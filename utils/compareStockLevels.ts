export type KesesuaianStock =
  | "Sesuai"
  | "Tidak sesuai"
  | "SKU belum diisi"
  | "Stok Assist tidak tersedia"
  | "Stok Desty tidak tersedia";

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
  kesesuaian: KesesuaianStock;
  notes: string[];
}

export interface CompareStockLevelsInput {
  soldItems: SoldItemAggregate[];
  /** medicineId → stockTotal from KMedicineStocks */
  assistStockByMedicineId?: Record<string, number | null | undefined>;
  /** medicineId → kodeObat (code field from KMedicineStocks) */
  kodeObatByMedicineId?: Record<string, string>;
  /** sku → stockTotal from Desty, for future use */
  destyStockBySku?: Record<string, number | null | undefined>;
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
    const destyStock = sku
      ? normalizeStock(input.destyStockBySku?.[sku])
      : null;
    const notes = [...aggregate.notes];
    if (!sku) {
      notes.push(
        "SKU belum diisi — lengkapi kode obat dan SKU di sheet margin.",
      );
    }

    rows.push({
      medicineId,
      kodeObat,
      sku: aggregate.sku,
      itemName: aggregate.itemName,
      qtySold: aggregate.qtySold,
      assistStock,
      destyStock,
      kesesuaian: resolveKesesuaian(assistStock, destyStock, Boolean(sku)),
      notes,
    });
  }

  return rows.sort(
    (a, b) => b.qtySold - a.qtySold || a.kodeObat.localeCompare(b.kodeObat),
  );
}
