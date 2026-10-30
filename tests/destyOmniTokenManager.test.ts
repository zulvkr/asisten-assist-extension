import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findTokenInStorageLikeObject,
  getStoredDestyToken,
  normalizeCandidateToken,
  parseCookieHeader,
  pickTokenFromCookieHeader,
  resolveDestyToken,
} from "@/composables/destyOmniTokenManager";

describe("destyOmniTokenManager", () => {
  let localStorageMock: Record<string, unknown> = {};

  beforeEach(() => {
    localStorageMock = {};
    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) {
              out[k] = localStorageMock[k];
            }
            return out;
          }),
          set: vi.fn(async (value: Record<string, unknown>) => {
            Object.assign(localStorageMock, value);
          }),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        sendMessage: vi.fn(async () => ({ ok: false })),
      },
    });
  });

  describe("token parsing & normalization", () => {
    it("strips Bearer prefix and trims whitespace", () => {
      expect(normalizeCandidateToken("  Bearer test-token-123  ")).toBe(
        "test-token-123",
      );
      expect(normalizeCandidateToken("bearer xyz ")).toBe("xyz");
      expect(normalizeCandidateToken("plain-token")).toBe("plain-token");
      expect(normalizeCandidateToken("")).toBe("");
      expect(normalizeCandidateToken(null)).toBe("");
    });

    it("extracts token from cookie header", () => {
      const header = "foo=bar; access_token=tok-cookie-999; session=abc";
      expect(pickTokenFromCookieHeader(header)).toBe("tok-cookie-999");
    });

    it("parses cookies properly", () => {
      const parsed = parseCookieHeader("a=1; b=2=3; c=");
      expect(parsed.a).toBe("1");
      expect(parsed.b).toBe("2=3");
      expect(parsed.c).toBe("");
    });

    it("finds token in storage like object", () => {
      const storageObj = {
        theme: "dark",
        Authorization: "Bearer token-abc",
      };
      expect(findTokenInStorageLikeObject(storageObj)).toBe("token-abc");
    });
  });

  describe("resolveDestyToken", () => {
    it("returns manual token when provided", async () => {
      const result = await resolveDestyToken({
        manualToken: "Bearer my-manual-tok",
      });
      expect(result.token).toBe("my-manual-tok");
      expect(result.source).toBe("manual");
    });

    it("retrieves token from open tab messaging", async () => {
      vi.stubGlobal("browser", {
        storage: {
          local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async (val: Record<string, unknown>) => {
              Object.assign(localStorageMock, val);
            }),
          },
        },
        tabs: {
          query: vi.fn(async () => [{ id: 101, url: "https://omni.desty.app/orders" }]),
          sendMessage: vi.fn(async (_tabId: number, message: unknown) => {
            if ((message as { type: string }).type === "GET_DESTY_OMNI_TOKEN") {
              return {
                ok: true,
                token: "tab-token-456",
                tenantId: "tenant-456",
                masterWarehouseId: "wh-1",
                source: "localStorage",
              };
            }
            return null;
          }),
        },
      });

      const result = await resolveDestyToken();
      expect(result.token).toBe("tab-token-456");
      expect(result.tenantId).toBe("tenant-456");
      expect(result.masterWarehouseId).toBe("wh-1");
      expect(localStorageMock.desty_saved_token).toBe("tab-token-456");
    });

    it("falls back to scripting.executeScript when tab sendMessage fails", async () => {
      vi.stubGlobal("browser", {
        storage: {
          local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async (val: Record<string, unknown>) => {
              Object.assign(localStorageMock, val);
            }),
          },
        },
        tabs: {
          query: vi.fn(async () => [{ id: 202, url: "https://omni.desty.app/orders" }]),
          sendMessage: vi.fn(async () => {
            throw new Error("Could not establish connection. Receiving end does not exist.");
          }),
        },
        scripting: {
          executeScript: vi.fn(async () => [
            {
              result: {
                token: "scripted-token-789",
                tenantId: "tenant-789",
                masterWarehouseId: "wh-2",
                source: "localStorage",
              },
            },
          ]),
        },
      });

      const result = await resolveDestyToken();
      expect(result.token).toBe("scripted-token-789");
      expect(result.tenantId).toBe("tenant-789");
      expect(localStorageMock.desty_saved_token).toBe("scripted-token-789");
    });

    it("falls back to browser.storage.local if tabs fail or no tab open", async () => {
      localStorageMock = {
        desty_saved_token: "saved-persisted-token",
        desty_saved_tenant_id: "saved-tenant",
        desty_saved_master_warehouse_id: "saved-wh",
        desty_saved_source: "localStorage",
      };

      const result = await resolveDestyToken();
      expect(result.token).toBe("saved-persisted-token");
      expect(result.tenantId).toBe("saved-tenant");
      expect(result.masterWarehouseId).toBe("saved-wh");
      expect(result.warnings[0]).toContain("tersimpan dari sesi sebelumnya");
    });

    it("handles tab probe timeout gracefully and falls back to storage", async () => {
      localStorageMock = {
        desty_saved_token: "storage-fallback-token",
      };

      vi.stubGlobal("browser", {
        storage: {
          local: {
            get: vi.fn(async (keys: string[]) => {
              const out: Record<string, unknown> = {};
              for (const k of keys) out[k] = localStorageMock[k];
              return out;
            }),
            set: vi.fn(async () => {}),
          },
        },
        tabs: {
          query: vi.fn(async () => [{ id: 999, url: "https://omni.desty.app/orders" }]),
          sendMessage: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 3000))),
        },
        scripting: {
          executeScript: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 3000))),
        },
      });

      const result = await resolveDestyToken();
      expect(result.token).toBe("storage-fallback-token");
    }, 6000);

    it("returns empty result with warning when no tab and no stored token", async () => {
      const result = await resolveDestyToken();
      expect(result.token).toBe("");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Token Desty tidak ditemukan");
    });
  });
});
