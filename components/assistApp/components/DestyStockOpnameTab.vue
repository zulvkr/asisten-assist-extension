<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useQuasar } from "quasar";
import type { DestySkuMapping, AssistCatalogItem } from "@/types/destySync";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";
import type {
  SoSessionMode,
  AdjustMode,
  InferredShiftType,
  AssistRestockInvoice,
  SoTableRowItem,
  QuickMappingFormData,
} from "@/types/destyStockOpname";
import {
  filterTransactionsByInferredShift,
  aggregateSoldItemsFromTransactions,
  buildCatalogLookup,
  buildShiftSoRows,
  buildFakturSoRows,
  buildAllProductsSoRows,
  fetchAssistRestockInvoices,
} from "@/services/destySync/destyStockOpnameService";
import { fetchAllAssistPemasukan } from "@/services/destySync/offlineStockSync";
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
  (e: "saveMapping", mapping: QuickMappingFormData): void;
  (e: "refreshCatalog"): void;
}>();

const $q = useQuasar();

// 1. Session Mode States
const soSessionMode = ref<SoSessionMode>("shift");

// Mode 1: Shift States
const shiftDate = ref<string>(new Date().toISOString().slice(0, 10));
const selectedShift = ref<InferredShiftType>("semua");
const shiftTransactions = ref<any[]>([]);

// Mode 2: Faktur States
const recentInvoicesList = ref<AssistRestockInvoice[]>([]);
const selectedInvoiceId = ref<string | null>(null);
const selectedInvoice = computed(() => {
  return recentInvoicesList.value.find((inv) => inv.id === selectedInvoiceId.value) || null;
});

// Mode 3: All Products & Live Desty Stock State
const destyStockMap = ref<Record<string, DestyOmniStockItem>>({});
const isLoadingSoData = ref(false);
const isLoadingLiveDestyStock = ref(false);

// Filters & Table Manual States
const soFilterSearch = ref("");
const soFilterStatus = ref<string>("all");
const soManualStates = ref<Record<string, { adjustMode?: AdjustMode; adjustQty?: number; checked?: boolean }>>({});
const soRowSaving = ref<Record<string, boolean>>({});
const soSyncResult = ref<Record<string, { status: "success" | "error"; message?: string }>>({});

// Dialog Mapping
const showMappingDialog = ref(false);
const mappingDialogData = ref<Partial<QuickMappingFormData>>({});

// Batch Sync Execution States
const showConfirmBatchDialog = ref(false);
const showProgressBatchDialog = ref(false);
const isBatchSyncing = ref(false);
const batchProgressTotal = ref(0);
const batchProgressCurrent = ref(0);
const batchProgressSuccess = ref(0);
const batchProgressFailed = ref(0);
const batchProgressLogs = ref<Array<{ text: string; type: "info" | "success" | "error" | "warning"; time: string }>>([]);

// Pagination
const soCurrentPage = ref(1);
const soPageSize = ref(20);
const soPageSizeOptions = [10, 20, 50, 100, 250];

// Dynamic status options depending on mode
const soStatusFilterOptions = computed(() => {
  if (soSessionMode.value === "shift") {
    return [
      { label: "Semua Produk Terjual", value: "all" },
      { label: "Perlu Potong Stok (Ada Offline)", value: "need_deduct" },
      { label: "Hanya Penjualan Online (Tanpa Potong)", value: "online_only" },
      { label: "Peringatan Stok / Minus", value: "warning" },
      { label: "Belum Terhubung ke Desty", value: "unmapped" },
      { label: "Sudah Berhasil Tersinkron", value: "synced" },
    ];
  }
  if (soSessionMode.value === "faktur") {
    return [
      { label: "Semua Item Faktur", value: "all" },
      { label: "Siap Tambah Stok Desty", value: "ready" },
      { label: "Peringatan Kuantitas / 0", value: "warning" },
      { label: "Belum Terhubung ke Desty", value: "unmapped" },
      { label: "Sudah Berhasil Tersinkron", value: "synced" },
    ];
  }
  return [
    { label: "Semua Selisih & Masalah", value: "all" },
    { label: "Selisih Stok Assist vs Desty (Siap Sinkron)", value: "ready" },
    { label: "Peringatan Validasi", value: "warning" },
    { label: "Belum Dipetakan (Semua)", value: "unmapped" },
    { label: "  ↳ Hanya di Desty (Belum ke Assist)", value: "unmapped_pos" },
    { label: "  ↳ Hanya di Assist (Belum ke Desty)", value: "unmapped_desty" },
    { label: "Sudah Berhasil Tersinkron", value: "synced" },
  ];
});

async function fetchLiveDestyStock(skus?: string[]) {
  if (!props.destyToken) return;
  isLoadingLiveDestyStock.value = true;
  try {
    const response = (await browser.runtime.sendMessage({
      type: "FETCH_DESTY_STOCK",
      payload: {
        token: props.destyToken,
        tenantId: props.destyTenantId,
        masterWarehouseId: props.destyWarehouseId || "2042620805094077644",
        skus,
      },
    })) as { ok: boolean; items?: DestyOmniStockItem[]; error?: string } | undefined;

    if (!response?.ok || !response.items) {
      throw new Error(response?.error || "Gagal mengambil live stock Desty");
    }

    for (const item of response.items) {
      if (item.sku) {
        destyStockMap.value[item.sku.toUpperCase()] = item;
      }
    }
  } catch (err: any) {
    console.error("Gagal mengambil stok live Desty:", err);
    $q.notify({
      type: "warning",
      message: "Gagal mengambil data stok dari Desty Omni: " + (err?.message || String(err)),
      position: "top-right",
    });
  } finally {
    isLoadingLiveDestyStock.value = false;
  }
}

async function loadInvoicesForSo() {
  if (!props.assistToken || !props.assistHospitalId || !props.assistApiBaseUrl) return;
  try {
    const list = await fetchAssistRestockInvoices({
      apiBaseUrl: props.assistApiBaseUrl,
      hospitalId: props.assistHospitalId,
      token: props.assistToken,
      limit: 30,
    });
    recentInvoicesList.value = list;
    if (list.length > 0 && !selectedInvoiceId.value) {
      selectedInvoiceId.value = list[0].id;
    }
  } catch (err) {
    console.error("Gagal memuat daftar faktur restock:", err);
  }
}

async function loadSoSessionData() {
  isLoadingSoData.value = true;
  soManualStates.value = {};
  soSyncResult.value = {};

  try {
    if (soSessionMode.value === "shift") {
      if (!props.assistToken) {
        throw new Error("Token Assist belum tersedia.");
      }
      const rawTxs = await fetchAllAssistPemasukan(
        shiftDate.value,
        shiftDate.value,
        props.assistToken
      );
      shiftTransactions.value = rawTxs;

      // Extract target SKUs to fetch live stock
      const filteredTxs = filterTransactionsByInferredShift(rawTxs, selectedShift.value, shiftDate.value);
      const soldItems = aggregateSoldItemsFromTransactions(filteredTxs);

      const targetSkus = new Set<string>();
      for (const item of soldItems) {
        if (item.assistCode) targetSkus.add(item.assistCode.toUpperCase());
        for (const m of props.mappings) {
          if (
            m.active &&
            ((m.assistId && m.assistId === item.assistItemId) ||
              (m.assistCode && m.assistCode.toUpperCase() === item.assistCode.toUpperCase()))
          ) {
            targetSkus.add(m.destySku.toUpperCase());
          }
        }
      }

      if (targetSkus.size > 0) {
        await fetchLiveDestyStock(Array.from(targetSkus));
      }
    } else if (soSessionMode.value === "faktur") {
      if (recentInvoicesList.value.length === 0) {
        await loadInvoicesForSo();
      }
      if (selectedInvoice.value) {
        const targetSkus = new Set<string>();
        for (const item of selectedInvoice.value.items) {
          if (item.code) targetSkus.add(item.code.toUpperCase());
          for (const m of props.mappings) {
            if (
              m.active &&
              ((m.assistId && item.medicineId && m.assistId === item.medicineId) ||
                (m.assistCode && item.code && m.assistCode.toUpperCase() === item.code.toUpperCase()))
            ) {
              targetSkus.add(m.destySku.toUpperCase());
            }
          }
        }
        if (targetSkus.size > 0) {
          await fetchLiveDestyStock(Array.from(targetSkus));
        }
      }
    } else if (soSessionMode.value === "all") {
      await fetchLiveDestyStock();
    }
  } catch (err: any) {
    console.error("Gagal memuat data SO:", err);
    $q.notify({
      type: "negative",
      message: err?.message || "Gagal memuat data sesi SO.",
      position: "top-right",
    });
  } finally {
    isLoadingSoData.value = false;
  }
}

// Compute Table Rows based on Mode
const soTableRows = computed<SoTableRowItem[]>(() => {
  const catalogLookup = buildCatalogLookup(props.assistCatalog);

  if (soSessionMode.value === "shift") {
    const filteredTxs = filterTransactionsByInferredShift(
      shiftTransactions.value,
      selectedShift.value,
      shiftDate.value
    );
    const soldItems = aggregateSoldItemsFromTransactions(filteredTxs);
    return buildShiftSoRows({
      soldItems,
      mappings: props.mappings,
      destyStockMap: destyStockMap.value,
      catalogLookup,
      manualStates: soManualStates.value,
      syncResults: soSyncResult.value,
    });
  }

  if (soSessionMode.value === "faktur") {
    if (!selectedInvoice.value) return [];
    return buildFakturSoRows({
      invoice: selectedInvoice.value,
      mappings: props.mappings,
      destyStockMap: destyStockMap.value,
      catalogLookup,
      manualStates: soManualStates.value,
      syncResults: soSyncResult.value,
    });
  }

  if (soSessionMode.value === "all") {
    return buildAllProductsSoRows({
      destyStockMap: destyStockMap.value,
      assistCatalog: props.assistCatalog,
      mappings: props.mappings,
      manualStates: soManualStates.value,
      syncResults: soSyncResult.value,
    });
  }

  return [];
});

// Search & Filter
const filteredSoTableRows = computed(() => {
  let list = soTableRows.value;
  if (soFilterSearch.value.trim()) {
    const q = soFilterSearch.value.trim().toLowerCase();
    list = list.filter(
      (item) =>
        item.assistCode.toLowerCase().includes(q) ||
        item.assistItemName.toLowerCase().includes(q) ||
        item.destySku.toLowerCase().includes(q) ||
        (item.destyProductName || "").toLowerCase().includes(q)
    );
  }

  if (soFilterStatus.value !== "all") {
    if (soSessionMode.value === "shift") {
      if (soFilterStatus.value === "need_deduct") {
        list = list.filter((item) => item.offlineQty > 0 && item.status === "ready");
      } else if (soFilterStatus.value === "online_only") {
        list = list.filter((item) => item.offlineQty === 0 && item.onlineQty > 0);
      } else if (soFilterStatus.value === "warning") {
        list = list.filter((item) => item.status === "warning");
      } else if (soFilterStatus.value === "unmapped") {
        list = list.filter((item) => item.status === "unmapped");
      } else if (soFilterStatus.value === "synced") {
        list = list.filter((item) => item.status === "synced");
      } else {
        list = list.filter((item) => item.status === soFilterStatus.value);
      }
    } else if (soSessionMode.value === "faktur") {
      if (soFilterStatus.value === "ready") {
        list = list.filter((item) => item.status === "ready");
      } else if (soFilterStatus.value === "unmapped") {
        list = list.filter((item) => item.status === "unmapped");
      } else if (soFilterStatus.value === "warning") {
        list = list.filter((item) => item.status === "warning");
      } else if (soFilterStatus.value === "synced") {
        list = list.filter((item) => item.status === "synced");
      } else {
        list = list.filter((item) => item.status === soFilterStatus.value);
      }
    } else if (soSessionMode.value === "all") {
      if (soFilterStatus.value === "ready") {
        list = list.filter((item) => item.status === "ready");
      } else if (soFilterStatus.value === "unmapped_pos") {
        list = list.filter((item) => item.status === "unmapped" && !item.assistItemId);
      } else if (soFilterStatus.value === "unmapped_desty") {
        list = list.filter(
          (item) => item.status === "unmapped" && (!item.destyStockFound || !item.destySkuId)
        );
      } else if (soFilterStatus.value === "unmapped") {
        list = list.filter((item) => item.status === "unmapped");
      } else if (soFilterStatus.value === "warning") {
        list = list.filter((item) => item.status === "warning");
      } else if (soFilterStatus.value === "synced") {
        list = list.filter((item) => item.status === "synced");
      } else {
        list = list.filter((item) => item.status === soFilterStatus.value);
      }
    }
  }

  return list;
});

watch([soFilterSearch, soFilterStatus, soSessionMode, soPageSize], () => {
  soCurrentPage.value = 1;
});

const pagedSoTableRows = computed(() => {
  const startIndex = (soCurrentPage.value - 1) * soPageSize.value;
  return filteredSoTableRows.value.slice(startIndex, startIndex + soPageSize.value);
});

const totalSoPages = computed(() => {
  return Math.max(1, Math.ceil(filteredSoTableRows.value.length / soPageSize.value));
});

// Checkbox selection states
const checkedItems = computed(() => {
  return filteredSoTableRows.value.filter((i) => i.checked);
});

const isAllChecked = computed(() => {
  const valid = filteredSoTableRows.value.filter((i) => i.destySkuId && i.status !== "synced");
  return valid.length > 0 && valid.every((i) => i.checked);
});

function toggleSelectAll(val: boolean) {
  for (const item of filteredSoTableRows.value) {
    if (item.destySkuId && item.status !== "synced") {
      updateSoRowChecked(item.rowKey, val);
    }
  }
}

function updateSoRowChecked(rowKey: string, checked: boolean) {
  const existing = soManualStates.value[rowKey] || {};
  soManualStates.value[rowKey] = { ...existing, checked };
}

function updateSoRowAdjustMode(rowKey: string, adjustMode: AdjustMode) {
  const existing = soManualStates.value[rowKey] || {};
  soManualStates.value[rowKey] = { ...existing, adjustMode };
}

function updateSoRowAdjustQty(rowKey: string, val: string | number | null | undefined) {
  const existing = soManualStates.value[rowKey] || {};
  soManualStates.value[rowKey] = {
    ...existing,
    adjustQty: Math.max(0, Number(val ?? 0)),
  };
}

// Single Row Save to Desty
async function saveSingleSoRow(item: SoTableRowItem) {
  if (!item.destySkuId) {
    $q.notify({
      type: "warning",
      message: "SKU Desty tidak ditemukan / belum dipetakan.",
      position: "top-right",
    });
    return;
  }
  if (!props.destyToken) {
    $q.notify({
      type: "warning",
      message: "Token Desty tidak tersedia. Pastikan omni.desty.app terbuka.",
      position: "top-right",
    });
    return;
  }

  soRowSaving.value[item.rowKey] = true;
  const qty = Number(item.adjustQty) || 0;
  const amount = item.adjustMode === "Min" ? -qty : qty;
  const editType = item.adjustMode === "Set" ? "Set" : "Add";

  try {
    const response = (await browser.runtime.sendMessage({
      type: "UPDATE_DESTY_ON_HAND",
      payload: {
        token: props.destyToken,
        tenantId: props.destyTenantId,
        skuId: item.destySkuId,
        warehouseId: item.destyWarehouseId || props.destyWarehouseId || "2042620805094077644",
        amount,
        editType,
      },
    })) as { ok: boolean; error?: string } | undefined;

    if (!response || !response.ok) {
      throw new Error(response?.error || "Gagal mengubah stok fisik Desty");
    }

    soSyncResult.value[item.rowKey] = { status: "success" };
    $q.notify({
      type: "positive",
      message: `Stok Desty untuk ${item.destySku} berhasil diperbarui!`,
      position: "top-right",
    });

    await fetchLiveDestyStock([item.destySku]);
  } catch (err: any) {
    const errMsg = err?.message || "Gagal mengupdate stok Desty";
    soSyncResult.value[item.rowKey] = { status: "error", message: errMsg };
    $q.notify({
      type: "negative",
      message: errMsg,
      position: "top-right",
    });
  } finally {
    soRowSaving.value[item.rowKey] = false;
  }
}

// Batch Sync Execution
function openBatchConfirm() {
  if (checkedItems.value.length === 0) {
    $q.notify({
      type: "warning",
      message: "Pilih setidaknya satu item yang siap dikoreksi.",
      position: "top-right",
    });
    return;
  }
  showConfirmBatchDialog.value = true;
}

async function handleExecuteBatchSync() {
  showConfirmBatchDialog.value = false;
  const itemsToSync = [...checkedItems.value];
  if (itemsToSync.length === 0) return;

  showProgressBatchDialog.value = true;
  isBatchSyncing.value = true;
  batchProgressTotal.value = itemsToSync.length;
  batchProgressCurrent.value = 0;
  batchProgressSuccess.value = 0;
  batchProgressFailed.value = 0;
  batchProgressLogs.value = [];

  const addLog = (text: string, type: "info" | "success" | "error" | "warning") => {
    batchProgressLogs.value.push({
      text,
      type,
      time: new Date().toLocaleTimeString("id-ID", { hour12: false }),
    });
  };

  try {
    for (let i = 0; i < itemsToSync.length; i++) {
      const item = itemsToSync[i];
      batchProgressCurrent.value = i + 1;

      if (!item.destySkuId) {
        batchProgressFailed.value++;
        soSyncResult.value[item.rowKey] = { status: "error", message: "skuId Desty tidak ditemukan" };
        addLog(`[GAGAL] ${item.destySku}: skuId Desty tidak ditemukan.`, "error");
        continue;
      }

      const qty = Number(item.adjustQty) || 0;
      const amount = item.adjustMode === "Min" ? -qty : qty;
      const editType = item.adjustMode === "Set" ? "Set" : "Add";

      addLog(`[SYNC] ${item.destySku}: mode ${item.adjustMode} (${amount > 0 ? '+' : ''}${amount} ${item.destyUnit})...`, "info");

      try {
        const response = (await browser.runtime.sendMessage({
          type: "UPDATE_DESTY_ON_HAND",
          payload: {
            token: props.destyToken,
            tenantId: props.destyTenantId,
            skuId: item.destySkuId,
            warehouseId: item.destyWarehouseId || props.destyWarehouseId || "2042620805094077644",
            amount,
            editType,
          },
        })) as { ok: boolean; error?: string } | undefined;

        if (!response || !response.ok) {
          throw new Error(response?.error || "Gagal mengubah stok di Desty");
        }

        batchProgressSuccess.value++;
        soSyncResult.value[item.rowKey] = { status: "success" };
        addLog(`[BERHASIL] ${item.destySku} berhasil diperbarui di Desty.`, "success");
      } catch (err: any) {
        batchProgressFailed.value++;
        const errMsg = err?.message || "Gagal mengubah stok fisik";
        soSyncResult.value[item.rowKey] = { status: "error", message: errMsg };
        addLog(`[GAGAL] ${item.destySku}: ${errMsg}`, "error");
      }
    }

    const skusToReload = itemsToSync.map((it) => it.destySku).filter(Boolean);
    if (skusToReload.length > 0) {
      await fetchLiveDestyStock(skusToReload);
    }
  } finally {
    isBatchSyncing.value = false;
  }
}

// Quick SKU Mapping Dialog
function openQuickMapDialog(item: SoTableRowItem) {
  mappingDialogData.value = {
    destySku: item.destySku || "",
    destyUnit: item.destyUnit || "Pcs",
    assistCode: item.assistCode || "",
    assistId: item.assistItemId || "",
    assistName: item.assistItemName || "",
    assistType: item.assistItemType || "prescription",
    assistUnit: item.assistUnit || "Pcs",
    conversionFactor: item.conversionFactor || 1,
  };
  showMappingDialog.value = true;
}

function handleSaveQuickMapping(formData: QuickMappingFormData) {
  emit("saveMapping", formData);
  $q.notify({
    type: "positive",
    message: `Pemetaan SKU untuk ${formData.destySku} berhasil disimpan.`,
    position: "top-right",
  });
  void loadSoSessionData();
}

function getStatusShortLabel(status: SoTableRowItem["status"]): string {
  switch (status) {
    case "ready":
      return "Siap";
    case "synced":
      return "Tersinkron";
    case "warning":
      return "Peringatan";
    case "unmapped":
      return "Belum";
    case "error":
      return "Gagal";
    default:
      return status;
  }
}

watch(soSessionMode, () => {
  soFilterStatus.value = "all";
  void loadSoSessionData();
});
watch(selectedInvoiceId, () => {
  if (soSessionMode.value === "faktur") void loadSoSessionData();
});

onMounted(async () => {
  await loadSoSessionData();
});

defineExpose({
  loadSoSessionData,
});
</script>

<template>
  <div class="desty-stock-opname-tab">
    <q-card flat bordered class="rounded-borders bg-white border-slate">
      <!-- Session Mode Selector Bar -->
      <q-card-section class="bg-grey-1 row items-center justify-between q-py-md q-col-gutter-md border-bottom-slate">
        <div class="col-12 col-md-5 row items-center q-gutter-sm">
          <div class="text-subtitle2 text-weight-bold text-slate-900">Mode Sesi SO:</div>
          <q-btn-toggle
            v-model="soSessionMode"
            toggle-color="teal"
            color="white"
            text-color="slate-900"
            unelevated
            dense
            no-caps
            class="border-slate rounded-borders"
            :options="[
              { label: 'Shift (Penjualan)', value: 'shift', icon: 'schedule' },
              { label: 'Faktur Pembelian', value: 'faktur', icon: 'receipt_long' },
              { label: 'Seluruh Produk', value: 'all', icon: 'inventory_2' }
            ]"
          />
        </div>

        <!-- Session Context Selectors -->
        <div class="col-12 col-md-7 row items-center justify-end q-gutter-sm">
          <!-- Mode: Shift Selectors -->
          <template v-if="soSessionMode === 'shift'">
            <q-input
              v-model="shiftDate"
              type="date"
              outlined
              dense
              label="Tanggal"
              color="teal"
              bg-color="white"
              style="width: 145px;"
            />
            <q-select
              v-model="selectedShift"
              :options="[
                { label: 'Semua Shift (Full Day)', value: 'semua' },
                { label: 'Shift Pagi (06:00 - 14:00)', value: 'pagi' },
                { label: 'Shift Siang (14:00 - 22:00)', value: 'siang' }
              ]"
              emit-value
              map-options
              outlined
              dense
              label="Sesi Shift"
              color="teal"
              bg-color="white"
              style="min-width: 200px;"
            />
          </template>

          <!-- Mode: Faktur Selector -->
          <template v-else-if="soSessionMode === 'faktur'">
            <q-select
              v-model="selectedInvoiceId"
              :options="recentInvoicesList"
              option-value="id"
              option-label="invoiceNumber"
              outlined
              dense
              emit-value
              map-options
              style="min-width: 320px;"
              bg-color="white"
              color="teal"
            >
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label class="font-medium text-slate-900">
                      No. {{ scope.opt.invoiceNumber }} — {{ scope.opt.supplierName }}
                    </q-item-label>
                    <q-item-label caption class="text-grey-7">
                      Tgl: {{ scope.opt.receivedDate || '-' }} • {{ scope.opt.itemCount || 0 }} Item
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </template>
              <template v-slot:selected-item="scope">
                <span class="text-caption text-weight-bold text-teal ellipsis" v-if="scope.opt">
                  Faktur {{ scope.opt.invoiceNumber }} ({{ scope.opt.supplierName }})
                </span>
              </template>
            </q-select>
          </template>

          <!-- Mode: All Products Refresh -->
          <template v-else>
            <q-btn
              color="teal"
              unelevated
              icon="sync"
              label="Muat Seluruh Produk"
              :loading="isLoadingLiveDestyStock"
              @click="fetchLiveDestyStock()"
              class="rounded-borders"
              no-caps
            />
          </template>

          <q-btn
            color="white"
            text-color="teal"
            unelevated
            icon="refresh"
            :loading="isLoadingSoData || isLoadingLiveDestyStock"
            @click="loadSoSessionData"
            class="border-slate rounded-borders"
          >
            <q-tooltip>Muat Ulang Sesi</q-tooltip>
          </q-btn>
        </div>
      </q-card-section>

      <!-- Filter Bar -->
      <q-card-section class="bg-white row items-center justify-between q-py-sm border-bottom-slate q-col-gutter-sm">
        <div class="col-12 col-md-4">
          <q-input
            v-model="soFilterSearch"
            placeholder="Cari SKU, Nama Obat, atau Kode..."
            outlined
            dense
            color="teal"
            class="bg-white"
          >
            <template v-slot:prepend>
              <q-icon name="search" size="20px" class="text-grey-5" />
            </template>
          </q-input>
        </div>
        <div class="col-12 col-md-5">
          <q-select
            v-model="soFilterStatus"
            :options="soStatusFilterOptions"
            emit-value
            map-options
            outlined
            dense
            color="teal"
            bg-color="white"
          />
        </div>
        <div class="col-12 col-md-3 flex justify-end items-center text-caption text-grey-7">
          <template v-if="checkedItems.length > 0">
            <q-btn
              color="positive"
              icon="sync"
              dense
              no-caps
              class="q-px-sm"
              :label="`Koreksi Terpilih (${checkedItems.length})`"
              @click="openBatchConfirm"
            />
          </template>
          <template v-else>
            Total Item: <strong class="text-slate-900 q-ml-xs">{{ filteredSoTableRows.length }}</strong>
          </template>
        </div>
      </q-card-section>

      <!-- Table Section -->
      <div class="table-container">
        <table class="desty-table">
          <thead>
            <tr v-if="soSessionMode === 'shift'">
              <th style="width: 40px;" class="text-center">
                <q-checkbox
                  :model-value="isAllChecked"
                  @update:model-value="toggleSelectAll"
                  color="teal"
                  dense
                />
              </th>
              <th style="width: 20%;">Produk Assist (POS)</th>
              <th style="width: 8%;" class="text-center">Stok Assist</th>
              <th style="width: 22%;">Produk Desty</th>
              <th style="width: 14%;">Stok Desty Live</th>
              <th style="width: 8%;">Terjual POS</th>
              <th style="width: 7%;" class="text-center">Status</th>
              <th style="width: 21%;">Ubah Fisik Desty</th>
            </tr>
            <tr v-else-if="soSessionMode === 'faktur'">
              <th style="width: 40px;" class="text-center">
                <q-checkbox
                  :model-value="isAllChecked"
                  @update:model-value="toggleSelectAll"
                  color="teal"
                  dense
                />
              </th>
              <th style="width: 20%;">Produk Assist (POS)</th>
              <th style="width: 8%;" class="text-center">Stok Assist</th>
              <th style="width: 23%;">Produk Desty</th>
              <th style="width: 14%;">Stok Desty Live</th>
              <th style="width: 8%;">Diterima Faktur</th>
              <th style="width: 7%;" class="text-center">Status</th>
              <th style="width: 20%;">Ubah Fisik Desty</th>
            </tr>
            <tr v-else>
              <th style="width: 40px;" class="text-center">
                <q-checkbox
                  :model-value="isAllChecked"
                  @update:model-value="toggleSelectAll"
                  color="teal"
                  dense
                />
              </th>
              <th style="width: 22%;">Produk Assist (POS)</th>
              <th style="width: 8%;" class="text-center">Stok Assist</th>
              <th style="width: 26%;">Produk Desty</th>
              <th style="width: 15%;">Stok Desty Live</th>
              <th style="width: 8%;" class="text-center">Status</th>
              <th style="width: 21%;">Ubah Fisik Desty</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredSoTableRows.length === 0">
              <td :colspan="soSessionMode === 'all' ? 7 : 8" class="text-center text-grey-6 q-py-xl">
                <template v-if="isLoadingSoData || isLoadingLiveDestyStock">
                  <q-spinner-dots size="36px" color="teal" />
                  <div class="q-mt-sm text-caption">Memuat data sesi SO...</div>
                </template>
                <template v-else>
                  <q-icon name="sync_saved_locally" size="40px" class="text-grey-4 q-mb-xs" />
                  <div>Tidak ada item yang ditemukan pada sesi SO saat ini.</div>
                </template>
              </td>
            </tr>
            <tr v-for="item in pagedSoTableRows" :key="item.rowKey">
              <!-- Selection Checkbox -->
              <td class="text-center">
                <q-checkbox
                  :model-value="item.checked"
                  @update:model-value="updateSoRowChecked(item.rowKey, $event)"
                  :disable="!item.destySkuId || item.status === 'synced'"
                  color="teal"
                  dense
                />
              </td>

              <!-- Produk Assist -->
              <td class="col-product">
                <div class="text-weight-bold text-slate-900 text-xs leading-tight" :title="item.assistItemName">
                  {{ item.assistItemName || '-' }}
                </div>
                <div class="text-caption font-mono text-teal text-xs q-mt-xs break-all">
                  {{ item.assistCode || item.assistItemId || 'Kode Kosong' }}
                  <q-badge color="blue-grey-2" text-color="blue-grey-9" class="q-ml-2xs text-2xs">
                    {{ item.assistItemType === 'akhp' ? 'AKHP' : 'Obat' }}
                  </q-badge>
                </div>
              </td>

              <!-- Stok Assist -->
              <td class="text-center">
                <span class="text-weight-bold text-slate-900">{{ item.assistStock ?? '-' }}</span>
                <span class="text-caption text-grey-7 q-ml-2xs">{{ item.assistUnit }}</span>
              </td>

              <!-- Produk Desty -->
              <td class="col-desty-product">
                <div v-if="item.status !== 'unmapped' && item.destySku">
                  <div v-if="item.destyProductName" class="text-weight-bold text-slate-900 text-xs leading-tight" :title="item.destyProductName">
                    {{ item.destyProductName }}
                  </div>
                  <div class="text-caption font-mono text-primary text-xs q-mt-xs break-all">
                    {{ item.destySku }}
                    <span v-if="item.conversionFactor !== 1" class="text-grey-7 font-normal">
                      (x{{ item.conversionFactor }})
                    </span>
                  </div>
                </div>
                <div v-else class="row items-center q-gutter-x-xs">
                  <span class="text-grey-5 font-semibold text-xs">-</span>
                  <q-btn
                    size="xs"
                    outline
                    color="teal"
                    icon="link"
                    label="Petakan"
                    @click="openQuickMapDialog(item)"
                  />
                </div>
              </td>

              <!-- Stok Desty Live -->
              <td class="col-desty-stock">
                <div v-if="item.destyStockFound" class="text-xs leading-tight">
                  <div>
                    <span class="text-grey-7">Fisik:</span>
                    <strong class="text-slate-900 q-ml-2xs">{{ item.destyFisik ?? '-' }}</strong>
                    <template v-if="item.calculatedFisikBaru !== null">
                      <span class="text-grey-5 q-mx-xs">&gt;</span>
                      <strong class="text-teal font-bold">{{ item.calculatedFisikBaru }}</strong>
                    </template>
                  </div>
                  <div style="margin-top: 2px;">
                    <span class="text-grey-7">Tersedia:</span>
                    <strong class="text-slate-900 q-ml-2xs">{{ item.destyTersedia ?? 0 }}</strong>
                    <template v-if="item.calculatedTersediaBaru !== null">
                      <span class="text-grey-5 q-mx-xs">&gt;</span>
                      <strong :class="(item.calculatedTersediaBaru ?? 0) < 0 ? 'text-negative font-bold' : 'text-teal font-bold'">
                        {{ item.calculatedTersediaBaru }}
                      </strong>
                    </template>
                  </div>
                  <div style="margin-top: 2px;">
                    <span class="text-grey-7">Pesanan:</span>
                    <strong :class="item.destyReserved > 0 ? 'text-amber-9 font-bold' : 'text-slate-900'" class="q-ml-2xs">
                      {{ item.destyReserved ?? 0 }}
                    </strong>
                  </div>
                </div>
                <div v-else class="text-grey-5 font-semibold text-xs">
                  -
                </div>
              </td>

              <!-- Shift/Faktur Column -->
              <td v-if="soSessionMode === 'shift'" class="text-xs">
                <div>Offline: <strong class="text-teal">{{ item.offlineQty }}</strong></div>
                <div class="text-caption text-grey-7">Online: {{ item.onlineQty }}</div>
              </td>
              <td v-else-if="soSessionMode === 'faktur'" class="text-xs">
                <div class="text-weight-bold text-teal">{{ item.receivedQty }} {{ item.assistUnit }}</div>
              </td>

              <!-- Status -->
              <td class="text-center">
                <q-badge
                  :color="item.badgeColor"
                  class="text-weight-bold q-px-sm cursor-pointer"
                >
                  {{ getStatusShortLabel(item.status) }}
                  <q-tooltip anchor="top middle" self="bottom middle" max-width="260px">
                    {{ item.statusMessage }}
                  </q-tooltip>
                </q-badge>
              </td>

              <!-- Ubah Kuantitas Fisik Desty -->
              <td>
                <div class="row items-center q-gutter-x-xs no-wrap">
                  <q-btn-toggle
                    :model-value="item.adjustMode"
                    @update:model-value="updateSoRowAdjustMode(item.rowKey, $event)"
                    toggle-color="teal"
                    color="white"
                    text-color="slate-900"
                    unelevated
                    dense
                    no-caps
                    class="border-slate rounded"
                    style="font-size: 11px;"
                    :options="[
                      { label: 'Add', value: 'Add' },
                      { label: 'Min', value: 'Min' },
                      { label: 'Set', value: 'Set' }
                    ]"
                  />
                  <q-input
                    :model-value="item.adjustQty"
                    @update:model-value="updateSoRowAdjustQty(item.rowKey, $event)"
                    type="number"
                    dense
                    outlined
                    min="0"
                    style="width: 52px;"
                    class="bg-white"
                  />
                  <span class="text-caption text-grey-7 ellipsis text-xs" style="max-width: 36px;" :title="item.destyUnit">
                    {{ item.destyUnit }}
                  </span>
                  <q-btn
                    v-if="item.status !== 'unmapped' && item.destyStockFound && item.destySkuId"
                    flat
                    round
                    dense
                    color="teal"
                    icon="save"
                    :loading="soRowSaving[item.rowKey]"
                    @click="saveSingleSoRow(item)"
                    class="q-ml-2xs"
                  >
                    <q-tooltip>Simpan ke Desty</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    round
                    dense
                    color="grey-7"
                    icon="tune"
                    size="sm"
                    @click="openQuickMapDialog(item)"
                  >
                    <q-tooltip>Sesuaikan Pemetaan</q-tooltip>
                  </q-btn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Bar -->
      <q-card-section class="bg-white border-top-slate row items-center justify-between q-py-sm" v-if="filteredSoTableRows.length > 0">
        <div class="text-caption text-grey-7">
          Menampilkan {{ (soCurrentPage - 1) * soPageSize + 1 }} -
          {{ Math.min(soCurrentPage * soPageSize, filteredSoTableRows.length) }}
          dari {{ filteredSoTableRows.length }} item
        </div>
        <div class="row items-center q-gutter-md">
          <div class="row items-center q-gutter-xs">
            <span class="text-caption text-grey-7">Item per hal:</span>
            <q-select
              v-model="soPageSize"
              :options="soPageSizeOptions"
              dense
              outlined
              options-dense
              style="width: 70px;"
              class="bg-white"
            />
          </div>
          <q-pagination
            v-model="soCurrentPage"
            :max="totalSoPages"
            :max-pages="6"
            boundary-numbers
            direction-links
            color="teal"
            dense
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Dialog Konfirmasi Eksekusi Batch -->
    <q-dialog v-model="showConfirmBatchDialog" persistent>
      <q-card style="min-width: 440px; max-width: 600px;">
        <q-card-section class="row items-center bg-teal text-white">
          <q-icon name="sync_saved_locally" size="24px" class="q-mr-sm" />
          <div class="text-h6">Konfirmasi Koreksi Stok Desty</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="text-body2 text-slate-800 q-mb-md">
            Anda akan melakukan koreksi stok fisik pada Desty Omni untuk <strong>{{ checkedItems.length }} SKU</strong> terpilih:
          </div>
          <q-list bordered separator class="rounded-borders bg-grey-1" style="max-height: 220px; overflow-y: auto;">
            <q-item v-for="item in checkedItems" :key="item.rowKey" dense>
              <q-item-section>
                <q-item-label class="text-weight-bold font-mono text-primary">{{ item.destySku }}</q-item-label>
                <q-item-label caption>{{ item.assistItemName }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <div :class="item.adjustMode === 'Min' ? 'text-negative text-weight-bold' : 'text-teal text-weight-bold'">
                  {{ item.adjustMode === 'Min' ? '-' : item.adjustMode === 'Add' ? '+' : '=' }}{{ item.adjustQty }} {{ item.destyUnit }}
                </div>
                <div class="text-caption text-grey-6" style="font-size: 10px;">
                  Fisik baru: {{ item.calculatedFisikBaru !== null ? item.calculatedFisikBaru : '-' }}
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Batal" color="grey-7" v-close-popup no-caps />
          <q-btn
            color="positive"
            label="Ya, Eksekusi Koreksi"
            icon="check"
            no-caps
            @click="handleExecuteBatchSync"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog Progress Streaming Eksekusi Batch -->
    <q-dialog v-model="showProgressBatchDialog" persistent>
      <q-card style="min-width: 500px; max-width: 700px;">
        <q-card-section class="row items-center bg-teal text-white">
          <q-icon name="sync" size="24px" class="q-mr-sm" :class="{ 'rotate-spinner': isBatchSyncing }" />
          <div class="text-h6">
            {{ isBatchSyncing ? 'Memproses Koreksi Stok Desty...' : 'Koreksi Stok Selesai' }}
          </div>
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="q-mb-sm">
            <div class="row justify-between text-caption text-grey-8 q-mb-xs">
              <span>Progress: {{ batchProgressCurrent }} / {{ batchProgressTotal }} item</span>
              <span class="text-weight-bold">
                <span class="text-positive">{{ batchProgressSuccess }} Sukses</span> • 
                <span class="text-negative">{{ batchProgressFailed }} Gagal</span>
              </span>
            </div>
            <q-linear-progress
              :value="batchProgressTotal > 0 ? batchProgressCurrent / batchProgressTotal : 0"
              color="teal"
              size="8px"
              rounded
            />
          </div>

          <div class="text-caption text-grey-7 q-mb-xs">Log Aktivitas:</div>
          <div class="bg-grey-10 text-grey-2 q-pa-sm rounded-borders font-mono text-caption" style="height: 180px; overflow-y: auto;">
            <div
              v-for="(log, idx) in batchProgressLogs"
              :key="idx"
              class="q-mb-xs"
              :class="{
                'text-green-4': log.type === 'success',
                'text-red-4': log.type === 'error',
                'text-amber-4': log.type === 'warning',
                'text-grey-4': log.type === 'info'
              }"
            >
              <span class="text-grey-6">[{{ log.time }}]</span> {{ log.text }}
            </div>
            <div v-if="!batchProgressLogs.length" class="text-grey-6 text-italic">Menunggu proses...</div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn
            color="teal"
            label="Tutup"
            :disable="isBatchSyncing"
            v-close-popup
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Quick Mapping Dialog -->
    <DestySkuMappingDialog
      v-model="showMappingDialog"
      :initial-data="mappingDialogData"
      :catalog="assistCatalog"
      @save="handleSaveQuickMapping"
    />
  </div>
</template>

<style scoped>
.table-container {
  overflow-x: auto;
  width: 100%;
}

.desty-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
}

.desty-table th,
.desty-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
}

.desty-table th {
  background-color: #f8fafc;
  color: #475569;
  font-weight: 600;
  font-size: 12px;
}

.desty-table tr:hover {
  background-color: #f8fafc;
}

.desty-table .font-mono {
  font-family: monospace;
}

.col-product,
.col-desty-product {
  white-space: normal;
  word-break: break-word;
}

.col-desty-stock {
  white-space: normal;
}

.border-slate {
  border: 1px solid #e2e8f0;
}

.border-top-slate {
  border-top: 1px solid #e2e8f0;
}

.border-bottom-slate {
  border-bottom: 1px solid #e2e8f0;
}

.rotate-spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}
</style>
