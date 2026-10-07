import { createRouter, createWebHashHistory, createMemoryHistory, type RouteRecordRaw } from "vue-router";

export const STORAGE_KEY_LAST_ROUTE = "asisten_assist_last_route";

export const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_LAST_ROUTE);
        if (saved && saved.startsWith("/") && saved !== "/") {
          return saved;
        }
      } catch {
        // ignore
      }
      return "/obat";
    },
  },
  {
    path: "/obat",
    name: "obat",
    component: () => import("../pages/ObatPage.vue"),
    alias: ["/stok-obat", "/stok_obat"],
  },
  {
    path: "/bhp",
    name: "bhp",
    component: () => import("../pages/BhpPage.vue"),
    alias: ["/stok-bhp", "/stok_bhp"],
  },
  {
    path: "/restock",
    name: "restock",
    component: () => import("../pages/RestockReturnPage.vue"),
    alias: ["/return", "/restock-return"],
  },
  {
    path: "/comparison",
    name: "comparison",
    component: () => import("../pages/StockComparisonPage.vue"),
    alias: ["/perbandingan", "/perbandingan-stok"],
  },
  {
    path: "/recommendation",
    name: "recommendation",
    component: () => import("../pages/RekomendasiBelanjaPage.vue"),
    alias: ["/rekomendasi", "/rekomendasi-belanja"],
  },
  {
    path: "/destyHelper",
    name: "destyHelper",
    component: () => import("../pages/DestyHelperPage.vue"),
    alias: ["/desty-helper", "/desty_helper", "/desty", "/pldmp"],
  },
  {
    path: "/hitunganHarian",
    name: "hitunganHarian",
    component: () => import("../pages/HitunganHarianPage.vue"),
    alias: ["/hitungan-harian", "/hitungan_harian"],
  },
  {
    path: "/kesehatanInventori",
    name: "kesehatanInventori",
    component: () => import("../pages/KesehatanInventoriPage.vue"),
    alias: ["/kesehatan-inventori", "/kesehatan_inventori"],
  },
  {
    path: "/hnaValuation",
    name: "hnaValuation",
    component: () => import("../pages/HnaValuationPage.vue"),
    alias: ["/hna-valuation", "/hna_valuation"],
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("../pages/SettingsPage.vue"),
    alias: ["/pengaturan"],
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/obat",
  },
];

export const router = createRouter({
  history: typeof window !== "undefined" ? createWebHashHistory() : createMemoryHistory(),
  routes,
});

router.afterEach((to) => {
  if (to.path && to.path !== "/") {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_ROUTE, to.path);
    } catch {
      // ignore
    }
  }
});

export default router;
