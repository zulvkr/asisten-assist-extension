import type { PemasukanData } from "@/types/PemasukanData";
import type { HppCatalogItem } from "@/types/HppCatalogItem";
import {
  buildDestyStockDetailBySku,
  buildDestyStockBySku,
  fetchDestyOmniStock,
  editDestyOnHand,
} from "@/composables/destyOmniStockApi";
import { resolveDestyToken } from "@/composables/destyOmniTokenManager";
import { fetchAllDestyOrders } from "@/composables/destyOmniOrderApi";
import {
  compareStockLevels,
  type StockComparisonRow,
} from "@/utils/compareStockLevels";
import {
  getAssistShoppingSalesByDate,
  getAssistSoldItemsByDate,
} from "@/utils/getSoldItemsByDate";
import { buildPemasukanRequest } from "@/utils/pemasukanApi";
import { runtimeConfig } from "@/config/runtimeConfig";
import { fetchMarginMappings } from "@/services/marginStorage";
import { buildAssistHeaders } from "@/services/integration/assistRequest";
import {
  buildPendingOrderQuantityMap,
  markItemsAsOrdered,
  reconcileOutstandingOrdersWithCatalog,
  removeOutstandingOrder,
} from "@/services/shoppingRecommendationStorage";
import type {
  MarkOutstandingOrderItem,
  ProductPurchaseHistoryResponse,
  ProductPurchaseRecordDto,
  ShoppingCatalogItem,
  ShoppingItemType,
  ShoppingRecommendationRow,
  ShoppingRecommendationSettings,
  SupplierPriceComparisonDto,
} from "@/types/ShoppingRecommendation";
import {
  buildShoppingRecommendationRows,
  resolveShoppingRecommendationSettings,
  validateShoppingRecommendationSettings,
} from "@/utils/shoppingRecommendations";

interface FetchStockComparisonPayload {
  startDate?: string;
  endDate?: string;
  source?: "assist" | "desty" | "both";
  assistToken?: string;
  destyToken?: string;
  destyTenantId?: string;
  destyMasterWarehouseId?: string;
  comparisonMode?: "dates" | "all";
}

interface FetchShoppingRecommendationsPayload {
  assistToken?: string;
  settings?: Partial<ShoppingRecommendationSettings>;
}

interface FetchProductPriceHistoryPayload {
  assistToken?: string;
  itemId: string;
  itemType: ShoppingItemType;
  itemName?: string;
  code?: string;
}

interface MarkItemsAsOrderedPayload {
  items?: MarkOutstandingOrderItem[];
}

interface MarginSkuRow {
  kodeObat: string;
  namaObat: string;
  sku: string;
}

interface AssistStockItem {
  id?: string;
  code?: string;
  medName?: string;
  itemName?: string;
  brandName?: string;
  unit?: string;
  stockTotal?: number;
  buyFee?: number;
  avgHPP?: number;
  sellNormalFee?: number;
}

interface ShoppingRecommendationResponse {
  ok: true;
  data: ShoppingRecommendationRow[];
  catalogItems: ShoppingCatalogItem[];
  warnings: string[];
  settings: ShoppingRecommendationSettings;
  lookbackDays: number;
  generatedAt: string;
}

interface MarkItemsAsOrderedResponse {
  ok: true;
  markedCount: number;
}

async function fetchAssistPemasukan(
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

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: buildAssistHeaders(token),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const errorMessage = errorBody?.trim()
        ? errorBody.slice(0, 200)
        : `Gagal mengambil data pemasukan: ${response.status}`;
      throw new Error(errorMessage);
    }

    const payload = (await response.json()) as { result?: PemasukanData[] };
    const rows = payload?.result ?? [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      return allRows;
    }

    skip += pageSize;
  }
}

async function fetchMarginSkuRows(): Promise<MarginSkuRow[]> {
  const { items } = await fetchMarginMappings();
  return items.map((item) => ({
    kodeObat: item.kodeAssist.trim(),
    namaObat: item.nama.trim(),
    sku: (item.sku || "").trim(),
  }));
}

async function fetchAssistStockItemsByPath(params: {
  token: string;
  path: string;
  fieldName: string;
}): Promise<AssistStockItem[]> {
  const allItems: AssistStockItem[] = [];
  const pageSize = 1000;
  let skip = 0;
  let total = Number.POSITIVE_INFINITY;

  while (skip < total) {
    const url = new URL(`${runtimeConfig.assistApiBase}/${params.path}`);
    url.searchParams.append("hospitalId", runtimeConfig.assistHospitalId);
    url.searchParams.append("fieldName", params.fieldName);
    url.searchParams.append("sort", "1");
    url.searchParams.append("skip", String(skip));
    url.searchParams.append("limit", String(pageSize));

    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      headers: buildAssistHeaders(params.token),
    });

    if (!response.ok) {
      throw new Error(
        `Gagal mengambil stok Assist (${params.path}): ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      total?: number;
      data?: AssistStockItem[];
    };
    const items = payload.data ?? [];
    allItems.push(...items);

    const resolvedTotal = Number(payload.total ?? allItems.length);
    total = Number.isFinite(resolvedTotal) ? resolvedTotal : allItems.length;

    if (items.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return allItems;
}

async function fetchAssistMedicineStockItems(
  token: string,
): Promise<AssistStockItem[]> {
  return fetchAssistStockItemsByPath({
    token,
    path: "KMedicineStocks/getList",
    fieldName: "medName",
  });
}

async function fetchAssistBhpStockItems(
  token: string,
): Promise<AssistStockItem[]> {
  return fetchAssistStockItemsByPath({
    token,
    path: "KAKHPStocks/getList",
    fieldName: "itemName",
  });
}

function buildAssistStockByItemId(
  stockItems: AssistStockItem[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of stockItems) {
    const id = String(item.id ?? "").trim();
    if (id) {
      result[id] = Number(item.stockTotal ?? 0);
    }
  }
  return result;
}

function buildKodeObatByMedicineId(
  stockItems: AssistStockItem[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of stockItems) {
    const id = String(item.id ?? "").trim();
    const code = String(item.code ?? "").trim();
    if (id && code) {
      result[id] = code;
    }
  }
  return result;
}

function buildSellNormalFeeByMedicineId(
  stockItems: AssistStockItem[],
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const item of stockItems) {
    const id = String(item.id ?? "").trim();
    if (id) {
      result[id] = toNullableNumber(item.sellNormalFee);
    }
  }
  return result;
}

function buildShoppingCatalogItems(
  stockItems: AssistStockItem[],
  itemType: ShoppingItemType,
): ShoppingCatalogItem[] {
  return stockItems
    .map((item) => {
      const itemId = String(item.id ?? "").trim();
      if (!itemId) {
        return null;
      }

      return {
        itemId,
        itemType,
        code: String(item.code ?? "").trim(),
        itemName: String(item.medName ?? item.itemName ?? "").trim(),
        brandName: String(item.brandName ?? "").trim(),
        unit: String(item.unit ?? "").trim(),
        stockTotal: Number(item.stockTotal ?? 0),
        buyFee: toNullableNumber(item.buyFee),
        avgHpp: toNullableNumber(item.avgHPP),
        sellNormalFee: toNullableNumber(item.sellNormalFee),
      } satisfies ShoppingCatalogItem;
    })
    .filter((item): item is ShoppingCatalogItem => Boolean(item));
}

function buildHppCatalogItems(
  stockItems: AssistStockItem[],
  type: HppCatalogItem["type"],
): HppCatalogItem[] {
  return stockItems
    .map((item) => {
      const id = String(item.id ?? "").trim();
      if (!id) {
        return null;
      }

      return {
        id,
        code: String(item.code ?? "").trim(),
        name: String(item.medName ?? item.itemName ?? "").trim(),
        type,
        avgHPP: toNullableNumber(item.avgHPP),
        buyFee: toNullableNumber(item.buyFee),
      } satisfies HppCatalogItem;
    })
    .filter((item): item is HppCatalogItem => Boolean(item));
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return value;
}

function formatDateOffsetFromToday(daysOffset: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysOffset);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function handleFetchShoppingRecommendations(
  payload: FetchShoppingRecommendationsPayload,
): Promise<ShoppingRecommendationResponse | { ok: false; error: string }> {
  const assistToken = payload.assistToken?.trim() ?? "";
  if (!assistToken) {
    return {
      ok: false,
      error:
        "Token Assist tidak tersedia. Pastikan tab clinica.assist.id sedang aktif.",
    };
  }

  const settings = resolveShoppingRecommendationSettings(
    payload.settings ?? {},
  );
  const settingsValidation = validateShoppingRecommendationSettings(settings);
  if (!settingsValidation.valid) {
    return {
      ok: false,
      error: settingsValidation.reason,
    };
  }

  const lookbackDays = 30;
  const endDate = formatDateOffsetFromToday(0);
  const startDate = formatDateOffsetFromToday(-(lookbackDays - 1));

  try {
    const [pemasukanData, medicineStockItems, bhpStockItems] =
      await Promise.all([
        fetchAssistPemasukan(startDate, endDate, assistToken),
        fetchAssistMedicineStockItems(assistToken),
        fetchAssistBhpStockItems(assistToken),
      ]);

    const salesResult = getAssistShoppingSalesByDate(pemasukanData, {
      includeOnlyPaidOff: true,
    });
    const catalogItems = [
      ...buildShoppingCatalogItems(medicineStockItems, "prescription"),
      ...buildShoppingCatalogItems(bhpStockItems, "akhp"),
    ];
    const reconciliation =
      await reconcileOutstandingOrdersWithCatalog(catalogItems);

    const rows = buildShoppingRecommendationRows({
      catalogItems,
      salesAggregates: salesResult.salesAggregates,
      pendingOrderQuantities: buildPendingOrderQuantityMap(
        reconciliation.outstandingOrders,
      ),
      settings,
      lookbackDays,
    });

    const warnings: string[] = [];
    if (salesResult.skippedByType > 0) {
      warnings.push(
        `${salesResult.skippedByType} item transaksi non-stok dilewati dari perhitungan rekomendasi.`,
      );
    }
    if (salesResult.missingItemId > 0) {
      warnings.push(
        `${salesResult.missingItemId} item tanpa id Assist tetap ditampilkan, tetapi mungkin tidak bisa dicocokkan ke katalog.`,
      );
    }

    const missingBuyFeeCount = rows.filter((row) => row.buyFee === null).length;
    if (missingBuyFeeCount > 0) {
      warnings.push(
        `${missingBuyFeeCount} item tidak memiliki buyFee dari payload stok Assist.`,
      );
    }
    if (reconciliation.reconciledItemCount > 0) {
      warnings.push(
        `${reconciliation.reconciledItemCount} item outstanding order disesuaikan otomatis berdasarkan kenaikan stok terbaru.`,
      );
    }

    return {
      ok: true,
      data: rows,
      catalogItems,
      warnings,
      settings,
      lookbackDays,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menyiapkan rekomendasi belanja.",
    };
  }
}

const priceHistoryCache = new Map<
  string,
  { data: ProductPurchaseHistoryResponse; cachedAt: number }
>();

async function handleFetchProductPriceHistory(
  payload: FetchProductPriceHistoryPayload,
): Promise<{ ok: true; data: ProductPurchaseHistoryResponse } | { ok: false; error: string }> {
  const assistToken = payload.assistToken?.trim() ?? "";
  if (!assistToken) {
    return { ok: false, error: "Token Assist tidak tersedia." };
  }
  const itemId = payload.itemId?.trim() ?? "";
  if (!itemId) {
    return { ok: false, error: "ID Item tidak valid." };
  }

  const cacheKey = `${payload.itemType}::${itemId}`;
  const cached = priceHistoryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < 15 * 60 * 1000) {
    return { ok: true, data: cached.data };
  }

  try {
    const rawRecords: ProductPurchaseRecordDto[] = [];

    // 1. Fetch from audit stock endpoint
    try {
      const filter =
        payload.itemType === "akhp"
          ? { hospitalId: runtimeConfig.assistHospitalId, akhpId: itemId }
          : { hospitalId: runtimeConfig.assistHospitalId, medicineId: itemId };

      const endpoint =
        payload.itemType === "akhp"
          ? `${runtimeConfig.assistApiBase}/KAKHPStocks/auditAKHPStock`
          : `${runtimeConfig.assistApiBase}/KTxes/auditMedStock`;

      const auditUrl = `${endpoint}?filter=${encodeURIComponent(JSON.stringify(filter))}`;
      const auditRes = await fetch(auditUrl, {
        headers: buildAssistHeaders(assistToken),
        credentials: "include",
      });

      if (auditRes.ok) {
        const auditData = (await auditRes.json()) as any[];
        if (Array.isArray(auditData)) {
          for (const row of auditData) {
            if (row.transactionType === "restock") {
              const tx = row.Transaction || {};
              const dist = tx.Distributors || {};
              const qty = Number(row.quantity ?? 1);
              const buyPrice = Number(row.buyFee ?? row.baseFee ?? tx.buyFee ?? 0);
              const discount = Number(row.diskonObat ?? row.discount ?? 0);
              const netUnitPrice = Number(row.baseFee ?? (buyPrice * (1 - discount / 100)));
              const subtotal = Number(row.totalFee ?? (netUnitPrice * qty));

              rawRecords.push({
                transactionId: String(tx.id || tx._id || row.id || `rec_${Math.random()}`),
                invoiceNumber: String(tx.code || tx.nomorFaktur || row.batchNo || "-"),
                receivedDate: (row.createdAt || row.executeDate || tx.transactionDate || tx.date || "").slice(0, 10),
                supplierId: dist.id || dist._id || tx.distributorId || undefined,
                supplierName: String(dist.supplierName || tx.supplierName || row.supplierName || "Supplier Tanpa Nama").trim(),
                batchNumber: row.batchNo || "-",
                expiryDate: row.expiredDate ? String(row.expiredDate).slice(0, 10) : undefined,
                quantity: qty,
                unitName: row.unit || undefined,
                buyPrice,
                netUnitPrice: netUnitPrice > 0 ? netUnitPrice : buyPrice,
                discountPercent: discount,
                subtotal,
              });
            }
          }
        }
      }
    } catch (auditErr) {
      console.warn("Gagal mengambil kartu stok untuk riwayat harga:", auditErr);
    }

    // 2. Fallback / supplement from general KTxes if records are scarce
    if (rawRecords.length === 0) {
      try {
        const txFilter = {
          where: {
            hospitalId: runtimeConfig.assistHospitalId,
            distributorId: { neq: null },
          },
          include: ["Distributors"],
          limit: 100,
        };
        const txUrl = `${runtimeConfig.assistApiBase}/KTxes?filter=${encodeURIComponent(JSON.stringify(txFilter))}`;
        const txRes = await fetch(txUrl, {
          headers: buildAssistHeaders(assistToken),
          credentials: "include",
        });
        if (txRes.ok) {
          const txData = (await txRes.json()) as any[];
          if (Array.isArray(txData)) {
            for (const tx of txData) {
              const dist = tx.Distributors || {};
              const items = Array.isArray(tx.item) ? tx.item : [];
              for (const it of items) {
                const matchId =
                  payload.itemType === "akhp"
                    ? it.akhpId === itemId
                    : it.medicineId === itemId;
                const matchName =
                  payload.itemName &&
                  it.name &&
                  String(it.name).trim().toLowerCase() === payload.itemName.trim().toLowerCase();

                if (matchId || matchName) {
                  const qty = Number(it.quantity ?? 1);
                  const buyPrice = Number(it.buyFee ?? it.baseFee ?? 0);
                  const discount = Number(it.diskonObat ?? it.discount ?? 0);
                  const netUnitPrice = Number(it.baseFee ?? (buyPrice * (1 - discount / 100)));
                  const subtotal = Number(it.totalFee ?? (netUnitPrice * qty));

                  rawRecords.push({
                    transactionId: String(tx.id || tx._id || `tx_${Math.random()}`),
                    invoiceNumber: String(tx.nomorFaktur || tx.code || "-"),
                    receivedDate: String(tx.transactionDate || tx.date || tx.createdAt || "").slice(0, 10),
                    supplierId: dist.id || dist._id || tx.distributorId || undefined,
                    supplierName: String(dist.supplierName || tx.supplierName || "Supplier Tanpa Nama").trim(),
                    batchNumber: it.batchNo || "-",
                    expiryDate: it.expiredDate ? String(it.expiredDate).slice(0, 10) : undefined,
                    quantity: qty,
                    unitName: it.unit || undefined,
                    buyPrice,
                    netUnitPrice: netUnitPrice > 0 ? netUnitPrice : buyPrice,
                    discountPercent: discount,
                    subtotal,
                  });
                }
              }
            }
          }
        }
      } catch (txErr) {
        console.warn("Gagal mengambil KTxes untuk riwayat harga:", txErr);
      }
    }

    // Sort rawRecords chronologically descending (newest first)
    rawRecords.sort(
      (a, b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime(),
    );

    // Group by supplier
    const supplierGroups = new Map<string, {
      supplierId: string;
      supplierName: string;
      supplierPhone?: string;
      prices: number[];
      latestPrice: number;
      lastDate: string;
      totalQty: number;
      purchaseCount: number;
      weightedSum: number;
    }>();

    let overallLowestNetPrice: number | null = null;
    let overallLatestNetPrice: number | null = null;
    let latestSupplierName: string | null = null;
    let totalPurchasedQuantity = 0;
    let totalWeightedPrice = 0;

    for (const rec of rawRecords) {
      const supKey = rec.supplierName.trim().toUpperCase() || "UNKNOWN";
      const net = rec.netUnitPrice > 0 ? rec.netUnitPrice : rec.buyPrice;

      if (net > 0) {
        if (overallLowestNetPrice === null || net < overallLowestNetPrice) {
          overallLowestNetPrice = net;
        }
      }

      if (overallLatestNetPrice === null && net > 0) {
        overallLatestNetPrice = net;
        latestSupplierName = rec.supplierName;
      }

      totalPurchasedQuantity += rec.quantity;
      totalWeightedPrice += net * rec.quantity;

      const existing = supplierGroups.get(supKey);
      if (existing) {
        if (net > 0) existing.prices.push(net);
        existing.totalQty += rec.quantity;
        existing.purchaseCount += 1;
        existing.weightedSum += net * rec.quantity;
        if (new Date(rec.receivedDate) > new Date(existing.lastDate)) {
          existing.lastDate = rec.receivedDate;
          existing.latestPrice = net;
        }
      } else {
        supplierGroups.set(supKey, {
          supplierId: rec.supplierId || supKey,
          supplierName: rec.supplierName,
          prices: net > 0 ? [net] : [],
          latestPrice: net,
          lastDate: rec.receivedDate,
          totalQty: rec.quantity,
          purchaseCount: 1,
          weightedSum: net * rec.quantity,
        });
      }
    }

    const supplierComparisons: SupplierPriceComparisonDto[] = [];
    let cheapestSupplierName: string | null = null;

    for (const group of supplierGroups.values()) {
      const lowestNetPrice = group.prices.length ? Math.min(...group.prices) : group.latestPrice;
      const avgNetPrice = group.totalQty > 0 ? Math.round(group.weightedSum / group.totalQty) : group.latestPrice;
      const isCheapest = overallLowestNetPrice !== null && lowestNetPrice === overallLowestNetPrice;
      if (isCheapest && !cheapestSupplierName) {
        cheapestSupplierName = group.supplierName;
      }
      const priceDiffPercent =
        overallLowestNetPrice !== null && overallLowestNetPrice > 0
          ? Number((((lowestNetPrice - overallLowestNetPrice) / overallLowestNetPrice) * 100).toFixed(1))
          : 0;

      supplierComparisons.push({
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        supplierPhone: group.supplierPhone,
        lowestNetPrice,
        latestNetPrice: group.latestPrice,
        averageNetPrice: avgNetPrice,
        lastPurchasedDate: group.lastDate,
        totalQuantityPurchased: group.totalQty,
        purchaseCount: group.purchaseCount,
        isCheapest,
        priceDifferencePercent: priceDiffPercent,
      });
    }

    supplierComparisons.sort((a, b) => a.lowestNetPrice - b.lowestNetPrice);

    const overallAverageNetPrice =
      totalPurchasedQuantity > 0 ? Math.round(totalWeightedPrice / totalPurchasedQuantity) : null;

    const responseData: ProductPurchaseHistoryResponse = {
      itemId,
      itemName: payload.itemName || "",
      code: payload.code || "",
      unitName: rawRecords[0]?.unitName || "",
      currentBuyPrice: rawRecords[0]?.buyPrice ?? null,
      lowestNetPrice: overallLowestNetPrice,
      cheapestSupplierName,
      latestNetPrice: overallLatestNetPrice,
      latestSupplierName,
      averageNetPrice: overallAverageNetPrice,
      totalPurchasedQuantity,
      totalTransactions: rawRecords.length,
      supplierComparisons,
      historyRecords: rawRecords,
    };

    priceHistoryCache.set(cacheKey, { data: responseData, cachedAt: Date.now() });

    return { ok: true, data: responseData };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal mengambil riwayat harga supplier.",
    };
  }
}

async function handleMarkItemsAsOrdered(
  payload: MarkItemsAsOrderedPayload,
): Promise<MarkItemsAsOrderedResponse | { ok: false; error: string }> {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const validItems = items.filter(
    (item) => item?.itemId && Number(item.quantity ?? 0) > 0,
  );
  if (!validItems.length) {
    return {
      ok: false,
      error: "Tidak ada item draft valid untuk ditandai sebagai sudah dipesan.",
    };
  }

  await markItemsAsOrdered(validItems);

  return {
    ok: true,
    markedCount: validItems.length,
  };
}

async function handleRemoveOutstandingOrder(
  payload: { itemId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const itemId = payload.itemId?.trim() ?? "";
  if (!itemId) {
    return {
      ok: false,
      error: "Item ID tidak tersedia.",
    };
  }

  await removeOutstandingOrder(itemId);

  return {
    ok: true,
  };
}

async function handleFetchStockComparison(
  payload: FetchStockComparisonPayload,
): Promise<
  | { ok: true; data: StockComparisonRow[]; warnings: string[] }
  | { ok: false; error: string }
> {
  const comparisonMode = payload.comparisonMode ?? "dates";
  const startDate =
    typeof payload.startDate === "string" ? payload.startDate : "";
  const endDate = typeof payload.endDate === "string" ? payload.endDate : "";
  const source = payload.source ?? "assist";
  const assistToken = payload.assistToken?.trim() ?? "";
  const destyToken = payload.destyToken?.trim() ?? "";
  const destyTenantId = payload.destyTenantId?.trim() ?? "";
  const destyMasterWarehouseId = payload.destyMasterWarehouseId?.trim() ?? "";

  if (comparisonMode !== "all" && (!startDate || !endDate)) {
    return {
      ok: false,
      error: "Rentang tanggal wajib diisi.",
    };
  }

  if (!assistToken) {
    return {
      ok: false,
      error:
        "Token Assist tidak tersedia. Pastikan tab clinica.assist.id sedang aktif.",
    };
  }

  try {
    const storage = await browser.storage.local.get("settings:excludedDestySkuPrefixes");
    const excludedStr = (storage["settings:excludedDestySkuPrefixes"] as string | undefined) ?? "ISA-";
    const prefixes = excludedStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const shouldExcludeSku = (sku: string | undefined | null): boolean => {
      if (!sku) return false;
      const s = sku.trim().toLowerCase();
      return prefixes.some((pref) => s.startsWith(pref.toLowerCase()));
    };

    const [pemasukanData, marginRows, medicineStockItems, bhpStockItems] =
      await Promise.all([
        comparisonMode === "all"
          ? Promise.resolve([])
          : fetchAssistPemasukan(startDate, endDate, assistToken),
        fetchMarginSkuRows(),
        fetchAssistMedicineStockItems(assistToken),
        fetchAssistBhpStockItems(assistToken),
      ]);

    const stockItems = [...medicineStockItems, ...bhpStockItems];

    let soldItems: SoldItemAggregate[];
    let skippedByType = 0;
    let missingItemId = 0;

    if (comparisonMode === "all") {
      soldItems = stockItems
        .map((item) => {
          const id = String(item.id ?? "").trim();
          return {
            medicineId: id,
            itemName: String(item.medName ?? item.itemName ?? "").trim(),
            qtySold: 0,
            source: "assist" as const,
          };
        })
        .filter((item) => Boolean(item.medicineId));
    } else {
      const soldResult = getAssistSoldItemsByDate(pemasukanData, {
        includeOnlyPaidOff: true,
      });
      soldItems = soldResult.soldItems;
      skippedByType = soldResult.skippedByType;
      missingItemId = soldResult.missingItemId;
    }

    const assistStockByMedicineId = buildAssistStockByItemId(stockItems);
    const sellNormalFeeByMedicineId =
      buildSellNormalFeeByMedicineId(stockItems);
    const kodeObatByMedicineId = buildKodeObatByMedicineId(stockItems);

    // Kode Obat is Assist metadata and is used only as a bridge key to read SKU from marginData.
    const normalizeCode = (value: string): string => value.trim().toUpperCase();
    const skuByKodeObat = new Map<string, string>();
    for (const row of marginRows) {
      if (row.kodeObat && row.sku) {
        skuByKodeObat.set(normalizeCode(row.kodeObat), row.sku.trim());
      }
    }

    let missingSkuMappingCount = 0;
    let missingKodeObatCount = 0;
    for (const item of soldItems) {
      const kodeObat = kodeObatByMedicineId[item.medicineId] ?? "";
      if (!kodeObat) {
        missingKodeObatCount += 1;
        continue;
      }

      const sku = skuByKodeObat.get(normalizeCode(kodeObat));
      if (sku) {
        item.sku = sku;
      } else {
        missingSkuMappingCount += 1;
      }
    }

    // Filter out sold items that match the excluded SKU prefixes
    soldItems = soldItems.filter((item) => !shouldExcludeSku(item.sku));

    let destyStockBySku: Record<string, number | null> | undefined;
    let destyStockDetailBySku:
      | Record<
          string,
          import("@/composables/destyOmniStockApi").DestyStockBreakdown
        >
      | undefined;
    const warnings: string[] = [];

    const shouldUseDesty = source === "desty" || source === "both";
    let destyItems: import("@/composables/destyOmniStockApi").DestyOmniStockItem[] = [];

    if (shouldUseDesty) {
      const skus = comparisonMode === "all" ? undefined : Array.from(
        new Set(
          soldItems
            .map((item) => item.sku?.trim() ?? "")
            .filter((sku) => Boolean(sku)),
        ),
      );

      if (!destyToken) {
        warnings.push(
          "Token Desty tidak tersedia. Hasil tetap ditampilkan dari Assist.",
        );
      } else if (skus !== undefined && skus.length === 0) {
        warnings.push(
          "Tidak ada SKU yang bisa dipakai untuk sinkronisasi Desty pada rentang ini.",
        );
      } else {
        try {
          destyItems = await fetchDestyOmniStock({
            token: destyToken,
            skus,
            tenantId: destyTenantId,
            masterWarehouseId: destyMasterWarehouseId,
          });
          // Filter out excluded Desty SKU items
          destyItems = destyItems.filter((item) => !shouldExcludeSku(item.sku));

          destyStockBySku = buildDestyStockBySku(destyItems);
          destyStockDetailBySku = buildDestyStockDetailBySku(destyItems);
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `Gagal mengambil stok Desty: ${error.message}`
              : "Gagal mengambil stok Desty. Hasil tetap ditampilkan dari Assist.",
          );
        }
      }
    }

    if (shouldUseDesty && destyItems.length > 0) {
      const mappedSkus = new Set<string>();
      for (const item of soldItems) {
        if (item.sku) {
          mappedSkus.add(item.sku.trim().toUpperCase());
        }
      }

      for (const destyItem of destyItems) {
        const destySkuUpper = destyItem.sku.trim().toUpperCase();
        if (destySkuUpper && !mappedSkus.has(destySkuUpper)) {
          soldItems.push({
            medicineId: "",
            itemName: destyItem.productName || destyItem.sku,
            qtySold: 0,
            source: "desty",
            sku: destyItem.sku,
          });
        }
      }
    }

    const rows = compareStockLevels({
      soldItems,
      assistStockByMedicineId,
      sellNormalFeeByMedicineId,
      kodeObatByMedicineId,
      destyStockBySku,
      destyStockDetailBySku,
    });

    if (skippedByType > 0) {
      warnings.push(
        `${skippedByType} item dilewati karena tipe transaksi tidak termasuk perhitungan stok.`,
      );
    }
    if (missingItemId > 0) {
      warnings.push(
        `${missingItemId} item tanpa id Assist (medicineId/akhpId) tidak bisa dicocokkan ke stok Assist dan ditandai unknown.`,
      );
    }
    if (missingKodeObatCount > 0) {
      warnings.push(
        `${missingKodeObatCount} item tidak punya kodeObat dari Assist, sehingga SKU margin tidak bisa dicari.`,
      );
    }
    if (missingSkuMappingCount > 0) {
      warnings.push(
        `${missingSkuMappingCount} item tidak menemukan pasangan SKU di marginData berdasarkan kodeObat Assist.`,
      );
    }

    return {
      ok: true,
      data: rows,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menyiapkan data perbandingan stok.",
    };
  }
}

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) {
      return;
    }

    if (message.type === "GET_DESTY_TOKEN") {
      (async () => {
        try {
          const res = await resolveDestyToken();
          sendResponse(res);
        } catch (err) {
          sendResponse({ token: "", tenantId: "", masterWarehouseId: "", warnings: [String(err)] });
        }
      })();
      return true;
    }

    if (message.type === "FETCH_DESTY_ORDERS") {
      (async () => {
        try {
          const { token, tenantId, status } = message.payload || {};
          if (!token) throw new Error("Token Desty tidak tersedia.");
          const allRecords = await fetchAllDestyOrders({ token, tenantId, status });
          sendResponse({ ok: true, records: allRecords });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }

    if (message.type === "FETCH_DESTY_STOCK") {
      (async () => {
        try {
          const { token, tenantId, masterWarehouseId, skus } = message.payload || {};
          if (!token) throw new Error("Token Desty tidak tersedia.");
          const items = await fetchDestyOmniStock({ token, tenantId, masterWarehouseId, skus });
          sendResponse({ ok: true, items });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }

    if (message.type === "UPDATE_DESTY_ON_HAND") {
      (async () => {
        try {
          const { token, tenantId, skuId, warehouseId, amount, editType } = message.payload || {};
          if (!token) throw new Error("Token Desty tidak tersedia.");
          if (!skuId) throw new Error("skuId Desty diperlukan untuk mengubah stok.");
          if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
            throw new Error("Jumlah (amount) stok tidak valid.");
          }

          const targetWarehouse = warehouseId ? String(warehouseId) : "2042620805094077644";
          const result = await editDestyOnHand({
            token,
            tenantId,
            skuId: String(skuId),
            warehouseId: targetWarehouse,
            amount: Number(amount),
            editType: editType === "Set" ? "Set" : "Add",
          });

          sendResponse({ ok: true, data: result });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }

    if (message.type === "FETCH_STOCK_COMPARISON") {
      (async () => {
        const result = await handleFetchStockComparison(
          (message.payload ?? {}) as FetchStockComparisonPayload,
        );
        sendResponse(result);
      })();

      return true;
    }

    if (message.type === "FETCH_SHOPPING_RECOMMENDATIONS") {
      (async () => {
        const result = await handleFetchShoppingRecommendations(
          (message.payload ?? {}) as FetchShoppingRecommendationsPayload,
        );
        sendResponse(result);
      })();

      return true;
    }

    if (message.type === "MARK_ITEMS_AS_ORDERED") {
      (async () => {
        const result = await handleMarkItemsAsOrdered(
          (message.payload ?? {}) as MarkItemsAsOrderedPayload,
        );
        sendResponse(result);
      })();

      return true;
    }

    if (message.type === "REMOVE_OUTSTANDING_ORDER") {
      (async () => {
        const result = await handleRemoveOutstandingOrder(
          (message.payload ?? {}) as { itemId: string },
        );
        sendResponse(result);
      })();

      return true;
    }

    if (message.type === "CLEAR_ALL_OUTSTANDING_ORDERS") {
      (async () => {
        const storageLocal = browser?.storage?.local;
        if (storageLocal) {
          await storageLocal.set({
            "shoppingRecommendation:outstandingOrders": {},
          });
        }
        sendResponse({ ok: true });
      })();

      return true;
    }

    if (message.type === "FETCH_PRODUCT_PRICE_HISTORY") {
      (async () => {
        const result = await handleFetchProductPriceHistory(
          (message.payload ?? {}) as FetchProductPriceHistoryPayload,
        );
        sendResponse(result);
      })();

      return true;
    }

    if (message.type === "FETCH_ASSIST_SKU_BUY_FEES") {
      (async () => {
        try {
          const assistToken = message.payload?.assistToken?.trim() ?? "";
          if (!assistToken) {
            sendResponse({ ok: false, error: "Token Assist tidak tersedia." });
            return;
          }

          const [marginRows, medicineStockItems, bhpStockItems] =
            await Promise.all([
              fetchMarginSkuRows(),
              fetchAssistMedicineStockItems(assistToken),
              fetchAssistBhpStockItems(assistToken),
            ]);

          const stockItems = [...medicineStockItems, ...bhpStockItems];

          // Build maps of code (kodeObat) to buyFee and unit
          const buyFeeByCode = new Map<string, number>();
          const unitByCode = new Map<string, string>();
          for (const item of stockItems) {
            const code = String(item.code ?? "").trim().toUpperCase();
            if (code) {
              if (typeof item.buyFee === "number") {
                buyFeeByCode.set(code, item.buyFee);
              }
              if (item.unit) {
                unitByCode.set(code, String(item.unit).trim().toUpperCase());
              }
            }
          }

          // Build sku -> value maps
          const buyFeeBySku: Record<string, number> = {};
          const unitBySku: Record<string, string> = {};

          // 1. Map via Google Sheet margins mapping (sku -> kodeObat -> values)
          for (const row of marginRows) {
            const sku = String(row.sku ?? "").trim().toUpperCase();
            const code = String(row.kodeObat ?? "").trim().toUpperCase();
            if (sku && code) {
              const buyFee = buyFeeByCode.get(code);
              if (buyFee !== undefined) {
                buyFeeBySku[sku] = buyFee;
              }
              const unit = unitByCode.get(code);
              if (unit !== undefined) {
                unitBySku[sku] = unit;
              }
            }
          }

          // 2. Fallback: Map directly (if SKU matches Assist code directly)
          for (const item of stockItems) {
            const code = String(item.code ?? "").trim().toUpperCase();
            if (code) {
              if (typeof item.buyFee === "number" && buyFeeBySku[code] === undefined) {
                buyFeeBySku[code] = item.buyFee;
              }
              if (item.unit && unitBySku[code] === undefined) {
                unitBySku[code] = String(item.unit).trim().toUpperCase();
              }
            }
          }

          sendResponse({ ok: true, buyFeeBySku, unitBySku });
        } catch (error) {
          console.error("Gagal memuat data stock Assist:", error);
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Gagal memuat data stock.",
          });
        }
      })();

      return true;
    }

    if (message.type === "FETCH_ASSIST_EXPIRED_STOCKS") {
        (async () => {
          try {
            const assistToken = message.payload?.assistToken?.trim() ?? "";
            if (!assistToken) {
              sendResponse({ ok: false, error: "Token Assist tidak tersedia." });
              return;
            }

            const data = await fetchAssistExpiredStocks(assistToken);
            sendResponse({ ok: true, data });
          } catch (error) {
            console.error("Gagal memuat data expired stock Assist:", error);
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : "Gagal memuat data kesehatan inventori.",
            });
          }
        })();

        return true;
      }

    if (message.type === "FETCH_ASSIST_HPP_CATALOG") {
      (async () => {
        try {
          const assistToken = message.payload?.token?.trim() ?? "";
          if (!assistToken) {
            sendResponse({ ok: false, error: "Token Assist tidak tersedia." });
            return;
          }

          const [medicineStockItems, bhpStockItems] = await Promise.all([
            fetchAssistMedicineStockItems(assistToken),
            fetchAssistBhpStockItems(assistToken),
          ]);

          sendResponse({
            ok: true,
            data: [
              ...buildHppCatalogItems(medicineStockItems, "prescription"),
              ...buildHppCatalogItems(bhpStockItems, "akhp"),
            ],
          });
        } catch (error) {
          console.error("Gagal memuat katalog HPP Assist:", error);
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Gagal mengambil data HPP dari katalog Assist.",
          });
        }
      })();

      return true;
    }

    if (message.type !== "FETCH_PEMASUKAN_DATA") {
      return;
    }

    const url = message.payload?.url;
    const token = message.payload?.token ?? "";

    if (typeof url !== "string") {
      sendResponse({
        ok: false,
        error: "Permintaan pemasukan tidak valid.",
      });
      return false;
    }

    (async () => {
      try {
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: buildAssistHeaders(token),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          const errorMessage = errorBody?.trim()
            ? errorBody.slice(0, 200)
            : `Gagal mengambil data pemasukan: ${response.status}`;
          sendResponse({
            ok: false,
            status: response.status,
            error: errorMessage,
          });
          return;
        }

        const payload = (await response.json()) as {
          result?: PemasukanData[];
        };

        sendResponse({
          ok: true,
          status: response.status,
          data: payload?.result ?? [],
        });
      } catch (error) {
        console.error("Gagal melakukan fetch pemasukan di worker", error);
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Terjadi kesalahan tidak diketahui.",
        });
      }
    })();

    return true;
  });
});

async function fetchAssistExpiredStocks(
  token: string,
): Promise<any[]> {
  const allItems: any[] = [];
  const pageSize = 1000;
  let skip = 0;
  let total = Number.POSITIVE_INFINITY;

  while (skip < total) {
    const url = new URL(`${runtimeConfig.assistApiBase}/KMedicineStocks/getItemsWithExpiredDate`);
    url.searchParams.append("hospitalId", runtimeConfig.assistHospitalId);
    url.searchParams.append("skip", String(skip));
    url.searchParams.append("limit", String(pageSize));

    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      headers: buildAssistHeaders(token),
    });

    if (!response.ok) {
      throw new Error(
        `Gagal mengambil data kesehatan inventori: ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      total?: number;
      data?: any[];
    };
    const items = payload.data ?? [];
    allItems.push(...items);

    const resolvedTotal = Number(payload.total ?? allItems.length);
    total = Number.isFinite(resolvedTotal) ? resolvedTotal : allItems.length;

    if (items.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return allItems;
}
