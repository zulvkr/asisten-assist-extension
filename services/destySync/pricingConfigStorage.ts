import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db, auth } from "@/config/firebase";
import type { MarketplacePricingConfig, PriceRangeTier } from "@/types/destyPriceUpdate";

export const PRICING_SETTINGS_COLLECTION = "settings";
export const PRICING_SETTINGS_DOC = "desty_pricing";
export const STORAGE_KEY = "desty_pricing_formula_config";

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

/**
 * Sanitizes and normalizes marketplace pricing configuration.
 */
export function sanitizePricingConfig(data: unknown): MarketplacePricingConfig {
  if (!data || typeof data !== "object") {
    return JSON.parse(JSON.stringify(DEFAULT_MARKETPLACE_PRICING_CONFIG));
  }

  const raw = data as Record<string, any>;
  const adminPercent = Number(raw.adminPercent);
  const adminFixedPerTx = Number(raw.adminFixedPerTx);
  const rounding = Number(raw.rounding);

  let tiers: PriceRangeTier[] = [];
  if (Array.isArray(raw.tiers) && raw.tiers.length > 0) {
    tiers = raw.tiers.map((t: any, index: number) => ({
      id: String(t?.id || `tier-${index + 1}`),
      minPrice: Number(t?.minPrice) || 0,
      maxPrice: t?.maxPrice !== null && t?.maxPrice !== undefined ? Number(t.maxPrice) : null,
      marginPercent: Number(t?.marginPercent) || 0,
      minBuyQty: Math.max(1, Number(t?.minBuyQty) || 1),
    }));
  } else {
    tiers = getDefaultPricingTiers();
  }

  return {
    adminPercent: Number.isFinite(adminPercent)
      ? Math.max(0, Math.min(99, adminPercent))
      : DEFAULT_MARKETPLACE_PRICING_CONFIG.adminPercent,
    adminFixedPerTx: Number.isFinite(adminFixedPerTx)
      ? Math.max(0, adminFixedPerTx)
      : DEFAULT_MARKETPLACE_PRICING_CONFIG.adminFixedPerTx,
    basePriceSource: "buyPrice", // Always enforce harga beli terakhir (HPP) in Assist
    rounding: Number.isFinite(rounding) && rounding > 0
      ? rounding
      : DEFAULT_MARKETPLACE_PRICING_CONFIG.rounding,
    tiers,
    ...(raw.updatedAt ? { updatedAt: String(raw.updatedAt) } : {}),
    ...(raw.updatedBy ? { updatedBy: String(raw.updatedBy) } : {}),
  };
}

/**
 * Reads cached pricing config from browser.storage.local or localStorage.
 */
export async function getCachedPricingConfig(): Promise<MarketplacePricingConfig | null> {
  // 1. Try browser.storage.local
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      const data = await browser.storage.local.get(STORAGE_KEY);
      if (data && data[STORAGE_KEY]) {
        const parsed =
          typeof data[STORAGE_KEY] === "string"
            ? JSON.parse(data[STORAGE_KEY])
            : data[STORAGE_KEY];
        if (parsed) {
          return sanitizePricingConfig(parsed);
        }
      }
    }
  } catch (err) {
    console.warn("[PricingConfig] Failed to read from browser.storage.local:", err);
  }

  // 2. Fallback to localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed) {
        return sanitizePricingConfig(parsed);
      }
    }
  } catch (err) {
    console.warn("[PricingConfig] Failed to read from localStorage:", err);
  }

  return null;
}

/**
 * Persists pricing config to local caches (browser.storage.local and localStorage).
 */
export async function writeLocalPricingCache(config: MarketplacePricingConfig): Promise<void> {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      await browser.storage.local.set({ [STORAGE_KEY]: config });
    }
  } catch (err) {
    console.warn("[PricingConfig] Failed to update browser.storage.local cache:", err);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn("[PricingConfig] Failed to update localStorage cache:", err);
  }
}

/**
 * Loads marketplace pricing config from Firestore as primary source of truth,
 * with automatic fallback to local cache and defaults.
 */
export async function loadMarketplacePricingConfig(): Promise<MarketplacePricingConfig> {
  const cached = await getCachedPricingConfig();

  // Try fetching latest config from Firestore
  try {
    if (db) {
      const docRef = doc(db, PRICING_SETTINGS_COLLECTION, PRICING_SETTINGS_DOC);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const firestoreConfig = sanitizePricingConfig(snap.data());
        // Update local caches with authoritative Firestore data
        await writeLocalPricingCache(firestoreConfig);
        return firestoreConfig;
      } else if (cached) {
        // Document doesn't exist in Firestore yet, but we have local config:
        // Attempt initial sync to Firestore if authenticated
        try {
          if (auth?.currentUser) {
            await setDoc(docRef, cached, { merge: true });
          }
        } catch {
          // Non-blocking initial sync
        }
      }
    }
  } catch (err) {
    console.warn("[PricingConfig] Could not fetch from Firestore (using local cache):", err);
  }

  if (cached) {
    return cached;
  }

  return JSON.parse(JSON.stringify(DEFAULT_MARKETPLACE_PRICING_CONFIG));
}

/**
 * Saves marketplace pricing config to Firestore and updates local cache.
 */
export async function saveMarketplacePricingConfig(
  config: MarketplacePricingConfig,
  updatedBy?: string,
): Promise<MarketplacePricingConfig> {
  const safeConfig = sanitizePricingConfig(config);
  safeConfig.updatedAt = new Date().toISOString();

  const author = updatedBy || auth?.currentUser?.email;
  if (author) {
    safeConfig.updatedBy = author;
  }

  // 1. Try to save to Firestore
  let firestoreSaved = false;
  try {
    if (db) {
      const docRef = doc(db, PRICING_SETTINGS_COLLECTION, PRICING_SETTINGS_DOC);
      await setDoc(docRef, safeConfig, { merge: true });
      firestoreSaved = true;
    }
  } catch (err) {
    console.warn("[PricingConfig] Failed to save to Firestore (persisting locally):", err);
  }

  // 2. Always persist to local cache
  await writeLocalPricingCache(safeConfig);

  if (!firestoreSaved && db) {
    console.warn("[PricingConfig] Pricing config saved to local storage, but Firestore sync was unsuccessful.");
  }

  return safeConfig;
}

/**
 * Real-time subscription to pricing config changes from Firestore.
 */
export function subscribeMarketplacePricingConfig(
  onUpdate: (config: MarketplacePricingConfig) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  try {
    if (!db) return null;
    const docRef = doc(db, PRICING_SETTINGS_COLLECTION, PRICING_SETTINGS_DOC);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const config = sanitizePricingConfig(snap.data());
          void writeLocalPricingCache(config);
          onUpdate(config);
        }
      },
      (err) => {
        console.warn("[PricingConfig] Firestore onSnapshot error:", err);
        if (onError) onError(err);
      },
    );
  } catch (err: any) {
    console.warn("[PricingConfig] Failed to initialize Firestore listener:", err);
    if (onError) onError(err);
    return null;
  }
}
