export type DestyTokenSource =
  | "manual"
  | "localStorage"
  | "sessionStorage"
  | "cookie"
  | "content-script";

export interface DestyTokenProbeResult {
  token: string;
  tenantId: string;
  masterWarehouseId: string;
  source: DestyTokenSource;
  warnings: string[];
}

interface TokenMessageResponse {
  ok?: boolean;
  token?: string;
  tenantId?: string;
  masterWarehouseId?: string;
  source?: "localStorage" | "sessionStorage" | "cookie";
  debugSteps?: string[];
}

const DESTY_TAB_PATTERNS = ["*://omni.desty.app/*"];
const TOKEN_KEY_HINTS = [
  "access_token",
  "accessToken",
  "token",
  "auth_token",
  "authorization",
  "jwt",
  "id_token",
];

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallbackMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(fallbackMessage));
    }, ms);
  });

  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]);
}

export function normalizeCandidateToken(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const token = input.trim();
  if (!token) {
    return "";
  }

  if (token.toLowerCase().startsWith("bearer ")) {
    return token.slice(7).trim();
  }

  return token;
}

export function findTokenInStorageLikeObject(
  storageLike: Record<string, string>,
): string {
  for (const keyHint of TOKEN_KEY_HINTS) {
    const found = Object.entries(storageLike).find(([key]) =>
      key.toLowerCase().includes(keyHint.toLowerCase()),
    );

    if (!found) {
      continue;
    }

    const normalized = normalizeCandidateToken(found[1]);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

async function persistDestyTokenToStorage(
  result: DestyTokenProbeResult,
): Promise<void> {
  try {
    if (result.token) {
      await browser.storage.local.set({
        desty_saved_token: result.token,
        desty_saved_tenant_id: result.tenantId,
        desty_saved_master_warehouse_id: result.masterWarehouseId,
        desty_saved_source: result.source,
        desty_saved_timestamp: Date.now(),
      });
      console.debug("[DestyTokenManager] Token saved to browser.storage.local");
    }
  } catch (err) {
    console.debug("[DestyTokenManager] Failed to persist token to storage.local", err);
  }
}

export async function getStoredDestyToken(): Promise<DestyTokenProbeResult | null> {
  try {
    const data = await browser.storage.local.get([
      "desty_saved_token",
      "desty_saved_tenant_id",
      "desty_saved_master_warehouse_id",
      "desty_saved_source",
      "desty_saved_timestamp",
    ]);

    const token = normalizeCandidateToken(data?.desty_saved_token);
    if (token) {
      return {
        token,
        tenantId: String(data?.desty_saved_tenant_id ?? "").trim(),
        masterWarehouseId: String(
          data?.desty_saved_master_warehouse_id ?? "",
        ).trim(),
        source: (data?.desty_saved_source as DestyTokenSource) || "localStorage",
        warnings: [
          "Menggunakan token Desty yang tersimpan dari sesi sebelumnya.",
        ],
      };
    }
  } catch (err) {
    console.warn(
      "[DestyTokenManager] Failed to read token from storage.local",
      err,
    );
  }
  return null;
}

async function extractTokenViaScripting(
  tabId: number,
): Promise<DestyTokenProbeResult | null> {
  try {
    const scripting =
      (browser as unknown as { scripting?: { executeScript: Function } })
        .scripting ??
      (typeof chrome !== "undefined" ? chrome.scripting : undefined);

    if (!scripting?.executeScript) {
      return null;
    }

    console.debug(
      "[DestyTokenManager] Attempting dynamic executeScript on tab",
      tabId,
    );

    const injectionResults = (await withTimeout(
      scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            const rawUser = localStorage.getItem("user");
            if (rawUser) {
              const parsed = JSON.parse(rawUser) as Record<string, unknown>;
              const tokenCandidates = [
                parsed.access_token,
                parsed.accessToken,
                parsed.token,
                parsed.Authorization,
                parsed.authorization,
              ];

              const token =
                tokenCandidates
                  .map((value) =>
                    String(value ?? "")
                      .trim()
                      .replace(/^Bearer\s+/i, ""),
                  )
                  .find((value) => value.length > 0) ?? "";

              const tenantId = String(
                parsed.tenantId ?? parsed.tenant ?? parsed.tenant_id ?? "",
              ).trim();

              const params = new URLSearchParams(window.location.search);
              let masterWarehouseId = String(
                params.get("masterWarehouseId") ?? "",
              ).trim();
              if (!masterWarehouseId && params.get("q")) {
                try {
                  const qObj = JSON.parse(
                    decodeURIComponent(params.get("q") ?? ""),
                  ) as Record<string, unknown>;
                  masterWarehouseId = String(
                    qObj.masterWarehouseId ?? "",
                  ).trim();
                } catch {
                  // Ignore
                }
              }

              if (token) {
                return {
                  token,
                  tenantId,
                  masterWarehouseId,
                  source: "localStorage",
                };
              }
            }
          } catch {
            // Ignore
          }
          return null;
        },
      }),
      1500,
      "Scripting executeScript timeout (1500ms)",
    )) as Array<{ result?: { token: string; tenantId: string; masterWarehouseId: string; source: string } }> | undefined;

    const output = injectionResults?.[0]?.result;
    if (output && output.token) {
      const result: DestyTokenProbeResult = {
        token: output.token,
        tenantId: output.tenantId || "",
        masterWarehouseId: output.masterWarehouseId || "",
        source: (output.source as DestyTokenSource) || "localStorage",
        warnings: [],
      };
      await persistDestyTokenToStorage(result);
      return result;
    }
  } catch (err) {
    console.warn(
      "[DestyTokenManager] scripting.executeScript failed for tab",
      tabId,
      err,
    );
  }
  return null;
}

async function probeDestyTokenFromTab(tabId: number): Promise<{
  result: DestyTokenProbeResult | null;
  debugSteps: string[];
  errorMessage?: string;
}> {
  try {
    console.debug("[DestyTokenManager] Sending token probe to tab", tabId);

    const response = (await withTimeout(
      browser.tabs.sendMessage(tabId, {
        type: "GET_DESTY_OMNI_TOKEN",
      }),
      1500,
      "Tab sendMessage timeout (1500ms)",
    )) as TokenMessageResponse | undefined;

    console.debug("[DestyTokenManager] Probe response", {
      tabId,
      ok: response?.ok,
      source: response?.source,
      tenantId: response?.tenantId,
      masterWarehouseId: response?.masterWarehouseId,
      tokenLength: String(response?.token ?? "").trim().length,
      debugSteps: response?.debugSteps ?? [],
    });

    const debugSteps = response?.debugSteps ?? [];

    const token = normalizeCandidateToken(response?.token);
    if (!token) {
      return {
        result: null,
        debugSteps,
      };
    }

    const result: DestyTokenProbeResult = {
      token,
      tenantId: String(response?.tenantId ?? "").trim(),
      masterWarehouseId: String(response?.masterWarehouseId ?? "").trim(),
      source: response?.source ?? "content-script",
      warnings: [],
    };

    await persistDestyTokenToStorage(result);

    return {
      result,
      debugSteps,
    };
  } catch (error) {
    console.warn("[DestyTokenManager] Probe failed for tab", tabId, error);
    return {
      result: null,
      debugSteps: [],
      errorMessage: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export async function requestDestyTokenFromOpenTabs(): Promise<DestyTokenProbeResult> {
  let tabs: Array<{ id?: number; url?: string }> = [];
  try {
    tabs = (await withTimeout(
      browser.tabs.query({ url: DESTY_TAB_PATTERNS }),
      1000,
      "tabs.query timeout",
    )) as Array<{
      id?: number;
      url?: string;
    }>;
  } catch (queryErr) {
    console.warn("[DestyTokenManager] tabs.query failed", queryErr);
  }

  console.debug(
    "[DestyTokenManager] Desty tabs found",
    tabs.map((tab) => tab.id),
  );

  const probeWarnings: string[] = [];

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    // Attempt 1: sendMessage to content script (with 1.5s timeout)
    const { result, debugSteps, errorMessage } = await probeDestyTokenFromTab(
      tab.id,
    );
    if (result?.token) {
      return result;
    }

    // Attempt 2: Direct scripting extraction (handles disconnected content script after extension reload, with 1.5s timeout)
    const directResult = await extractTokenViaScripting(tab.id);
    if (directResult?.token) {
      return directResult;
    }

    if (errorMessage) {
      probeWarnings.push(`Tab ${tab.id}: sendMessage (${errorMessage})`);
      continue;
    }

    if (debugSteps.length) {
      probeWarnings.push(`Tab ${tab.id}: ${debugSteps.join(" | ")}`);
    } else {
      probeWarnings.push(
        `Tab ${tab.id}: script belum aktif pada tab ini. Segarkan (F5) tab Desty.`,
      );
    }
  }

  // Attempt 3: Stored token from browser.storage.local
  const stored = await getStoredDestyToken();
  if (stored?.token) {
    return stored;
  }

  return {
    token: "",
    tenantId: "",
    masterWarehouseId: "",
    source: "content-script",
    warnings: [
      "Token Desty tidak ditemukan dari tab omni.desty.app. Pastikan sudah login di Desty Omni, lalu coba lagi.",
      ...probeWarnings,
    ],
  };
}

export async function resolveDestyToken(options?: {
  manualToken?: string;
}): Promise<DestyTokenProbeResult> {
  const manualToken = normalizeCandidateToken(options?.manualToken);
  if (manualToken) {
    return {
      token: manualToken,
      tenantId: "",
      masterWarehouseId: "",
      source: "manual",
      warnings: [],
    };
  }

  return requestDestyTokenFromOpenTabs();
}

export function parseCookieHeader(
  cookieHeader: string,
): Record<string, string> {
  const output: Record<string, string> = {};

  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = pair.split("=");
    const key = rawKey?.trim();
    if (!key) {
      continue;
    }

    output[key] = rawValue.join("=").trim();
  }

  return output;
}

export function pickTokenFromCookieHeader(cookieHeader: string): string {
  return findTokenInStorageLikeObject(parseCookieHeader(cookieHeader));
}
