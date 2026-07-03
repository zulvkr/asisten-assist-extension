<template>
  <div>
    <!-- Title & Main Actions -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="health_and_safety" class="q-mr-sm" />
        Kesehatan Inventori
      </div>
      <div class="row q-gutter-sm">
        <q-btn
          color="grey-7"
          icon="visibility_off"
          :label="`Item Diabaikan (${ignoredIds.size})`"
          @click="showIgnoredDialog = true"
          flat
          bordered
        />
        <q-btn
          color="teal"
          icon="refresh"
          label="Segarkan Data"
          :loading="loading"
          @click="reloadData"
        />
        <q-btn
          color="primary"
          icon="download"
          label="Ekspor Excel"
          :disabled="loading || activeItems.length === 0"
          @click="exportToExcel"
        />
      </div>
    </div>

    <!-- Info Description -->
    <div class="text-subtitle2 text-grey-7 q-mb-md">
      Visualisasikan risiko keuangan, kelola produk lambat berputar (slow-moving), obat mati, dan darurat kedaluwarsa secara dinamis.
    </div>

    <!-- Error Banner -->
    <q-banner v-if="errorMessage" rounded class="bg-red-1 text-red-9 q-mb-md">
      <template v-slot:avatar>
        <q-icon name="error" />
      </template>
      <div class="text-weight-bold">Terjadi Kesalahan:</div>
      <div>{{ errorMessage }}</div>
      <template v-slot:action>
        <q-btn flat label="Coba Lagi" @click="reloadData" />
      </template>
    </q-banner>

    <!-- Parameters Panel -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal row items-center q-mb-xs">
          <q-icon name="settings" class="q-mr-xs" />
          Kontrol Parameter
        </div>
        <div class="text-caption text-grey-7 q-mb-md">
          Tentukan batas klasifikasi inventori sesuai kebutuhan apotek Anda.
        </div>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-4">
            <q-select
              id="slowMovingLimit"
              v-model.number="thresholds.slowMovingLimit"
              :options="slowMovingOptions"
              emit-value
              map-options
              outlined
              dense
              label="Batas Slow-Moving (Bulan)"
              color="teal"
              @update:model-value="saveThresholds"
            />
          </div>
          <div class="col-12 col-md-4">
            <q-select
              id="deadStockLimit"
              v-model.number="thresholds.deadStockLimit"
              :options="deadStockOptions"
              emit-value
              map-options
              outlined
              dense
              label="Batas Dead Stock (Bulan)"
              color="teal"
              @update:model-value="saveThresholds"
            />
          </div>
          <div class="col-12 col-md-4">
            <q-select
              id="edAlertLimit"
              v-model.number="thresholds.edAlertLimit"
              :options="edAlertOptions"
              emit-value
              map-options
              outlined
              dense
              label="Batas ED Alert Kritis (Bulan)"
              color="teal"
              @update:model-value="saveThresholds"
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- KPI Summary Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <!-- Capital Tied Up -->
      <div class="col-12 col-md-2.4 col-sm-6">
        <q-card flat bordered class="bg-teal-1 text-teal-9 full-height">
          <q-card-section class="q-pb-none">
            <div class="text-caption text-uppercase text-weight-bold">Total Modal Terikat</div>
            <div class="text-h6 text-weight-bold q-my-xs">{{ formatRupiah(kpi.totalCapital) }}</div>
          </q-card-section>
          <q-card-section class="text-caption text-grey-7 q-pt-none">
            Dari {{ activeItems.length }} obat tersisa
          </q-card-section>
        </q-card>
      </div>

      <!-- Sudah ED -->
      <div class="col-12 col-md-2.4 col-sm-6">
        <q-card flat bordered class="bg-purple-1 text-purple-9 full-height">
          <q-card-section class="q-pb-none">
            <div class="text-caption text-uppercase text-weight-bold">Sudah ED</div>
            <div class="text-h6 text-weight-bold q-my-xs">{{ kpi.expiredCount }} Item</div>
          </q-card-section>
          <q-card-section class="text-caption text-purple-8 q-pt-none text-weight-medium">
            Nilai: {{ formatRupiah(kpi.expiredValue) }}
          </q-card-section>
        </q-card>
      </div>

      <!-- Zona Kritis -->
      <div class="col-12 col-md-2.4 col-sm-6">
        <q-card flat bordered class="bg-red-1 text-red-9 full-height">
          <q-card-section class="q-pb-none">
            <div class="text-caption text-uppercase text-weight-bold">Zona Kritis</div>
            <div class="text-h6 text-weight-bold q-my-xs">{{ kpi.criticalCount }} Item</div>
          </q-card-section>
          <q-card-section class="text-caption text-red-8 q-pt-none text-weight-medium">
            Nilai: {{ formatRupiah(kpi.criticalValue) }}
          </q-card-section>
        </q-card>
      </div>

      <!-- Zona Waspada -->
      <div class="col-12 col-md-2.4 col-sm-6">
        <q-card flat bordered class="bg-orange-1 text-orange-9 full-height">
          <q-card-section class="q-pb-none">
            <div class="text-caption text-uppercase text-weight-bold">Zona Waspada</div>
            <div class="text-h6 text-weight-bold q-my-xs">{{ kpi.warningCount }} Item</div>
          </q-card-section>
          <q-card-section class="text-caption text-orange-8 q-pt-none text-weight-medium">
            Nilai: {{ formatRupiah(kpi.warningValue) }}
          </q-card-section>
        </q-card>
      </div>

      <!-- Zona Sehat -->
      <div class="col-12 col-md-2.4 col-sm-6">
        <q-card flat bordered class="bg-green-1 text-green-9 full-height">
          <q-card-section class="q-pb-none">
            <div class="text-caption text-uppercase text-weight-bold">Zona Sehat</div>
            <div class="text-h6 text-weight-bold q-my-xs">{{ kpi.healthyCount }} Item</div>
          </q-card-section>
          <q-card-section class="text-caption text-green-8 q-pt-none text-weight-medium">
            Nilai: {{ formatRupiah(kpi.healthyValue) }}
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Chart Panel -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-md">
          Matriks Risiko Finansial Stok
        </div>
        <div ref="chartRef" style="height: 380px; width: 100%;"></div>
      </q-card-section>
    </q-card>

    <!-- Data Table & Filters -->
    <q-card flat bordered>
      <q-card-section class="q-pb-none">
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-md">
          Daftar Detail Risiko Stok
        </div>

        <!-- Filters Grid -->
        <div class="row q-col-gutter-sm q-mb-md">
          <div class="col-12 col-md-4">
            <q-input
              v-model="filters.search"
              outlined
              dense
              placeholder="Cari Obat / SKU..."
              color="teal"
              clearable
            >
              <template v-slot:prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <div class="col-12 col-md-2">
            <q-select
              v-model="filters.classification"
              outlined
              dense
              emit-value
              map-options
              :options="classificationOptions"
              color="teal"
            />
          </div>

          <div class="col-12 col-md-2">
            <q-select
              v-model="filters.inactiveAge"
              outlined
              dense
              emit-value
              map-options
              :options="inactiveAgeOptions"
              color="teal"
            />
          </div>

          <div class="col-12 col-md-2">
            <q-select
              v-model="filters.edLimit"
              outlined
              dense
              emit-value
              map-options
              :options="edLimitOptions"
              color="teal"
            />
          </div>

          <div class="col-12 col-md-2">
            <q-select
              v-model="filters.sortBy"
              outlined
              dense
              emit-value
              map-options
              :options="sortByOptions"
              color="teal"
            />
          </div>
        </div>
      </q-card-section>

      <!-- Table Content -->
      <q-card-section class="q-pa-none">
        <q-table
          :rows="filteredItems"
          :columns="columns"
          row-key="id"
          flat
          :loading="loading"
          :pagination="{ rowsPerPage: 15 }"
        >
          <template v-slot:body-cell-medName="props">
            <q-td :props="props">
              <div class="text-weight-bold">{{ props.row.medName }}</div>
              <div class="text-caption text-grey-6">{{ props.row.code || 'MS------' }}</div>
            </q-td>
          </template>

          <template v-slot:body-cell-stockTotal="props">
            <q-td :props="props" class="text-right text-weight-bold">
              {{ props.row.stockTotal }} {{ props.row.unit || 'Unit' }}
            </q-td>
          </template>

          <template v-slot:body-cell-stockValue="props">
            <q-td :props="props" class="text-right">
              {{ formatRupiah(props.row.stockValue) }}
            </q-td>
          </template>

          <template v-slot:body-cell-unmovedMonths="props">
            <q-td :props="props">
              {{ formatMonths(props.row.unmovedMonths) }}
            </q-td>
          </template>

          <template v-slot:body-cell-edMonths="props">
            <q-td :props="props">
              <q-badge
                v-if="props.row.edMonths !== null"
                :color="getEdBadgeColor(props.row.edMonths)"
                class="q-px-sm q-py-xs text-weight-bold"
              >
                {{ props.row.edMonths <= 0 ? 'Kedaluwarsa' : formatMonths(props.row.edMonths) }}
              </q-badge>
              <span v-else class="text-grey-5">-</span>
            </q-td>
          </template>

          <template v-slot:body-cell-zone="props">
            <q-td :props="props">
              <q-badge
                :color="getZoneBadgeColor(props.row.zone)"
                class="q-px-sm q-py-xs text-weight-bold"
              >
                {{ props.row.classification }}
              </q-badge>
            </q-td>
          </template>

          <template v-slot:body-cell-actions="props">
            <q-td :props="props" class="text-center">
              <q-btn
                flat
                round
                color="grey-7"
                icon="visibility_off"
                size="sm"
                title="Abaikan item"
                @click="ignoreItem(props.row.id)"
              />
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <!-- Ignored Items Dialog -->
    <q-dialog v-model="showIgnoredDialog">
      <q-card style="width: 700px; max-width: 90vw;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">Item yang Diabaikan ({{ ignoredItemsList.length }})</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-sm">
          <div class="text-caption text-grey-7 q-mb-md">
            Daftar item obat yang dikecualikan dari kalkulasi total modal terikat, statistik visual, dan diagram sebar.
          </div>

          <q-table
            :rows="ignoredItemsList"
            :columns="ignoredColumns"
            row-key="id"
            flat
            bordered
            dense
            :pagination="{ rowsPerPage: 10 }"
          >
            <template v-slot:body-cell-medName="props">
              <q-td :props="props">
                <div class="text-weight-bold">{{ props.row.medName }}</div>
                <div class="text-caption text-grey-6">{{ props.row.code || 'MS------' }}</div>
              </q-td>
            </template>

            <template v-slot:body-cell-stockTotal="props">
              <q-td :props="props" class="text-right text-weight-bold">
                {{ props.row.stockTotal }} {{ props.row.unit }}
              </q-td>
            </template>

            <template v-slot:body-cell-actions="props">
              <q-td :props="props" class="text-center">
                <q-btn
                  flat
                  round
                  color="teal"
                  icon="visibility"
                  size="sm"
                  title="Pulihkan item"
                  @click="restoreItem(props.row.id)"
                />
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from "vue";
import { resolveAssistToken } from "@/composables/assistTokenManager";
import { formatRupiah } from "@/utils/rupiahUtils";
import * as echarts from "echarts";
import * as XLSX from "xlsx";

// Interfaces
interface ExpireItem {
  _id: string;
  name: string;
  lastQuantity: number;
  lastExpire: string;
  dosage?: string;
  batchNo?: string;
  unit?: string;
}

interface RawStockItem {
  _id: string;
  medName: string;
  brandName?: string;
  category?: string;
  code?: string;
  unit?: string;
  stockTotal: number;
  buyFee: number;
  avgHPP: number;
  updatedAt?: string;
  createdAt?: string;
  isDeleted?: boolean;
  ExpireOverview?: ExpireItem[];
}

interface ProcessedItem extends RawStockItem {
  id: string;
  unmovedMonths: number;
  edMonths: number | null;
  stockValue: number;
  zone: "expired" | "critical" | "warning" | "healthy";
  classification: string;
}

// State variables
const loading = ref(true);
const errorMessage = ref("");
const showIgnoredDialog = ref(false);
const items = ref<RawStockItem[]>([]);
const ignoredIds = ref<Set<string>>(new Set());

// EChart ref
const chartRef = ref<HTMLDivElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

// Thresholds
const thresholds = ref({
  slowMovingLimit: 2,
  deadStockLimit: 3,
  edAlertLimit: 3,
});

// Dropdown Options
const slowMovingOptions = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} Bulan`, value: i + 1 }));
const deadStockOptions = Array.from({ length: 24 }, (_, i) => ({ label: `${i + 1} Bulan`, value: i + 1 }));
const edAlertOptions = Array.from({ length: 24 }, (_, i) => ({ label: `${i + 1} Bulan`, value: i + 1 }));

const classificationOptions = [
  { label: "Semua Klasifikasi", value: "all" },
  { label: "Sudah ED", value: "expired" },
  { label: "Zona Kritis", value: "critical" },
  { label: "Zona Waspada", value: "warning" },
  { label: "Zona Sehat", value: "healthy" },
  { label: "Slow-Moving", value: "slow" },
  { label: "Dead Stock", value: "dead" }
];

const inactiveAgeOptions = [
  { label: "Semua Umur Inaktif", value: "all" },
  { label: "> 1 Bulan", value: "1" },
  { label: "> 2 Bulan", value: "2" },
  { label: "> 3 Bulan", value: "3" },
  { label: "> 6 Bulan", value: "6" }
];

const edLimitOptions = [
  { label: "Batas ED (Semua)", value: "all" },
  { label: "Sudah ED", value: "expired" },
  ...Array.from({ length: 24 }, (_, i) => ({ label: `< ${i + 1} Bulan`, value: String(i + 1) }))
];

const sortByOptions = [
  { label: "ED Terdekat", value: "ed_asc" },
  { label: "ED Terjauh", value: "ed_desc" },
  { label: "Stok Terbanyak", value: "stock_desc" },
  { label: "Stok Tersedikit", value: "stock_asc" },
  { label: "Nilai Stok Tertinggi", value: "val_desc" },
  { label: "Nilai Stok Terendah", value: "val_asc" },
  { label: "Tak Bergerak Terlama", value: "unmoved_desc" },
  { label: "Nama A-Z", value: "name_asc" },
  { label: "Nama Z-A", value: "name_desc" }
];

// Table Columns
const columns = [
  { name: "medName", align: "left", label: "Obat / SKU", field: "medName", sortable: true },
  { name: "category", align: "left", label: "Kategori", field: "category", sortable: true },
  { name: "stockTotal", align: "right", label: "Stok", field: "stockTotal", sortable: true },
  { name: "stockValue", align: "right", label: "Nilai Stok", field: "stockValue", sortable: true },
  { name: "unmovedMonths", align: "left", label: "Tak Bergerak", field: "unmovedMonths", sortable: true },
  { name: "edMonths", align: "left", label: "Sisa ED", field: "edMonths", sortable: true },
  { name: "zone", align: "left", label: "Klasifikasi", field: "zone", sortable: true },
  { name: "actions", align: "center", label: "Aksi", field: "actions" }
];

const ignoredColumns = [
  { name: "medName", align: "left", label: "Obat / SKU", field: "medName" },
  { name: "stockTotal", align: "right", label: "Stok", field: "stockTotal" },
  { name: "actions", align: "center", label: "Aksi", field: "actions" }
];

// Filters
const filters = reactive({
  search: "",
  classification: "all",
  inactiveAge: "all",
  edLimit: "all",
  sortBy: "ed_asc",
});

// Load parameters & ignored list on creation
async function loadPersistentState() {
  try {
    const storageLocal = browser?.storage?.local;
    if (storageLocal) {
      const storedData = await storageLocal.get(["inventoryThresholds", "ignoredInventoryIds"]);
      if (storedData.inventoryThresholds) {
        thresholds.value = { ...storedData.inventoryThresholds };
      }
      if (storedData.ignoredInventoryIds && Array.isArray(storedData.ignoredInventoryIds)) {
        ignoredIds.value = new Set(storedData.ignoredInventoryIds);
      }
    }
  } catch (err) {
    console.error("Gagal memuat persistent state dari storage:", err);
  }
}

// Save parameters to storage
async function saveThresholds() {
  try {
    const storageLocal = browser?.storage?.local;
    if (storageLocal) {
      await storageLocal.set({ inventoryThresholds: thresholds.value });
    }
  } catch (err) {
    console.error("Gagal menyimpan parameter batas:", err);
  }
}

// Save ignored IDs to storage
async function saveIgnoredIds() {
  try {
    const storageLocal = browser?.storage?.local;
    if (storageLocal) {
      await storageLocal.set({ ignoredInventoryIds: Array.from(ignoredIds.value) });
    }
  } catch (err) {
    console.error("Gagal menyimpan daftar item diabaikan:", err);
  }
}

// Main fetch data function
async function reloadData() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const assistTokenResult = await resolveAssistToken();
    if (!assistTokenResult.token) {
      throw new Error("Token Assist tidak ditemukan. Silakan login ke clinica.assist.id.");
    }

    const response = await browser.runtime.sendMessage({
      type: "FETCH_ASSIST_EXPIRED_STOCKS",
      payload: { assistToken: assistTokenResult.token },
    });

    if (response && response.ok) {
      items.value = response.data || [];
    } else {
      throw new Error(response?.error || "Gagal mengambil data dari background script.");
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "Terjadi kesalahan yang tidak diketahui.";
  } finally {
    loading.value = false;
  }
}

// Calculate closest active expiration date FEFO
function getClosestExpirationDate(item: RawStockItem): Date | null {
  if (!item.ExpireOverview || !Array.isArray(item.ExpireOverview) || item.ExpireOverview.length === 0) {
    return null;
  }

  const batches = item.ExpireOverview.map((b) => {
    const qty = typeof b.lastQuantity === "number" ? b.lastQuantity : 0;
    const date = b.lastExpire ? new Date(b.lastExpire) : null;
    return { qty, date };
  }).filter((b): b is { qty: number; date: Date } => b.date !== null && !isNaN(b.date.getTime()));

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

function formatMonths(months: number): string {
  const formatted = months.toFixed(1);
  return (formatted.endsWith(".0") ? months.toFixed(0) : formatted) + " bln";
}

// Badge styling helper
function getEdBadgeColor(months: number): string {
  if (months <= 0) return "purple";
  if (months <= thresholds.value.edAlertLimit) return "red";
  if (months <= thresholds.value.edAlertLimit + 3) return "orange";
  return "green";
}

function getZoneBadgeColor(zone: string): string {
  if (zone === "expired") return "purple";
  if (zone === "critical") return "red";
  if (zone === "warning") return "orange";
  return "green";
}

// Process data items
const processedItems = computed<ProcessedItem[]>(() => {
  const now = new Date();
  const slowLimit = thresholds.value.slowMovingLimit;
  const deadLimit = thresholds.value.deadStockLimit;
  const edLimit = thresholds.value.edAlertLimit;

  const groupedRawItems: RawStockItem[] = [];
  const skuMap = new Map<string, RawStockItem>();

  for (const item of items.value) {
    if (item.isDeleted || !(item.stockTotal > 0)) {
      continue;
    }

    const sku = item.code ? item.code.trim().toUpperCase() : "";
    if (!sku) {
      groupedRawItems.push(JSON.parse(JSON.stringify(item)));
      continue;
    }

    if (skuMap.has(sku)) {
      const existing = skuMap.get(sku)!;
      existing.stockTotal += item.stockTotal;
      
      if (item.ExpireOverview && Array.isArray(item.ExpireOverview)) {
        existing.ExpireOverview = [
          ...(existing.ExpireOverview || []),
          ...item.ExpireOverview,
        ];
      }

      const existingDate = new Date(existing.updatedAt || existing.createdAt || 0);
      const itemDate = new Date(item.updatedAt || item.createdAt || 0);
      if (itemDate > existingDate) {
        existing.updatedAt = item.updatedAt;
        existing.createdAt = item.createdAt;
      }

      if (!existing.brandName && item.brandName) {
        existing.brandName = item.brandName;
      }
      if (!existing.category && item.category) {
        existing.category = item.category;
      }

      if ((!existing.buyFee || existing.buyFee === 0) && item.buyFee) {
        existing.buyFee = item.buyFee;
      }
      if ((!existing.avgHPP || existing.avgHPP === 0) && item.avgHPP) {
        existing.avgHPP = item.avgHPP;
      }
    } else {
      const clone = JSON.parse(JSON.stringify(item)) as RawStockItem;
      skuMap.set(sku, clone);
      groupedRawItems.push(clone);
    }
  }

  return groupedRawItems.map((item) => {
    const lastUpdate = new Date(item.updatedAt || item.createdAt || now);
    const diffMs = now.getTime() - lastUpdate.getTime();
    const unmovedMonths = Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 30.4375));

    const closestExpire = getClosestExpirationDate(item);
    let edMonths: number | null = null;
    if (closestExpire) {
      const diffEdMs = closestExpire.getTime() - now.getTime();
      edMonths = diffEdMs / (1000 * 60 * 60 * 24 * 30.4375);
    }

    const cost = item.avgHPP && item.avgHPP > 0 ? item.avgHPP : (item.buyFee || 0);
    const stockValue = item.stockTotal * cost;

    let movement = "NORMAL";
    if (unmovedMonths > deadLimit) {
      movement = "DEAD STOCK";
    } else if (unmovedMonths > slowLimit) {
      movement = "SLOW-MOVING";
    }

    let edStatus = "SEHAT";
    if (edMonths !== null) {
      if (edMonths <= 0) {
        edStatus = "KEDALUWARSA";
      } else if (edMonths <= edLimit) {
        edStatus = "ED KRITIS";
      } else if (edMonths <= edLimit + 3) {
        edStatus = "ED WASPADA";
      }
    }

    let zone: "expired" | "critical" | "warning" | "healthy" = "healthy";
    let classification = "ZONA SEHAT";

    if (edStatus === "KEDALUWARSA") {
      zone = "expired";
      classification = `${movement} + KEDALUWARSA`;
    } else if (edStatus === "ED KRITIS") {
      zone = "critical";
      classification = `${movement} + ED KRITIS`;
    } else if (movement !== "NORMAL" || edStatus === "ED WASPADA") {
      zone = "warning";
      const parts: string[] = [];
      if (movement !== "NORMAL") parts.push(movement);
      if (edStatus === "ED WASPADA") parts.push(edStatus);
      classification = parts.join(" + ");
    }

    return {
      ...item,
      id: item._id,
      unmovedMonths,
      edMonths,
      stockValue,
      zone,
      classification,
    };
  });
});

// Non-ignored active items
const activeItems = computed<ProcessedItem[]>(() => {
  return processedItems.value.filter((item) => !ignoredIds.value.has(item.id));
});

// Ignored items list
const ignoredItemsList = computed<ProcessedItem[]>(() => {
  return processedItems.value.filter((item) => ignoredIds.value.has(item.id));
});

// Action triggers to ignore / restore
function ignoreItem(id: string) {
  ignoredIds.value.add(id);
  saveIgnoredIds();
}

function restoreItem(id: string) {
  ignoredIds.value.delete(id);
  saveIgnoredIds();
}

// KPI numbers
const kpi = computed(() => {
  let totalCapital = 0;
  let expiredCount = 0;
  let expiredValue = 0;
  let criticalCount = 0;
  let criticalValue = 0;
  let warningCount = 0;
  let warningValue = 0;
  let healthyCount = 0;
  let healthyValue = 0;

  for (const item of activeItems.value) {
    totalCapital += item.stockValue;

    if (item.zone === "expired") {
      expiredCount++;
      expiredValue += item.stockValue;
    } else if (item.zone === "critical") {
      criticalCount++;
      criticalValue += item.stockValue;
    } else if (item.zone === "warning") {
      warningCount++;
      warningValue += item.stockValue;
    } else {
      healthyCount++;
      healthyValue += item.stockValue;
    }
  }

  return {
    totalCapital,
    expiredCount,
    expiredValue,
    criticalCount,
    criticalValue,
    warningCount,
    warningValue,
    healthyCount,
    healthyValue,
  };
});

// Filter & Sort Table rows
const filteredItems = computed(() => {
  let result = [...activeItems.value];

  const search = filters.search.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (item) =>
        (item.medName && item.medName.toLowerCase().includes(search)) ||
        (item.code && item.code.toLowerCase().includes(search))
    );
  }

  if (filters.classification !== "all") {
    if (filters.classification === "slow") {
      result = result.filter((item) => item.unmovedMonths > thresholds.value.slowMovingLimit && item.unmovedMonths <= thresholds.value.deadStockLimit);
    } else if (filters.classification === "dead") {
      result = result.filter((item) => item.unmovedMonths > thresholds.value.deadStockLimit);
    } else {
      result = result.filter((item) => item.zone === filters.classification);
    }
  }

  if (filters.inactiveAge !== "all") {
    const age = Number(filters.inactiveAge);
    result = result.filter((item) => item.unmovedMonths > age);
  }

  if (filters.edLimit !== "all") {
    if (filters.edLimit === "expired") {
      result = result.filter((item) => item.edMonths !== null && item.edMonths <= 0);
    } else {
      const limit = Number(filters.edLimit);
      result = result.filter((item) => item.edMonths !== null && item.edMonths > 0 && item.edMonths < limit);
    }
  }

  result.sort((a, b) => {
    switch (filters.sortBy) {
      case "ed_asc":
        if (a.edMonths === null) return 1;
        if (b.edMonths === null) return -1;
        return a.edMonths - b.edMonths;
      case "ed_desc":
        if (a.edMonths === null) return 1;
        if (b.edMonths === null) return -1;
        return b.edMonths - a.edMonths;
      case "stock_desc":
        return b.stockTotal - a.stockTotal;
      case "stock_asc":
        return a.stockTotal - b.stockTotal;
      case "val_desc":
        return b.stockValue - a.stockValue;
      case "val_asc":
        return a.stockValue - b.stockValue;
      case "unmoved_desc":
        return b.unmovedMonths - a.unmovedMonths;
      case "name_asc":
        return a.medName.localeCompare(b.medName);
      case "name_desc":
        return b.medName.localeCompare(a.medName);
      default:
        return 0;
    }
  });

  return result;
});

// Render Apache EChart
function initChart() {
  if (!chartRef.value) return;

  if (chartInstance) {
    chartInstance.dispose();
  }

  chartInstance = echarts.init(chartRef.value);
  updateChartOptions();
}

function updateChartOptions() {
  if (!chartInstance) return;

  const dataList = activeItems.value.map((item) => {
    const displayX = Math.min(6, item.unmovedMonths);
    const displayY = item.edMonths === null ? 24 : Math.max(0, Math.min(24, item.edMonths));
    
    let color = "#10b981"; // green
    if (item.zone === "expired") color = "#a855f7"; // purple
    else if (item.zone === "critical") color = "#ef4444"; // red
    else if (item.zone === "warning") color = "#f59e0b"; // orange

    return {
      value: [displayX, displayY],
      itemStyle: { color },
      itemObj: item,
    };
  });

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      textStyle: {
        color: "#0f172a",
      },
      formatter: (params: any) => {
        const item = params.data.itemObj;
        return `
          <div style="font-family: 'Inter', sans-serif; font-size: 12px; padding: 4px; line-height: 1.5;">
            <strong style="font-size: 13px; color: #0f172a; display: block; margin-bottom: 4px;">${item.medName}</strong>
            <span style="color: #64748b; font-size: 11px;">SKU: ${item.code || "-"} • ${item.category || "Lainnya"}</span>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 8px 0;"/>
            <b>Stok:</b> ${item.stockTotal} ${item.unit || "Unit"}<br/>
            <b>Nilai Stok:</b> ${formatRupiah(item.stockValue)}<br/>
            <b>Bulan Tidak Bergerak:</b> ${item.unmovedMonths.toFixed(1)} bln<br/>
            <b>Sisa Bulan ke ED:</b> ${item.edMonths !== null ? (item.edMonths <= 0 ? 'Kedaluwarsa' : item.edMonths.toFixed(1) + ' bln') : 'Tidak ada'}<br/>
            <span style="margin-top: 6px; display: inline-block; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; font-weight: 700; font-size: 10.5px;">
              ${item.classification}
            </span>
          </div>
        `;
      },
    },
    grid: {
      left: "8%",
      right: "8%",
      bottom: "12%",
      top: "10%",
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: "Bulan Tidak Bergerak",
      nameLocation: "center",
      nameGap: 30,
      min: 0,
      max: 6,
      splitLine: {
        show: true,
        lineStyle: { color: "#f1f5f9" },
      },
    },
    yAxis: {
      type: "value",
      name: "Sisa Bulan ke ED",
      nameLocation: "middle",
      nameGap: 40,
      min: 0,
      max: 24,
      splitLine: {
        show: true,
        lineStyle: { color: "#f1f5f9" },
      },
    },
    series: [
      {
        type: "scatter",
        symbolSize: 10,
        data: dataList,
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: {
            type: "dashed",
            color: "#94a3b8",
            width: 1,
          },
          data: [
            {
              xAxis: thresholds.value.deadStockLimit,
              label: {
                position: "end",
                formatter: "Batas Dead Stock",
                fontSize: 10,
                color: "#475569",
              },
            },
            {
              yAxis: thresholds.value.edAlertLimit,
              label: {
                position: "end",
                formatter: "ED Kritis",
                fontSize: 10,
                color: "#475569",
              },
            },
          ],
        },
      },
    ],
  };

  chartInstance.setOption(option);
}

function exportToExcel() {
  const headers = [
    "KODE OBAT (SKU)",
    "NAMA OBAT",
    "BRAND",
    "KATEGORI",
    "STOK TOTAL",
    "SATUAN",
    "HARGA BELI (BUY FEE)",
    "NILAI STOK",
    "TAK BERGERAK (BULAN)",
    "SISA ED (BULAN)",
    "KLASIFIKASI",
  ];

  const rows = activeItems.value.map((item) => [
    item.code || "",
    item.medName || "",
    item.brandName || "",
    item.category || "",
    item.stockTotal,
    item.unit || "",
    item.buyFee || 0,
    item.stockValue,
    Number(item.unmovedMonths.toFixed(1)),
    item.edMonths !== null ? (item.edMonths <= 0 ? "Kedaluwarsa" : Number(item.edMonths.toFixed(1))) : "Tidak ada",
    item.classification,
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Kesehatan Inventori");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });

  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kesehatan-inventori_${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  await loadPersistentState();
  await reloadData();
  initChart();

  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize();
  });
  if (chartRef.value) {
    resizeObserver.observe(chartRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (chartInstance) {
    chartInstance.dispose();
  }
});

watch([activeItems, thresholds], () => {
  updateChartOptions();
}, { deep: true });
</script>
