import type { PemasukanData } from "@/types/PemasukanData";
import type { DestySkuMapping, AssistCatalogItem } from "@/types/destySync";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";
import { isOnlineAssistTransaction } from "./offlineStockSync";
import type {
  SoSessionMode,
  AdjustMode,
  InferredShiftType,
  AssistRestockInvoice,
  AssistRestockInvoiceItem,
  SoTableRowItem,
} from "@/types/destyStockOpname";
import { buildAssistHeaders } from "@/services/integration/assistRequest";
import { isSkuPrefixExcluded } from "@/utils/skuPrefixUtils";

/**
 * Fetches recent restock invoices from Assist KTxes.
 */
export async function fetchAssistRestockInvoices(params: {
  apiBaseUrl: string;
  hospitalId: string;
  token: string;
  limit?: number;
}): Promise<AssistRestockInvoice[]> {
  const { apiBaseUrl, hospitalId, token, limit = 30 } = params;
  if (!token || !hospitalId) return [];

  const filter = {
    where: {
      hospitalId,
      distributorId: { neq: null },
    },
    order: "createdAt DESC",
    limit,
    include: ["Distributors"],
  };

  const url = `${apiBaseUrl.replace(/\/+$/, "")}/KTxes?filter=${encodeURIComponent(JSON.stringify(filter))}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: buildAssistHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil daftar faktur restock: HTTP ${response.status}`);
  }

  const data = (await response.json()) as any[];
  if (!Array.isArray(data)) return [];

  return data.map((tx) => {
    const dist = tx.Distributors || {};
    const rawItems = Array.isArray(tx.item) ? tx.item : [];
    const items: AssistRestockInvoiceItem[] = rawItems.map((it: any) => ({
      name: String(it.name || it.itemName || "Item Tanpa Nama").trim(),
      quantity: Number(it.quantity || 0),
      unit: it.unit || undefined,
      code: it.code || it.itemCode || undefined,
      medicineId: it.medicineId || undefined,
      akhpId: it.akhpId || undefined,
      buyFee: Number(it.buyFee ?? it.baseFee ?? it.unitPrice ?? it.price ?? 0),
    }));

    return {
      id: String(tx.id || tx._id || ""),
      invoiceNumber: String(tx.nomorFaktur || tx.code || "-").trim(),
      supplierName: String(dist.supplierName || tx.supplierName || "Supplier Tanpa Nama").trim(),
      receivedDate: String(tx.transactionDate || tx.createdAt || "").slice(0, 10),
      itemCount: items.length,
      totalFee: Number(tx.totalFee || 0),
      items,
    };
  });
}

const ALLOWED_ITEM_TYPES = new Set(["prescription", "akhp", "scourPrescription"]);

export interface SoldAggregatedItem {
  assistItemId: string;
  assistItemType: "prescription" | "akhp";
  assistCode: string;
  assistItemName: string;
  assistUnit: string;
  offlineQty: number;
  onlineQty: number;
}

/**
 * Filters PemasukanData transactions by inferred shift time.
 */
export function filterTransactionsByInferredShift(
  transactions: PemasukanData[],
  shift: InferredShiftType,
  targetDate?: string,
): PemasukanData[] {
  return transactions.filter((tx) => {
    if (!tx.createdAt) return false;
    const createdDate = new Date(tx.createdAt);
    if (Number.isNaN(createdDate.getTime())) return false;

    // Filter by date if specified (YYYY-MM-DD)
    if (targetDate) {
      const txDateStr = createdDate.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
      if (txDateStr !== targetDate) return false;
    }

    if (shift === "semua") return true;

    const hour = createdDate.getHours();
    if (shift === "pagi") {
      return hour >= 6 && hour < 14;
    }
    if (shift === "siang") {
      return hour >= 14 && hour < 22;
    }
    return true;
  });
}

/**
 * Aggregates sold items from Assist transactions, separating offline vs online quantities.
 */
export function aggregateSoldItemsFromTransactions(
  transactions: PemasukanData[],
  options: {
    includeOnlyPaidOff?: boolean;
  } = {},
): SoldAggregatedItem[] {
  const includeOnlyPaidOff = options.includeOnlyPaidOff ?? true;
  const grouped = new Map<string, SoldAggregatedItem>();

  for (const tx of transactions) {
    if (includeOnlyPaidOff && tx.status !== "paid off") {
      continue;
    }

    const isOnline = isOnlineAssistTransaction(tx);
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
        if (isOnline) {
          existing.onlineQty += quantity;
        } else {
          existing.offlineQty += quantity;
        }
      } else {
        grouped.set(groupKey, {
          assistItemId,
          assistItemType: itemType,
          assistCode,
          assistItemName,
          assistUnit,
          offlineQty: isOnline ? 0 : quantity,
          onlineQty: isOnline ? quantity : 0,
        });
      }
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    // Items with offline sales first
    if (a.offlineQty > 0 && b.offlineQty <= 0) return -1;
    if (a.offlineQty <= 0 && b.offlineQty > 0) return 1;
    return b.offlineQty - a.offlineQty || a.assistItemName.localeCompare(b.assistItemName);
  });
}

export interface CandidateMapping {
  destySku: string;
  destyUnit: string;
  conversionFactor: number;
  isMapped: boolean;
  assistId?: string;
}

export function resolveCandidates(
  assistItemId: string,
  assistCode: string,
  assistName: string,
  assistUnit: string,
  mappings: DestySkuMapping[],
): CandidateMapping[] {
  const codeUpper = assistCode.trim().toUpperCase();
  const matched = mappings.filter((m) => {
    if (!m.active) return false;
    if (m.assistId && assistItemId && m.assistId === assistItemId) return true;
    if (m.assistCode && codeUpper && m.assistCode.trim().toUpperCase() === codeUpper) return true;
    return false;
  });

  if (matched.length > 0) {
    return matched.map((m) => ({
      destySku: m.destySku.trim().toUpperCase(),
      destyUnit: m.destyUnit || assistUnit || "Pcs",
      conversionFactor: Number(m.conversionFactor) || 1,
      isMapped: true,
      assistId: m.assistId,
    }));
  }

  return [
    {
      destySku: (assistCode || assistName).trim().toUpperCase(),
      destyUnit: assistUnit || "Pcs",
      conversionFactor: 1,
      isMapped: false,
      assistId: assistItemId,
    },
  ];
}

export interface AssistCatalogLookup {
  stockById: Map<string, number>;
  stockByCode: Map<string, number>;
  stockByName: Map<string, number>;
  itemById: Map<string, AssistCatalogItem>;
  itemByCode: Map<string, AssistCatalogItem>;
}

export function buildCatalogLookup(catalog: AssistCatalogItem[]): AssistCatalogLookup {
  const stockById = new Map<string, number>();
  const stockByCode = new Map<string, number>();
  const stockByName = new Map<string, number>();
  const itemById = new Map<string, AssistCatalogItem>();
  const itemByCode = new Map<string, AssistCatalogItem>();

  for (const item of catalog) {
    if (item.id) {
      itemById.set(item.id, item);
      if (typeof item.stock === "number") stockById.set(item.id, item.stock);
    }
    if (item.code) {
      const codeUpper = item.code.trim().toUpperCase();
      itemByCode.set(codeUpper, item);
      if (typeof item.stock === "number") stockByCode.set(codeUpper, item.stock);
    }
    if (item.name && typeof item.stock === "number") {
      stockByName.set(item.name.trim().toLowerCase(), item.stock);
    }
  }

  return { stockById, stockByCode, stockByName, itemById, itemByCode };
}

export function resolveAssistStock(
  assistItemId: string,
  assistCode: string,
  assistName: string,
  lookup: AssistCatalogLookup,
): number | null {
  if (assistItemId && lookup.stockById.has(assistItemId)) {
    return lookup.stockById.get(assistItemId)!;
  }
  if (assistCode && lookup.stockByCode.has(assistCode.trim().toUpperCase())) {
    return lookup.stockByCode.get(assistCode.trim().toUpperCase())!;
  }
  if (assistName && lookup.stockByName.has(assistName.trim().toLowerCase())) {
    return lookup.stockByName.get(assistName.trim().toLowerCase())!;
  }
  return null;
}

/**
 * Builds rows for Mode 1: Sesi Shift (Penjualan POS).
 */
export function buildShiftSoRows(params: {
  soldItems: SoldAggregatedItem[];
  mappings: DestySkuMapping[];
  destyStockMap: Record<string, DestyOmniStockItem>;
  catalogLookup: AssistCatalogLookup;
  excludedPrefixes?: string[];
  manualStates?: Record<string, { adjustMode?: AdjustMode; adjustQty?: number; checked?: boolean }>;
  syncResults?: Record<string, { status: "success" | "error"; message?: string }>;
}): SoTableRowItem[] {
  const { soldItems, mappings, destyStockMap, catalogLookup, excludedPrefixes, manualStates = {}, syncResults = {} } = params;
  const rows: SoTableRowItem[] = [];

  for (const item of soldItems) {
    const assistStock = resolveAssistStock(item.assistItemId, item.assistCode, item.assistItemName, catalogLookup);
    const candidates = resolveCandidates(item.assistItemId, item.assistCode, item.assistItemName, item.assistUnit, mappings);

    for (const cand of candidates) {
      if (
        excludedPrefixes &&
        (isSkuPrefixExcluded(cand.destySku, excludedPrefixes) ||
          isSkuPrefixExcluded(item.assistCode, excludedPrefixes))
      ) {
        continue;
      }

      const rowKey = `${item.assistItemId || item.assistCode || item.assistItemName}__${cand.destySku}`;
      const destyInfo = destyStockMap[cand.destySku];

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

      const defaultQty = item.offlineQty > 0
        ? Math.round((item.offlineQty / cand.conversionFactor) * 1000) / 1000
        : 0;
      const defaultMode: AdjustMode = "Min";

      const manual = manualStates[rowKey];
      const adjustMode: AdjustMode = manual?.adjustMode ?? defaultMode;
      const adjustQty = manual?.adjustQty !== undefined ? manual.adjustQty : defaultQty;

      let calculatedFisikBaru: number | null = null;
      if (destyFisik !== null) {
        if (adjustMode === "Add") calculatedFisikBaru = destyFisik + adjustQty;
        else if (adjustMode === "Min") calculatedFisikBaru = destyFisik - adjustQty;
        else if (adjustMode === "Set") calculatedFisikBaru = adjustQty;
      }
      const calculatedTersediaBaru = calculatedFisikBaru !== null ? calculatedFisikBaru - destyReserved : null;

      const syncRes = syncResults[rowKey];
      let status: SoTableRowItem["status"] = "ready";
      let statusMessage = "Siap disesuaikan";
      let badgeColor = "positive";

      if (syncRes?.status === "success") {
        status = "synced";
        statusMessage = "Berhasil disinkronkan ke Desty";
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
      } else if (adjustQty < 0) {
        status = "warning";
        statusMessage = "Kuantitas tidak boleh negatif";
        badgeColor = "amber-9";
      } else if (adjustMode === "Min" && destyFisik !== null && destyFisik < adjustQty) {
        status = "warning";
        statusMessage = `Stok fisik Desty (${destyFisik}) < Pengurangan (${adjustQty} ${cand.destyUnit})`;
        badgeColor = "amber-9";
      } else if (calculatedTersediaBaru !== null && calculatedTersediaBaru < 0) {
        status = "warning";
        statusMessage = `Tersedia baru minus (${calculatedTersediaBaru}) karena ada pesanan reserved (${destyReserved})`;
        badgeColor = "amber-9";
      }

      const checked = manual?.checked !== undefined
        ? manual.checked
        : (item.offlineQty > 0 && status === "ready");

      rows.push({
        rowKey,
        assistItemId: item.assistItemId,
        assistItemType: item.assistItemType,
        assistCode: item.assistCode,
        assistItemName: item.assistItemName,
        assistUnit: item.assistUnit,
        assistStock,
        destySku: destyStockFound ? cand.destySku : (cand.isMapped ? cand.destySku : ""),
        destyUnit: cand.destyUnit,
        conversionFactor: cand.conversionFactor,
        isMapped: cand.isMapped,
        offlineQty: item.offlineQty,
        onlineQty: item.onlineQty,
        receivedQty: 0,
        destyStockFound,
        destySkuId: destyInfo?.skuId,
        destyWarehouseId: destyInfo?.warehouseId,
        destyProductName: destyInfo?.productName,
        destyFisik,
        destyReserved,
        destyTersedia,
        adjustMode,
        adjustQty,
        calculatedFisikBaru,
        calculatedTersediaBaru,
        checked,
        status,
        statusMessage,
        badgeColor,
      });
    }
  }

  return rows;
}

/**
 * Builds rows for Mode 2: Sesi Faktur Pembelian (Penerimaan Barang).
 */
export function buildFakturSoRows(params: {
  invoice: AssistRestockInvoice;
  mappings: DestySkuMapping[];
  destyStockMap: Record<string, DestyOmniStockItem>;
  catalogLookup: AssistCatalogLookup;
  excludedPrefixes?: string[];
  manualStates?: Record<string, { adjustMode?: AdjustMode; adjustQty?: number; checked?: boolean }>;
  syncResults?: Record<string, { status: "success" | "error"; message?: string }>;
}): SoTableRowItem[] {
  const { invoice, mappings, destyStockMap, catalogLookup, excludedPrefixes, manualStates = {}, syncResults = {} } = params;
  const rows: SoTableRowItem[] = [];

  for (const item of invoice.items) {
    const receivedQty = Number(item.quantity) || 0;
    const assistItemId = (item.medicineId || item.akhpId || "").trim();
    const assistCode = (item.code || "").trim();
    const assistItemName = (item.name || "").trim() || "Item Faktur";
    const assistUnit = (item.unit || "Pcs").trim();
    const assistItemType = item.akhpId ? "akhp" : "prescription";

    const assistStock = resolveAssistStock(assistItemId, assistCode, assistItemName, catalogLookup);
    const candidates = resolveCandidates(assistItemId, assistCode, assistItemName, assistUnit, mappings);

    for (const cand of candidates) {
      if (
        excludedPrefixes &&
        (isSkuPrefixExcluded(cand.destySku, excludedPrefixes) ||
          isSkuPrefixExcluded(assistCode, excludedPrefixes))
      ) {
        continue;
      }

      const rowKey = `${invoice.id || invoice.invoiceNumber}_${assistItemId || assistCode || assistItemName}__${cand.destySku}`;
      const destyInfo = destyStockMap[cand.destySku];

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

      const defaultQty = receivedQty > 0
        ? Math.round((receivedQty / cand.conversionFactor) * 1000) / 1000
        : 0;
      const defaultMode: AdjustMode = "Add";

      const manual = manualStates[rowKey];
      const adjustMode: AdjustMode = manual?.adjustMode ?? defaultMode;
      const adjustQty = manual?.adjustQty !== undefined ? manual.adjustQty : defaultQty;

      let calculatedFisikBaru: number | null = null;
      if (destyFisik !== null) {
        if (adjustMode === "Add") calculatedFisikBaru = destyFisik + adjustQty;
        else if (adjustMode === "Min") calculatedFisikBaru = destyFisik - adjustQty;
        else if (adjustMode === "Set") calculatedFisikBaru = adjustQty;
      }
      const calculatedTersediaBaru = calculatedFisikBaru !== null ? calculatedFisikBaru - destyReserved : null;

      const syncRes = syncResults[rowKey];
      let status: SoTableRowItem["status"] = "ready";
      let statusMessage = "Siap ditambahkan ke Desty";
      let badgeColor = "positive";

      if (syncRes?.status === "success") {
        status = "synced";
        statusMessage = "Berhasil ditambahkan ke Desty";
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
      } else if (adjustQty <= 0) {
        status = "warning";
        statusMessage = "Jumlah penambahan harus > 0";
        badgeColor = "amber-9";
      }

      const checked = manual?.checked !== undefined ? manual.checked : status === "ready";

      rows.push({
        rowKey,
        assistItemId,
        assistItemType,
        assistCode,
        assistItemName,
        assistUnit,
        assistStock,
        destySku: destyStockFound ? cand.destySku : (cand.isMapped ? cand.destySku : ""),
        destyUnit: cand.destyUnit,
        conversionFactor: cand.conversionFactor,
        isMapped: cand.isMapped,
        offlineQty: 0,
        onlineQty: 0,
        receivedQty,
        destyStockFound,
        destySkuId: destyInfo?.skuId,
        destyWarehouseId: destyInfo?.warehouseId,
        destyProductName: destyInfo?.productName,
        destyFisik,
        destyReserved,
        destyTersedia,
        adjustMode,
        adjustQty,
        calculatedFisikBaru,
        calculatedTersediaBaru,
        checked,
        status,
        statusMessage,
        badgeColor,
      });
    }
  }

  return rows;
}

/**
 * Builds rows for Mode 3: Sesi Seluruh Produk (Audit Seluruh Katalog Assist vs Desty).
 */
export function buildAllProductsSoRows(params: {
  destyStockMap: Record<string, DestyOmniStockItem>;
  assistCatalog: AssistCatalogItem[];
  mappings: DestySkuMapping[];
  excludedPrefixes?: string[];
  manualStates?: Record<string, { adjustMode?: AdjustMode; adjustQty?: number; checked?: boolean }>;
  syncResults?: Record<string, { status: "success" | "error"; message?: string }>;
}): SoTableRowItem[] {
  const { destyStockMap, assistCatalog, mappings, excludedPrefixes, manualStates = {}, syncResults = {} } = params;
  const rows: SoTableRowItem[] = [];
  const catalogLookup = buildCatalogLookup(assistCatalog);

  // Index mappings by destySku
  const mappingByDestySku = new Map<string, DestySkuMapping>();
  for (const m of mappings) {
    if (m.active && m.destySku) {
      mappingByDestySku.set(m.destySku.trim().toUpperCase(), m);
    }
  }

  const matchedAssistKeys = new Set<string>();

  for (const [destySkuUpper, destyInfo] of Object.entries(destyStockMap)) {
    if (excludedPrefixes && isSkuPrefixExcluded(destySkuUpper, excludedPrefixes)) {
      const mapping = mappingByDestySku.get(destySkuUpper);
      if (mapping) {
        if (mapping.assistId) matchedAssistKeys.add(mapping.assistId);
        if (mapping.assistCode) matchedAssistKeys.add(mapping.assistCode.toUpperCase());
      } else {
        if (catalogLookup.itemByCode.has(destySkuUpper)) {
          const assistItem = catalogLookup.itemByCode.get(destySkuUpper);
          if (assistItem?.id) matchedAssistKeys.add(assistItem.id);
          matchedAssistKeys.add(destySkuUpper);
        }
      }
      continue;
    }

    const mapping = mappingByDestySku.get(destySkuUpper);
    let assistItem: AssistCatalogItem | undefined;

    if (mapping) {
      if (mapping.assistId && catalogLookup.itemById.has(mapping.assistId)) {
        assistItem = catalogLookup.itemById.get(mapping.assistId);
      } else if (mapping.assistCode && catalogLookup.itemByCode.has(mapping.assistCode.toUpperCase())) {
        assistItem = catalogLookup.itemByCode.get(mapping.assistCode.toUpperCase());
      }
    } else {
      // Direct code match fallback
      if (catalogLookup.itemByCode.has(destySkuUpper)) {
        assistItem = catalogLookup.itemByCode.get(destySkuUpper);
      }
    }

    if (assistItem?.id) matchedAssistKeys.add(assistItem.id);
    if (assistItem?.code) matchedAssistKeys.add(assistItem.code.toUpperCase());

    const rawAssistStock = assistItem?.stock !== undefined ? assistItem.stock : null;
    const conversionFactor = mapping ? Number(mapping.conversionFactor) || 1 : 1;
    const assistStock = rawAssistStock !== null ? Math.floor(rawAssistStock / conversionFactor) : null;

    const destyFisik = destyInfo.fisik ?? destyInfo.breakdown?.fisik ?? destyInfo.stock ?? null;
    const destyReserved = destyInfo.pesanan ?? destyInfo.breakdown?.pesanan ?? 0;
    const destyTersedia = destyInfo.tersedia ?? destyInfo.breakdown?.tersedia ?? (destyFisik !== null ? destyFisik - destyReserved : null);

    const rowKey = `all_${destySkuUpper}`;
    const manual = manualStates[rowKey];

    const isStockMatched = assistStock !== null && destyFisik !== null && assistStock === destyFisik;

    let defaultMode: AdjustMode = "Set";
    let defaultQty = assistStock !== null ? assistStock : destyFisik !== null ? destyFisik : 0;

    if (assistStock !== null && destyFisik !== null) {
      if (destyFisik < assistStock) {
        defaultMode = "Add";
        defaultQty = assistStock - destyFisik;
      } else if (destyFisik > assistStock) {
        defaultMode = "Min";
        defaultQty = destyFisik - assistStock;
      } else {
        defaultMode = "Set";
        defaultQty = 0;
      }
    }

    const adjustMode: AdjustMode = manual?.adjustMode ?? defaultMode;
    const adjustQty = manual?.adjustQty !== undefined ? manual.adjustQty : defaultQty;

    let calculatedFisikBaru: number | null = null;
    if (destyFisik !== null) {
      if (adjustMode === "Add") calculatedFisikBaru = destyFisik + adjustQty;
      else if (adjustMode === "Min") calculatedFisikBaru = destyFisik - adjustQty;
      else if (adjustMode === "Set") calculatedFisikBaru = adjustQty;
    }
    const calculatedTersediaBaru = calculatedFisikBaru !== null ? calculatedFisikBaru - destyReserved : null;

    const syncRes = syncResults[rowKey];
    let status: SoTableRowItem["status"] = isStockMatched ? "matched" : "ready";
    let statusMessage = isStockMatched ? "Stok Sesuai (Cocok)" : "Selisih terdeteksi";
    let badgeColor = isStockMatched ? "positive" : "amber-9";

    if (syncRes?.status === "success") {
      status = "synced";
      statusMessage = "Berhasil disinkronkan";
      badgeColor = "positive";
    } else if (syncRes?.status === "error") {
      status = "error";
      statusMessage = syncRes.message || "Gagal sinkron";
      badgeColor = "red";
    } else if (!assistItem) {
      status = "unmapped";
      statusMessage = mapping
        ? "Produk Assist terpetakan tidak ditemukan di katalog"
        : "Hanya ada di Desty (Belum dicocokkan ke POS)";
      badgeColor = "red";
    } else if (!destyInfo.skuId) {
      status = "unmapped";
      statusMessage = "skuId Desty tidak ditemukan";
      badgeColor = "red";
    }

    const checked = manual?.checked !== undefined ? manual.checked : (status === "ready");

    rows.push({
      rowKey,
      assistItemId: assistItem?.id || "",
      assistItemType: assistItem?.type || "prescription",
      assistCode: assistItem?.code || mapping?.assistCode || "",
      assistItemName: assistItem?.name || "",
      assistUnit: mapping?.assistUnit || assistItem?.unit || "Pcs",
      assistStock,
      destySku: destySkuUpper,
      destyUnit: mapping?.destyUnit || "Pcs",
      conversionFactor,
      isMapped: !!mapping,
      offlineQty: 0,
      onlineQty: 0,
      receivedQty: 0,
      destyStockFound: true,
      destySkuId: destyInfo.skuId,
      destyWarehouseId: destyInfo.warehouseId,
      destyProductName: destyInfo.productName,
      destyFisik,
      destyReserved,
      destyTersedia,
      adjustMode,
      adjustQty,
      calculatedFisikBaru,
      calculatedTersediaBaru,
      checked,
      status,
      statusMessage,
      badgeColor,
    });
  }

  // Iterate Assist catalog items that are not in Desty
  for (const cat of assistCatalog) {
    const codeUpper = (cat.code || "").trim().toUpperCase();
    if (!cat.id && !codeUpper) continue;
    if (matchedAssistKeys.has(cat.id) || (codeUpper && matchedAssistKeys.has(codeUpper))) {
      continue;
    }

    if (excludedPrefixes) {
      if (isSkuPrefixExcluded(codeUpper, excludedPrefixes)) {
        continue;
      }
      const mappedToExcluded = mappings.some(
        (m) =>
          m.active &&
          ((m.assistId && cat.id && m.assistId === cat.id) ||
            (m.assistCode && codeUpper && m.assistCode.trim().toUpperCase() === codeUpper)) &&
          isSkuPrefixExcluded(m.destySku, excludedPrefixes),
      );
      if (mappedToExcluded) {
        continue;
      }
    }

    const rowKey = `all_assist_${cat.id || codeUpper}`;
    const manual = manualStates[rowKey];
    rows.push({
      rowKey,
      assistItemId: cat.id,
      assistItemType: cat.type,
      assistCode: cat.code,
      assistItemName: cat.name,
      assistUnit: cat.unit || "Pcs",
      assistStock: typeof cat.stock === "number" ? cat.stock : null,
      destySku: "",
      destyUnit: cat.unit || "Pcs",
      conversionFactor: 1,
      isMapped: false,
      offlineQty: 0,
      onlineQty: 0,
      receivedQty: 0,
      destyStockFound: false,
      destyFisik: null,
      destyReserved: 0,
      destyTersedia: null,
      adjustMode: "Set",
      adjustQty: typeof cat.stock === "number" ? cat.stock : 0,
      calculatedFisikBaru: null,
      calculatedTersediaBaru: null,
      checked: manual?.checked ?? false,
      status: "unmapped",
      statusMessage: "Hanya ada di Assist (Belum ada di Desty)",
      badgeColor: "red",
    });
  }

  return rows;
}
