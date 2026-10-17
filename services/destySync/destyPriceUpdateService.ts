import type { PemasukanData } from "@/types/PemasukanData";
import type { DestySkuMapping } from "@/types/destySync";
import type {
  MarketplacePricingConfig,
  PriceRangeTier,
  SalesVelocityItemInfo,
  DestyPriceRecord,
} from "@/types/destyPriceUpdate";
import { isOnlineAssistTransaction } from "./offlineStockSync";

export interface TargetPriceCalculationResult {
  matchedTier: PriceRangeTier | null;
  calculatedPrice: number;
  convertedCost: number;
  targetNetReceived: number;
  netReceived: number;
  profitNominal: number;
  actualMarginPercent: number;
  adminPerUnit: number;
}

/**
 * Calculates marketplace selling price based on Assist's latest buy price (harga beli terakhir / HPP),
 * conversion factor, margin tier, and marketplace admin fees.
 */
export function calculateTargetPrice(
  latestBuyPrice: number,
  conversionFactor = 1,
  config: MarketplacePricingConfig,
): TargetPriceCalculationResult {
  const factor = Number(conversionFactor) > 0 ? Number(conversionFactor) : 1;
  // c is HPP (Harga Beli Terakhir) adjusted for unit conversion factor
  const c = Math.max(0, Number(latestBuyPrice) || 0) * factor;

  const tiers = config.tiers && config.tiers.length > 0 ? config.tiers : [];
  const matchedTier =
    tiers.find(
      (t) =>
        c >= t.minPrice && (t.maxPrice === null || t.maxPrice === undefined || c <= t.maxPrice),
    ) || tiers[tiers.length - 1] || null;

  const margin = matchedTier ? matchedTier.marginPercent : 15;
  const minQty = matchedTier ? Math.max(1, matchedTier.minBuyQty) : 1;
  const adminPct = Math.max(0, Math.min(99, config.adminPercent || 0)) / 100;
  const adminFix = Math.max(0, config.adminFixedPerTx || 0);

  // Admin tetap per unit barang (dibagi minimal pembelian)
  const adminPerUnit = adminFix / minQty;

  // Rumus Net Margin di Kantong (sebanding dengan margin kasir offline apotek):
  // Target Net Received = c / (1 - margin/100)
  // Marketplace Selling Price = (Target Net Received + adminPerUnit) / (1 - adminPct)
  const marginPct = margin / 100;
  const targetNetReceived = c / Math.max(0.01, 1 - marginPct);
  const rawPrice = (targetNetReceived + adminPerUnit) / Math.max(0.05, 1 - adminPct);

  let finalPrice = Math.round(rawPrice);
  const rounding = Number(config.rounding) > 0 ? Number(config.rounding) : 100;
  if (rounding > 0) {
    finalPrice = Math.ceil(finalPrice / rounding) * rounding;
  }

  const netReceived = finalPrice * (1 - adminPct) - adminPerUnit;
  const profitNominal = Math.round(netReceived - c);
  const actualMarginPercent = netReceived > 0 ? (profitNominal / netReceived) * 100 : 0;

  return {
    matchedTier,
    calculatedPrice: finalPrice,
    convertedCost: c,
    targetNetReceived,
    netReceived,
    profitNominal,
    actualMarginPercent,
    adminPerUnit,
  };
}

/**
 * Computes net margin nominal and percent for any given price.
 */
export function computeMarginForPrice(
  price: number,
  convertedCost: number,
  minBuyQty = 1,
  config: MarketplacePricingConfig,
): { nominal: number; percent: number; netReceived: number } {
  if (!price || price <= 0) {
    return { nominal: 0, percent: 0, netReceived: 0 };
  }
  const adminPct = Math.max(0, Math.min(99, config.adminPercent || 0)) / 100;
  const adminFix = Math.max(0, config.adminFixedPerTx || 0);
  const qty = Math.max(1, minBuyQty);
  const adminPerUnit = adminFix / qty;

  const netReceived = price * (1 - adminPct) - adminPerUnit;
  const nominal = Math.round(netReceived - convertedCost);
  // Net margin dihitung dari uang bersih yang diterima apotek
  const percent = netReceived > 0 ? (nominal / netReceived) * 100 : 0;
  return { nominal, percent, netReceived };
}

/**
 * Determines price increase risk safety based on sales velocity and percentage increase.
 */
export function determineSafety(
  onlineSold: number,
  onlineOrders: number,
  totalSold: number,
  currentPrice: number | null,
  targetPrice: number,
  percentDiff: number,
  lookbackDays = 30,
): { level: "safe" | "moderate" | "caution"; label: string; reason: string } {
  // If price decreases or stays same, always safe
  if (currentPrice !== null && targetPrice <= currentPrice) {
    return {
      level: "safe",
      label: "Aman (Turun/Sama)",
      reason: "Harga tidak dinaikkan, sehingga tidak ada risiko penurunan konversi atau komplain dari pembeli.",
    };
  }

  // Fast moving online (high sales volume)
  if (onlineSold >= 10 || onlineOrders >= 5) {
    if (percentDiff > 5) {
      return {
        level: "caution",
        label: "Perlu Waspada",
        reason: `Produk sangat laris di online (${onlineSold} pcs terjual dlm ${onlineOrders} pesanan). Kenaikan +${percentDiff.toFixed(1)}% berisiko mempengaruhi ranking & conversion rate toko. Disarankan menaikkan bertahap.`,
      };
    } else {
      return {
        level: "moderate",
        label: "Cukup Aman",
        reason: `Produk laris, namun persentase kenaikan harga masih kecil (+${percentDiff.toFixed(1)}%). Relatif aman bagi pelanggan setia.`,
      };
    }
  }

  // Moderate sales online or total
  if (onlineSold >= 2 || totalSold >= 5) {
    if (percentDiff > 20) {
      return {
        level: "caution",
        label: "Kenaikan Tinggi",
        reason: `Kenaikan harga cukup signifikan (+${percentDiff.toFixed(1)}%). Pastikan harga tetap kompetitif dibanding apotek lain.`,
      };
    } else {
      return {
        level: "moderate",
        label: "Cukup Aman",
        reason: `Penjualan normal (${onlineSold} pcs online, ${totalSold} pcs total). Kenaikan harga wajar sesuai margin target.`,
      };
    }
  }

  // Slow moving / zero online sales
  return {
    level: "safe",
    label: "Sangat Aman",
    reason: `Penjualan online jarang/belum ada (${onlineSold} pcs terjual dlm ${lookbackDays} hari). Sangat aman dinaikkan untuk memaksimalkan margin saat ada pesanan online.`,
  };
}

export interface ItemSalesVelocityAggregate {
  onlineSoldQty: number;
  onlineOrderCount: number;
  totalSoldQty: number;
  totalOrderCount: number;
  lastOnlineOrderDate: string | null;
}

/**
 * Calculates item sales velocity metrics from Assist PemasukanData records.
 */
export function calculateSalesVelocityFromTransactions(
  transactions: PemasukanData[],
): Map<string, ItemSalesVelocityAggregate> {
  const map = new Map<string, ItemSalesVelocityAggregate>();

  for (const tx of transactions) {
    const isOnline = isOnlineAssistTransaction(tx);
    const txDate = tx.createdAt ? tx.createdAt.slice(0, 10) : null;
    const items = Array.isArray(tx.Items) ? tx.Items : Array.isArray((tx as any).item) ? (tx as any).item : [];

    // Track unique orders per item within this transaction
    const seenItemsInTx = new Set<string>();

    for (const it of items) {
      const codeKey = (it.code || "").trim().toUpperCase();
      const idKey = String(it.medicineId || it.akhpId || it.id || "").trim().toLowerCase();
      const qty = Math.max(0, Number(it.quantity) || 0);

      const keysToUpdate = [codeKey, idKey].filter((k) => Boolean(k));

      for (const key of keysToUpdate) {
        let existing = map.get(key);
        if (!existing) {
          existing = {
            onlineSoldQty: 0,
            onlineOrderCount: 0,
            totalSoldQty: 0,
            totalOrderCount: 0,
            lastOnlineOrderDate: null,
          };
          map.set(key, existing);
        }

        existing.totalSoldQty += qty;
        if (!seenItemsInTx.has(key)) {
          existing.totalOrderCount += 1;
        }

        if (isOnline) {
          existing.onlineSoldQty += qty;
          if (!seenItemsInTx.has(key)) {
            existing.onlineOrderCount += 1;
          }
          if (txDate && (!existing.lastOnlineOrderDate || txDate > existing.lastOnlineOrderDate)) {
            existing.lastOnlineOrderDate = txDate;
          }
        }

        seenItemsInTx.add(key);
      }
    }
  }

  return map;
}

/**
 * Resolves match between Assist item and Desty catalog record using mappings.
 */
export function resolveDestyPriceItem(
  assistCode: string,
  mappings: DestySkuMapping[],
  destyPriceCatalog: Record<string, DestyPriceRecord>,
): {
  destySku: string;
  conversionFactor: number;
  isMapped: boolean;
  destyRecord?: DestyPriceRecord;
} {
  const codeUpper = (assistCode || "").trim().toUpperCase();

  // 1. Check in SKU mappings (destySku -> assistCode)
  const mapped = mappings.find(
    (m) => m.active !== false && (m.assistCode || "").trim().toUpperCase() === codeUpper,
  );

  if (mapped && mapped.destySku) {
    const destySkuUpper = mapped.destySku.trim().toUpperCase();
    const destyRecord = destyPriceCatalog[destySkuUpper];
    return {
      destySku: destySkuUpper,
      conversionFactor: Number(mapped.conversionFactor) > 0 ? Number(mapped.conversionFactor) : 1,
      isMapped: true,
      destyRecord,
    };
  }

  // 2. Direct match with masterSku in Desty catalog
  if (codeUpper && destyPriceCatalog[codeUpper]) {
    return {
      destySku: codeUpper,
      conversionFactor: 1,
      isMapped: true,
      destyRecord: destyPriceCatalog[codeUpper],
    };
  }

  return {
    destySku: codeUpper,
    conversionFactor: 1,
    isMapped: false,
  };
}
