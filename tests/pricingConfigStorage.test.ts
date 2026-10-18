import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplacePricingConfig } from "@/types/destyPriceUpdate";

// Mock firebase
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockDoc = vi.fn();
const mockOnSnapshot = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: (...args: any[]) => mockDoc(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
}));

vi.mock("@/config/firebase", () => ({
  db: { _mockDb: true },
  auth: { currentUser: { email: "test-auth@apotekaldila.com" } },
}));

import {
  getDefaultPricingTiers,
  DEFAULT_MARKETPLACE_PRICING_CONFIG,
  sanitizePricingConfig,
  loadMarketplacePricingConfig,
  saveMarketplacePricingConfig,
  subscribeMarketplacePricingConfig,
  writeLocalPricingCache,
  getCachedPricingConfig,
  STORAGE_KEY,
  PRICING_SETTINGS_COLLECTION,
  PRICING_SETTINGS_DOC,
} from "@/services/destySync/pricingConfigStorage";

describe("Pricing Config Storage (Firestore & Local Hybrid)", () => {
  let localStorageMock: Record<string, string> = {};
  let browserStorageMock: Record<string, unknown> = {};

  beforeEach(() => {
    localStorageMock = {};
    browserStorageMock = {};
    vi.clearAllMocks();

    mockDoc.mockReturnValue({ path: "settings/desty_pricing" });
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null });
    mockSetDoc.mockResolvedValue(undefined);

    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        localStorageMock[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageMock[key];
      }),
      clear: vi.fn(() => {
        localStorageMock = {};
      }),
    });

    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: browserStorageMock[key] })),
          set: vi.fn(async (val: Record<string, unknown>) => {
            Object.assign(browserStorageMock, val);
          }),
        },
      },
    });
  });

  describe("Constants & Default Configurations", () => {
    it("exports correct Firestore collection and doc names", () => {
      expect(PRICING_SETTINGS_COLLECTION).toBe("settings");
      expect(PRICING_SETTINGS_DOC).toBe("desty_pricing");
      expect(STORAGE_KEY).toBe("desty_pricing_formula_config");
    });

    it("has 4 sensible default tiers", () => {
      const tiers = getDefaultPricingTiers();
      expect(tiers).toHaveLength(4);
      expect(tiers[0].marginPercent).toBe(25);
      expect(tiers[0].minBuyQty).toBe(3);
      expect(tiers[tiers.length - 1].maxPrice).toBeNull();
    });

    it("has default marketplace pricing settings using buyPrice", () => {
      expect(DEFAULT_MARKETPLACE_PRICING_CONFIG.adminPercent).toBe(10);
      expect(DEFAULT_MARKETPLACE_PRICING_CONFIG.adminFixedPerTx).toBe(1000);
      expect(DEFAULT_MARKETPLACE_PRICING_CONFIG.basePriceSource).toBe("buyPrice");
      expect(DEFAULT_MARKETPLACE_PRICING_CONFIG.rounding).toBe(100);
      expect(DEFAULT_MARKETPLACE_PRICING_CONFIG.tiers.length).toBeGreaterThan(0);
    });
  });

  describe("sanitizePricingConfig", () => {
    it("returns default config when given invalid input", () => {
      const result = sanitizePricingConfig(null);
      expect(result.adminPercent).toBe(DEFAULT_MARKETPLACE_PRICING_CONFIG.adminPercent);
      expect(result.basePriceSource).toBe("buyPrice");
      expect(result.tiers).toHaveLength(4);
    });

    it("clamps adminPercent within 0-99 and enforces basePriceSource buyPrice", () => {
      const result = sanitizePricingConfig({
        adminPercent: 150, // exceeds max
        adminFixedPerTx: -50, // negative
        basePriceSource: "sellPrice", // should be coerced to buyPrice
        rounding: 0,
        tiers: [],
      });

      expect(result.adminPercent).toBe(99);
      expect(result.adminFixedPerTx).toBe(0);
      expect(result.basePriceSource).toBe("buyPrice");
      expect(result.rounding).toBe(DEFAULT_MARKETPLACE_PRICING_CONFIG.rounding);
      expect(result.tiers).toHaveLength(4); // falls back to default tiers
    });

    it("normalizes and cleans tiers", () => {
      const result = sanitizePricingConfig({
        adminPercent: 12,
        adminFixedPerTx: 2000,
        rounding: 50,
        tiers: [
          {
            id: "",
            minPrice: 0,
            maxPrice: 20000,
            marginPercent: 30,
            minBuyQty: 0, // should become at least 1
          },
        ],
        updatedAt: "2026-10-17T07:00:00.000Z",
        updatedBy: "user@example.com",
      });

      expect(result.adminPercent).toBe(12);
      expect(result.adminFixedPerTx).toBe(2000);
      expect(result.rounding).toBe(50);
      expect(result.tiers[0].id).toBe("tier-1");
      expect(result.tiers[0].minBuyQty).toBe(1);
      expect(result.updatedAt).toBe("2026-10-17T07:00:00.000Z");
      expect(result.updatedBy).toBe("user@example.com");
    });
  });

  describe("Local Caching & Fallbacks", () => {
    it("writes and reads from browser.storage.local and localStorage", async () => {
      const customConfig: MarketplacePricingConfig = {
        adminPercent: 11,
        adminFixedPerTx: 1500,
        basePriceSource: "buyPrice",
        rounding: 500,
        tiers: [
          { id: "t1", minPrice: 0, maxPrice: 10000, marginPercent: 20, minBuyQty: 2 },
        ],
      };

      await writeLocalPricingCache(customConfig);

      const cached = await getCachedPricingConfig();
      expect(cached).not.toBeNull();
      expect(cached?.adminPercent).toBe(11);
      expect(cached?.adminFixedPerTx).toBe(1500);
      expect(cached?.rounding).toBe(500);

      // Verify localStorage was also written
      expect(localStorageMock[STORAGE_KEY]).toBeDefined();
    });

    it("falls back to localStorage if browser.storage.local is empty", async () => {
      const customConfig: MarketplacePricingConfig = {
        adminPercent: 15,
        adminFixedPerTx: 500,
        basePriceSource: "buyPrice",
        rounding: 100,
        tiers: getDefaultPricingTiers(),
      };
      localStorageMock[STORAGE_KEY] = JSON.stringify(customConfig);

      const cached = await getCachedPricingConfig();
      expect(cached?.adminPercent).toBe(15);
      expect(cached?.adminFixedPerTx).toBe(500);
    });
  });

  describe("Firestore Integration & Sync", () => {
    it("loads from Firestore when document exists and updates local cache", async () => {
      const firestoreData: MarketplacePricingConfig = {
        adminPercent: 9,
        adminFixedPerTx: 800,
        basePriceSource: "buyPrice",
        rounding: 50,
        tiers: getDefaultPricingTiers(),
        updatedAt: "2026-10-17T07:10:00.000Z",
        updatedBy: "firestore-user@apotekaldila.com",
      };

      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => firestoreData,
      });

      const loaded = await loadMarketplacePricingConfig();

      expect(loaded.adminPercent).toBe(9);
      expect(loaded.adminFixedPerTx).toBe(800);
      expect(loaded.rounding).toBe(50);
      expect(loaded.updatedBy).toBe("firestore-user@apotekaldila.com");

      // Verify local caches were updated
      expect(browserStorageMock[STORAGE_KEY]).toBeDefined();
      expect(localStorageMock[STORAGE_KEY]).toBeDefined();
    });

    it("saves to Firestore with setDoc and falls back safely if Firestore fails", async () => {
      const configToSave: MarketplacePricingConfig = {
        adminPercent: 8,
        adminFixedPerTx: 1200,
        basePriceSource: "buyPrice",
        rounding: 100,
        tiers: getDefaultPricingTiers(),
      };

      const saved = await saveMarketplacePricingConfig(configToSave, "staff@apotekaldila.com");
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          adminPercent: 8,
          adminFixedPerTx: 1200,
          updatedBy: "staff@apotekaldila.com",
        }),
        { merge: true },
      );
      expect(saved.adminPercent).toBe(8);
      expect(saved.updatedBy).toBe("staff@apotekaldila.com");

      // Test error fallback
      mockSetDoc.mockRejectedValueOnce(new Error("Network offline"));
      const offlineSave = await saveMarketplacePricingConfig(configToSave);
      expect(offlineSave.adminPercent).toBe(8);
      // Still saved to local cache despite Firestore error
      expect(browserStorageMock[STORAGE_KEY]).toBeDefined();
    });

    it("registers real-time listener via subscribeMarketplacePricingConfig", () => {
      const callback = vi.fn();
      mockOnSnapshot.mockImplementation((_ref, next) => {
        next({
          exists: () => true,
          data: () => ({
            adminPercent: 14,
            adminFixedPerTx: 999,
            rounding: 100,
            tiers: getDefaultPricingTiers(),
          }),
        });
        return () => {};
      });

      const unsub = subscribeMarketplacePricingConfig(callback);
      expect(mockOnSnapshot).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          adminPercent: 14,
          adminFixedPerTx: 999,
        }),
      );
      expect(typeof unsub).toBe("function");
    });
  });
});
