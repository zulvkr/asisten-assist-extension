import type { MarketplacePricingConfig, PriceRangeTier } from "@/types/destyPriceUpdate";

const STORAGE_KEY = "desty_pricing_formula_config";

export function getDefaultPricingTiers(): PriceRangeTier[] {
  return [
    {
      id: "tier-1",
      minPrice: 0,
      maxPrice: 15000,
      marginPercent: 25,
      minBuyQty: 3,
    },
    {
      id: "tier-2",
      minPrice: 15001,
      maxPrice: 50000,
      marginPercent: 20,
      minBuyQty: 2,
    },
    {
      id: "tier-3",
      minPrice: 50001,
      maxPrice: 150000,
      marginPercent: 15,
      minBuyQty: 1,
    },
    {
      id: "tier-4",
      minPrice: 150001,
      maxPrice: null,
      marginPercent: 12,
      minBuyQty: 1,
    },
  ];
}

export const DEFAULT_MARKETPLACE_PRICING_CONFIG: MarketplacePricingConfig = {
  adminPercent: 10,
  adminFixedPerTx: 1000,
  basePriceSource: "buyPrice", // Explicitly using harga beli terakhir in Assist as HPP
  rounding: 100,
  tiers: getDefaultPricingTiers(),
};

export async function loadMarketplacePricingConfig(): Promise<MarketplacePricingConfig> {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      const data = await browser.storage.local.get(STORAGE_KEY);
      if (data && data[STORAGE_KEY]) {
        const parsed = typeof data[STORAGE_KEY] === "string" ? JSON.parse(data[STORAGE_KEY]) : data[STORAGE_KEY];
        if (parsed && Array.isArray(parsed.tiers) && parsed.tiers.length > 0) {
          return {
            adminPercent: Number(parsed.adminPercent) ?? DEFAULT_MARKETPLACE_PRICING_CONFIG.adminPercent,
            adminFixedPerTx: Number(parsed.adminFixedPerTx) ?? DEFAULT_MARKETPLACE_PRICING_CONFIG.adminFixedPerTx,
            basePriceSource: "buyPrice", // enforce harga beli terakhir as requested by user
            rounding: Number(parsed.rounding) ?? DEFAULT_MARKETPLACE_PRICING_CONFIG.rounding,
            tiers: parsed.tiers,
          };
        }
      }
    }
  } catch (err) {
    console.warn("Gagal memuat formula config dari browser.storage.local:", err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tiers) && parsed.tiers.length > 0) {
        return {
          adminPercent: Number(parsed.adminPercent) ?? DEFAULT_MARKETPLACE_PRICING_CONFIG.adminPercent,
          adminFixedPerTx: Number(parsed.adminFixedPerTx) ?? DEFAULT_MARKETPLACE_PRICING_CONFIG.adminFixedPerTx,
          basePriceSource: "buyPrice",
          rounding: Number(parsed.rounding) ?? DEFAULT_MARKETPLACE_PRICING_CONFIG.rounding,
          tiers: parsed.tiers,
        };
      }
    }
  } catch (err) {
    console.warn("Gagal memuat formula config dari localStorage:", err);
  }

  return JSON.parse(JSON.stringify(DEFAULT_MARKETPLACE_PRICING_CONFIG));
}

export async function saveMarketplacePricingConfig(
  config: MarketplacePricingConfig,
): Promise<void> {
  const safeConfig: MarketplacePricingConfig = {
    adminPercent: Math.max(0, Math.min(99, Number(config.adminPercent) || 0)),
    adminFixedPerTx: Math.max(0, Number(config.adminFixedPerTx) || 0),
    basePriceSource: "buyPrice", // Always use harga beli terakhir (HPP) in Assist
    rounding: Math.max(1, Number(config.rounding) || 100),
    tiers: Array.isArray(config.tiers) && config.tiers.length > 0 ? config.tiers : getDefaultPricingTiers(),
  };

  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      await browser.storage.local.set({ [STORAGE_KEY]: safeConfig });
    }
  } catch (err) {
    console.warn("Gagal menyimpan formula config ke browser.storage.local:", err);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConfig));
  } catch (err) {
    console.warn("Gagal menyimpan formula config ke localStorage:", err);
  }
}
