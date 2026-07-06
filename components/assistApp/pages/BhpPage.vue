<template>
  <div>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="healing" class="q-mr-sm" />
        Daftar Stok BHP (Bahan Habis Pakai)
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
              placeholder="Cari nama barang, kode, atau brand..."
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
            no-data-label="Tidak ada data stok BHP ditemukan"
            loading-label="Mengambil data stok BHP dari Assist..."
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

            <template v-slot:body-cell-itemName="props">
              <q-td :props="props">
                <div class="text-weight-bold text-teal-9 text-body2">{{ props.value }}</div>
                <div class="text-caption text-grey-7 q-mt-xs row items-center q-gutter-x-xs">
                  <span v-if="props.row.code" class="font-mono bg-grey-3 q-px-xs rounded text-weight-bold">{{ props.row.code }}</span>
                  <span v-if="props.row.code && props.row.brandName">•</span>
                  <span v-if="props.row.brandName" class="text-weight-medium">{{ props.row.brandName }}</span>
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
            Kartu Stok: {{ selectedItemName }}
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section v-if="selectedBrandName" class="q-pt-none q-pb-md">
          <div class="text-subtitle2 text-grey-7">Brand: {{ selectedBrandName }}</div>
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
                <div v-if="props.row.batchNo && props.row.batchNo !== '-'" class="text-weight-medium">B: {{ props.row.batchNo }}</div>
                <div v-if="props.row.expiredDate" class="text-caption text-grey-6">
                  ED: {{ formatDateOnly(props.row.expiredDate) }}
                </div>
                <span v-if="(!props.row.batchNo || props.row.batchNo === '-') && !props.row.expiredDate" class="text-grey-5">-</span>
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
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import { useAssistStore } from "../stores/assistStore";
import { formatRupiah } from "@/utils/rupiahUtils";

const $q = useQuasar();
const store = useAssistStore();

const loading = ref(false);
const items = ref<any[]>([]);
const searchText = ref("");
const stockFilter = ref("all");

const stockFilterOptions = [
  { label: "Semua Stok", value: "all" },
  { label: "Stok Tersedia (> 0)", value: "available" },
  { label: "Stok Habis (0)", value: "zero" },
  { label: "Stok Tipis (<= 10)", value: "low" }
];

const initialPagination = {
  sortBy: "itemName",
  descending: false,
  page: 1,
  rowsPerPage: 15
};

const columns = [
  { name: "itemName", label: "Nama / Kode / Brand", align: "left", field: "itemName", sortable: true },
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



// Computed Filtered List
const filteredItems = computed(() => {
  let list = [...items.value];

  // 1. Search text filter
  if (searchText.value) {
    const q = searchText.value.toLowerCase().trim();
    list = list.filter((row) => {
      return (
        (row.itemName || "").toLowerCase().includes(q) ||
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

    while (skip < total) {
      const url = `${store.apiBaseUrl}/KAKHPStocks/getList?hospitalId=${store.hospitalId}&fieldName=itemName&sort=1&skip=${skip}&limit=${limit}`;
      const res = await fetch(url, {
        method: "GET",
        headers: store.getHeaders()
      });

      if (!res.ok) {
        throw new Error(`Gagal fetch data: HTTP ${res.status} ${res.statusText}`);
      }

      const payload = await res.json();
      const data = payload.data || [];
      items.value.push(...data);

      const resolvedTotal = Number(payload.total ?? items.value.length);
      total = Number.isFinite(resolvedTotal) ? resolvedTotal : items.value.length;

      if (data.length < limit) break;
      skip += limit;
    }
  } catch (err) {
    console.error(err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal mengambil data stok BHP.",
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
const selectedItemName = ref("");
const selectedBrandName = ref("");
const loadingHistory = ref(false);
const stockHistory = ref<any[]>([]);

const historyColumns = [
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
  console.log("Opening stock card for BHP row:", row);
  selectedItemName.value = row.itemName || "BHP";
  selectedBrandName.value = row.brandName || "";
  historyDialogOpen.value = true;

  const akhpId = row.akhpId || row._id || row.id;
  if (akhpId) {
    fetchStockHistory(akhpId);
  } else {
    $q.notify({
      type: "negative",
      message: "ID BHP tidak ditemukan.",
      position: "top"
    });
  }
}

async function fetchStockHistory(akhpId: string) {
  if (!store.assistToken) return;

  loadingHistory.value = true;
  stockHistory.value = [];
  try {
    const filter = {
      hospitalId: store.hospitalId,
      akhpId: akhpId
    };
    const url = `${store.apiBaseUrl}/KAKHPStocks/auditAKHPStock?filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const res = await fetch(url, {
      method: "GET",
      headers: store.getHeaders()
    });

    if (!res.ok) {
      throw new Error("Gagal fetch kartu stok BHP: HTTP " + res.status + " " + res.statusText);
    }

    const data = await res.json();
    stockHistory.value = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal mengambil data kartu stok BHP.",
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
