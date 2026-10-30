export default defineContentScript({
  matches: ["https://omni.desty.app/*"],
  main() {
    const DEBUG_PREFIX = "[DestyTokenProbe]";
    console.info(DEBUG_PREFIX, "Content script injected", window.location.href);

    const parseTenantId = (value: unknown): string => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      if (typeof value === "string") {
        const normalized = value.trim();
        return normalized;
      }
      return "";
    };

    const parseMasterWarehouseId = (): string => {
      const params = new URLSearchParams(window.location.search);
      const direct = String(params.get("masterWarehouseId") ?? "").trim();
      if (direct) {
        return direct;
      }

      const q = params.get("q");
      if (!q) {
        return "";
      }

      const attempts = [q];
      try {
        attempts.push(decodeURIComponent(q));
      } catch {
        // Ignore malformed URI parts.
      }

      for (const candidate of attempts) {
        try {
          const parsed = JSON.parse(candidate) as Record<string, unknown>;
          const fromObject = String(parsed.masterWarehouseId ?? "").trim();
          if (fromObject) {
            return fromObject;
          }
        } catch {
          // Ignore non-JSON candidates.
        }
      }

      return "";
    };

    const probeStorage = (
      storage: Storage,
    ): {
      token: string;
      source: "localStorage" | "sessionStorage";
      tenantId?: string;
    } | null => {
      const storageName =
        storage === localStorage ? "localStorage" : "sessionStorage";

      const keyHints = [
        "access_token",
        "accessToken",
        "token",
        "auth_token",
        "authorization",
        "jwt",
        "id_token",
      ];

      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) {
          continue;
        }

        const lowerKey = key.toLowerCase();
        if (!keyHints.some((hint) => lowerKey.includes(hint.toLowerCase()))) {
          continue;
        }

        const rawValue = storage.getItem(key) ?? "";
        const normalized = rawValue.trim().replace(/^Bearer\s+/i, "");
        if (!normalized) {
          continue;
        }

        return {
          token: normalized,
          source:
            storage === localStorage ? "localStorage" : "sessionStorage",
        };
      }

      return null;
    };

    const parseUserBlob = (): { token: string; tenantId: string } | null => {
      const rawUser = localStorage.getItem("user");
      if (!rawUser) {
        return null;
      }

      try {
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

        const tenantId = parseTenantId(
          parsed.tenantId ?? parsed.tenant ?? parsed.tenant_id,
        );

        if (!token) {
          return null;
        }

        return { token, tenantId };
      } catch {
        return null;
      }
    };

    const extractAuthData = (): {
      token: string;
      tenantId: string;
      masterWarehouseId: string;
      source: "localStorage" | "sessionStorage" | "cookie";
    } | null => {
      const fromUserBlob = parseUserBlob();
      if (fromUserBlob?.token) {
        return {
          token: fromUserBlob.token,
          tenantId: fromUserBlob.tenantId,
          masterWarehouseId: parseMasterWarehouseId(),
          source: "localStorage",
        };
      }

      const fromLocal = probeStorage(localStorage);
      if (fromLocal?.token) {
        return {
          token: fromLocal.token,
          tenantId: fromLocal.tenantId ?? "",
          masterWarehouseId: parseMasterWarehouseId(),
          source: "localStorage",
        };
      }

      const fromSession = probeStorage(sessionStorage);
      if (fromSession?.token) {
        return {
          token: fromSession.token,
          tenantId: fromSession.tenantId ?? "",
          masterWarehouseId: parseMasterWarehouseId(),
          source: "sessionStorage",
        };
      }

      const cookieEntry = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) =>
          /token|auth|jwt|access/i.test(part.split("=")[0] ?? ""),
        );

      if (cookieEntry) {
        const token = cookieEntry.split("=").slice(1).join("=").trim();
        if (token) {
          return {
            token,
            tenantId: "",
            masterWarehouseId: parseMasterWarehouseId(),
            source: "cookie",
          };
        }
      }

      return null;
    };

    const syncAuthToStorage = async (): Promise<void> => {
      try {
        const data = extractAuthData();
        if (data && data.token) {
          await browser.storage.local.set({
            desty_saved_token: data.token,
            desty_saved_tenant_id: data.tenantId,
            desty_saved_master_warehouse_id: data.masterWarehouseId,
            desty_saved_source: data.source,
            desty_saved_timestamp: Date.now(),
          });
          console.info(DEBUG_PREFIX, "Saved auth to browser.storage.local", {
            source: data.source,
            tokenLength: data.token.length,
            tenantId: data.tenantId,
          });
        }
      } catch (err) {
        console.debug(DEBUG_PREFIX, "Failed to sync auth to storage", err);
      }
    };

    // Sync immediately on script load
    void syncAuthToStorage();

    // Listen for storage events (e.g., login in another tab or changes to localStorage)
    window.addEventListener("storage", () => {
      void syncAuthToStorage();
    });

    // Listen for visibility change (e.g. user switches back to Desty tab)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncAuthToStorage();
      }
    });

    // Handle runtime messages from Assist extension
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "GET_DESTY_OMNI_TOKEN") {
        return;
      }

      const debugSteps: string[] = [];
      const pushDebug = (step: string): void => {
        debugSteps.push(step);
        console.debug(DEBUG_PREFIX, step);
      };

      pushDebug(`Probe requested at ${new Date().toISOString()}`);
      pushDebug(`Page URL: ${window.location.href}`);

      const authData = extractAuthData();
      if (authData && authData.token) {
        pushDebug(`token resolved from ${authData.source} (length: ${authData.token.length})`);
        void syncAuthToStorage();
        sendResponse({
          ok: true,
          token: authData.token,
          tenantId: authData.tenantId,
          masterWarehouseId: authData.masterWarehouseId,
          source: authData.source,
          debugSteps,
        });
        return false;
      }

      pushDebug("token probe failed from all sources");
      sendResponse({ ok: false, token: "", debugSteps });
      return false;
    });
  },
});
