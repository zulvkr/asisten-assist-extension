import type { DestyStockBreakdown } from "@/composables/destyOmniStockApi";
import { formatRupiah } from "@/utils/rupiahUtils";

export type KesesuaianStock =
  | "Sesuai"
  | "Tidak Sesuai"
  | "SKU belum diisi"
  | "Hanya di Desty"
  | "Hanya di Assist";

export type StockAttentionTone = "red" | "yellow" | "orange" | null;

/**
 * Aggregated item sold for a date range.
 * medicineId is the Assist-internal join key (links to KMedicineStocks id).
 * sku is optional — only populated when marginData has one, for future Desty matching.
 */
export interface SoldItemAggregate {
  medicineId: string;
  itemName: string;
  qtySold: number;
  source: "assist" | "desty";
  sku?: string;
}

export interface StockComparisonRow {
  medicineId: string;
  kodeObat: string;
  sku?: string;
  itemName: string;
  qtySold: number;
  assistStock: number | null;
  destyEquivalentStock?: number | null;
  conversionFactor?: number;
  destyStock: number | null;
  destyStockDetail: DestyStockBreakdown | null;
  kesesuaian: KesesuaianStock;
  attentionLabel: string | null;
  attentionTone: StockAttentionTone;
  notes: string[];
}

export interface CompareStockLevelsInput {
  soldItems: SoldItemAggregate[];
  /** medicineId → stockTotal from KMedicineStocks */
  assistStockByMedicineId?: Record<string, number | null | undefined>;
  /** medicineId → sellNormalFee from KMedicineStocks/KAKHPStocks */
  sellNormalFeeByMedicineId?: Record<string, number | null | undefined>;
  /** medicineId → kodeObat (code field from KMedicineStocks) */
  kodeObatByMedicineId?: Record<string, string>;
  /** sku → stockTotal from Desty, for future use */
  destyStockBySku?: Record<string, number | null | undefined>;
  /** sku → Desty stock breakdown for UI */
  destyStockDetailBySku?: Record<string, DestyStockBreakdown | undefined>;
  /** sku → conversionFactor (Desty unit to Assist unit) */
  conversionFactorBySku?: Record<string, number>;
}

function normalizeStock(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function resolveKesesuaian(
  assistStock: number | null,
  destyStock: number | null,
  hasSku: boolean,
): KesesuaianStock {
  if (!hasSku) {
    return "SKU belum diisi";
  }
  if (assistStock === null) {
    return "Hanya di Desty";
  }
  if (destyStock === null) {
    return "Hanya di Assist";
  }
  if (destyStock !== assistStock) {
    return "Tidak Sesuai";
  }
  return "Sesuai";
}

function resolveAttention(input: {
  assistStock: number | null;
  destyStock: number | null;
  hasSku: boolean;
  sellNormalFee: number | null;
}): { label: string | null; tone: StockAttentionTone; notes: string[] } {
  const { assistStock, destyStock, hasSku, sellNormalFee } = input;

  if (!hasSku || assistStock === null || destyStock === null) {
    return {
      label: null,
      tone: null,
      notes: [],
    };
  }

  if (assistStock > destyStock) {
    if (destyStock === 0) {
      return {
        label: "Potensi kehilangan penjualan online",
        tone: "red",
        notes: [],
      };
    }

    return {
      label: "Segera isi Desty",
      tone: "yellow",
      notes: [],
    };
  }

  if (destyStock > assistStock) {
    return {
      label: "Risiko overselling",
      tone: "orange",
      notes: [],
    };
  }

  return {
    label: null,
    tone: null,
    notes: [],
  };
}

export function compareStockLevels(
  input: CompareStockLevelsInput,
): StockComparisonRow[] {
  const grouped = new Map<
    string,
    {
      medicineId: string;
      itemName: string;
      qtySold: number;
      sku?: string;
      notes: string[];
    }
  >();

  for (const item of input.soldItems) {
    const medicineId = item.medicineId?.trim() ?? "";
    // Keep rows without medicineId in output so callers can surface unknowns.
    const aggregateKey =
      medicineId || `__noId__::${item.sku ?? ""}::${item.itemName}`;

    const existing = grouped.get(aggregateKey);
    if (existing) {
      existing.qtySold += item.qtySold;
      continue;
    }

    const notes: string[] = [];
    if (!medicineId) {
      notes.push(
        "medicineId tidak tersedia; tidak dapat dipetakan ke stok Assist.",
      );
    }

    grouped.set(aggregateKey, {
      medicineId,
      itemName: item.itemName,
      qtySold: item.qtySold,
      sku: item.sku,
      notes,
    });
  }

  const normalizedDestyStock: Record<string, number | null> = {};
  if (input.destyStockBySku) {
    for (const [k, v] of Object.entries(input.destyStockBySku)) {
      if (k) normalizedDestyStock[k.trim().toUpperCase()] = normalizeStock(v);
    }
  }

  const normalizedDestyDetail: Record<string, DestyStockBreakdown> = {};
  if (input.destyStockDetailBySku) {
    for (const [k, v] of Object.entries(input.destyStockDetailBySku)) {
      if (k && v) normalizedDestyDetail[k.trim().toUpperCase()] = v;
    }
  }

  const normalizedConversionFactors: Record<string, number> = {};
  if (input.conversionFactorBySku) {
    for (const [k, v] of Object.entries(input.conversionFactorBySku)) {
      if (k && Number.isFinite(v) && v > 0) normalizedConversionFactors[k.trim().toUpperCase()] = v;
    }
  }

  const rows: StockComparisonRow[] = [];
  for (const aggregate of grouped.values()) {
    const medicineId = aggregate.medicineId;
    const assistStock = normalizeStock(
      input.assistStockByMedicineId?.[medicineId],
    );
    const kodeObat = input.kodeObatByMedicineId?.[medicineId] ?? "";
    const sku = aggregate.sku ?? "";
    const skuKey = sku.trim().toUpperCase();
    const destyStockDetail = skuKey
      ? (normalizedDestyDetail[skuKey] ?? null)
      : null;
    const destyStock = skuKey
      ? (normalizeStock(destyStockDetail?.tersedia) ?? normalizedDestyStock[skuKey] ?? null)
      : null;
    const conversionFactor = skuKey && normalizedConversionFactors[skuKey]
      ? normalizedConversionFactors[skuKey]
      : 1;
    const destyEquivalentStock = assistStock !== null && conversionFactor > 0
      ? Math.floor(assistStock / conversionFactor)
      : assistStock;

    const sellNormalFee = normalizeStock(
      input.sellNormalFeeByMedicineId?.[medicineId],
    );
    const notes = [...aggregate.notes];
    if (!sku) {
      notes.push("SKU belum diisi.");
    }

    const attention = resolveAttention({
      assistStock: destyEquivalentStock,
      destyStock,
      hasSku: Boolean(sku),
      sellNormalFee,
    });
    notes.push(...attention.notes);

    rows.push({
      medicineId,
      kodeObat,
      sku: aggregate.sku,
      itemName: aggregate.itemName,
      qtySold: aggregate.qtySold,
      assistStock,
      destyEquivalentStock,
      conversionFactor,
      destyStock,
      destyStockDetail,
      kesesuaian: resolveKesesuaian(destyEquivalentStock, destyStock, Boolean(sku)),
      attentionLabel: attention.label,
      attentionTone: attention.tone,
      notes,
    });
  }

  return rows.sort(
    (a, b) => b.qtySold - a.qtySold || a.kodeObat.localeCompare(b.kodeObat),
  );
}
