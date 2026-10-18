<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useQuasar } from "quasar";
import type { DestySkuMapping, AssistCatalogItem } from "@/types/destySync";
import type {
  PriceSessionMode,
  MarketplacePricingConfig,
  PriceRangeTier,
  PriceTableRowItem,
  DestyPriceRecord,
  SalesVelocityItemInfo,
} from "@/types/destyPriceUpdate";
import type { AssistRestockInvoice } from "@/types/destyStockOpname";
import {
  fetchAssistRestockInvoices,
} from "@/services/destySync/destyStockOpnameService";
import {
  fetchAllAssistPemasukan,
  isOnlineAssistTransaction,
} from "@/services/destySync/offlineStockSync";
import {
  calculateTargetPrice,
  computeMarginForPrice,
  determineSafety,
  calculateSalesVelocityFromTransactions,
  resolveDestyPriceItem,
  type ItemSalesVelocityAggregate,
} from "@/services/destySync/destyPriceUpdateService";
import {
  loadMarketplacePricingConfig,
  saveMarketplacePricingConfig,
  subscribeMarketplacePricingConfig,
  DEFAULT_MARKETPLACE_PRICING_CONFIG,
} from "@/services/destySync/pricingConfigStorage";
import {
  fetchDestyPriceList,
  updateDestyMasterPrice,
} from "@/composables/destyOmniPriceApi";
import DestyPricingFormulaDialog from "./DestyPricingFormulaDialog.vue";
import DestySkuMappingDialog from "./DestySkuMappingDialog.vue";

const props = defineProps<{
  destyToken?: string;
  destyTenantId?: string;
  destyWarehouseId?: string;
  assistToken?: string;
  assistHospitalId?: string;
  assistApiBaseUrl?: string;
  assistCatalog: AssistCatalogItem[];
  mappings: DestySkuMapping[];
}>();

const emit = defineEmits<{
  (e: "refreshProbe"): void;
  (e: "refreshCatalog"): void;
  (e: "saveMapping", mapping: any): void;
}>();

const $q = useQuasar();

// 1. Session Mode
const priceSessionMode = ref<PriceSessionMode>("faktur");

// Mode: Faktur States
const recentInvoicesList = ref<AssistRestockInvoice[]>([]);
const selectedInvoiceId = ref<string | null>(null);
const selectedInvoice = computed(() => {
  return recentInvoicesList.value.find((inv) => inv.id === selectedInvoiceId.value) || null;
});

// Mode: Sold Online States
const selectedSalesDate = ref<string>(new Date().toISOString().slice(0, 10));
const onlineSoldProductsSummary = ref<
  Array<{ code: string; name: string; quantitySold: number; buyFee?: number }>
>([]);
const isLoadingOnlineSales = ref(false);

// Desty Catalog State
const destyPriceCatalog = ref<Record<string, DestyPriceRecord>>({});
const isLoadingData = ref(false);
const isLoadingDestyPrices = ref(false);
const isLoadingInvoices = ref(false);

// Search & Filtering
const searchFilter = ref("");
const statusFilter = ref<string>("all");
const safetyFilter = ref<string>("all");
const velocityPeriodDays = ref<number>(30);
const velocityMap = ref<Map<string, ItemSalesVelocityAggregate>>(new Map());
const isLoadingVelocity = ref<boolean>(false);

// Pagination
const currentPage = ref(1);
const pageSize = ref(25);
const pageSizeOptions = [10, 25, 50, 100];

// Dialogs
const showFormulaDialog = ref(false);
const showMappingDialog = ref(false);
const mappingDialogData = ref<{
  destySku: string;
  localSku: string;
  conversionFactor: number;
  destyUnit: string;
  localUnit: string;
}>({
  destySku: "",
  localSku: "",
  conversionFactor: 1,
  destyUnit: "",
  localUnit: "pcs",
});

// Pricing Formula Config State
const pricingConfig = ref<MarketplacePricingConfig>(
  JSON.parse(JSON.stringify(DEFAULT_MARKETPLACE_PRICING_CONFIG)),
);
let unsubscribePricingConfig: (() => void) | null = null;

// Table Rows State
const tableRows = ref<PriceTableRowItem[]>([]);

// Queue & Throttling Execution States
const throttleDelayMs = ref<number>(1000);
const isQueueRunning = ref(false);
const isQueuePaused = ref(false);
const isQueueCancelled = ref(false);
const queueProgress = ref({
  current: 0,
  total: 0,
  success: 0,
  failed: 0,
});
const currentItemProcessing = ref("");

// --- CATALOG LOOKUP ---
const catalogByCode = computed(() => {
  const map = new Map<string, AssistCatalogItem>();
  for (const it of props.assistCatalog) {
    if (it.code) {
      map.set(it.code.trim().toUpperCase(), it);
    }
  }
  return map;
});

const catalogById = computed(() => {
  const map = new Map<string, AssistCatalogItem>();
  for (const it of props.assistCatalog) {
    if (it.id) {
      map.set(it.id.trim(), it);
    }
  }
  return map;
});

// --- DATA FETCHING ---

async function loadPricingConfig() {
  pricingConfig.value = await loadMarketplacePricingConfig();
}

async function handleSaveFormulaConfig(newConfig: MarketplacePricingConfig) {
  pricingConfig.value = newConfig;
  await saveMarketplacePricingConfig(newConfig);
  $q.notify({
    type: "positive",
    message: "Formula harga marketplace berhasil disimpan ke Firestore & penyimpanan lokal.",
    position: "top-right",
  });
  recalculateAllRows();
}

async function loadDestyPrices(searchParam?: string) {
  if (!props.destyToken) return;
  isLoadingDestyPrices.value = true;
  try {
    const res = await fetchDestyPriceList({
      token: props.destyToken,
      tenantId: props.destyTenantId,
      searchParam,
      fetchAll: !searchParam,
      size: 50,
    });

    const catalog: Record<string, DestyPriceRecord> = {};
    for (const rec of res.records) {
      if (rec.masterSku) {
        catalog[rec.masterSku.trim().toUpperCase()] = rec;
      }
      if (rec.skuId) {
        catalog[String(rec.skuId)] = rec;
      }
    }
    destyPriceCatalog.value = catalog;
  } catch (err: any) {
    console.error("Gagal mengambil data harga Desty:", err);
    $q.notify({
      type: "warning",
      message: "Gagal mengambil katalog harga Desty: " + (err?.message || String(err)),
      position: "top-right",
    });
  } finally {
    isLoadingDestyPrices.value = false;
  }
}

async function loadSalesVelocity() {
  if (!props.assistToken) return;
  isLoadingVelocity.value = true;
  try {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDateObj = new Date();
    startDateObj.setDate(startDateObj.getDate() - velocityPeriodDays.value);
    const startDate = startDateObj.toISOString().slice(0, 10);

    const txs = await fetchAllAssistPemasukan(startDate, endDate, props.assistToken);
    velocityMap.value = calculateSalesVelocityFromTransactions(txs);
  } catch (err) {
    console.warn("Gagal memuat histori penjualan Assist:", err);
  } finally {
    isLoadingVelocity.value = false;
  }
}

async function loadInvoices() {
  if (!props.assistToken || !props.assistHospitalId) return;
  isLoadingInvoices.value = true;
  try {
    const invoices = await fetchAssistRestockInvoices({
      apiBaseUrl: props.assistApiBaseUrl || "https://api-clinica.assist.id",
      hospitalId: props.assistHospitalId,
      token: props.assistToken,
      limit: 30,
    });
    recentInvoicesList.value = invoices;
    if (invoices.length > 0 && !selectedInvoiceId.value) {
      selectedInvoiceId.value = invoices[0].id;
    }
  } catch (err) {
    console.error("Gagal memuat faktur pembelian:", err);
  } finally {
    isLoadingInvoices.value = false;
  }
}

async function onVelocityPeriodChanged() {
  await loadSalesVelocity();
  buildRowsForCurrentMode();
}

// --- ROW BUILDERS (Using Harga Beli Terakhir as HPP) ---

function buildRowItem(params: {
  rowKey: string;
  assistCode: string;
  assistName: string;
  assistUnit: string;
  latestBuyPrice: number; // HARGA BELI TERAKHIR DARI ASSIST (HPP)
  assistSellPrice?: number;
  fakturUnitPrice?: number | null;
  soldQtyOnDate?: number;
}): PriceTableRowItem {
  const {
    rowKey,
    assistCode,
    assistName,
    assistUnit,
    latestBuyPrice,
    assistSellPrice = 0,
    fakturUnitPrice = null,
    soldQtyOnDate,
  } = params;

  // Resolve Desty SKU match & conversion factor
  const resolved = resolveDestyPriceItem(assistCode, props.mappings, destyPriceCatalog.value);
  const destyRec = resolved.destyRecord;
  const destyCurrentPrice = destyRec ? Number(destyRec.salesPrice || 0) : null;

  // Base Cost = HARGA BELI TERAKHIR
  const baseCost = Number(latestBuyPrice) || 0;
  const factor = Number(resolved.conversionFactor) > 0 ? Number(resolved.conversionFactor) : 1;
  const convertedCost = baseCost * factor;

  const offlineSellPrice = Number(assistSellPrice) || 0;
  const assistOfflinePrice = offlineSellPrice * factor;
  const offlineProfit = assistOfflinePrice - convertedCost;
  const assistOfflineMarginPercent =
    assistOfflinePrice > 0 ? (offlineProfit / assistOfflinePrice) * 100 : 0;

  // Target Price from Formula
  const {
    matchedTier,
    calculatedPrice,
    profitNominal,
    actualMarginPercent,
  } = calculateTargetPrice(baseCost, factor, pricingConfig.value);

  // Desty Current Margin
  const destyMargin =
    destyCurrentPrice !== null && destyCurrentPrice > 0
      ? computeMarginForPrice(destyCurrentPrice, convertedCost, matchedTier?.minBuyQty || 1, pricingConfig.value)
      : null;

  const priceDiff = destyCurrentPrice !== null ? calculatedPrice - destyCurrentPrice : 0;
  const pctDiff = destyCurrentPrice && destyCurrentPrice > 0 ? (priceDiff / destyCurrentPrice) * 100 : 0;

  const rowStatus = !destyRec
    ? "unmapped"
    : priceDiff !== 0
    ? "ready"
    : "idle";

  // Sales Velocity
  const vItem =
    velocityMap.value.get(assistCode.trim().toUpperCase()) ||
    (rowKey ? velocityMap.value.get(rowKey.toLowerCase()) : undefined);

  const onlineSoldQty = vItem?.onlineSoldQty ?? 0;
  const onlineOrderCount = vItem?.onlineOrderCount ?? 0;
  const totalSoldQty = vItem?.totalSoldQty ?? 0;
  const totalOrderCount = vItem?.totalOrderCount ?? 0;
  const lastOnlineOrderDate = vItem?.lastOnlineOrderDate ?? null;

  const safety = determineSafety(
    onlineSoldQty,
    onlineOrderCount,
    totalSoldQty,
    destyCurrentPrice,
    calculatedPrice,
    pctDiff,
    velocityPeriodDays.value,
  );

  const salesVelocity: SalesVelocityItemInfo = {
    onlineSoldQty,
    onlineOrderCount,
    totalSoldQty,
    totalOrderCount,
    lastOnlineOrderDate,
    safetyLevel: safety.level,
    safetyLabel: safety.label,
    safetyReason: safety.reason,
  };

  return {
    rowKey,
    destySkuId: destyRec?.skuId,
    destyMasterSku: resolved.destySku,
    destyProductName: destyRec?.productName,
    destyCurrentPrice,
    bindList: destyRec?.bindList || [],

    assistCode,
    assistProductName: assistName,
    assistUnitName: assistUnit || "pcs",
    conversionFactor: factor,
    isMapped: resolved.isMapped,

    assistBuyPrice: baseCost,
    assistSellPrice: offlineSellPrice,
    fakturUnitPrice,
    baseCost,

    appliedTier: matchedTier,
    appliedMarginPercent: matchedTier ? matchedTier.marginPercent : 0,
    appliedMinBuyQty: matchedTier ? matchedTier.minBuyQty : 1,
    calculatedPrice,

    assistOfflinePrice,
    assistOfflineMarginPercent,
    convertedCost,

    destyCurrentMarginNominal: destyMargin ? destyMargin.nominal : null,
    destyCurrentMarginPercent: destyMargin ? destyMargin.percent : null,
    targetMarginNominal: profitNominal,
    targetMarginPercent: actualMarginPercent,

    targetPrice: calculatedPrice,
    isCustomPrice: false,
    priceDifference: priceDiff,
    percentDifference: pctDiff,

    salesVelocity,
    soldQtyOnDate,

    checked: rowStatus === "ready",
    status: rowStatus,
    statusMessage: !destyRec ? "SKU belum terhubung di Desty" : undefined,
  };
}

function buildRowsForFaktur() {
  const inv = selectedInvoice.value;
  if (!inv) {
    tableRows.value = [];
    return;
  }

  const rows: PriceTableRowItem[] = [];
  for (const it of inv.items) {
    const code = it.code || "";
    const catItem =
      (code ? catalogByCode.value.get(code.toUpperCase()) : undefined) ||
      (it.medicineId ? catalogById.value.get(it.medicineId) : undefined) ||
      (it.akhpId ? catalogById.value.get(it.akhpId) : undefined);

    const resolvedCode = code || catItem?.code || "";
    const resolvedName = it.name || catItem?.name || "Item Tanpa Nama";
    const resolvedUnit = it.unit || catItem?.unit || "pcs";

    // Harga Beli Terakhir: ambil it.buyFee dari faktur, atau fallback ke catItem.buyFee / catItem.avgHPP
    const invoiceBuyPrice = Number(it.buyFee) || 0;
    const catalogBuyPrice = Number(catItem?.buyFee) || Number(catItem?.avgHPP) || 0;
    const latestBuyPrice = invoiceBuyPrice > 0 ? invoiceBuyPrice : catalogBuyPrice;

    rows.push(
      buildRowItem({
        rowKey: `faktur-${inv.id}-${it.medicineId || it.code || it.name}`,
        assistCode: resolvedCode,
        assistName: resolvedName,
        assistUnit: resolvedUnit,
        latestBuyPrice,
        fakturUnitPrice: invoiceBuyPrice > 0 ? invoiceBuyPrice : null,
        assistSellPrice: Number(catItem?.sellNormalFee) || 0,
      }),
    );
  }

  tableRows.value = rows;
}

function buildRowsForAllProducts() {
  const rows: PriceTableRowItem[] = [];
  for (const it of props.assistCatalog) {
    if (!it.code) continue;

    // Harga Beli Terakhir: it.buyFee || it.avgHPP
    const latestBuyPrice = Number(it.buyFee) || Number(it.avgHPP) || 0;

    rows.push(
      buildRowItem({
        rowKey: `all-${it.id || it.code}`,
        assistCode: it.code,
        assistName: it.name,
        assistUnit: it.unit || "pcs",
        latestBuyPrice,
        assistSellPrice: Number(it.sellNormalFee) || 0,
      }),
    );
  }

  tableRows.value = rows;
}

function buildRowsForOnlineSales() {
  const rows: PriceTableRowItem[] = [];
  for (const it of onlineSoldProductsSummary.value) {
    const catItem = catalogByCode.value.get(it.code.toUpperCase());
    const latestBuyPrice =
      Number(it.buyFee) || Number(catItem?.buyFee) || Number(catItem?.avgHPP) || 0;

    rows.push(
      buildRowItem({
        rowKey: `sold-${it.code}`,
        assistCode: it.code,
        assistName: it.name,
        assistUnit: catItem?.unit || "pcs",
        latestBuyPrice,
        assistSellPrice: Number(catItem?.sellNormalFee) || 0,
        soldQtyOnDate: it.quantitySold,
      }),
    );
  }

  tableRows.value = rows;
}

function buildRowsForCurrentMode() {
  if (priceSessionMode.value === "faktur") {
    buildRowsForFaktur();
  } else if (priceSessionMode.value === "sold") {
    buildRowsForOnlineSales();
  } else {
    buildRowsForAllProducts();
  }
}

async function loadOnlineSalesForDate() {
  if (!props.assistToken || !selectedSalesDate.value) return;
  isLoadingOnlineSales.value = true;
  try {
    const txs = await fetchAllAssistPemasukan(
      selectedSalesDate.value,
      selectedSalesDate.value,
      props.assistToken,
    );

    const onlineTxs = txs.filter((tx) => isOnlineAssistTransaction(tx));
    const map = new Map<string, { code: string; name: string; quantitySold: number; buyFee?: number }>();

    for (const tx of onlineTxs) {
      const items = Array.isArray(tx.Items) ? tx.Items : Array.isArray((tx as any).item) ? (tx as any).item : [];
      for (const it of items) {
        const code = (it.code || "").trim();
        if (!code) continue;
        const key = code.toUpperCase();
        const existing = map.get(key);
        const qty = Number(it.quantity) || 0;

        if (existing) {
          existing.quantitySold += qty;
        } else {
          const cat = catalogByCode.value.get(key);
          map.set(key, {
            code,
            name: it.name || it.itemName || cat?.name || code,
            quantitySold: qty,
            buyFee: Number(it.buyFee) || Number(cat?.buyFee) || Number(cat?.avgHPP) || 0,
          });
        }
      }
    }

    onlineSoldProductsSummary.value = Array.from(map.values());
    buildRowsForOnlineSales();
  } catch (err) {
    console.error("Gagal memuat penjualan online:", err);
    $q.notify({
      type: "negative",
      message: "Gagal memuat transaksi online tanggal tersebut.",
      position: "top-right",
    });
  } finally {
    isLoadingOnlineSales.value = false;
  }
}

async function loadSessionData() {
  isLoadingData.value = true;
  tableRows.value = [];
  currentPage.value = 1;

  if (!props.assistCatalog || props.assistCatalog.length === 0) {
    emit("refreshCatalog");
  }

  try {
    await Promise.all([
      loadPricingConfig(),
      loadDestyPrices(),
      loadSalesVelocity(),
      loadInvoices(),
    ]);

    buildRowsForCurrentMode();
  } catch (err: any) {
    console.error("Gagal memuat data sesi harga:", err);
  } finally {
    isLoadingData.value = false;
  }
}

function recalculateAllRows() {
  for (const row of tableRows.value) {
    const factor = Number(row.conversionFactor) > 0 ? Number(row.conversionFactor) : 1;
    row.convertedCost = Math.max(0, Number(row.baseCost) || 0) * factor;

    const {
      matchedTier,
      calculatedPrice,
      profitNominal,
      actualMarginPercent,
    } = calculateTargetPrice(row.baseCost, row.conversionFactor, pricingConfig.value);

    row.appliedTier = matchedTier;
    row.appliedMarginPercent = matchedTier ? matchedTier.marginPercent : 0;
    row.appliedMinBuyQty = matchedTier ? matchedTier.minBuyQty : 1;
    row.calculatedPrice = calculatedPrice;

    if (!row.isCustomPrice) {
      row.targetPrice = calculatedPrice;
      row.targetMarginNominal = profitNominal;
      row.targetMarginPercent = actualMarginPercent;
    } else {
      const tm = computeMarginForPrice(row.targetPrice, row.convertedCost, row.appliedMinBuyQty, pricingConfig.value);
      row.targetMarginNominal = tm.nominal;
      row.targetMarginPercent = tm.percent;
    }

    if (row.destyCurrentPrice !== null && row.destyCurrentPrice > 0) {
      const cm = computeMarginForPrice(row.destyCurrentPrice, row.convertedCost, row.appliedMinBuyQty, pricingConfig.value);
      row.destyCurrentMarginNominal = cm.nominal;
      row.destyCurrentMarginPercent = cm.percent;
      row.priceDifference = row.targetPrice - row.destyCurrentPrice;
      row.percentDifference = ((row.targetPrice - row.destyCurrentPrice) / row.destyCurrentPrice) * 100;
    } else {
      row.destyCurrentMarginNominal = null;
      row.destyCurrentMarginPercent = null;
      row.priceDifference = 0;
      row.percentDifference = 0;
    }

    if (row.status !== "success" && row.status !== "error") {
      row.status = !row.destySkuId ? "unmapped" : row.priceDifference !== 0 ? "ready" : "idle";
    }

    if (!isQueueRunning.value && row.status !== "success" && row.status !== "error") {
      row.checked = Boolean(row.destySkuId && row.priceDifference !== 0);
    }
  }

  tableRows.value = [...tableRows.value];
}

function onTargetPriceChange(row: PriceTableRowItem, newVal: string | number) {
  const val = Math.max(0, Number(newVal) || 0);
  row.targetPrice = val;
  row.isCustomPrice = val !== row.calculatedPrice;
  const destyPrice = row.destyCurrentPrice ?? 0;
  row.priceDifference = row.targetPrice - destyPrice;
  row.percentDifference = destyPrice > 0 ? ((row.targetPrice - destyPrice) / destyPrice) * 100 : 0;

  const tm = computeMarginForPrice(row.targetPrice, row.convertedCost, row.appliedMinBuyQty, pricingConfig.value);
  row.targetMarginNominal = tm.nominal;
  row.targetMarginPercent = tm.percent;

  if (row.salesVelocity) {
    const s = determineSafety(
      row.salesVelocity.onlineSoldQty,
      row.salesVelocity.onlineOrderCount,
      row.salesVelocity.totalSoldQty,
      row.destyCurrentPrice,
      row.targetPrice,
      row.percentDifference,
      velocityPeriodDays.value,
    );
    row.salesVelocity.safetyLevel = s.level;
    row.salesVelocity.safetyLabel = s.label;
    row.salesVelocity.safetyReason = s.reason;
  }

  if (row.status !== "success" && row.status !== "error") {
    row.status = !row.destySkuId ? "unmapped" : row.priceDifference !== 0 ? "ready" : "idle";
  }
}

function resetRowPrice(row: PriceTableRowItem) {
  row.targetPrice = row.calculatedPrice;
  row.isCustomPrice = false;
  const destyPrice = row.destyCurrentPrice ?? 0;
  row.priceDifference = row.targetPrice - destyPrice;
  row.percentDifference = destyPrice > 0 ? ((row.targetPrice - destyPrice) / destyPrice) * 100 : 0;

  const tm = computeMarginForPrice(row.targetPrice, row.convertedCost, row.appliedMinBuyQty, pricingConfig.value);
  row.targetMarginNominal = tm.nominal;
  row.targetMarginPercent = tm.percent;

  if (row.salesVelocity) {
    const s = determineSafety(
      row.salesVelocity.onlineSoldQty,
      row.salesVelocity.onlineOrderCount,
      row.salesVelocity.totalSoldQty,
      row.destyCurrentPrice,
      row.targetPrice,
      row.percentDifference,
      velocityPeriodDays.value,
    );
    row.salesVelocity.safetyLevel = s.level;
    row.salesVelocity.safetyLabel = s.label;
    row.salesVelocity.safetyReason = s.reason;
  }

  if (row.status !== "success" && row.status !== "error") {
    row.status = !row.destySkuId ? "unmapped" : row.priceDifference !== 0 ? "ready" : "idle";
  }
}

// --- SKU MAPPING DIALOG ---
function openMappingDialog(row: PriceTableRowItem) {
  mappingDialogData.value = {
    destySku: row.destyMasterSku || row.assistCode,
    localSku: row.assistCode,
    conversionFactor: row.conversionFactor || 1,
    destyUnit: "",
    localUnit: row.assistUnitName || "pcs",
  };
  showMappingDialog.value = true;
}

function handleSaveMapping(mapping: any) {
  emit("saveMapping", mapping);
  showMappingDialog.value = false;
  $q.notify({
    type: "positive",
    message: "Pemetaan SKU berhasil disimpan.",
    position: "top-right",
  });
  buildRowsForCurrentMode();
}

// --- FILTERING & PAGINATION ---

const filterCounts = computed(() => {
  let diffCount = 0;
  let diffPositiveCount = 0;
  let diffNegativeCount = 0;
  let sameCount = 0;
  let unmappedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let safeCount = 0;
  let moderateCount = 0;
  let cautionCount = 0;

  for (const r of tableRows.value) {
    if (!r.destySkuId || r.status === "unmapped") {
      unmappedCount++;
    } else if (r.status === "success") {
      successCount++;
    } else if (r.status === "error") {
      errorCount++;
    } else if (r.destyCurrentPrice !== null && r.priceDifference !== 0) {
      diffCount++;
      if (r.priceDifference > 0) {
        diffPositiveCount++;
      } else if (r.priceDifference < 0) {
        diffNegativeCount++;
      }
    } else if (r.destyCurrentPrice !== null && r.priceDifference === 0) {
      sameCount++;
    }

    if (r.salesVelocity?.safetyLevel === "safe") {
      safeCount++;
    } else if (r.salesVelocity?.safetyLevel === "moderate") {
      moderateCount++;
    } else if (r.salesVelocity?.safetyLevel === "caution") {
      cautionCount++;
    }
  }

  return {
    diff: diffCount,
    diffPositive: diffPositiveCount,
    diffNegative: diffNegativeCount,
    all: tableRows.value.length,
    same: sameCount,
    unmapped: unmappedCount,
    success: successCount,
    error: errorCount,
    safe: safeCount,
    moderate: moderateCount,
    caution: cautionCount,
  };
});

const filterOptions = computed(() => [
  { label: `Semua (${filterCounts.value.all})`, value: "all" },
  { label: `Selisih + (${filterCounts.value.diffPositive})`, value: "diff_positive" },
  { label: `Selisih - (${filterCounts.value.diffNegative})`, value: "diff_negative" },
  { label: `Harga Sama (${filterCounts.value.same})`, value: "same_price" },
  { label: `Belum Dipetakan (${filterCounts.value.unmapped})`, value: "unmapped" },
  ...(filterCounts.value.success > 0 ? [{ label: `Berhasil (${filterCounts.value.success})`, value: "success" }] : []),
  ...(filterCounts.value.error > 0 ? [{ label: `Gagal (${filterCounts.value.error})`, value: "error" }] : []),
]);

const safetyFilterOptions = computed(() => [
  { label: `Semua Keamanan (${filterCounts.value.all})`, value: "all" },
  { label: `🟢 Aman Naik (${filterCounts.value.safe})`, value: "safe" },
  { label: `🟡 Cukup Aman (${filterCounts.value.moderate})`, value: "moderate" },
  { label: `⚠️ Perlu Waspada (${filterCounts.value.caution})`, value: "caution" },
]);

const filteredRows = computed(() => {
  let list = tableRows.value;

  if (statusFilter.value === "diff_positive") {
    list = list.filter((r) => r.destySkuId && r.destyCurrentPrice !== null && r.priceDifference > 0);
  } else if (statusFilter.value === "diff_negative") {
    list = list.filter((r) => r.destySkuId && r.destyCurrentPrice !== null && r.priceDifference < 0);
  } else if (statusFilter.value === "same_price") {
    list = list.filter((r) => r.destySkuId && r.destyCurrentPrice !== null && r.priceDifference === 0);
  } else if (statusFilter.value === "unmapped") {
    list = list.filter((r) => !r.destySkuId || r.status === "unmapped");
  } else if (statusFilter.value === "success") {
    list = list.filter((r) => r.status === "success");
  } else if (statusFilter.value === "error") {
    list = list.filter((r) => r.status === "error");
  }

  if (safetyFilter.value !== "all") {
    list = list.filter((r) => r.salesVelocity?.safetyLevel === safetyFilter.value);
  }

  const query = searchFilter.value.toLowerCase().trim();
  if (query) {
    list = list.filter(
      (r) =>
        r.assistCode.toLowerCase().includes(query) ||
        r.destyMasterSku.toLowerCase().includes(query) ||
        (r.assistProductName && r.assistProductName.toLowerCase().includes(query)) ||
        (r.destyProductName && r.destyProductName.toLowerCase().includes(query)),
    );
  }

  return list;
});

const totalPages = computed(() => Math.ceil(filteredRows.value.length / pageSize.value) || 1);
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

const checkedRows = computed(() => tableRows.value.filter((r) => r.checked && r.destySkuId));
const isAllSelected = computed({
  get: () => {
    const valid = pagedRows.value.filter((r) => r.destySkuId);
    return valid.length > 0 && valid.every((r) => r.checked);
  },
  set: (val: boolean) => {
    pagedRows.value.forEach((r) => {
      if (r.destySkuId) r.checked = val;
    });
  },
});

function selectAllDiff() {
  tableRows.value.forEach((r) => {
    r.checked = Boolean(r.destySkuId && r.priceDifference !== 0);
  });
}

function clearSelection() {
  tableRows.value.forEach((r) => {
    r.checked = false;
  });
}

// --- QUEUE EXECUTION ---

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateSingleItem(row: PriceTableRowItem) {
  if (!row.destySkuId || !props.destyToken) {
    $q.notify({
      type: "warning",
      message: "Item belum terhubung ke Desty atau token tidak tersedia.",
      position: "top-right",
    });
    return;
  }

  row.status = "pending";
  row.statusMessage = "Mengirim harga baru ke Desty...";

  try {
    const res = await updateDestyMasterPrice({
      token: props.destyToken,
      tenantId: props.destyTenantId,
      skuId: row.destySkuId,
      price: Math.round(row.targetPrice),
    });

    row.status = "success";
    row.destyCurrentPrice = row.targetPrice;
    row.priceDifference = 0;
    row.percentDifference = 0;
    row.destyCurrentMarginNominal = row.targetMarginNominal;
    row.destyCurrentMarginPercent = row.targetMarginPercent;
    row.successChannelsCount = res.successCount;
    row.statusMessage = `Berhasil (${res.successCount} toko terupdate)`;

    $q.notify({
      type: "positive",
      message: `Harga ${row.destyMasterSku} berhasil diperbarui di Desty!`,
      position: "top-right",
    });
  } catch (err: any) {
    row.status = "error";
    row.statusMessage = err?.message || "Gagal mengupdate harga";
    $q.notify({
      type: "negative",
      message: `Gagal mengupdate ${row.destyMasterSku}: ${err?.message || String(err)}`,
      position: "top-right",
    });
  }
}

async function startBatchUpdate() {
  if (!props.destyToken) {
    $q.notify({
      type: "negative",
      message: "Token Desty tidak tersedia. Silakan hubungkan Desty terlebih dahulu.",
      position: "top-right",
    });
    return;
  }

  const items = checkedRows.value;
  if (items.length === 0) {
    $q.notify({
      type: "warning",
      message: "Pilih minimal 1 produk yang memiliki SKU Desty.",
      position: "top-right",
    });
    return;
  }

  isQueueRunning.value = true;
  isQueuePaused.value = false;
  isQueueCancelled.value = false;

  queueProgress.value = {
    current: 0,
    total: items.length,
    success: 0,
    failed: 0,
  };

  for (let i = 0; i < items.length; i++) {
    if (isQueueCancelled.value) break;

    while (isQueuePaused.value && !isQueueCancelled.value) {
      await wait(300);
    }
    if (isQueueCancelled.value) break;

    const row = items[i];
    queueProgress.value.current = i + 1;
    currentItemProcessing.value = `[${row.destyMasterSku}] ${row.assistProductName} -> Rp ${Math.round(row.targetPrice).toLocaleString("id-ID")}`;

    row.status = "pending";
    row.statusMessage = "Mengirim harga ke Desty...";

    let success = false;
    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts && !success && !isQueueCancelled.value) {
      attempt++;
      try {
        const res = await updateDestyMasterPrice({
          token: props.destyToken,
          tenantId: props.destyTenantId,
          skuId: row.destySkuId!,
          price: Math.round(row.targetPrice),
        });

        row.status = "success";
        row.destyCurrentPrice = row.targetPrice;
        row.priceDifference = 0;
        row.percentDifference = 0;
        row.destyCurrentMarginNominal = row.targetMarginNominal;
        row.destyCurrentMarginPercent = row.targetMarginPercent;
        row.successChannelsCount = res.successCount;
        row.statusMessage = `Berhasil (${res.successCount} toko)`;
        row.checked = false;
        queueProgress.value.success++;
        success = true;
      } catch (err: any) {
        if (attempt < maxAttempts) {
          row.statusMessage = `Mencoba lagi (ke-${attempt + 1})...`;
          await wait(1500);
        } else {
          row.status = "error";
          row.statusMessage = err?.message || "Gagal mengupdate";
          queueProgress.value.failed++;
        }
      }
    }

    if (i < items.length - 1 && !isQueueCancelled.value) {
      await wait(throttleDelayMs.value);
    }
  }

  isQueueRunning.value = false;
  isQueuePaused.value = false;
  currentItemProcessing.value = "";

  if (isQueueCancelled.value) {
    $q.notify({
      type: "info",
      message: "Proses update harga dihentikan oleh pengguna.",
      position: "top-right",
    });
  } else {
    $q.notify({
      type: queueProgress.value.failed === 0 ? "positive" : "warning",
      message: `Selesai: ${queueProgress.value.success} berhasil, ${queueProgress.value.failed} gagal.`,
      position: "top-right",
    });
  }
}

function pauseQueue() {
  isQueuePaused.value = true;
}

function resumeQueue() {
  isQueuePaused.value = false;
}

function cancelQueue() {
  isQueueCancelled.value = true;
  isQueuePaused.value = false;
}

function retryFailedItems() {
  tableRows.value.forEach((r) => {
    r.checked = r.status === "error";
  });
  startBatchUpdate();
}

function getPlatformColor(platform?: string): string {
  const p = (platform || "").toLowerCase();
  if (p === "shopee") return "orange-8";
  if (p === "blibli") return "blue-7";
  if (p.includes("tiktok") || p.includes("tokopedia")) return "dark";
  return "purple-7";
}

function getSafetyBadgeColor(level?: string): string {
  if (level === "safe") return "positive";
  if (level === "moderate") return "warning";
  return "negative";
}

function formatRupiah(val?: number | null): string {
  if (val === null || val === undefined) return "-";
  return `Rp ${Math.round(val).toLocaleString("id-ID")}`;
}

function formatDateShort(val?: string | null): string {
  if (!val) return "-";
  return val.substring(0, 10);
}

// Lifecycle & Watches
onMounted(() => {
  loadSessionData();
  const unsub = subscribeMarketplacePricingConfig((latestConfig) => {
    pricingConfig.value = latestConfig;
    recalculateAllRows();
  });
  if (unsub) {
    unsubscribePricingConfig = unsub;
  }
});

onUnmounted(() => {
  if (unsubscribePricingConfig) {
    unsubscribePricingConfig();
    unsubscribePricingConfig = null;
  }
});

watch(priceSessionMode, () => {
  buildRowsForCurrentMode();
});

watch(selectedInvoiceId, () => {
  if (priceSessionMode.value === "faktur") {
    buildRowsForFaktur();
  }
});

watch(() => props.assistCatalog, () => {
  buildRowsForCurrentMode();
}, { deep: true });

watch(() => props.mappings, () => {
  buildRowsForCurrentMode();
}, { deep: true });

watch([statusFilter, searchFilter, safetyFilter], () => {
  currentPage.value = 1;
});
</script>

<template>
  <div class="desty-price-update-tab">
    <!-- Banner if Assist Catalog is empty -->
    <q-banner v-if="props.assistCatalog.length === 0" rounded class="bg-amber-1 text-amber-10 border-amber q-mb-md">
      <template v-slot:avatar>
        <q-icon name="warning" color="amber-9" />
      </template>
      <div class="row items-center justify-between no-wrap">
        <div>
          Data katalog dan harga beli stok obat dari Assist belum termuat. Pastikan tab <b>clinica.assist.id</b> terbuka untuk sinkronisasi harga beli terakhir (HPP).
        </div>
        <q-btn
          color="amber-9"
          text-color="white"
          dense
          no-caps
          label="Muat Katalog Assist"
          icon="refresh"
          class="q-px-sm q-ml-md no-wrap"
          @click="emit('refreshCatalog')"
        />
      </div>
    </q-banner>

    <q-card flat bordered class="q-mb-md">
      <!-- 1. SESSION MODE SELECTOR & CONTEXT BAR -->
      <q-card-section class="bg-grey-1 row items-center justify-between q-py-md q-col-gutter-md border-bottom">
        <div class="col-12 col-lg-5 row items-center q-gutter-sm">
          <div class="text-subtitle2 text-weight-bold text-slate-800">Mode Sesi:</div>
          <q-btn-toggle
            v-model="priceSessionMode"
            toggle-color="teal"
            color="white"
            text-color="grey-9"
            unelevated
            dense
            no-caps
            class="border rounded-borders"
            :options="[
              { label: 'Faktur Pembelian', value: 'faktur', icon: 'receipt_long' },
              { label: 'Terjual Online', value: 'sold', icon: 'shopping_cart' },
              { label: 'Seluruh Produk', value: 'all', icon: 'inventory_2' }
            ]"
          />
        </div>

        <!-- Mode: Faktur Selector -->
        <div v-if="priceSessionMode === 'faktur'" class="col-12 col-lg-4">
          <q-select
            v-model="selectedInvoiceId"
            :options="recentInvoicesList"
            option-value="id"
            option-label="invoiceNumber"
            outlined
            dense
            emit-value
            map-options
            color="teal"
            bg-color="white"
            :loading="isLoadingInvoices"
            style="min-width: 280px"
          >
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label class="text-weight-bold text-slate-900">
                    No. {{ scope.opt.invoiceNumber }} — {{ scope.opt.supplierName }}
                  </q-item-label>
                  <q-item-label caption class="text-grey-7">
                    Tgl: {{ scope.opt.receivedDate || '-' }} | {{ scope.opt.itemCount || 0 }} Item
                  </q-item-label>
                </q-item-section>
              </q-item>
            </template>
            <template v-slot:selected-item="scope">
              <span class="text-caption text-weight-bold text-teal" v-if="scope.opt">
                Faktur {{ scope.opt.invoiceNumber }} ({{ scope.opt.supplierName }})
              </span>
            </template>
          </q-select>
        </div>

        <!-- Mode: Sold Online Date Selector -->
        <div v-else-if="priceSessionMode === 'sold'" class="col-12 col-lg-4 row items-center q-gutter-sm">
          <div class="text-caption text-weight-bold text-grey-8">Tanggal:</div>
          <q-input
            v-model="selectedSalesDate"
            type="date"
            outlined
            dense
            color="teal"
            bg-color="white"
            style="width: 150px;"
          />
          <q-btn
            color="teal"
            unelevated
            dense
            icon="refresh"
            label="Muat"
            :loading="isLoadingOnlineSales"
            @click="loadOnlineSalesForDate"
            no-caps
            class="q-px-sm"
          />
          <span v-if="onlineSoldProductsSummary.length > 0" class="text-caption text-grey-7">
            ({{ onlineSoldProductsSummary.length }} produk)
          </span>
        </div>

        <!-- Mode: All Products Counter -->
        <div v-else class="col-12 col-lg-4 row items-center q-gutter-xs">
          <q-badge color="teal" class="q-py-xs q-px-sm text-caption text-weight-medium">
            {{ props.assistCatalog.length }} Produk Assist | {{ Object.keys(destyPriceCatalog).length }} SKU Desty
          </q-badge>
          <q-btn
            flat
            dense
            round
            icon="sync"
            color="teal"
            :loading="isLoadingDestyPrices"
            @click="loadDestyPrices()"
          >
            <q-tooltip>Muat ulang katalog harga dari Desty</q-tooltip>
          </q-btn>
        </div>

        <!-- Right Toolbar Actions -->
        <div class="col-12 col-md-3 row items-center justify-end q-gutter-xs">
          <q-btn
            outline
            color="teal"
            icon="tune"
            label="Atur Formula Harga"
            dense
            no-caps
            class="q-px-sm font-medium"
            @click="showFormulaDialog = true"
          />
          <q-btn
            flat
            round
            dense
            icon="refresh"
            color="grey-8"
            :loading="isLoadingData"
            @click="loadSessionData"
          >
            <q-tooltip>Segarkan Data</q-tooltip>
          </q-btn>
        </div>
      </q-card-section>

      <!-- 2. QUEUE PROGRESS BANNER -->
      <q-card-section v-if="isQueueRunning || queueProgress.total > 0" class="bg-grey-1 border-bottom q-py-sm">
        <div class="row items-center justify-between q-col-gutter-sm">
          <div class="row items-center q-gutter-sm">
            <q-spinner-dots v-if="isQueueRunning && !isQueuePaused" color="teal" size="20px" />
            <q-icon v-else-if="isQueuePaused" name="pause_circle" color="warning" size="22px" />
            <q-icon v-else name="check_circle" color="positive" size="22px" />

            <div>
              <div class="text-caption text-weight-bold text-slate-800">
                <span v-if="isQueueRunning && !isQueuePaused">Mengupdate Harga ke Desty Omni...</span>
                <span v-else-if="isQueuePaused">Antrian Dijeda (Paused)</span>
                <span v-else>Proses Update Selesai</span>
              </div>
              <div class="text-caption text-grey-7 ellipsis" style="max-width: 500px;">
                {{ currentItemProcessing || 'Semua item dalam antrian telah selesai diproses.' }}
              </div>
            </div>
          </div>

          <!-- Queue Control Buttons -->
          <div class="row items-center q-gutter-xs">
            <q-btn
              v-if="isQueueRunning && !isQueuePaused"
              unelevated
              color="warning"
              icon="pause"
              label="Jeda"
              size="sm"
              dense
              no-caps
              class="q-px-sm"
              @click="pauseQueue"
            />
            <q-btn
              v-if="isQueueRunning && isQueuePaused"
              unelevated
              color="positive"
              icon="play_arrow"
              label="Lanjutkan"
              size="sm"
              dense
              no-caps
              class="q-px-sm"
              @click="resumeQueue"
            />
            <q-btn
              v-if="isQueueRunning"
              flat
              color="negative"
              icon="cancel"
              label="Batal"
              size="sm"
              dense
              no-caps
              @click="cancelQueue"
            />
            <q-btn
              v-if="!isQueueRunning && queueProgress.failed > 0"
              unelevated
              color="negative"
              icon="replay"
              :label="`Coba Lagi ${queueProgress.failed} Item Gagal`"
              size="sm"
              dense
              no-caps
              class="q-px-sm"
              @click="retryFailedItems"
            />
          </div>
        </div>

        <q-linear-progress
          :value="queueProgress.total > 0 ? queueProgress.current / queueProgress.total : 0"
          color="teal"
          rounded
          size="6px"
          class="q-my-xs"
        />

        <div class="row items-center justify-between text-caption text-grey-7">
          <div>
            Progres: <b>{{ queueProgress.current }} / {{ queueProgress.total }}</b>
            ({{ queueProgress.total > 0 ? Math.round((queueProgress.current / queueProgress.total) * 100) : 0 }}%)
          </div>
          <div class="row q-gutter-sm">
            <span class="text-positive text-weight-bold">Berhasil: {{ queueProgress.success }}</span>
            <span class="text-negative text-weight-bold">Gagal: {{ queueProgress.failed }}</span>
            <span>Sisa: {{ queueProgress.total - queueProgress.current }}</span>
          </div>
        </div>
      </q-card-section>

      <!-- 3. FILTER BAR -->
      <q-card-section class="bg-white border-bottom q-py-sm">
        <div class="row items-center justify-between q-col-gutter-sm">
          <!-- Status Filter Toggle -->
          <div class="col-12 col-lg-5">
            <q-btn-toggle
              v-model="statusFilter"
              rounded
              dense
              no-caps
              unelevated
              toggle-color="teal"
              color="white"
              text-color="grey-8"
              class="border"
              :options="filterOptions"
            />
          </div>

          <!-- Safety Filter, Period Selector, Search & Throttle Delay -->
          <div class="col-12 col-lg-7 row items-center justify-end q-gutter-xs">
            <q-select
              v-model="safetyFilter"
              :options="safetyFilterOptions"
              emit-value
              map-options
              dense
              outlined
              color="teal"
              bg-color="white"
              style="min-width: 170px;"
            >
              <q-tooltip>Filter berdasarkan analisis keamanan kenaikan harga</q-tooltip>
            </q-select>

            <q-select
              v-model.number="velocityPeriodDays"
              :options="[
                { label: 'Histori 30 Hari', value: 30 },
                { label: 'Histori 60 Hari', value: 60 },
                { label: 'Histori 90 Hari', value: 90 },
              ]"
              emit-value
              map-options
              dense
              outlined
              color="teal"
              bg-color="white"
              style="width: 140px;"
              :loading="isLoadingVelocity"
              @update:model-value="onVelocityPeriodChanged"
            >
              <q-tooltip>Rentang waktu histori penjualan online & total Assist</q-tooltip>
            </q-select>

            <q-input
              v-model="searchFilter"
              dense
              outlined
              placeholder="Cari SKU / Nama..."
              color="teal"
              bg-color="white"
              class="col"
              style="min-width: 140px;"
              clearable
            >
              <template #prepend>
                <q-icon name="search" size="18px" color="grey-6" />
              </template>
            </q-input>

            <q-select
              v-model.number="throttleDelayMs"
              :options="[
                { label: 'Jeda 500ms', value: 500 },
                { label: 'Jeda 1000ms', value: 1000 },
                { label: 'Jeda 1500ms', value: 1500 },
                { label: 'Jeda 2000ms', value: 2000 },
              ]"
              emit-value
              map-options
              dense
              outlined
              color="teal"
              bg-color="white"
              style="width: 125px;"
            >
              <q-tooltip>Jeda waktu antar request untuk mencegah rate limit Desty/Marketplace</q-tooltip>
            </q-select>
          </div>
        </div>
      </q-card-section>

      <!-- 4. SELECTION HEADER & BATCH CTA BAR -->
      <q-card-section class="bg-grey-1 border-bottom q-py-xs row items-center justify-between">
        <div class="row items-center q-gutter-sm">
          <q-checkbox v-model="isAllSelected" dense color="teal" />
          <span class="text-caption text-weight-bold text-grey-9">
            {{ checkedRows.length }} produk terpilih
          </span>
          <q-btn flat dense no-caps size="xs" color="teal" label="Pilih Semua Selisih" @click="selectAllDiff" />
          <q-btn flat dense no-caps size="xs" color="grey-7" label="Hapus Pilihan" @click="clearSelection" />
        </div>

        <q-btn
          unelevated
          color="teal"
          dense
          icon="cloud_upload"
          :label="`Update ${checkedRows.length} Produk ke Desty`"
          :disable="checkedRows.length === 0 || isQueueRunning"
          :loading="isQueueRunning"
          no-caps
          class="q-px-md font-medium"
          @click="startBatchUpdate"
        />
      </q-card-section>

      <!-- 5. TABLE CONTAINER -->
      <div class="table-container">
        <table class="desty-table">
          <thead>
            <tr>
              <th style="width: 40px;" class="text-center">
                <q-checkbox v-model="isAllSelected" dense color="teal" />
              </th>
              <th style="width: 17%;">Produk & Kode Assist</th>
              <th style="width: 15%;">SKU Desty & Toko Terikat</th>
              <th style="width: 14%;">Histori Terjual & Keamanan</th>
              <th style="width: 9%;" class="text-right">Harga Beli Terakhir (HPP)</th>
              <th style="width: 12%;" class="text-right">Harga Desty & Net Margin</th>
              <th style="width: 12%;" class="text-right">Target Harga Baru</th>
              <th style="width: 10%;" class="text-right">Target Net Margin</th>
              <th style="width: 6%;" class="text-right">Selisih</th>
              <th style="width: 5%;" class="text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoadingData || (priceSessionMode === 'sold' && isLoadingOnlineSales)">
              <td colspan="10" class="text-center text-grey-7 q-py-lg">
                <q-spinner-dots size="32px" color="teal" />
                <div class="q-mt-sm">Memuat data produk, HPP harga beli terakhir, dan harga Desty...</div>
              </td>
            </tr>

            <tr v-else-if="filteredRows.length === 0">
              <td colspan="10" class="text-center text-grey-7 q-py-lg">
                <q-icon name="search_off" size="32px" class="q-mb-xs" />
                <div v-if="priceSessionMode === 'sold'">Tidak ada produk terjual online pada tanggal yang dipilih.</div>
                <div v-else-if="priceSessionMode === 'faktur' && recentInvoicesList.length === 0">Belum ada faktur restock yang ditemukan di Assist.</div>
                <div v-else>Tidak ada produk yang cocok dengan kriteria filter saat ini.</div>
              </td>
            </tr>

            <tr
              v-for="row in pagedRows"
              :key="row.rowKey"
              :class="{
                'bg-blue-1': row.status === 'pending',
                'bg-green-1': row.status === 'success',
                'bg-red-1': row.status === 'error',
              }"
            >
              <!-- Checkbox -->
              <td class="text-center">
                <q-checkbox
                  v-model="row.checked"
                  dense
                  color="teal"
                  :disable="!row.destySkuId || isQueueRunning"
                />
              </td>

              <!-- Assist Product Info -->
              <td class="col-product">
                <div class="text-weight-bold text-slate-800 text-xs leading-tight" :title="row.assistProductName">
                  {{ row.assistProductName || '-' }}
                </div>
                <div class="text-caption font-mono text-teal text-xs q-mt-xs">
                  {{ row.assistCode || 'Kode Kosong' }}
                  <span class="text-grey-7 font-normal">({{ row.assistUnitName }})</span>
                  <span v-if="row.conversionFactor !== 1" class="text-amber-9 font-medium q-ml-xs">
                    (x{{ row.conversionFactor }})
                  </span>
                </div>
              </td>

              <!-- Desty SKU & Channels -->
              <td class="col-desty-product">
                <div v-if="row.destySkuId">
                  <div class="text-caption font-mono text-weight-bold text-slate-900">
                    {{ row.destyMasterSku }}
                  </div>
                  <div v-if="row.destyProductName" class="text-caption text-grey-7 ellipsis" style="max-width: 200px;" :title="row.destyProductName">
                    {{ row.destyProductName }}
                  </div>
                  <!-- Channels summary badge with hover tooltip -->
                  <div class="row items-center q-mt-xs">
                    <q-badge
                      v-if="row.bindList && row.bindList.length > 0"
                      outline
                      color="teal"
                      class="cursor-pointer text-caption text-weight-medium q-py-none q-px-xs"
                      style="font-size: 11px;"
                    >
                      <q-icon name="storefront" size="13px" class="q-mr-xs" />
                      {{ row.bindList.length }} Toko Terikat
                      <q-tooltip class="bg-slate-900 text-white shadow-4 q-pa-sm" :offset="[0, 6]">
                        <div class="text-weight-bold text-caption q-mb-xs">
                          Toko Terhubung di Desty ({{ row.bindList.length }}):
                        </div>
                        <div
                          v-for="b in row.bindList"
                          :key="b.publishSkuId"
                          class="row items-center q-gutter-x-xs q-py-xs"
                          style="min-width: 200px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);"
                        >
                          <q-badge
                            :color="getPlatformColor(b.platformName)"
                            class="text-weight-bold text-caption text-uppercase"
                            style="font-size: 10px;"
                          >
                            {{ b.platformName }}
                          </q-badge>
                          <span class="text-caption text-weight-medium text-white">{{ b.shopName }}</span>
                        </div>
                      </q-tooltip>
                    </q-badge>
                    <span v-else class="text-caption text-grey-5 italic" style="font-size: 11px;">
                      Belum ada toko terikat
                    </span>
                  </div>
                </div>
                <div v-else class="text-caption text-negative text-weight-medium">
                  Belum Dipetakan di Desty
                </div>
              </td>

              <!-- Histori Terjual & Keamanan -->
              <td class="col-sales-velocity">
                <div v-if="row.soldQtyOnDate !== undefined" class="q-mb-xs">
                  <q-badge color="teal" class="text-caption text-weight-bold q-px-xs" style="font-size: 10px;">
                    Terjual Tgl Ini: {{ row.soldQtyOnDate }} unit
                  </q-badge>
                </div>
                <div v-if="row.salesVelocity">
                  <div class="row items-center no-wrap">
                    <span
                      class="text-caption text-weight-bold"
                      :class="row.salesVelocity.onlineSoldQty > 0 ? 'text-teal' : 'text-grey-6'"
                    >
                      <q-icon name="shopping_cart" size="13px" class="q-mr-xs" />
                      {{ row.salesVelocity.onlineSoldQty }} online
                    </span>
                    <span class="text-caption text-grey-6 q-ml-xs" style="font-size: 11px;">
                      ({{ row.salesVelocity.onlineOrderCount }} order)
                    </span>
                  </div>

                  <div class="text-caption text-grey-7 q-mt-xs" style="font-size: 11px;">
                    Total Assist: {{ row.salesVelocity.totalSoldQty }} pcs
                  </div>

                  <!-- Safety Badge with Tooltip -->
                  <div class="q-mt-xs">
                    <q-badge
                      :color="getSafetyBadgeColor(row.salesVelocity.safetyLevel)"
                      :text-color="row.salesVelocity.safetyLevel === 'moderate' ? 'black' : 'white'"
                      class="cursor-pointer text-caption text-weight-bold q-px-xs"
                      style="font-size: 10px;"
                    >
                      {{ row.salesVelocity.safetyLabel }}
                      <q-tooltip class="bg-slate-900 text-white shadow-4 q-pa-sm" :offset="[0, 6]" style="max-width: 280px;">
                        <div class="text-weight-bold text-caption q-mb-xs">
                          Analisis Keamanan Kenaikan Harga:
                        </div>
                        <div class="text-caption q-mb-xs">
                          • Terjual Online: {{ row.salesVelocity.onlineSoldQty }} pcs ({{ row.salesVelocity.onlineOrderCount }} pesanan)
                        </div>
                        <div class="text-caption q-mb-xs">
                          • Total Terjual Assist: {{ row.salesVelocity.totalSoldQty }} pcs ({{ row.salesVelocity.totalOrderCount }} transaksi)
                        </div>
                        <div v-if="row.salesVelocity.lastOnlineOrderDate" class="text-caption q-mb-xs text-grey-4">
                          • Terakhir Online: {{ formatDateShort(row.salesVelocity.lastOnlineOrderDate) }}
                        </div>
                        <div class="text-caption text-amber-3 q-mt-xs font-medium">
                          {{ row.salesVelocity.safetyReason }}
                        </div>
                      </q-tooltip>
                    </q-badge>
                  </div>
                </div>
                <div v-else class="text-caption text-grey-5 italic">-</div>
              </td>

              <!-- Base Cost: HARGA BELI TERAKHIR DARI ASSIST (HPP) -->
              <td class="text-right">
                <div v-if="row.convertedCost > 0">
                  <div class="text-weight-bold text-slate-900">{{ formatRupiah(row.convertedCost) }}</div>
                  <div class="text-caption text-teal-9" style="font-size: 11px;">
                    <span v-if="row.conversionFactor !== 1">
                      {{ formatRupiah(row.baseCost) }}/{{ row.assistUnitName }}
                    </span>
                    <span v-else>
                      Beli Terakhir
                    </span>
                  </div>
                </div>
                <div v-else>
                  <span class="text-caption text-grey-5 italic">Rp 0 (Belum ada harga beli)</span>
                </div>
              </td>

              <!-- Desty Current Price & Margin -->
              <td class="text-right">
                <div v-if="row.destyCurrentPrice !== null">
                  <div class="text-weight-bold text-slate-900">
                    {{ formatRupiah(row.destyCurrentPrice) }}
                  </div>
                  <div
                    v-if="row.destyCurrentMarginNominal !== null && row.destyCurrentMarginNominal !== undefined"
                    class="text-caption font-medium q-mt-xs"
                    :class="row.destyCurrentMarginNominal >= 0 ? 'text-positive' : 'text-negative'"
                    style="font-size: 11px;"
                  >
                    Net Margin: {{ formatRupiah(row.destyCurrentMarginNominal) }} ({{ row.destyCurrentMarginPercent?.toFixed(1) }}%)
                  </div>
                </div>
                <div v-else class="text-grey-5 italic text-caption">-</div>
              </td>

              <!-- Target Price Input (Inline) -->
              <td class="text-right">
                <div class="row items-center justify-end q-gutter-x-xs no-wrap">
                  <q-input
                    :model-value="row.targetPrice"
                    @update:model-value="val => onTargetPriceChange(row, val)"
                    type="number"
                    step="100"
                    min="0"
                    dense
                    outlined
                    prefix="Rp"
                    style="width: 110px;"
                    color="teal"
                    class="bg-white text-right text-weight-bold"
                    :disable="!row.destySkuId || isQueueRunning"
                  />
                  <q-btn
                    v-if="row.isCustomPrice"
                    flat
                    round
                    dense
                    size="xs"
                    icon="restart_alt"
                    color="grey-6"
                    @click="resetRowPrice(row)"
                  >
                    <q-tooltip>Kembalikan ke formula otomatis</q-tooltip>
                  </q-btn>
                </div>
                <div class="text-caption text-grey-7 q-mt-xs" style="font-size: 10px;">
                  Tier: M{{ row.appliedMarginPercent }}% | Min {{ row.appliedMinBuyQty }}
                </div>
              </td>

              <!-- Target Margin (Nominal & Percent) -->
              <td class="text-right">
                <div
                  class="text-weight-bold"
                  :class="row.targetMarginNominal >= 0 ? 'text-positive' : 'text-negative'"
                >
                  {{ formatRupiah(row.targetMarginNominal) }}
                </div>
                <div
                  class="text-caption font-medium"
                  :class="row.targetMarginPercent >= 0 ? 'text-positive' : 'text-negative'"
                  style="font-size: 11px;"
                >
                  Net Margin: {{ row.targetMarginPercent?.toFixed(1) }}%
                </div>
              </td>

              <!-- Variance -->
              <td class="text-right">
                <div v-if="row.destyCurrentPrice !== null">
                  <q-badge
                    :color="row.priceDifference > 0 ? 'positive' : row.priceDifference < 0 ? 'warning' : 'grey-4'"
                    :text-color="row.priceDifference === 0 ? 'grey-8' : 'white'"
                    class="text-weight-bold text-caption"
                  >
                    {{ row.priceDifference > 0 ? '+' : '' }}{{ formatRupiah(row.priceDifference) }}
                  </q-badge>
                  <div
                    v-if="row.destyCurrentPrice > 0 && row.priceDifference !== 0"
                    class="text-caption font-bold q-mt-xs"
                    :class="row.priceDifference > 0 ? 'text-positive' : 'text-warning'"
                    style="font-size: 10px;"
                  >
                    {{ row.priceDifference > 0 ? '+' : '' }}{{ row.percentDifference.toFixed(1) }}%
                  </div>
                </div>
                <div v-else class="text-grey-5 text-caption">-</div>
              </td>

              <!-- Action & Status -->
              <td class="text-center">
                <div class="row items-center justify-center q-gutter-xs no-wrap">
                  <q-badge
                    v-if="row.status === 'success'"
                    color="positive"
                    class="cursor-pointer"
                  >
                    <q-icon name="check" size="12px" />
                    <q-tooltip>{{ row.statusMessage }}</q-tooltip>
                  </q-badge>
                  <q-badge
                    v-else-if="row.status === 'error'"
                    color="negative"
                    class="cursor-pointer"
                  >
                    <q-icon name="error" size="12px" />
                    <q-tooltip>{{ row.statusMessage }}</q-tooltip>
                  </q-badge>

                  <q-btn
                    v-if="row.destySkuId"
                    flat
                    round
                    dense
                    color="teal"
                    icon="cloud_upload"
                    size="sm"
                    :disable="isQueueRunning"
                    :loading="row.status === 'pending'"
                    @click="updateSingleItem(row)"
                  >
                    <q-tooltip>Update produk ini ke Desty</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-else
                    flat
                    round
                    dense
                    color="amber-9"
                    icon="link"
                    size="sm"
                    @click="openMappingDialog(row)"
                  >
                    <q-tooltip>Petakan ke SKU Desty</q-tooltip>
                  </q-btn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 6. PAGINATION FOOTER -->
      <q-card-section class="bg-white border-top row items-center justify-between q-py-sm" v-if="filteredRows.length > 0">
        <div class="text-caption text-grey-7">
          Menampilkan {{ (currentPage - 1) * pageSize + 1 }} -
          {{ Math.min(currentPage * pageSize, filteredRows.length) }}
          dari {{ filteredRows.length }} produk
        </div>
        <div class="row items-center q-gutter-md">
          <div class="row items-center q-gutter-xs">
            <span class="text-caption text-grey-7">Item per hal:</span>
            <q-select
              v-model="pageSize"
              :options="pageSizeOptions"
              dense
              outlined
              options-dense
              color="teal"
              style="width: 75px"
              class="bg-white"
            />
          </div>
          <q-pagination
            v-model="currentPage"
            :max="totalPages"
            :max-pages="6"
            boundary-numbers
            direction-links
            color="teal"
            dense
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- FORMULA CONFIGURATION DIALOG -->
    <DestyPricingFormulaDialog
      v-model="showFormulaDialog"
      :initial-config="pricingConfig"
      @save="handleSaveFormulaConfig"
    />

    <!-- SKU MAPPING DIALOG -->
    <DestySkuMappingDialog
      v-model="showMappingDialog"
      :desty-sku="mappingDialogData.destySku"
      :desty-name="mappingDialogData.destySku"
      :assist-catalog="props.assistCatalog"
      :current-mapping="null"
      @save="handleSaveMapping"
    />
  </div>
</template>

<style scoped>
.table-container {
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 300px);
  min-height: 380px;
  width: 100%;
  position: relative;
}

.desty-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  text-align: left;
}

.desty-table th,
.desty-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
}

.desty-table th {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: #f8fafc;
  color: #475569;
  font-weight: 600;
  font-size: 12px;
  box-shadow: inset 0 -1px 0 #e2e8f0, inset 0 1px 0 #e2e8f0;
}

.desty-table tr:hover td {
  background-color: #f8fafc;
}

.desty-table tr.bg-blue-1 td {
  background-color: #e3f2fd;
}
.desty-table tr.bg-green-1 td {
  background-color: #e8f5e9;
}
.desty-table tr.bg-red-1 td {
  background-color: #ffebee;
}

.col-product,
.col-desty-product,
.col-sales-velocity {
  white-space: normal;
  word-break: break-word;
}

.border {
  border: 1px solid #e2e8f0;
}

.border-bottom {
  border-bottom: 1px solid #e2e8f0;
}

.border-top {
  border-top: 1px solid #e2e8f0;
}
</style>
