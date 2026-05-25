import "../assets/main.css";
import { mountHitunganHarianButtonUi } from "@/components/hitungan-harian/addHitunganHarianButton";

export default defineContentScript({
  matches: ["https://clinica.assist.id/*"],
  async main(ctx) {
    const DEBUG_PREFIX = "[AssistTokenProbe]";
    console.log("Content script loaded on", window.location.href);

    const safePersistAssistToken = async (token: string): Promise<void> => {
      const storageLocal = browser?.storage?.local;
      if (!storageLocal) {
        return;
      }

      try {
        await storageLocal.set({ assistToken: token });
      } catch {
        // Ignore storage errors.
      }
    };

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "GET_ASSIST_TOKEN") {
        return;
      }

      const debugSteps: string[] = [];

      const pushDebug = (step: string): void => {
        debugSteps.push(step);
        console.debug(DEBUG_PREFIX, step);
      };

      const normalizeToken = (value: unknown): string => {
        if (typeof value !== "string") {
          return "";
        }

        const normalized = value.trim().replace(/^Bearer\s+/i, "");
        return normalized;
      };

      const keyHints = [
        "access_token",
        "accessToken",
        "token",
        "auth_token",
        "authorization",
        "jwt",
        "id_token",
      ];

      const probeStorage = (
        storage: Storage,
      ): {
        token: string;
        source: "localStorage" | "sessionStorage";
      } | null => {
        const storageName =
          storage === localStorage ? "localStorage" : "sessionStorage";
        pushDebug(`${storageName} key count: ${storage.length}`);

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
          const token = normalizeToken(storage.getItem(key));
          if (!token) {
            pushDebug(`${storageName} key ${key} is empty after normalization`);
            continue;
          }

          pushDebug(
            `${storageName} key ${key} produced token length: ${token.length}`,
          );
          return {
            token,
            source:
              storage === localStorage ? "localStorage" : "sessionStorage",
          };
        }

        return null;
      };

      pushDebug(`Probe requested at ${new Date().toISOString()}`);
      pushDebug(`Page URL: ${window.location.href}`);

      const directLocalToken = normalizeToken(localStorage.getItem("token"));
      if (directLocalToken) {
        pushDebug(
          `token resolved from direct localStorage token key (length: ${directLocalToken.length})`,
        );
        void safePersistAssistToken(directLocalToken);
        sendResponse({
          ok: true,
          token: directLocalToken,
          source: "localStorage",
          debugSteps,
        });
        return false;
      }

      const fromLocal = probeStorage(localStorage);
      if (fromLocal?.token) {
        pushDebug("token resolved from generic localStorage probe");
        void safePersistAssistToken(fromLocal.token);
        sendResponse({
          ok: true,
          ...fromLocal,
          debugSteps,
        });
        return false;
      }

      const fromSession = probeStorage(sessionStorage);
      if (fromSession?.token) {
        pushDebug("token resolved from sessionStorage probe");
        void safePersistAssistToken(fromSession.token);
        sendResponse({
          ok: true,
          ...fromSession,
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
        const token = normalizeToken(cookieEntry.split("=").slice(1).join("="));
        if (token) {
          pushDebug("token resolved from cookie probe");
          void safePersistAssistToken(token);
          sendResponse({
            ok: true,
            token,
            source: "cookie",
            debugSteps,
          });
          return false;
        }
      }

      pushDebug("token probe failed from all sources");
      sendResponse({
        ok: false,
        token: "",
        debugSteps,
      });

      return false;
    });

    await fetchMarginTable();

    const observer = new MutationObserver(() => {
      modifyTableObat(ctx);
      modifyRestockReturn(ctx);
      modifyTableBhp(ctx);
    });

    function waitForTargetAndObserve() {
      const target = document.querySelector("#kamarmedis-content");
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
        mountHitunganHarianButtonUi(ctx).mount();
      } else {
        setTimeout(waitForTargetAndObserve, 500);
      }
    }

    function waitButtonAndListen() {
      const button = evaluateXPath(
        '//*[@id="appBar"]/div/div/div[2]/div[2]/div/div[2]/button',
      );
      if (button) {
        button.addEventListener("click", async () => {
          await fetchMarginTable();
          modifyTableObat(ctx);
          modifyRestockReturn(ctx);
          modifyTableBhp(ctx);
        });
      } else {
        setTimeout(waitButtonAndListen, 500);
      }
    }

    waitButtonAndListen();
    waitForTargetAndObserve();
  },
});
