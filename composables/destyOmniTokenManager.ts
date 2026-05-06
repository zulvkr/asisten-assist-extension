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

function normalizeCandidateToken(input: unknown): string {
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

function findTokenInStorageLikeObject(
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

async function probeDestyTokenFromTab(tabId: number): Promise<{
  result: DestyTokenProbeResult | null;
  debugSteps: string[];
  errorMessage?: string;
}> {
  try {
    console.debug("[DestyTokenManager] Sending token probe to tab", tabId);

    const response = (await browser.tabs.sendMessage(tabId, {
      type: "GET_DESTY_OMNI_TOKEN",
    })) as TokenMessageResponse | undefined;

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

    return {
      result: {
        token,
        tenantId: String(response?.tenantId ?? "").trim(),
        masterWarehouseId: String(response?.masterWarehouseId ?? "").trim(),
        source: response?.source ?? "content-script",
        warnings: [],
      },
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
  const tabs = await browser.tabs.query({ url: DESTY_TAB_PATTERNS });
  console.debug(
    "[DestyTokenManager] Desty tabs found",
    tabs.map((tab) => tab.id),
  );

  const probeWarnings: string[] = [];

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    const { result, debugSteps, errorMessage } = await probeDestyTokenFromTab(
      tab.id,
    );
    if (result?.token) {
      return result;
    }

    if (errorMessage) {
      probeWarnings.push(`Tab ${tab.id}: sendMessage error (${errorMessage})`);
      continue;
    }

    if (debugSteps.length) {
      probeWarnings.push(`Tab ${tab.id}: ${debugSteps.join(" | ")}`);
    } else {
      probeWarnings.push(
        `Tab ${tab.id}: no debugSteps returned; content script may not be injected on this tab yet.`,
      );
    }
  }

  return {
    token: "",
    tenantId: "",
    masterWarehouseId: "",
    source: "content-script",
    warnings: [
      "Token Desty tidak ditemukan dari tab omni.desty.app. Buka dashboard Desty lalu coba lagi.",
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
