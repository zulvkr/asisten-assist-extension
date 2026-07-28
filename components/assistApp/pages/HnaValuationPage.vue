<template>
  <div class="hna-valuation-page">
    <!-- Header Section -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="payments" class="q-mr-sm" />
        Laporan HNA & Valuasi HPP
      </div>
      <div class="text-caption text-grey-7" v-if="progressText">
        <q-spinner-dots color="teal" size="1.2em" class="q-mr-xs" />
        {{ progressText }}
      </div>
    </div>

    <!-- Error Alert Banner -->
    <q-banner v-if="errorMessage" class="bg-negative text-white q-mb-md rounded-borders" dense inline-actions>
      <template v-slot:avatar>
        <q-icon name="error" />
      </template>
      {{ errorMessage }}
    </q-banner>

    <!-- Filters Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-sm items-center">
        <div class="col-12 col-sm-3 col-md-2">
          <q-input
            v-model="startDate"
            type="date"
            outlined
            dense
            label="Mulai Tanggal"
            color="teal"
            stack-label
          />
        </div>
        <div class="col-12 col-sm-3 col-md-2">
          <q-input
            v-model="endDate"
            type="date"
            outlined
            dense
            label="Akhir Tanggal"
            color="teal"
            stack-label
          />
        </div>
        <div class="col-12 col-sm-3 col-md-3">
          <q-input
            v-model="targetHistoricalDate"
            type="date"
            outlined
            dense
            label="Tanggal Valuasi Historical"
            color="teal"
            stack-label
          >
            <template v-slot:append>
              <q-icon name="history" class="text-teal" />
            </template>
          </q-input>
        </div>
        <div class="col-12 col-sm-3 col-md-3 row q-gutter-x-sm">
          <q-btn
            color="teal"
            icon="play_arrow"
            label="Muat Data"
            :loading="loading"
            @click="loadHnaReport"
            class="col"
            dense
            no-caps
          />
          <q-btn
            color="positive"
            icon="file_download"
            label="Export Excel"
            :disabled="loading || (!salesItems.length && !currentCatalog.length)"
            @click="exportHnaToExcel"
            class="col"
            dense
            no-caps
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Summary KPI Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <!-- Current Inventory HNA Value -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="bg-teal-1">
          <q-card-section class="q-pa-md">
            <div class="text-caption text-grey-8 text-weight-medium">Stok HNA Saat Ini</div>
            <div class="text-h6 text-weight-bold text-teal q-mt-xs">
              {{ formatRupiah(currentStockTotalHnaValue) }}
            </div>
            <div class="text-caption text-grey-7 q-mt-xs font-mono">
              Total {{ totalCatalogItemsCount }} item obat & BHP
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Total HPP Penjualan (COGS) -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="bg-orange-1">
          <q-card-section class="q-pa-md">
            <div class="text-caption text-grey-8 text-weight-medium">Total HPP Penjualan (COGS)</div>
            <div class="text-h6 text-weight-bold text-orange-9 q-mt-xs">
              {{ formatRupiah(salesSummary.totalHna) }}
            </div>
            <div class="text-caption text-grey-7 q-mt-xs font-mono">
              Omset: {{ formatRupiah(salesSummary.totalRevenue) }}
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Gross Profit & Margin -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="bg-green-1">
          <q-card-section class="q-pa-md">
            <div class="text-caption text-grey-8 text-weight-medium">Laba Kotor Penjualan</div>
            <div class="text-h6 text-weight-bold text-positive q-mt-xs">
              {{ formatRupiah(salesSummary.totalProfit) }}
            </div>
            <div class="text-caption text-positive text-weight-bold q-mt-xs">
              Margin: {{ salesSummary.overallMarginPct }}%
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Historical Inventory Valuation (Date T) -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="bg-blue-1">
          <q-card-section class="q-pa-md">
            <div class="text-caption text-grey-8 text-weight-medium">
              Stok HNA ({{ targetHistoricalDate }})
            </div>
            <div class="text-h6 text-weight-bold text-primary q-mt-xs">
              {{ formatRupiah(historicalTotalHnaValue) }}
            </div>
            <div class="text-caption text-grey-7 q-mt-xs font-mono">
              Rekonstruksi peristiwa backlog
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Main Tabs Card -->
    <q-card flat bordered class="q-mb-md">
      <q-tabs
        v-model="activeTab"
        dense
        class="bg-grey-2 text-grey-8"
        active-color="teal"
        indicator-color="teal"
        align="left"
        narrow-indicator
      >
        <q-tab name="sales" icon="shopping_bag" label="HPP Penjualan (COGS)" />
        <q-tab name="current" icon="inventory_2" label="Valuasi Stok Saat Ini" />
        <q-tab name="historical" icon="history" label="Valuasi Stok Historical" />
      </q-tabs>

      <q-separator />

      <q-tab-panels v-model="activeTab" animated>
        <!-- Tab 1: HPP Penjualan -->
        <q-tab-panel name="sales" class="q-pa-none">
          <div class="q-pa-md row items-center justify-between">
            <q-input
              v-model="searchFilter"
              dense
              outlined
              placeholder="Cari item terjual..."
              color="teal"
              class="col-12 col-sm-4"
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <q-table
            :rows="salesItems"
            :columns="salesColumns"
            row-key="transactionId"
            flat
            :loading="loading"
            :filter="searchFilter"
            :pagination="{ rowsPerPage: 15 }"
            no-data-label="Belum ada data penjualan pada periode terpilih."
          >
            <template v-slot:body-cell-unitHna="props">
              <q-td :props="props" class="text-weight-medium font-mono text-teal">
                {{ formatRupiah(props.row.unitHna) }}
              </q-td>
            </template>

            <template v-slot:body-cell-totalHna="props">
              <q-td :props="props" class="text-weight-bold font-mono text-orange-9">
                {{ formatRupiah(props.row.totalHna) }}
              </q-td>
            </template>

            <template v-slot:body-cell-profit="props">
              <q-td :props="props" class="text-weight-bold font-mono" :class="props.row.profit >= 0 ? 'text-positive' : 'text-negative'">
                {{ formatRupiah(props.row.profit) }}
              </q-td>
            </template>

            <template v-slot:body-cell-profitMarginPct="props">
              <q-td :props="props">
                <q-chip
                  dense
                  size="sm"
                  :color="props.row.profitMarginPct >= 20 ? 'positive' : props.row.profitMarginPct >= 0 ? 'warning' : 'negative'"
                  text-color="white"
                >
                  {{ props.row.profitMarginPct }}%
                </q-chip>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- Tab 2: Valuasi Stok Saat Ini -->
        <q-tab-panel name="current" class="q-pa-none">
          <div class="q-pa-md row items-center justify-between">
            <q-input
              v-model="searchFilter"
              dense
              outlined
              placeholder="Cari item di katalog..."
              color="teal"
              class="col-12 col-sm-4"
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <q-table
            :rows="currentCatalog"
            :columns="currentColumns"
            row-key="id"
            flat
            :loading="loading"
            :filter="searchFilter"
            :pagination="{ rowsPerPage: 15 }"
            no-data-label="Katalog stok kosong."
          >
            <template v-slot:body-cell-unitHna="props">
              <q-td :props="props" class="text-weight-medium font-mono text-teal">
                {{ formatRupiah(calculateUnitHna(props.row)) }}
              </q-td>
            </template>

            <template v-slot:body-cell-totalHnaValue="props">
              <q-td :props="props" class="text-weight-bold font-mono text-teal">
                {{ formatRupiah(Math.round(props.row.stockTotal * calculateUnitHna(props.row))) }}
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- Tab 3: Valuasi Stok Historical (Date T) -->
        <q-tab-panel name="historical" class="q-pa-none">
          <div class="q-pa-md row items-center justify-between">
            <div class="text-subtitle2 text-teal font-weight-bold">
              Rekonstruksi Posisi Stok per {{ targetHistoricalDate }}
            </div>
            <q-input
              v-model="searchFilter"
              dense
              outlined
              placeholder="Cari item historical..."
              color="teal"
              class="col-12 col-sm-4"
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <q-table
            :rows="historicalSnapshots"
            :columns="historicalColumns"
            row-key="id"
            flat
            :loading="loading"
            :filter="searchFilter"
            :pagination="{ rowsPerPage: 15 }"
            no-data-label="Klik 'Muat Data' untuk menghitung rekonstruksi stok historical."
          >
            <template v-slot:body-cell-reconstructedStock="props">
              <q-td :props="props" class="text-weight-bold text-primary">
                {{ props.row.reconstructedStock }} {{ props.row.unit }}
              </q-td>
            </template>

            <template v-slot:body-cell-historicalHnaValue="props">
              <q-td :props="props" class="text-weight-bold font-mono text-primary">
                {{ formatRupiah(props.row.historicalHnaValue) }}
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useHnaValuation } from "@/composables/useHnaValuation";
import { formatRupiah } from "@/utils/rupiahUtils";
import { calculateUnitHna } from "@/utils/hnaUtils";

const activeTab = ref("sales");
const searchFilter = ref("");

const {
  loading,
  progressText,
  errorMessage,
  startDate,
  endDate,
  targetHistoricalDate,
  currentCatalog,
  salesItems,
  salesSummary,
  historicalSnapshots,
  currentStockTotalHnaValue,
  totalCatalogItemsCount,
  historicalTotalHnaValue,
  loadHnaReport,
  exportHnaToExcel
} = useHnaValuation();

// Column Definitions
const salesColumns = [
  { name: "transactionCode", label: "No Transaksi", field: "transactionCode", sortable: true, align: "left" as const },
  { name: "createdAt", label: "Tanggal", field: "createdAt", sortable: true, align: "left" as const, format: (val: string) => formatDate(val) },
  { name: "code", label: "Kode Item", field: "code", sortable: true, align: "left" as const },
  { name: "name", label: "Nama Item", field: "name", sortable: true, align: "left" as const },
  { name: "quantity", label: "Qty Sold", field: "quantity", sortable: true, align: "right" as const },
  { name: "sellingPrice", label: "Harga Jual", field: "sellingPrice", sortable: true, align: "right" as const, format: (val: number) => formatRupiah(val) },
  { name: "unitHna", label: "HNA Unit", field: "unitHna", sortable: true, align: "right" as const },
  { name: "totalHna", label: "Total HPP (COGS)", field: "totalHna", sortable: true, align: "right" as const },
  { name: "totalRevenue", label: "Total Omset", field: "totalRevenue", sortable: true, align: "right" as const, format: (val: number) => formatRupiah(val) },
  { name: "profit", label: "Profit", field: "profit", sortable: true, align: "right" as const },
  { name: "profitMarginPct", label: "Margin", field: "profitMarginPct", sortable: true, align: "center" as const }
];

const currentColumns = [
  { name: "code", label: "Kode Item", field: "code", sortable: true, align: "left" as const },
  { name: "name", label: "Nama Item", field: "name", sortable: true, align: "left" as const },
  { name: "category", label: "Kategori", field: "category", sortable: true, align: "left" as const },
  { name: "stockTotal", label: "Stok Total", field: "stockTotal", sortable: true, align: "right" as const },
  { name: "unit", label: "Satuan", field: "unit", sortable: true, align: "left" as const },
  { name: "unitHna", label: "HNA Unit", field: "unitHna", sortable: true, align: "right" as const },
  { name: "totalHnaValue", label: "Total Nilai HNA", field: "totalHnaValue", sortable: true, align: "right" as const }
];

const historicalColumns = [
  { name: "code", label: "Kode Item", field: "code", sortable: true, align: "left" as const },
  { name: "name", label: "Nama Item", field: "name", sortable: true, align: "left" as const },
  { name: "category", label: "Kategori", field: "category", sortable: true, align: "left" as const },
  { name: "currentStock", label: "Stok Saat Ini", field: "currentStock", sortable: true, align: "right" as const },
  { name: "deltaOutbound", label: "Delta Terjual", field: "deltaOutbound", sortable: true, align: "right" as const },
  { name: "reconstructedStock", label: "Stok Historical", field: "reconstructedStock", sortable: true, align: "right" as const },
  { name: "unitHna", label: "HNA Unit", field: "unitHna", sortable: true, align: "right" as const, format: (val: number) => formatRupiah(val) },
  { name: "historicalHnaValue", label: "Nilai HNA Historical", field: "historicalHnaValue", sortable: true, align: "right" as const }
];

function formatDate(val?: string): string {
  if (!val) return "-";
  try {
    return new Date(val).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return val;
  }
}

onMounted(() => {
  void loadHnaReport();
});
</script>

<style scoped>
.hna-valuation-page .font-mono {
  font-family: monospace;
}
</style>
