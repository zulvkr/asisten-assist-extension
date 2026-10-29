import type {
  StockOpnameItemRow,
  StockOpnameCountsMap,
  AssistRepairStockOpnameItem,
  StockOpnameScope,
} from "@/types/stockOpname";
import { DEFAULT_DISCREPANCY_REASON } from "@/types/stockOpname";

/**
 * Memfilter master produk berdasarkan cakupan sesi (Scope):
 * - "Full": Semua obat dan BHP
 * - "PerShift": Hanya produk yang termasuk dalam itemIdsFilter
 */
export function filterMasterItemsByScope(
  masterRows: StockOpnameItemRow[],
  scope: StockOpnameScope,
  itemIdsFilter?: string[],
): StockOpnameItemRow[] {
  if (scope === "PerShift" && Array.isArray(itemIdsFilter) && itemIdsFilter.length > 0) {
    const filterSet = new Set(itemIdsFilter.map((id) => id.trim().toLowerCase()));
    return masterRows.filter((r) => filterSet.has(r.id.toLowerCase()) || filterSet.has(r.code.toLowerCase()));
  }
  return masterRows;
}

/**
 * Menggabungkan master data katalog Assist dengan data hitungan fisik dari Firestore.
 */
export function mergeMasterWithCounts(
  masterRows: StockOpnameItemRow[],
  counts: StockOpnameCountsMap,
): StockOpnameItemRow[] {
  return masterRows.map((item) => {
    const saved = counts[item.id];
    if (saved && typeof saved.countedQuantity === "number") {
      const variance = saved.countedQuantity - item.systemQuantity;
      return {
        ...item,
        countedQuantity: saved.countedQuantity,
        variance,
        reason: saved.reason || "",
        isCounted: true,
      };
    }
    return {
      ...item,
      countedQuantity: null,
      variance: null,
      reason: "",
      isCounted: false,
    };
  });
}

export interface OpnameSummary {
  totalItems: number;
  countedItems: number;
  uncountedItems: number;
  discrepancyCount: number;
  totalVariance: number;
  surplusCount: number;
  surplusSum: number;
  deficitCount: number;
  deficitSum: number;
}

/**
 * Menghitung ringkasan statistik proses stock opname.
 */
export function calculateOpnameSummary(items: StockOpnameItemRow[]): OpnameSummary {
  let countedItems = 0;
  let discrepancyCount = 0;
  let totalVariance = 0;
  let surplusCount = 0;
  let surplusSum = 0;
  let deficitCount = 0;
  let deficitSum = 0;

  for (const item of items) {
    if (item.isCounted && item.countedQuantity !== null) {
      countedItems++;
      const v = item.countedQuantity - item.systemQuantity;
      totalVariance += v;

      if (v !== 0) {
        discrepancyCount++;
        if (v > 0) {
          surplusCount++;
          surplusSum += v;
        } else {
          deficitCount++;
          deficitSum += Math.abs(v);
        }
      }
    }
  }

  return {
    totalItems: items.length,
    countedItems,
    uncountedItems: items.length - countedItems,
    discrepancyCount,
    totalVariance,
    surplusCount,
    surplusSum,
    deficitCount,
    deficitSum,
  };
}

export interface BuildRepairPayloadParams {
  items: StockOpnameItemRow[];
  hospitalId: string;
  defaultReason?: string;
  /**
   * Jika disediakan, sistem menggunakan stok terbaru dari Assist sebagai qtyBefore
   * untuk menghindari bentrok dengan penjualan kasir yang terjadi selama opname berlangsung.
   */
  liveStockByItemId?: Record<string, number>;
}

/**
 * Membangun array payload untuk endpoint Assist: PUT /api/KTxes/repairStockOpname
 * Hanya item yang dihitung dan memiliki selisih yang dimasukkan ke payload.
 */
export function buildAssistRepairPayload(
  params: BuildRepairPayloadParams,
): AssistRepairStockOpnameItem[] {
  const repairItems: AssistRepairStockOpnameItem[] = [];
  const defaultReason = params.defaultReason || DEFAULT_DISCREPANCY_REASON;

  for (const row of params.items) {
    if (!row.isCounted || row.countedQuantity === null) {
      continue; // Item belum dihitung diabaikan
    }

    // Gunakan live stock jika ada, fallback ke systemQuantity awal
    const qtyBefore =
      params.liveStockByItemId && params.liveStockByItemId[row.id] !== undefined
        ? params.liveStockByItemId[row.id]
        : row.systemQuantity;

    const qtyAfter = row.countedQuantity;
    const diff = qtyAfter - qtyBefore;

    if (diff === 0) {
      continue; // Tidak ada selisih, tidak perlu repair
    }

    const isMinus = diff < 0;
    repairItems.push({
      type: isMinus ? "auditMinus" : "auditPlus",
      itemType: row.itemValue === "akhp" ? "akhp" : "prescription",
      itemValue: row.itemValue,
      hospitalId: params.hospitalId,
      depotId: row.depotStockId,
      depotName: row.depotName || "Apotek",
      medOrAkhpId: row.id,
      medOrAkhpName: row.name,
      itemName: row.name,
      itemCode: row.code,
      quantity: diff, // bertanda (-1 atau +1)
      difference: Math.abs(diff), // absolut (1)
      qtyBefore,
      qtyAfter,
      itemNotes: row.reason.trim() || defaultReason,
    });
  }

  return repairItems;
}
