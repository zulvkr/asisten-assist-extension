<template>
  <div class="dashboard-root">
    <!-- Header -->
    <header class="dashboard-header">
      <div class="header-title-area">
        <h1>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z"></path>
            <path d="M12 8v4"></path>
            <path d="M12 16h.01"></path>
          </svg>
          Kesehatan Inventori
        </h1>
        <p class="subtitle">
          Visualisasikan risiko keuangan, kelola produk lambat berputar (slow-moving), obat mati, dan darurat kedaluwarsa secara dinamis.
        </p>
      </div>

      <div class="header-actions">
        <button type="button" class="btn btn-ignored" @click="showIgnoredDrawer = true">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
          Item Diabaikan ({{ ignoredIds.size }})
        </button>

        <button type="button" class="btn btn-secondary" :disabled="loading" @click="reloadData">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ 'spinner': loading }">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          Segarkan Data
        </button>

        <button type="button" class="btn btn-primary" :disabled="loading || activeItems.length === 0" @click="exportToExcel">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Ekspor Excel
        </button>
      </div>
    </header>

    <!-- Error State -->
    <div v-if="errorMessage" class="error-card">
      <div class="error-title">Terjadi Kesalahan</div>
      <p class="error-desc">{{ errorMessage }}</p>
      <button type="button" class="btn btn-danger" @click="reloadData">Coba Lagi</button>
    </div>

    <!-- Loading State -->
    <div v-else-if="loading" class="loading-container">
      <div class="spinner"></div>
      <p>Mengambil data kesehatan inventori dari Assist...</p>
    </div>

    <!-- Main Content -->
    <div v-else>
      <!-- Parameters Panel -->
      <section class="parameters-panel">
        <h3 class="panel-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          Kontrol Parameter
        </h3>
        <p class="panel-desc">Tentukan batas klasifikasi inventori sesuai kebutuhan apotek Anda.</p>
        <div class="params-grid">
          <div class="param-group">
            <label for="slowMovingLimit">Batas Slow-Moving (Bulan)</label>
            <select id="slowMovingLimit" v-model.number="thresholds.slowMovingLimit" class="form-select" @change="saveThresholds">
              <option v-for="m in 12" :key="m" :value="m">{{ m }} Bulan</option>
            </select>
          </div>
          <div class="param-group">
            <label for="deadStockLimit">Batas Dead Stock (Bulan)</label>
            <select id="deadStockLimit" v-model.number="thresholds.deadStockLimit" class="form-select" @change="saveThresholds">
              <option v-for="m in 24" :key="m" :value="m">{{ m }} Bulan</option>
            </select>
          </div>
          <div class="param-group">
            <label for="edAlertLimit">Batas ED Alert Kritis (Bulan)</label>
            <select id="edAlertLimit" v-model.number="thresholds.edAlertLimit" class="form-select" @change="saveThresholds">
              <option v-for="m in 24" :key="m" :value="m">{{ m }} Bulan</option>
            </select>
          </div>
        </div>
      </section>

      <!-- KPI Summary Cards -->
      <section class="kpi-grid">
        <!-- Capital Tied Up -->
        <div class="kpi-card capital">
          <div>
            <span class="kpi-label">Total Modal Terikat</span>
            <div class="kpi-value-row">
              <div class="kpi-value">{{ formatRupiah(kpi.totalCapital) }}</div>
              <div class="kpi-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12" y2="18.01"></line>
                  <line x1="12" y1="6" x2="12" y2="14"></line>
                </svg>
              </div>
            </div>
          </div>
          <div class="kpi-subtitle">Dari {{ activeItems.length }} obat tersisa</div>
        </div>

        <!-- Sudah ED -->
        <div class="kpi-card expired">
          <div>
            <span class="kpi-label">Sudah ED</span>
            <div class="kpi-value-row">
              <div class="kpi-value">{{ kpi.expiredCount }} Item</div>
              <div class="kpi-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                  <path d="M12 14l4 4m0-4l-4 4"></path>
                </svg>
              </div>
            </div>
          </div>
          <div class="kpi-subtitle">Nilai: {{ formatRupiah(kpi.expiredValue) }}</div>
        </div>

        <!-- Zona Kritis -->
        <div class="kpi-card critical">
          <div>
            <span class="kpi-label">Zona Kritis</span>
            <div class="kpi-value-row">
              <div class="kpi-value">{{ kpi.criticalCount }} Item</div>
              <div class="kpi-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
            </div>
          </div>
          <div class="kpi-subtitle">Nilai: {{ formatRupiah(kpi.criticalValue) }}</div>
        </div>

        <!-- Zona Waspada -->
        <div class="kpi-card warning">
          <div>
            <span class="kpi-label">Zona Waspada</span>
            <div class="kpi-value-row">
              <div class="kpi-value">{{ kpi.warningCount }} Item</div>
              <div class="kpi-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
            </div>
          </div>
          <div class="kpi-subtitle">Nilai: {{ formatRupiah(kpi.warningValue) }}</div>
        </div>

        <!-- Zona Sehat -->
        <div class="kpi-card healthy">
          <div>
            <span class="kpi-label">Zona Sehat</span>
            <div class="kpi-value-row">
              <div class="kpi-value">{{ kpi.healthyCount }} Item</div>
              <div class="kpi-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
            </div>
          </div>
          <div class="kpi-subtitle">Nilai: {{ formatRupiah(kpi.healthyValue) }}</div>
        </div>
      </section>

      <!-- Grid for Chart and Table -->
      <section class="dashboard-body-grid">
        <!-- Scatter Plot Matrix -->
        <div class="chart-panel">
          <h2>Matriks Risiko Finansial Stok</h2>
          <div ref="chartRef" class="chart-wrapper"></div>
        </div>

        <!-- Data Table & Filters -->
        <div class="table-panel">
          <h2>Daftar Detail Risiko Stok</h2>

          <!-- Table Filters -->
          <div class="table-filters">
            <!-- Search -->
            <div class="search-input-wrapper">
              <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" v-model="filters.search" placeholder="Cari Obat / SKU" class="form-input" />
            </div>

            <!-- Classification -->
            <div>
              <select v-model="filters.classification" class="form-select">
                <option value="all">Semua Klasifikasi</option>
                <option value="expired">Sudah ED</option>
                <option value="critical">Zona Kritis</option>
                <option value="warning">Zona Waspada</option>
                <option value="healthy">Zona Sehat</option>
                <option value="slow">Slow-Moving</option>
                <option value="dead">Dead Stock</option>
              </select>
            </div>

            <!-- Inactive Age -->
            <div>
              <select v-model="filters.inactiveAge" class="form-select">
                <option value="all">Semua Umur Inaktif</option>
                <option value="1">> 1 Bulan</option>
                <option value="2">> 2 Bulan</option>
                <option value="3">> 3 Bulan</option>
                <option value="6">> 6 Bulan</option>
              </select>
            </div>

            <div>
              <select v-model="filters.edLimit" class="form-select">
                <option value="all">Batas ED (Semua)</option>
                <option value="expired">Sudah ED</option>
                <option v-for="m in 24" :key="m" :value="String(m)">&lt; {{ m }} Bulan</option>
              </select>
            </div>

            <!-- Sort By -->
            <div>
              <select v-model="filters.sortBy" class="form-select">
                <option value="ed_asc">ED Terdekat</option>
                <option value="ed_desc">ED Terjauh</option>
                <option value="stock_desc">Stok Terbanyak</option>
                <option value="stock_asc">Stok Tersedikit</option>
                <option value="val_desc">Nilai Stok Tertinggi</option>
                <option value="val_asc">Nilai Stok Terendah</option>
                <option value="unmoved_desc">Tak Bergerak Terlama</option>
                <option value="name_asc">Nama A-Z</option>
                <option value="name_desc">Nama Z-A</option>
              </select>
            </div>
          </div>

          <!-- Table Content -->
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Obat / SKU</th>
                  <th>Kategori</th>
                  <th class="text-right">Stok</th>
                  <th class="text-right">Nilai Stok</th>
                  <th>Tak Bergerak</th>
                  <th>Sisa ED</th>
                  <th>Klasifikasi</th>
                  <th class="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredItems.length === 0">
                  <td colspan="8" class="text-center" style="padding: 32px; color: var(--color-slate-600);">
                    Tidak ada item obat yang cocok dengan filter.
                  </td>
                </tr>
                <tr v-for="item in filteredItems" :key="item.id">
                  <td>
                    <div class="cell-medname">{{ item.medName }}</div>
                    <div class="cell-sku">{{ item.code || 'MS------' }}</div>
                  </td>
                  <td>{{ item.category || 'Lainnya' }}</td>
                  <td class="text-right font-semibold">{{ item.stockTotal }} {{ item.unit || 'Unit' }}</td>
                  <td class="text-right">{{ formatRupiah(item.stockValue) }}</td>
                  <td>{{ formatMonths(item.unmovedMonths) }}</td>
                  <td>
                    <span v-if="item.edMonths !== null" :class="{
                      'badge badge-expired': item.edMonths <= 0,
                      'badge badge-critical': item.edMonths > 0 && item.edMonths <= thresholds.edAlertLimit,
                      'badge badge-warning': item.edMonths > thresholds.edAlertLimit && item.edMonths <= thresholds.edAlertLimit + 3,
                      'badge badge-healthy': item.edMonths > thresholds.edAlertLimit + 3
                    }">
                      {{ item.edMonths <= 0 ? 'Kedaluwarsa' : formatMonths(item.edMonths) }}
                    </span>
                    <span v-else style="color: var(--color-slate-400)">-</span>
                  </td>
                  <td>
                    <span :class="{
                      'badge badge-expired': item.zone === 'expired',
                      'badge badge-critical': item.zone === 'critical',
                      'badge badge-warning': item.zone === 'warning',
                      'badge badge-healthy': item.zone === 'healthy'
                    }">
                      {{ item.classification }}
                    </span>
                  </td>
                  <td class="text-center">
                    <button type="button" class="btn btn-secondary" style="padding: 4px 8px; border-radius: 6px;" title="Abaikan item" @click="ignoreItem(item.id)">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <!-- Ignored Items Drawer -->
    <div v-if="showIgnoredDrawer" class="modal-overlay" @click.self="showIgnoredDrawer = false">
      <div class="drawer-container">
        <div class="drawer-header">
          <h3>Item yang Diabaikan ({{ ignoredItemsList.length }})</h3>
          <button type="button" class="drawer-close" @click="showIgnoredDrawer = false">&times;</button>
        </div>
        <p class="subtitle" style="margin-bottom: 16px;">
          Daftar item obat yang dikecualikan dari kalkulasi total modal terikat, statistik visual, dan diagram sebar.
        </p>

        <div class="drawer-body">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Obat / SKU</th>
                  <th class="text-right">Stok</th>
                  <th class="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="ignoredItemsList.length === 0">
                  <td colspan="3" class="text-center" style="padding: 24px; color: var(--color-slate-600)">
                    Tidak ada item yang diabaikan.
                  </td>
                </tr>
                <tr v-for="item in ignoredItemsList" :key="item.id">
                  <td>
                    <div class="cell-medname">{{ item.medName }}</div>
                    <div class="cell-sku">{{ item.code || 'MS------' }}</div>
                  </td>
                  <td class="text-right font-semibold">{{ item.stockTotal }} {{ item.unit }}</td>
                  <td class="text-center">
                    <button type="button" class="btn btn-secondary" style="padding: 4px 8px; border-radius: 6px;" title="Pulihkan item" @click="restoreItem(item.id)">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
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
const showIgnoredDrawer = ref(false);
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

// Calculate the closest active expiration date assuming FEFO (First Expired, First Out)
function getClosestExpirationDate(item: RawStockItem): Date | null {
  if (!item.ExpireOverview || !Array.isArray(item.ExpireOverview) || item.ExpireOverview.length === 0) {
    return null;
  }

  // Parse batches with valid expiration dates
  const batches = item.ExpireOverview.map((b) => {
    const qty = typeof b.lastQuantity === "number" ? b.lastQuantity : 0;
    const date = b.lastExpire ? new Date(b.lastExpire) : null;
    return {
      qty,
      date,
    };
  }).filter((b): b is { qty: number; date: Date } => b.date !== null && !isNaN(b.date.getTime()));

  if (batches.length === 0) {
    return null;
  }

  // Sort batches by expiration date ascending (earliest first)
  batches.sort((a, b) => a.date.getTime() - b.date.getTime());

  const totalBatchQty = batches.reduce((sum, b) => sum + b.qty, 0);
  const stockTotal = typeof item.stockTotal === "number" ? item.stockTotal : 0;

  // Calculate consumed quantity (under FEFO, earliest batches are consumed first)
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
          activeBatches.push({
            qty: remainingQty,
            date: b.date,
          });
        }
      } else {
        // No more consumption, this batch is fully active
        activeBatches.push(b);
      }
    }

    if (activeBatches.length > 0) {
      return activeBatches[0].date;
    }
  }

  // Fallback if consumed <= 0 or if all batches were somehow depleted
  const positiveQtyBatches = batches.filter((b) => b.qty > 0);
  if (positiveQtyBatches.length > 0) {
    return positiveQtyBatches[0].date;
  }
  
  return batches[0].date;
}

// Format months to static 1 decimal text, removing .0 if integer
function formatMonths(months: number): string {
  const formatted = months.toFixed(1);
  return (formatted.endsWith(".0") ? months.toFixed(0) : formatted) + " bln";
}

// Process data items into full view objects (grouped by SKU/code)
const processedItems = computed<ProcessedItem[]>(() => {
  const now = new Date();
  const slowLimit = thresholds.value.slowMovingLimit;
  const deadLimit = thresholds.value.deadStockLimit;
  const edLimit = thresholds.value.edAlertLimit;

  // Group raw items by SKU (code) to prevent duplicates and merge stock levels/dates
  const groupedRawItems: RawStockItem[] = [];
  const skuMap = new Map<string, RawStockItem>();

  for (const item of items.value) {
    if (item.isDeleted || !(item.stockTotal > 0)) {
      continue;
    }

    const sku = item.code ? item.code.trim().toUpperCase() : "";
    if (!sku) {
      // Standalone item if no SKU is provided
      groupedRawItems.push(JSON.parse(JSON.stringify(item)));
      continue;
    }

    if (skuMap.has(sku)) {
      const existing = skuMap.get(sku)!;
      // Accumulate stock
      existing.stockTotal += item.stockTotal;
      
      // Merge ExpireOverview
      if (item.ExpireOverview && Array.isArray(item.ExpireOverview)) {
        existing.ExpireOverview = [
          ...(existing.ExpireOverview || []),
          ...item.ExpireOverview,
        ];
      }

      // Pick latest updatedAt/createdAt to reflect recent activity
      const existingDate = new Date(existing.updatedAt || existing.createdAt || 0);
      const itemDate = new Date(item.updatedAt || item.createdAt || 0);
      if (itemDate > existingDate) {
        existing.updatedAt = item.updatedAt;
        existing.createdAt = item.createdAt;
      }

      // Merge brand and names if missing
      if (!existing.brandName && item.brandName) {
        existing.brandName = item.brandName;
      }
      if (!existing.category && item.category) {
        existing.category = item.category;
      }

      // Keep prices if missing
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
    // Unmoved months calculation
    const lastUpdate = new Date(item.updatedAt || item.createdAt || now);
    const diffMs = now.getTime() - lastUpdate.getTime();
    const unmovedMonths = Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 30.4375));

    // Expiration months calculation
    const closestExpire = getClosestExpirationDate(item);
    let edMonths: number | null = null;
    if (closestExpire) {
      const diffEdMs = closestExpire.getTime() - now.getTime();
      edMonths = diffEdMs / (1000 * 60 * 60 * 24 * 30.4375);
    }

    // Unit cost
    const cost = item.avgHPP && item.avgHPP > 0 ? item.avgHPP : (item.buyFee || 0);
    const stockValue = item.stockTotal * cost;

    // Classification categories
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

    // Zones & naming
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

  // Search filter
  const search = filters.search.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (item) =>
        (item.medName && item.medName.toLowerCase().includes(search)) ||
        (item.code && item.code.toLowerCase().includes(search))
    );
  }

  // Classification filter
  if (filters.classification !== "all") {
    if (filters.classification === "slow") {
      result = result.filter((item) => item.unmovedMonths > thresholds.value.slowMovingLimit && item.unmovedMonths <= thresholds.value.deadStockLimit);
    } else if (filters.classification === "dead") {
      result = result.filter((item) => item.unmovedMonths > thresholds.value.deadStockLimit);
    } else {
      result = result.filter((item) => item.zone === filters.classification);
    }
  }

  // Inactive Age filter
  if (filters.inactiveAge !== "all") {
    const age = Number(filters.inactiveAge);
    result = result.filter((item) => item.unmovedMonths > age);
  }

  // ED Limit filter
  if (filters.edLimit !== "all") {
    if (filters.edLimit === "expired") {
      result = result.filter((item) => item.edMonths !== null && item.edMonths <= 0);
    } else {
      const limit = Number(filters.edLimit);
      result = result.filter((item) => item.edMonths !== null && item.edMonths > 0 && item.edMonths < limit);
    }
  }

  // Sort Order
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
    // We cap unmoved months at 6 for clean visual boundaries, but store actual value
    const displayX = Math.min(6, item.unmovedMonths);
    const displayY = item.edMonths === null ? 24 : Math.max(0, Math.min(24, item.edMonths));
    
    // Color mapping
    let color = "#10b981"; // green (sehat)
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
        lineStyle: {
          color: "#f1f5f9",
        },
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
        lineStyle: {
          color: "#f1f5f9",
        },
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

// Excel Export trigger
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

// Lifecycle Hooks
onMounted(async () => {
  await loadPersistentState();
  await reloadData();
  
  // Setup charts
  initChart();

  // Resize listener
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

// Reactivity watchers to redraw ECharts
watch([activeItems, thresholds], () => {
  updateChartOptions();
}, { deep: true });
</script>
