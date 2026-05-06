export type StockStatus = "good" | "warning" | "critical" | "unknown";

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
  itemName: string;
  qtySold: number;
  assistStock: number | null;
  destyStock: number | null;
  status: StockStatus;
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

function resolveStatus(
  assistStock: number | null,
  qtySold: number,
): StockStatus {
  if (assistStock === null) {
    return "unknown";
  }
  if (assistStock <= 0 && qtySold > 0) {
    return "critical";
  }
  if (assistStock < qtySold) {
    return "warning";
  }
  return "good";
}

export function compareStockLevels(
  input: CompareStockLevelsInput,
): StockComparisonRow[] {
  const grouped = new Map<
    string,
    { itemName: string; qtySold: number; sku?: string; notes: string[] }
  >();

  for (const item of input.soldItems) {
    const medicineId = item.medicineId?.trim();
    if (!medicineId) {
      continue;
    }

    const existing = grouped.get(medicineId);
    if (existing) {
      existing.qtySold += item.qtySold;
      continue;
    }

    grouped.set(medicineId, {
      itemName: item.itemName,
      qtySold: item.qtySold,
      sku: item.sku,
      notes: [],
    });
  }

  const rows: StockComparisonRow[] = [];
  for (const [medicineId, aggregate] of grouped.entries()) {
    const assistStock = normalizeStock(
      input.assistStockByMedicineId?.[medicineId],
    );
    const kodeObat = input.kodeObatByMedicineId?.[medicineId] ?? "";
    const sku = aggregate.sku ?? "";
    const destyStock = sku
      ? normalizeStock(input.destyStockBySku?.[sku])
      : null;

    rows.push({
      medicineId,
      kodeObat,
      itemName: aggregate.itemName,
      qtySold: aggregate.qtySold,
      assistStock,
      destyStock,
      status: resolveStatus(assistStock, aggregate.qtySold),
      notes: aggregate.notes,
    });
  }

  return rows.sort(
    (a, b) => b.qtySold - a.qtySold || a.kodeObat.localeCompare(b.kodeObat),
  );
}
