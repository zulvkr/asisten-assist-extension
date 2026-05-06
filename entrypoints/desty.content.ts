export default defineContentScript({
  matches: ["https://omni.desty.app/*"],
  main() {
    const DEBUG_PREFIX = "[DestyTokenProbe]";
    console.info(DEBUG_PREFIX, "Content script injected", window.location.href);

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

      const probeStorage = (
        storage: Storage,
      ): {
        token: string;
        source: "localStorage" | "sessionStorage";
        tenantId?: string;
      } | null => {
        const storageName =
          storage === localStorage ? "localStorage" : "sessionStorage";

        pushDebug(`${storageName} key count: ${storage.length}`);

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

          pushDebug(`${storageName} candidate key found: ${key}`);

          const rawValue = storage.getItem(key) ?? "";
          const normalized = rawValue.trim().replace(/^Bearer\s+/i, "");
          if (!normalized) {
            pushDebug(`${storageName} key ${key} is empty after normalization`);
            continue;
          }

          pushDebug(
            `${storageName} key ${key} produced token length: ${normalized.length}`,
          );

          return {
            token: normalized,
            source:
              storage === localStorage ? "localStorage" : "sessionStorage",
          };
        }

        return null;
      };

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
          pushDebug(`masterWarehouseId found directly in query: ${direct}`);
          return direct;
        }

        const q = params.get("q");
        if (!q) {
          pushDebug("masterWarehouseId not found: no q query parameter");
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
              pushDebug(
                `masterWarehouseId parsed from q payload: ${fromObject}`,
              );
              return fromObject;
            }
          } catch {
            // Ignore non-JSON candidates.
          }
        }

        pushDebug("masterWarehouseId not found in parsed q payloads");

        return "";
      };

      const parseUserBlob = (): { token: string; tenantId: string } | null => {
        const rawUser = localStorage.getItem("user");
        if (!rawUser) {
          pushDebug("localStorage.user not found");
          return null;
        }

        pushDebug(`localStorage.user found (length: ${rawUser.length})`);

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

          pushDebug(`user blob token length: ${token.length}`);
          pushDebug(`user blob tenantId resolved: ${tenantId || "<empty>"}`);

          if (!token) {
            pushDebug("user blob parsed but token is empty");
            return null;
          }

          return { token, tenantId };
        } catch {
          pushDebug("failed to parse localStorage.user as JSON");
          return null;
        }
      };

      const fromUserBlob = parseUserBlob();
      if (fromUserBlob?.token) {
        pushDebug("token resolved from localStorage.user");
        sendResponse({
          ok: true,
          token: fromUserBlob.token,
          source: "localStorage",
          tenantId: fromUserBlob.tenantId,
          masterWarehouseId: parseMasterWarehouseId(),
          debugSteps,
        });
        return false;
      }

      const fromLocal = probeStorage(localStorage);
      if (fromLocal) {
        pushDebug("token resolved from generic localStorage probe");
        sendResponse({
          ok: true,
          ...fromLocal,
          masterWarehouseId: parseMasterWarehouseId(),
          debugSteps,
        });
        return false;
      }

      const fromSession = probeStorage(sessionStorage);
      if (fromSession) {
        pushDebug("token resolved from sessionStorage probe");
        sendResponse({
          ok: true,
          ...fromSession,
          masterWarehouseId: parseMasterWarehouseId(),
          debugSteps,
        });
        return false;
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
          pushDebug("token resolved from cookie probe");
          sendResponse({
            ok: true,
            token,
            source: "cookie",
            masterWarehouseId: parseMasterWarehouseId(),
            debugSteps,
          });
          return false;
        }
      }

      pushDebug("token probe failed from all sources");
      sendResponse({ ok: false, token: "", debugSteps });
      return false;
    });
  },
});
