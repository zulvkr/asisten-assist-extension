import type { PemasukanData } from "@/types/PemasukanData";
import type { DestySkuMapping, AssistCatalogItem } from "@/types/destySync";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";
import { buildPemasukanRequest } from "@/utils/pemasukanApi";
import type {
  OfflineSoldItem,
  OfflineSaleReductionItem,
  OfflineStockSyncLog,
} from "@/types/offlineStockSync";

/**
 * Fetches all PemasukanData records from Assist for the given date range.
 */
export async function fetchAllAssistPemasukan(
  startDate: string,
  endDate: string,
  token: string,
): Promise<PemasukanData[]> {
  const allRows: PemasukanData[] = [];
  const pageSize = 1000;
  let skip = 0;

  while (true) {
    const { url } = buildPemasukanRequest({
      tanggalMin: startDate,
      tanggalMax: endDate,
      limit: pageSize,
      skip,
    });

    const response = (await browser.runtime.sendMessage({
      type: "FETCH_PEMASUKAN_DATA",
      payload: { url, token },
    })) as { ok: boolean; status?: number; error?: string; data?: PemasukanData[] } | undefined;

    if (!response?.ok || !response.data) {
      const errorMessage = response?.error ?? `Gagal mengambil data pemasukan: ${response?.status ?? "unknown"}`;
      throw new Error(errorMessage);
    }

    const rows = response.data;
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
    skip += pageSize;
  }

  return allRows;
}

const ALLOWED_ITEM_TYPES = new Set(["prescription", "akhp", "scourPrescription"]);

const MARKETPLACE_KEYWORDS = ["shopee", "tiktok", "tokopedia", "tokped", "blibli", "goapotik", "marketplace"];

/**
 * Determines if a transaction in Assist is an online / marketplace transaction.
 */
export function isOnlineAssistTransaction(tx: PemasukanData): boolean {
  if (!tx) return false;

  // 1. Check paidName metadata (standard format for Desty imported orders: DESTY|platform=...|order=...)
  const paidName = (tx.paidName || "").trim().toLowerCase();
  if (
    paidName.startsWith("desty|") ||
    paidName.startsWith("desty ") ||
    paidName.includes("platform=") ||
    paidName.includes("order=") ||
    paidName.includes("booking=")
  ) {
    return true;
  }

  // 2. Check Payments list for marketplace keywords
  const payments = Array.isArray(tx.Payments) ? tx.Payments : [];
  for (const p of payments) {
    const raw = `${p.type ?? ""} ${p.name ?? ""} ${p.intent ?? ""} ${p.reason ?? ""}`.toLowerCase();
    if (MARKETPLACE_KEYWORDS.some((kw) => raw.includes(kw))) {
      return true;
    }
  }

  // 3. Check customer name or patient name for marketplace tags
  const patientName = (tx.Patient?.name || tx.Patient?.nama || "").toLowerCase();
  if (MARKETPLACE_KEYWORDS.some((kw) => patientName.includes(kw))) {
    return true;
  }

  return false;
}

/**
 * Aggregates offline sold items from Assist Pemasukan transactions.
 */
export function getAssistOfflineSoldItems(
  transactions: PemasukanData[],
  options: {
    includeOnlyPaidOff?: boolean;
    excludeOnline?: boolean;
  } = {},
): {
  soldItems: OfflineSoldItem[];
  skippedOnlineCount: number;
} {
  const includeOnlyPaidOff = options.includeOnlyPaidOff ?? true;
  const excludeOnline = options.excludeOnline ?? true;

  const grouped = new Map<string, OfflineSoldItem>();
  let skippedOnlineCount = 0;

  for (const tx of transactions) {
    if (includeOnlyPaidOff && tx.status !== "paid off") {
      continue;
    }

    if (excludeOnline && isOnlineAssistTransaction(tx)) {
      skippedOnlineCount++;
      continue;
    }

    const items = Array.isArray(tx.Items) ? tx.Items : [];
    for (const item of items) {
      if (!ALLOWED_ITEM_TYPES.has(item.type)) {
        continue;
      }

      const itemType: "prescription" | "akhp" = item.type === "akhp" ? "akhp" : "prescription";
      const assistItemId = (itemType === "akhp" ? item.akhpId : item.medicineId)?.trim() || "";
      const assistItemName = (item.name || "").trim() || "Item Tanpa Nama";
      const assistCode = (item.code || "").trim();
      const assistUnit = (item.unit || "Pcs").trim();
      const quantity = Number(item.quantity) || 0;

      if (quantity <= 0) continue;

      const groupKey = assistItemId || `__name__::${assistItemName}`;
      const existing = grouped.get(groupKey);

      if (existing) {
        existing.offlineQty += quantity;
      } else {
        grouped.set(groupKey, {
          assistItemId,
          assistItemType: itemType,
          assistCode,
          assistItemName,
          assistUnit,
          offlineQty: quantity,
        });
      }
    }
  }

  return {
    soldItems: Array.from(grouped.values()).sort(
      (a, b) => b.offlineQty - a.offlineQty || a.assistItemName.localeCompare(b.assistItemName),
    ),
    skippedOnlineCount,
  };
}

export interface BuildReductionItemsParams {
  soldItems: OfflineSoldItem[];
  mappings: DestySkuMapping[];
  destyStockMap: Record<string, DestyOmniStockItem>;
  assistStockMap?: Record<string, number | null | undefined>;
  assistCatalog?: AssistCatalogItem[];
  manualOverrides?: Record<string, { reductionQty?: number; checked?: boolean }>;
  syncResults?: Record<string, { status: "success" | "error"; message?: string }>;
}

/**
 * Matches sold items against Desty SKU mappings & live Desty stocks to build reduction rows.
 */
export function buildOfflineStockReductionItems(
  params: BuildReductionItemsParams,
): OfflineSaleReductionItem[] {
  const {
    soldItems,
    mappings,
    destyStockMap,
    assistStockMap,
    assistCatalog,
    manualOverrides = {},
    syncResults = {},
  } = params;
  const items: OfflineSaleReductionItem[] = [];

  // Build lookup index of mappings by assistId and assistCode
  const mappingsByAssistId = new Map<string, DestySkuMapping[]>();
  const mappingsByAssistCode = new Map<string, DestySkuMapping[]>();

  for (const m of mappings) {
    if (!m.active) continue;
    if (m.assistId) {
      const list = mappingsByAssistId.get(m.assistId) || [];
      list.push(m);
      mappingsByAssistId.set(m.assistId, list);
    }
    if (m.assistCode) {
      const codeUpper = m.assistCode.trim().toUpperCase();
      const list = mappingsByAssistCode.get(codeUpper) || [];
      list.push(m);
      mappingsByAssistCode.set(codeUpper, list);
    }
  }

  // Build lookup index for assist stock
  const assistStockById = new Map<string, number>();
  const assistStockByCode = new Map<string, number>();
  const assistStockByName = new Map<string, number>();

  if (assistCatalog && Array.isArray(assistCatalog)) {
    for (const cat of assistCatalog) {
      if (typeof cat.stock === "number") {
        if (cat.id) assistStockById.set(cat.id, cat.stock);
        if (cat.code) assistStockByCode.set(cat.code.trim().toUpperCase(), cat.stock);
        if (cat.name) assistStockByName.set(cat.name.trim().toLowerCase(), cat.stock);
      }
    }
  }

  if (assistStockMap) {
    for (const [id, stock] of Object.entries(assistStockMap)) {
      if (typeof stock === "number") {
        assistStockById.set(id, stock);
      }
    }
  }

  for (const sold of soldItems) {
    if (sold.offlineQty <= 0) continue;

    // Find candidate mappings for this sold item
    let matchedMappings: DestySkuMapping[] = [];
    if (sold.assistItemId && mappingsByAssistId.has(sold.assistItemId)) {
      matchedMappings = mappingsByAssistId.get(sold.assistItemId)!;
    } else if (sold.assistCode && mappingsByAssistCode.has(sold.assistCode.toUpperCase())) {
      matchedMappings = mappingsByAssistCode.get(sold.assistCode.toUpperCase())!;
    }

    const candidates = matchedMappings.length > 0
      ? matchedMappings.map((m) => ({
          destySku: m.destySku.trim().toUpperCase(),
          destyUnit: m.destyUnit || sold.assistUnit || "Pcs",
          conversionFactor: Number(m.conversionFactor) || 1,
          isMapped: true,
          assistId: m.assistId,
        }))
      : [{
          destySku: (sold.assistCode || sold.assistItemName).trim().toUpperCase(),
          destyUnit: sold.assistUnit || "Pcs",
          conversionFactor: 1,
          isMapped: false,
          assistId: sold.assistItemId,
        }];

    for (const cand of candidates) {
      const rowKey = `${sold.assistItemId || sold.assistCode || sold.assistItemName}__${cand.destySku}`;
      const destyInfo = destyStockMap[cand.destySku];

      // Resolve assist stock
      let assistStock: number | null = null;
      if (sold.assistItemId && assistStockById.has(sold.assistItemId)) {
        assistStock = assistStockById.get(sold.assistItemId)!;
      } else if (cand.assistId && assistStockById.has(cand.assistId)) {
        assistStock = assistStockById.get(cand.assistId)!;
      } else if (sold.assistCode && assistStockByCode.has(sold.assistCode.toUpperCase())) {
        assistStock = assistStockByCode.get(sold.assistCode.toUpperCase())!;
      } else if (sold.assistItemName && assistStockByName.has(sold.assistItemName.toLowerCase())) {
        assistStock = assistStockByName.get(sold.assistItemName.toLowerCase())!;
      }

      const destyStockFound = !!destyInfo && (
        destyInfo.fisik !== null ||
        destyInfo.breakdown?.fisik !== null ||
        destyInfo.stock !== null
      );

      const destyFisik = destyInfo
        ? (destyInfo.fisik ?? destyInfo.breakdown?.fisik ?? destyInfo.stock ?? null)
        : null;
      const destyReserved = destyInfo
        ? (destyInfo.pesanan ?? destyInfo.breakdown?.pesanan ?? 0)
        : 0;
      const destyTersedia = destyInfo
        ? (destyInfo.tersedia ?? destyInfo.breakdown?.tersedia ?? (destyFisik !== null ? destyFisik - destyReserved : null))
        : null;

      const qtyDesty = Math.round((sold.offlineQty / cand.conversionFactor) * 1000) / 1000;
      const override = manualOverrides[rowKey];
      const reductionQty = override?.reductionQty !== undefined ? override.reductionQty : qtyDesty;
      const calculatedFisikBaru = destyFisik !== null ? destyFisik - reductionQty : null;
      const calculatedTersediaBaru = calculatedFisikBaru !== null ? calculatedFisikBaru - destyReserved : null;

      // Determine item status
      const syncRes = syncResults[rowKey];
      let status: OfflineSaleReductionItem["status"] = "ready";
      let statusMessage = "Siap dikurangi";
      let badgeColor = "positive";

      if (syncRes?.status === "success") {
        status = "synced";
        statusMessage = "Berhasil dikurangi di Desty";
        badgeColor = "positive";
      } else if (syncRes?.status === "error") {
        status = "error";
        statusMessage = syncRes.message || "Gagal sinkron";
        badgeColor = "red";
      } else if (!destyStockFound || !destyInfo?.skuId) {
        status = "unmapped";
        statusMessage = !cand.isMapped
          ? "Belum dipetakan & tidak ditemukan di Desty"
          : "SKU Desty tidak ditemukan di katalog Omni";
        badgeColor = "red";
      } else if (reductionQty <= 0) {
        status = "warning";
        statusMessage = "Jumlah pengurangan harus lebih dari 0";
        badgeColor = "amber-9";
      } else if (destyFisik !== null && destyFisik < reductionQty) {
        status = "warning";
        statusMessage = `Stok fisik Desty (${destyFisik}) < Pengurangan (${reductionQty} ${cand.destyUnit})`;
        badgeColor = "amber-9";
      } else if (calculatedTersediaBaru !== null && calculatedTersediaBaru < 0) {
        status = "warning";
        statusMessage = `Tersedia baru minus (${calculatedTersediaBaru}) karena ada pesanan (${destyReserved})`;
        badgeColor = "amber-9";
      } else {
        status = "ready";
        statusMessage = "Siap dikurangi";
        badgeColor = "positive";
      }

      const checked = override?.checked !== undefined
        ? override.checked
        : (status === "ready");

      items.push({
        rowKey,
        assistItemId: sold.assistItemId,
        assistItemType: sold.assistItemType,
        assistCode: sold.assistCode,
        assistItemName: sold.assistItemName,
        assistUnit: sold.assistUnit,
        offlineQty: sold.offlineQty,
        assistStock,
        destySku: cand.destySku,
        destyUnit: cand.destyUnit,
        conversionFactor: cand.conversionFactor,
        isMapped: cand.isMapped,
        destyStockFound,
        destySkuId: destyInfo?.skuId,
        destyWarehouseId: destyInfo?.warehouseId,
        destyProductName: destyInfo?.productName,
        destyFisik,
        destyReserved,
        destyTersedia,
        qtyDesty,
        reductionQty,
        calculatedFisikBaru,
        calculatedTersediaBaru,
        checked,
        status,
        statusMessage,
        badgeColor,
      });
    }
  }

  return items;
}

export interface ExecuteStockSyncParams {
  items: OfflineSaleReductionItem[];
  destyToken: string;
  destyTenantId?: string;
  defaultWarehouseId?: string;
  onProgress?: (progress: {
    current: number;
    total: number;
    success: number;
    failed: number;
    log: OfflineStockSyncLog;
  }) => void;
}

/**
 * Executes stock reduction in Desty Omni via extension background messaging or direct API.
 */
export async function executeOfflineStockReduction(
  params: ExecuteStockSyncParams,
): Promise<{
  successCount: number;
  failedCount: number;
  results: Record<string, { status: "success" | "error"; message?: string }>;
}> {
  const { items, destyToken, destyTenantId, defaultWarehouseId = "2042620805094077644", onProgress } = params;
  const results: Record<string, { status: "success" | "error"; message?: string }> = {};
  let successCount = 0;
  let failedCount = 0;

  const emitLog = (current: number, text: string, type: OfflineStockSyncLog["type"] = "info") => {
    if (onProgress) {
      onProgress({
        current,
        total: items.length,
        success: successCount,
        failed: failedCount,
        log: {
          text,
          type,
          time: new Date().toLocaleTimeString("id-ID", { hour12: false }),
        },
      });
    }
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const currentIndex = i + 1;

    if (!item.destySkuId) {
      failedCount++;
      results[item.rowKey] = { status: "error", message: "skuId Desty tidak ditemukan" };
      emitLog(currentIndex, `[GAGAL] ${item.destySku}: skuId Desty tidak ditemukan.`, "error");
      continue;
    }

    const amount = -Math.abs(item.reductionQty);
    emitLog(currentIndex, `[SYNC] Mengurangi ${item.destySku} (${item.assistItemName}) sebesar ${amount} ${item.destyUnit}...`, "info");

    try {
      const response = await browser.runtime.sendMessage({
        type: "UPDATE_DESTY_ON_HAND",
        payload: {
          token: destyToken,
          tenantId: destyTenantId,
          skuId: item.destySkuId,
          warehouseId: item.destyWarehouseId || defaultWarehouseId,
          amount,
          editType: "Add",
        },
      });

      if (!response || !response.ok) {
        throw new Error(response?.error || "Gagal menghubungi API Desty");
      }

      successCount++;
      results[item.rowKey] = { status: "success" };
      emitLog(currentIndex, `[BERHASIL] ${item.destySku} berhasil dikurangi ${amount} ${item.destyUnit}.`, "success");
    } catch (err: any) {
      failedCount++;
      const errMsg = err?.message || "Gagal mengubah stok fisik";
      results[item.rowKey] = { status: "error", message: errMsg };
      emitLog(currentIndex, `[GAGAL] ${item.destySku}: ${errMsg}`, "error");
    }
  }

  return { successCount, failedCount, results };
}
