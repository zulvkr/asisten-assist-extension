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
      Token Authorization belum diisi. Silakan pergi ke menu <strong>Pengaturan</strong> terlebih dahulu.
    </q-banner>

    <div v-else>
      <!-- Summary Cards -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md-3">
          <q-card flat bordered class="bg-teal-1 text-teal-9">
            <q-card-section>
              <div class="text-caption text-uppercase">Total Item Obat</div>
              <div class="text-h4 text-weight-bold">{{ items.length }}</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-3">
          <q-card flat bordered class="bg-blue-1 text-blue-9">
            <q-card-section>
              <div class="text-caption text-uppercase">Total Nilai Aset Stok</div>
              <div class="text-h4 text-weight-bold">{{ formatRupiah(totalAssetValue) }}</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-3">
          <q-card flat bordered class="bg-red-1 text-red-9">
            <q-card-section>
              <div class="text-caption text-uppercase">Sudah ED (Expired)</div>
              <div class="text-h4 text-weight-bold">{{ countExpiredStock }}</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-3">
          <q-card flat bordered class="bg-orange-1 text-orange-9">
            <q-card-section>
              <div class="text-caption text-uppercase">Stok Tipis (<= 10)</div>
              <div class="text-h4 text-weight-bold">{{ countLowStock }}</div>
            </q-card-section>
          </q-card>
        </div>
      </div>

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

            <template v-slot:body-cell-code="props">
              <q-td :props="props" class="font-mono">
                {{ props.value || '-' }}
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
          </q-table>
        </q-card-section>
      </q-card>
    </div>
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

const columns = [
  { name: "code", label: "Kode", align: "left", field: "code", sortable: true },
  { name: "medName", label: "Nama Obat", align: "left", field: "medName", sortable: true },
  { name: "brandName", label: "Brand/Merk", align: "left", field: "brandName", sortable: true },
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
  }
];

function calculateMargin(row: any): number {
  const cost = row.avgHPP || row.buyFee || 0;
  const sell = row.sellNormalFee || 0;
  if (cost <= 0 || !sell) return 0;
  return ((sell - cost) / sell) * 100;
}

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

  batches.sort((a, b) => a.date.getTime() - b.date.getTime());

  const totalBatchQty = batches.reduce((sum, b) => sum + b.qty, 0);
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

  const positiveQtyBatches = batches.filter((b) => b.qty > 0);
  if (positiveQtyBatches.length > 0) {
    return positiveQtyBatches[0].date;
  }
  
  return batches[0].date;
}

// Computed Summary Stats
const totalAssetValue = computed(() => {
  return items.value.reduce((sum, row) => {
    const qty = row.stockTotal || 0;
    const cost = row.avgHPP || row.buyFee || 0;
    return sum + qty * cost;
  }, 0);
});

const countExpiredStock = computed(() => {
  return items.value.filter((row) => row.edMonths !== null && row.edMonths <= 0).length;
});

const countLowStock = computed(() => {
  return items.value.filter((row) => {
    const qty = row.stockTotal || 0;
    return qty > 0 && qty <= 10;
  }).length;
});

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
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
