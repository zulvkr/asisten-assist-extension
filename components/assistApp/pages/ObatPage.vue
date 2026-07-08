<template>
  <div>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="vaccines" class="q-mr-sm" />
        Daftar Stok Obat
      </div>
      <q-btn
        color="teal"
        icon="refresh"
        label="Segarkan Data"
        :loading="loading"
        @click="fetchStocks"
        :disabled="!store.assistToken"
      />
    </div>

    <!-- Token Check Warning -->
    <q-banner v-if="!store.assistToken" rounded class="bg-warning text-black q-mb-md">
      <template v-slot:avatar>
        <q-icon name="warning" color="black" />
      </template>
      Token Assist belum terdeteksi. Silakan klik label <strong>Token Assist Belum Diisi</strong> di bagian atas (header) untuk memuat token dari tab clinica.assist.id yang aktif.
    </q-banner>

    <div v-else>

      <!-- Filters & Table Card -->
      <q-card flat bordered>
        <!-- Filter Bar -->
        <q-card-section class="row q-col-gutter-sm items-center">
          <div class="col-12 col-md-4">
            <q-input
              v-model="searchText"
              outlined
              dense
              placeholder="Cari nama, kode obat, atau brand..."
              color="teal"
              clearable
            >
              <template v-slot:prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <div class="col-12 col-md-3">
            <q-select
              v-model="stockFilter"
              outlined
              dense
              emit-value
              map-options
              :options="stockFilterOptions"
              label="Filter Level Stok"
              color="teal"
            />
          </div>

          <div class="col-12 col-md-3">
            <q-select
              v-model="edFilter"
              outlined
              dense
              emit-value
              map-options
              :options="edFilterOptions"
              label="Filter Tanggal ED"
              color="teal"
            />
          </div>
        </q-card-section>

        <!-- Main Table -->
        <q-card-section class="q-pa-none">
          <q-table
            :rows="filteredItems"
            :columns="columns"
            row-key="id"
            :loading="loading"
            :pagination="initialPagination"
            flat
            no-data-label="Tidak ada data stok obat ditemukan"
            loading-label="Mengambil data stok dari Assist..."
          >
            <template v-slot:body-cell-stockTotal="props">
              <q-td :props="props">
                <q-badge
                  :color="props.value === 0 ? 'red' : props.value <= 10 ? 'orange' : 'teal'"
                  class="q-px-sm"
                >
                  {{ props.value }}
                </q-badge>
              </q-td>
            </template>

            <template v-slot:body-cell-medName="props">
              <q-td :props="props">
                <div class="text-weight-bold text-teal-9 text-body2">{{ props.value }}</div>
                <div class="text-caption text-grey-7 q-mt-xs row items-center q-gutter-x-xs">
                  <span v-if="props.row.code" class="font-mono bg-grey-3 q-px-xs rounded text-weight-bold">Kode: {{ props.row.code }}</span>
                  <span v-if="props.row.code && props.row.brandName">•</span>
                  <span v-if="props.row.brandName" class="text-weight-medium">{{ props.row.brandName }}</span>
                  <span>•</span>
                  <span class="row items-center no-wrap">
                    <span class="font-mono bg-grey-3 q-px-xs rounded text-weight-bold">SKU: {{ getSkuDestyValue(props.row) }}</span>
                    <q-btn
                      flat
                      round
                      dense
                      color="teal"
                      icon="edit"
                      size="xs"
                      class="q-ml-xs"
                      @click="editSkuDesty(props.row)"
                    >
                      <q-tooltip>Hubungkan SKU Desty</q-tooltip>
                    </q-btn>
                  </span>
                </div>
              </q-td>
            </template>

            <template v-slot:body-cell-marginAktual="props">
              <q-td :props="props">
                <q-badge
                  v-if="props.value !== undefined && props.value !== null && props.value !== 0"
                  :color="props.value > 0 ? 'teal' : 'red'"
                  class="q-px-sm text-weight-bold"
                >
                  {{ props.value > 0 ? '+' : '' }}{{ props.value.toFixed(1) }}%
                </q-badge>
                <span v-else class="text-grey-5">-</span>
              </q-td>
            </template>

            <template v-slot:body-cell-marginTarget="props">
              <q-td :props="props">
                <div class="row items-center justify-end no-wrap">
                  <span v-if="props.value !== '-'" class="text-weight-bold q-mr-xs">{{ props.value }}</span>
                  <span v-else class="text-grey-5 q-mr-xs">-</span>
                  <q-btn
                    flat
                    round
                    dense
                    color="teal"
                    icon="edit"
                    size="xs"
                    @click="editTargetMargin(props.row)"
                  >
                    <q-tooltip>Ubah Target Margin</q-tooltip>
                  </q-btn>
                </div>
              </q-td>
            </template>

            <template v-slot:body-cell-closestExpire="props">
              <q-td :props="props">
                <span v-if="props.row.edMonths !== undefined && props.row.edMonths !== null">
                  <q-badge
                    :color="props.row.edMonths <= 0 ? 'red' : props.row.edMonths <= 3 ? 'orange' : 'teal'"
                    class="q-px-sm"
                  >
                    {{ props.row.edMonths <= 0 ? 'ED' : `${props.row.edMonths.toFixed(1)} bln` }}
                  </q-badge>
                  <div class="text-caption text-grey-6 q-mt-xs" v-if="props.value">
                    {{ props.value.toLocaleDateString("id-ID") }}
                  </div>
                </span>
                <span v-else class="text-grey-5">-</span>
              </q-td>
            </template>

            <template v-slot:body-cell-actions="props">
              <q-td :props="props" class="text-center">
                <q-btn
                  flat
                  round
                  color="teal"
                  icon="history"
                  size="sm"
                  @click="openStockCard(props.row)"
                >
                  <q-tooltip>Kartu Stok</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </div>

    <!-- Dialog Kartu Stok -->
    <q-dialog v-model="historyDialogOpen">
      <q-card style="width: 950px; max-width: 95vw;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6 text-teal font-weight-bold">
            <q-icon name="history" class="q-mr-xs" />
            Kartu Stok: {{ selectedMedicineName }}
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section v-if="selectedMedicineBrand" class="q-pt-none q-pb-md">
          <div class="text-subtitle2 text-grey-7">Brand: {{ selectedMedicineBrand }}</div>
        </q-card-section>

        <q-card-section class="q-pa-none">
          <q-table
            :rows="stockHistory"
            :columns="historyColumns"
            row-key="id"
            flat
            bordered
            :loading="loadingHistory"
            :pagination="{ rowsPerPage: 10, sortBy: 'date', descending: true }"
            no-data-label="Tidak ada riwayat transaksi kartu stok ditemukan."
            loading-label="Mengambil riwayat kartu stok dari Assist..."
          >
            <!-- Waktu / Tanggal -->
            <template v-slot:body-cell-date="props">
              <q-td :props="props">
                <div class="text-weight-medium">{{ formatDate(props.row.createdAt || props.row.executeDate) }}</div>
                <div class="text-caption text-grey-6">{{ formatTime(props.row.createdAt || props.row.executeDate) }}</div>
              </q-td>
            </template>

            <!-- Tipe Transaksi -->
            <template v-slot:body-cell-type="props">
              <q-td :props="props">
                <q-badge :color="getTransactionTypeLabel(props.value).color">
                  {{ getTransactionTypeLabel(props.value).label }}
                </q-badge>
              </q-td>
            </template>

            <!-- Perubahan Qty -->
            <template v-slot:body-cell-delta="props">
              <q-td :props="props" class="text-right">
                <span :class="props.value > 0 ? 'text-green text-weight-bold' : props.value < 0 ? 'text-red text-weight-bold' : 'text-grey'">
                  {{ props.value > 0 ? '+' : '' }}{{ props.value }}
                </span>
              </q-td>
            </template>

            <!-- Depot Changes -->
            <template v-slot:body-cell-depotChanges="props">
              <q-td :props="props">
                <div v-for="(change, idx) in props.value" :key="idx" class="text-caption text-weight-medium">
                  {{ change }}
                </div>
                <span v-if="props.value.length === 0" class="text-grey-5">-</span>
              </q-td>
            </template>

            <!-- Batch / ED -->
            <template v-slot:body-cell-batchNo="props">
              <q-td :props="props">
                <div v-if="props.row.batchNo" class="text-weight-medium">B: {{ props.row.batchNo }}</div>
                <div v-if="props.row.expiredDate" class="text-caption text-grey-6">
                  ED: {{ formatDateOnly(props.row.expiredDate) }}
                </div>
                <span v-if="!props.row.batchNo && !props.row.expiredDate" class="text-grey-5">-</span>
              </q-td>
            </template>

            <!-- Keterangan / Referensi -->
            <template v-slot:body-cell-details="props">
              <q-td :props="props" style="max-width: 250px; white-space: normal;">
                <div v-if="props.row.transactionType === 'restock' && props.row.Transaction">
                  <div class="text-weight-bold">{{ props.row.Transaction.code }}</div>
                  <div class="text-caption text-grey-7" v-if="props.row.Transaction.Distributors">
                    {{ props.row.Transaction.Distributors.supplierName }}
                  </div>
                </div>
                <div v-else-if="props.value" class="text-caption">{{ props.value }}</div>
                <span v-else class="text-grey-5">-</span>
              </q-td>
            </template>
          </q-table>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Tutup" color="teal" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useQuasar } from "quasar";
import type { QTableColumn } from "quasar";
import { useAssistStore } from "../stores/assistStore";
import { formatRupiah } from "@/utils/rupiahUtils";

const $q = useQuasar();
const store = useAssistStore();

const loading = ref(false);
const items = ref<any[]>([]);
const searchText = ref("");
const stockFilter = ref("all");
const edFilter = ref("all");

const stockFilterOptions = [
  { label: "Semua Stok", value: "all" },
  { label: "Stok Tersedia (> 0)", value: "available" },
  { label: "Stok Habis (0)", value: "zero" },
  { label: "Stok Tipis (<= 10)", value: "low" }
];

const edFilterOptions = [
  { label: "Semua ED", value: "all" },
  { label: "Sudah ED (Expired)", value: "expired" },
  { label: "ED <= 1 Bulan", value: "1" },
  { label: "ED <= 2 Bulan", value: "2" },
  { label: "ED <= 3 Bulan", value: "3" },
  { label: "ED <= 4 Bulan", value: "4" },
  { label: "ED <= 5 Bulan", value: "5" },
  { label: "ED <= 6 Bulan", value: "6" }
];

const initialPagination = {
  sortBy: "medName",
  descending: false,
  page: 1,
  rowsPerPage: 15
};

const columns: QTableColumn[] = [
  { name: "medName", label: "Nama / Kode / Brand", align: "left", field: "medName", sortable: true },
  { name: "unit", label: "Satuan", align: "left", field: "unit", sortable: true },
  { name: "stockTotal", label: "Stok Total", align: "right", field: "stockTotal", sortable: true },
  { name: "buyFee", label: "Harga Beli", align: "right", field: "buyFee", sortable: true, format: (val: any) => formatRupiah(val) },
  { name: "avgHPP", label: "Avg HPP", align: "right", field: "avgHPP", sortable: true, format: (val: any) => formatRupiah(val) },
  { name: "sellNormalFee", label: "Harga Jual", align: "right", field: "sellNormalFee", sortable: true, format: (val: any) => formatRupiah(val) },
  {
    name: "marginAktual",
    label: "Margin (Aktual)",
    align: "right",
    field: (row: any) => calculateMargin(row),
    sortable: true
  },
  {
    name: "marginTarget",
    label: "Margin (Target)",
    align: "right",
    field: (row: any) => getTargetMarginValue(row),
    sortable: true
  },
  {
    name: "closestExpire",
    label: "Tgl ED / Sisa",
    align: "center",
    field: "closestExpire",
    sortable: true
  },
  {
    name: "stockValue",
    label: "Nilai Stok (HPP)",
    align: "right",
    field: (row: any) => row.stockTotal * (row.avgHPP || row.buyFee || 0),
    sortable: true,
    format: (val: any) => formatRupiah(val)
  },
  {
    name: "actions",
    label: "Aksi",
    align: "center",
    field: "actions"
  }
];

function calculateMargin(row: any): number {
  const cost = row.avgHPP || row.buyFee || 0;
  const sell = row.sellNormalFee || 0;
  if (cost <= 0 || !sell) return 0;
  return ((sell - cost) / sell) * 100;
}

function getTargetMarginValue(row: any): string {
  const code = row.code || "";
  if (!code) return "-";
  const marginRow = store.marginData.find((dataRow: any) => dataRow[0] === code);
  return marginRow ? marginRow[2] : "-";
}

function getSkuDestyValue(row: any): string {
  const code = row.code || "";
  if (!code) return "-";
  const marginRow = store.marginData.find((dataRow: any) => dataRow[0] === code);
  return marginRow && marginRow[5] ? marginRow[5] : "-";
}

function editSkuDesty(row: any) {
  const currentSku = getSkuDestyValue(row);
  const initialVal = currentSku !== "-" ? currentSku : "";

  $q.dialog({
    title: "Hubungkan SKU Desty",
    message: `Masukkan SKU Desty untuk ${row.medName} (SKU Assist: ${row.code || "-"}):`,
    prompt: {
      model: initialVal,
      type: "text",
      label: "SKU Desty",
    },
    cancel: true,
    persistent: true
  }).onOk(async (data) => {
    const newSku = data.trim();

    try {
      await store.upsertSku(row.code, row.medName, newSku);
      $q.notify({
        type: "positive",
        message: "Pemetaan SKU Desty berhasil diperbarui!",
        position: "top"
      });
    } catch (err: any) {
      console.error(err);
      $q.notify({
        type: "negative",
        message: err.message || "Gagal menyimpan pemetaan SKU. Perubahan dibatalkan.",
        position: "top"
      });
    }
  });
}

function editTargetMargin(row: any) {
  const currentMarginStr = getTargetMarginValue(row);
  const initialVal = currentMarginStr !== "-" ? currentMarginStr.replace("%", "").trim() : "";

  $q.dialog({
    title: "Ubah Target Margin",
    message: `Masukkan target margin baru untuk ${row.medName} (SKU: ${row.code || "-"}):`,
    prompt: {
      model: initialVal,
      type: "text",
      label: "Target Margin (%)",
      isValid: (val) => !isNaN(Number(val)) && Number(val) >= 0
    },
    cancel: true,
    persistent: true
  }).onOk(async (data) => {
    const newMarginPercent = data.trim();
    const marginStr = newMarginPercent ? `${newMarginPercent}%` : "";

    try {
      await store.upsertMargin(row.code, row.medName, marginStr);
      $q.notify({
        type: "positive",
        message: "Target margin berhasil diperbarui!",
        position: "top"
      });
    } catch (err: any) {
      console.error(err);
      $q.notify({
        type: "negative",
        message: err.message || "Gagal menyimpan target margin. Perubahan dibatalkan.",
        position: "top"
      });
    }
  });
}

onMounted(() => {
  store.fetchMarginData();
});

// Calculate closest expiration date based on FEFO (First Expired, First Out)
function getClosestExpirationDate(item: any): Date | null {
  if (!item.ExpireOverview || !Array.isArray(item.ExpireOverview) || item.ExpireOverview.length === 0) {
    return null;
  }

  const batches = item.ExpireOverview.map((b: any) => {
    const qty = typeof b.lastQuantity === "number" ? b.lastQuantity : 0;
    const date = b.lastExpire ? new Date(b.lastExpire) : null;
    return { qty, date };
  }).filter((b: any): b is { qty: number; date: Date } => b.date !== null && !isNaN(b.date.getTime()));

  if (batches.length === 0) {
    return null;
  }

  batches.sort((a: { qty: number; date: Date }, b: { qty: number; date: Date }) => a.date.getTime() - b.date.getTime());

  const totalBatchQty = batches.reduce((sum: number, b: { qty: number; date: Date }) => sum + b.qty, 0);
  const stockTotal = typeof item.stockTotal === "number" ? item.stockTotal : 0;
  const consumed = totalBatchQty - stockTotal;

  if (consumed > 0) {
    let remainingConsumed = consumed;
    const activeBatches: typeof batches = [];

    for (const b of batches) {
      if (remainingConsumed > 0) {
        const deducted = Math.min(b.qty, remainingConsumed);
        remainingConsumed -= deducted;
        const remainingQty = b.qty - deducted;
        if (remainingQty > 0) {
          activeBatches.push({ qty: remainingQty, date: b.date });
        }
      } else {
        activeBatches.push(b);
      }
    }

    if (activeBatches.length > 0) {
      return activeBatches[0].date;
    }
  }

  const positiveQtyBatches = batches.filter((b: { qty: number; date: Date }) => b.qty > 0);
  if (positiveQtyBatches.length > 0) {
    return positiveQtyBatches[0].date;
  }
  
  return batches[0].date;
}



// Computed Filtered List
const filteredItems = computed(() => {
  let list = [...items.value];

  // 1. Search text filter
  if (searchText.value) {
    const q = searchText.value.toLowerCase().trim();
    list = list.filter((row) => {
      return (
        (row.medName || "").toLowerCase().includes(q) ||
        (row.code || "").toLowerCase().includes(q) ||
        (row.brandName || "").toLowerCase().includes(q)
      );
    });
  }

  // 2. Stock status filter
  if (stockFilter.value === "available") {
    list = list.filter((row) => (row.stockTotal || 0) > 0);
  } else if (stockFilter.value === "zero") {
    list = list.filter((row) => (row.stockTotal || 0) === 0);
  } else if (stockFilter.value === "low") {
    list = list.filter((row) => {
      const qty = row.stockTotal || 0;
      return qty > 0 && qty <= 10;
    });
  }

  // 3. ED filter
  if (edFilter.value !== "all") {
    list = list.filter((row) => {
      if (row.edMonths === null) return false;
      if (edFilter.value === "expired") {
        return row.edMonths <= 0;
      }
      const limitMonths = Number(edFilter.value);
      return row.edMonths > 0 && row.edMonths <= limitMonths;
    });
  }

  return list;
});

// Fetching Function
async function fetchStocks() {
  if (!store.assistToken) return;

  loading.value = true;
  items.value = [];
  try {
    let skip = 0;
    const limit = 1000;
    let total = Number.POSITIVE_INFINITY;
    const now = new Date();

    while (skip < total) {
      const url = `${store.apiBaseUrl}/KMedicineStocks/getItemsWithExpiredDate?hospitalId=${store.hospitalId}&skip=${skip}&limit=${limit}`;
      const res = await fetch(url, {
        method: "GET",
        headers: store.getHeaders()
      });

      if (!res.ok) {
        throw new Error(`Gagal fetch data: HTTP ${res.status} ${res.statusText}`);
      }

      const payload = await res.json();
      const data = payload.data || [];

      const processed = data.map((row: any) => {
        const closestExpire = getClosestExpirationDate(row);
        let edMonths: number | null = null;
        if (closestExpire) {
          const diffEdMs = closestExpire.getTime() - now.getTime();
          edMonths = diffEdMs / (1000 * 60 * 60 * 24 * 30.4375);
        }
        return {
          ...row,
          closestExpire,
          edMonths
        };
      });

      items.value.push(...processed);

      const resolvedTotal = Number(payload.total ?? items.value.length);
      total = Number.isFinite(resolvedTotal) ? resolvedTotal : items.value.length;

      if (data.length < limit) break;
      skip += limit;
    }
  } catch (err) {
    console.error(err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal mengambil data stok obat.",
      position: "top"
    });
  } finally {
    loading.value = false;
  }
}

watch(
  () => store.assistToken,
  (newToken) => {
    if (newToken) {
      fetchStocks();
    }
  },
  { immediate: true }
);

// --- Kartu Stok Dialog logic ---
const historyDialogOpen = ref(false);
const selectedMedicineName = ref("");
const selectedMedicineBrand = ref("");
const loadingHistory = ref(false);
const stockHistory = ref<any[]>([]);

const historyColumns: QTableColumn[] = [
  { name: "date", label: "Waktu / Tanggal", align: "left", field: "createdAt", sortable: true },
  { name: "type", label: "Tipe Transaksi", align: "left", field: "transactionType" },
  { name: "delta", label: "Perubahan", align: "right", field: (row: any) => getStockDelta(row) },
  { name: "stockRange", label: "Stok Global", align: "center", field: (row: any) => `${row.stockBefore ?? 0} → ${row.stockAfter ?? 0}` },
  { name: "depotChanges", label: "Perubahan Depot", align: "left", field: (row: any) => formatDepotChanges(row) },
  { name: "batchNo", label: "Batch / ED", align: "left", field: "batchNo" },
  { name: "details", label: "Keterangan / Referensi", align: "left", field: "itemNotes" },
  { name: "operator", label: "Operator", align: "left", field: "createdName" }
];

function getStockDelta(row: any): number {
  const type = row.transactionType;
  const qty = row.quantity || 0;
  if (["auditMinus", "sell", "prescription", "returMinus"].includes(type)) {
    return -qty;
  }
  if (["restock", "auditPlus", "newItem", "returPlus"].includes(type)) {
    return qty;
  }
  const diff = (row.stockAfter ?? 0) - (row.stockBefore ?? 0);
  if (diff !== 0) return diff;
  return qty;
}

function formatDepotChanges(row: any): string[] {
  const changes: string[] = [];
  const beforeMap = new Map<string, number>();
  if (Array.isArray(row.depotStockBefore)) {
    row.depotStockBefore.forEach((d: any) => {
      if (d && d.id) beforeMap.set(d.id, d.stock ?? 0);
    });
  }
  if (Array.isArray(row.depotStockAfter)) {
    row.depotStockAfter.forEach((d: any) => {
      if (d && d.id) {
        const beforeStock = beforeMap.get(d.id) ?? 0;
        const afterStock = d.stock ?? 0;
        if (beforeStock !== afterStock) {
          changes.push(`${d.name || "Depot"}: ${beforeStock} → ${afterStock}`);
        }
      }
    });
  }
  return changes;
}

function getTransactionTypeLabel(type: string): { label: string; color: string } {
  switch (type) {
    case "newItem":
      return { label: "Item Baru", color: "blue" };
    case "restock":
      return { label: "Restok / Pembelian", color: "positive" };
    case "auditMinus":
      return { label: "Audit Kurang", color: "negative" };
    case "auditPlus":
      return { label: "Audit Tambah", color: "teal" };
    case "sell":
      return { label: "Penjualan", color: "orange" };
    case "prescription":
      return { label: "Resep / Medis", color: "indigo" };
    case "returMinus":
      return { label: "Retur Keluar", color: "red" };
    case "returPlus":
      return { label: "Retur Masuk", color: "green" };
    default:
      return { label: type || "Lainnya", color: "grey" };
  }
}

function formatDate(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateOnly(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function openStockCard(row: any) {
  console.log("Opening stock card for row:", row);
  selectedMedicineName.value = row.medName || "Obat";
  selectedMedicineBrand.value = row.brandName || "";
  historyDialogOpen.value = true;

  const medId = row.medicineId || row._id || row.id;
  if (medId) {
    fetchStockHistory(medId);
  } else {
    $q.notify({
      type: "negative",
      message: "ID obat tidak ditemukan.",
      position: "top"
    });
  }
}

async function fetchStockHistory(medicineId: string) {
  if (!store.assistToken) return;

  loadingHistory.value = true;
  stockHistory.value = [];
  try {
    const filter = {
      hospitalId: store.hospitalId,
      medicineId: medicineId
    };
    const url = `${store.apiBaseUrl}/KTxes/auditMedStock?filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const res = await fetch(url, {
      method: "GET",
      headers: store.getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Gagal fetch kartu stok: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    stockHistory.value = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal mengambil data kartu stok.",
      position: "top"
    });
  } finally {
    loadingHistory.value = false;
  }
}
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
