import type { DestyStockBreakdown } from "@/composables/destyOmniStockApi";
import { formatRupiah } from "@/utils/rupiahUtils";

export type KesesuaianStock =
  | "Sesuai"
  | "Tidak sesuai"
  | "SKU belum diisi"
  | "Stok Assist tidak tersedia"
  | "Stok Desty tidak tersedia";

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
    return "Stok Assist tidak tersedia";
  }
  if (destyStock === null) {
    return "Stok Desty tidak tersedia";
  }
  if (destyStock !== assistStock) {
    return "Tidak sesuai";
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
    const stockGap = assistStock - destyStock;
    if (destyStock === 0) {
      const lostSalesValue = stockGap * Math.max(sellNormalFee ?? 0, 0);
      const notes =
        sellNormalFee === null
          ? [
              "Harga jual Assist tidak tersedia; estimasi kehilangan penjualan memakai Rp 0.",
            ]
          : [];

      return {
        label: `Potensi kehilangan penjualan ${formatRupiah(lostSalesValue)}`,
        tone: "red",
        notes,
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

  const rows: StockComparisonRow[] = [];
  for (const aggregate of grouped.values()) {
    const medicineId = aggregate.medicineId;
    const assistStock = normalizeStock(
      input.assistStockByMedicineId?.[medicineId],
    );
    const kodeObat = input.kodeObatByMedicineId?.[medicineId] ?? "";
    const sku = aggregate.sku ?? "";
    const destyStockDetail = sku
      ? (input.destyStockDetailBySku?.[sku] ?? null)
      : null;
    const destyStock = sku
      ? normalizeStock(
          destyStockDetail?.tersedia ?? input.destyStockBySku?.[sku],
        )
      : null;
    const sellNormalFee = normalizeStock(
      input.sellNormalFeeByMedicineId?.[medicineId],
    );
    const notes = [...aggregate.notes];
    if (!sku) {
      notes.push(
        "SKU belum diisi — lengkapi kode obat dan SKU di sheet margin.",
      );
    }

    const attention = resolveAttention({
      assistStock,
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
      destyStock,
      destyStockDetail,
      kesesuaian: resolveKesesuaian(assistStock, destyStock, Boolean(sku)),
      attentionLabel: attention.label,
      attentionTone: attention.tone,
      notes,
    });
  }

  return rows.sort(
    (a, b) => b.qtySold - a.qtySold || a.kodeObat.localeCompare(b.kodeObat),
  );
}
