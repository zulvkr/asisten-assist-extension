import { describe, it, expect, beforeEach } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes, STORAGE_KEY_LAST_ROUTE } from "../components/assistApp/router";

describe("AssistApp Vue Router", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    router = createRouter({
      history: createMemoryHistory(),
      routes,
    });
  });

  it("has correct configuration for all designated pages", () => {
    const pages = [
      { path: "/bhp", name: "bhp" },
      { path: "/restock", name: "restock" },
      { path: "/comparison", name: "comparison" },
      { path: "/recommendation", name: "recommendation" },
      { path: "/destyHelper", name: "destyHelper" },
      { path: "/hitunganHarian", name: "hitunganHarian" },
      { path: "/kesehatanInventori", name: "kesehatanInventori" },
      { path: "/hnaValuation", name: "hnaValuation" },
      { path: "/settings", name: "settings" },
    ];

    for (const page of pages) {
      const resolved = router.resolve(page.path);
      expect(resolved.name).toBe(page.name);
    }
  });

  it("resolves route aliases correctly", () => {
    expect(router.resolve("/desty-helper").name).toBe("destyHelper");
    expect(router.resolve("/desty_helper").name).toBe("destyHelper");
    expect(router.resolve("/desty").name).toBe("destyHelper");
    expect(router.resolve("/pldmp").name).toBe("destyHelper");

    expect(router.resolve("/hitungan-harian").name).toBe("hitunganHarian");
    expect(router.resolve("/kesehatan-inventori").name).toBe("kesehatanInventori");
    expect(router.resolve("/hna-valuation").name).toBe("hnaValuation");
    expect(router.resolve("/pengaturan").name).toBe("settings");
    expect(router.resolve("/stok-obat").name).toBe("obat");
    expect(router.resolve("/stok-bhp").name).toBe("bhp");
    expect(router.resolve("/perbandingan").name).toBe("comparison");
    expect(router.resolve("/rekomendasi").name).toBe("recommendation");
  });

  it("redirects unknown routes to '/obat'", () => {
    const resolved = router.resolve("/some-random-unknown-page");
    // With catch-all route redirecting to /obat, resolve matches route
    expect(resolved.matched[0].path).toBe("/:pathMatch(.*)*");
  });

  it("root route redirect function uses localStorage if available", () => {
    const rootRoute = routes.find((r) => r.path === "/");
    expect(rootRoute).toBeDefined();

    if (typeof rootRoute?.redirect === "function") {
      // 1. Without localStorage, defaults to /obat
      expect((rootRoute.redirect as Function)()).toBe("/obat");

      // 2. With localStorage saved route, returns that route
      const storage: Record<string, string> = {
        [STORAGE_KEY_LAST_ROUTE]: "/bhp",
      };
      const originalLocalStorage = globalThis.localStorage;
      // @ts-ignore
      globalThis.localStorage = {
        getItem: (key: string) => storage[key] ?? null,
      };

      try {
        expect((rootRoute.redirect as Function)()).toBe("/bhp");
      } finally {
        globalThis.localStorage = originalLocalStorage;
      }
    }
  });
});
