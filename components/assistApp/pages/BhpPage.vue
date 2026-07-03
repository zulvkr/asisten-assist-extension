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
      Token Authorization belum diisi. Silakan pergi ke menu <strong>Pengaturan</strong> terlebih dahulu.
    </q-banner>

    <div v-else>
      <!-- Summary Cards -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md-3">
          <q-card flat bordered class="bg-teal-1 text-teal-9">
            <q-card-section>
              <div class="text-caption text-uppercase">Total Item BHP</div>
              <div class="text-h4 text-weight-bold">{{ items.length }}</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-3">
          <q-card flat bordered class="bg-blue-1 text-blue-9">
            <q-card-section>
              <div class="text-caption text-uppercase">Total Nilai Aset BHP</div>
              <div class="text-h4 text-weight-bold">{{ formatRupiah(totalAssetValue) }}</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-3">
          <q-card flat bordered class="bg-red-1 text-red-9">
            <q-card-section>
              <div class="text-caption text-uppercase">Stok Habis (0)</div>
              <div class="text-h4 text-weight-bold">{{ countZeroStock }}</div>
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
  { name: "code", label: "Kode", align: "left", field: "code", sortable: true },
  { name: "itemName", label: "Nama Barang BHP", align: "left", field: "itemName", sortable: true },
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

// Computed Summary Stats
const totalAssetValue = computed(() => {
  return items.value.reduce((sum, row) => {
    const qty = row.stockTotal || 0;
    const cost = row.avgHPP || row.buyFee || 0;
    return sum + qty * cost;
  }, 0);
});

const countZeroStock = computed(() => {
  return items.value.filter((row) => (row.stockTotal || 0) === 0).length;
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
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
