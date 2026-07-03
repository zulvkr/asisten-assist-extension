<template>
  <main class="comparison-root">
    <!-- Mode Selector: Date vs All Items -->
    <section class="mode-selector-section">
      <div class="mode-selector-pill">
        <button
          type="button"
          :class="['mode-btn', comparisonMode === 'dates' && 'active']"
          @click="setComparisonMode('dates')"
        >
          Berdasarkan Tanggal
        </button>
        <button
          type="button"
          :class="['mode-btn', comparisonMode === 'all' && 'active']"
          @click="setComparisonMode('all')"
        >
          Semua Item
        </button>
      </div>
    </section>

    <!-- Date Filters (Only shown if comparisonMode is 'dates') -->
    <section v-if="comparisonMode === 'dates'" class="filters-row date-filters">
      <div class="filter-group">
        <label>Mulai</label>
        <input v-model="startDate" type="date" />
      </div>
      <div class="filter-group">
        <label>Akhir</label>
        <input v-model="endDate" type="date" />
      </div>
      <div class="filter-group">
        <label>Sumber</label>
        <select v-model="source">
          <option value="both">Both</option>
          <option value="assist">Assist</option>
          <option value="desty">Desty Omni</option>
        </select>
      </div>
    </section>

    <!-- Main Control Bar (Search, Dropdown Status, Run Button) -->
    <section class="controls-bar">
      <!-- Search Input -->
      <div class="search-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari SKU atau nama produk..."
          class="search-input"
        />
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>

      <!-- Custom Dropdown Selector for Status Kesesuaian -->
      <div ref="selectContainerRef" class="custom-select-container">
        <span class="custom-select-label">Status Kesesuaian</span>
        <div class="custom-select-trigger" @click="toggleDropdown">
          <span class="selected-text">{{ selectedKesesuaian }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div v-if="dropdownOpen" class="custom-select-options">
          <div
            v-for="opt in kesesuaianDropdownOptions"
            :key="opt"
            class="custom-select-option"
            :class="{ active: selectedKesesuaian === opt }"
            @click="selectKesesuaian(opt)"
          >
            {{ opt }}
          </div>
        </div>
      </div>

      <!-- Run Button -->
      <button
        type="button"
        class="btn-run"
        :disabled="loading"
        @click="runComparison"
      >
        <svg v-if="!loading" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        <span v-else class="spinner"></span>
        {{ loading ? "Memuat..." : "Jalankan Perbandingan" }}
      </button>
    </section>

    <!-- Additional Filters: Tindakan (Shown if there are options) -->
    <section v-if="attentionFilterOptions.length" class="label-filters">
      <span class="label-filters__title">Filter tindakan:</span>
      <label
        v-for="option in attentionFilterOptions"
        :key="option"
        class="label-filter-chip"
      >
        <input
          :checked="activeAttentionFilters.includes(option)"
          type="checkbox"
          @change="toggleAttentionFilter(option)"
        />
        <span>{{ option }}</span>
      </label>
      <button
        v-if="activeAttentionFilters.length"
        type="button"
        class="button-secondary"
        @click="clearAttentionFilters"
      >
        Reset Tindakan
      </button>
    </section>

    <p :class="['state-msg', validationState]">{{ validationMessage }}</p>

    <ul v-if="warnings.length" class="warning-list">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>

    <section class="table-wrap">
      <p v-if="!rows.length" class="empty">
        Belum ada hasil. Klik "Jalankan Perbandingan".
      </p>

      <p v-else-if="!filteredRows.length" class="empty">
        Tidak ada hasil yang cocok dengan filter aktif.
      </p>

      <table v-else class="result-table">
        <thead>
          <tr>
            <th class="col-sku">SKU</th>
            <th class="col-name"></th>
            <th class="col-stock">Stok Apotek</th>
            <th class="col-stock">Stok Desty</th>
            <th class="col-status-desty">Status Desty</th>
            <th class="col-kesesuaian">Status Kesesuaian</th>
            <th class="col-action">Tindakan</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredRows"
            :key="`${row.medicineId}-${row.sku ?? ''}-${row.itemName}`"
            :class="{
              'row-no-sku': row.kesesuaian === 'SKU belum diisi',
              'row-mismatch': row.kesesuaian === 'Tidak Sesuai',
            }"
          >
            <td class="cell-sku">
              {{ row.sku || "-" }}
            </td>
            <td class="cell-name">
              {{ row.itemName }}
              <div v-if="row.kodeObat" class="sub-code">Kode: {{ row.kodeObat }}</div>
            </td>
            <td class="cell-stock text-right">
              {{ row.assistStock !== null ? row.assistStock : "-" }}
            </td>
            <td class="cell-stock text-right">
              {{ row.destyStock !== null ? row.destyStock : "-" }}
            </td>
            <td class="cell-status-desty">
              <template v-if="row.destyStockDetail">
                <div class="desty-detail-item">
                  Fisik: {{ formatStockValue(row.destyStockDetail.fisik) }}
                </div>
                <div class="desty-detail-item">
                  Tersedia: {{ formatStockValue(row.destyStockDetail.tersedia) }}
                </div>
              </template>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="cell-kesesuaian">
              <span
                :class="[
                  'badge-kesesuaian',
                  getKesesuaianClass(row.kesesuaian)
                ]"
                :title="row.notes.join(' | ')"
              >
                {{ row.kesesuaian }}
              </span>
            </td>
            <td class="cell-action">
              <span
                v-if="row.attentionLabel"
                :class="[
                  'attention-label',
                  row.attentionTone && `attention-label--${row.attentionTone}`,
                ]"
              >
                {{ row.attentionLabel }}
              </span>
              <span v-else class="attention-label-none">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { requestAssistTokenFromOpenTabs } from "@/composables/assistTokenManager";
import { requestDestyTokenFromOpenTabs } from "@/composables/destyOmniTokenManager";
import {
  type KesesuaianStock,
  type StockComparisonRow,
} from "@/utils/compareStockLevels";
import {
  DEFAULT_MAX_DATE_RANGE_DAYS,
  validateDateRangeLimit,
} from "@/utils/validateDateRangeLimit";

type ValidationState = "muted" | "ok" | "error";
type DataSource = "assist" | "desty" | "both";

const todayDate = new Date();
const lastWeekDate = new Date(todayDate);
lastWeekDate.setDate(lastWeekDate.getDate() - 7);

const comparisonMode = ref<"dates" | "all">("dates");
const startDate = ref(formatDateForInput(lastWeekDate));
const endDate = ref(formatDateForInput(todayDate));
const searchQuery = ref("");
const selectedKesesuaian = ref<string>("All");
const dropdownOpen = ref(false);
const selectContainerRef = ref<HTMLElement | null>(null);

const rows = ref<StockComparisonRow[]>([]);
const validationMessage = ref("");
const validationState = ref<ValidationState>("muted");
const warnings = ref<string[]>([]);
const loading = ref(false);
const source = ref<DataSource>("both");
const activeAttentionFilters = ref<string[]>([]);

const kesesuaianDropdownOptions = [
  "All",
  "Sesuai",
  "Tidak Sesuai",
  "Hanya di Assist",
  "Hanya di Desty",
];

const sortedRows = computed(() => {
  const data = [...rows.value];
  // Prioritize mismatched and one-sided items, then by item name
  return data.sort((a, b) => {
    const rankA = kesesuaianRank(a.kesesuaian);
    const rankB = kesesuaianRank(b.kesesuaian);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.itemName.localeCompare(b.itemName);
  });
});

const filteredRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  
  const matchesSearch = (row: StockComparisonRow) => {
    if (!query) return true;
    return (
      row.itemName.toLowerCase().includes(query) ||
      (row.sku && row.sku.toLowerCase().includes(query)) ||
      (row.kodeObat && row.kodeObat.toLowerCase().includes(query))
    );
  };

  const matchesKesesuaian = (row: StockComparisonRow) => {
    if (selectedKesesuaian.value === "All") return true;
    return row.kesesuaian === selectedKesesuaian.value;
  };

  const matchesAttention = (row: StockComparisonRow) => {
    if (!activeAttentionFilters.value.length) return true;
    const norm = normalizeAttentionFilterLabel(row.attentionLabel);
    return norm !== null && activeAttentionFilters.value.includes(norm);
  };

  return sortedRows.value.filter(
    (row) => matchesSearch(row) && matchesKesesuaian(row) && matchesAttention(row)
  );
});

const attentionFilterOptions = computed(() => {
  return Array.from(
    new Set(
      rows.value
        .map((row) => normalizeAttentionFilterLabel(row.attentionLabel))
        .filter((label): label is string => Boolean(label)),
    ),
  ).sort((left, right) => left.localeCompare(right));
});

function setComparisonMode(mode: "dates" | "all") {
  comparisonMode.value = mode;
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value;
}

function selectKesesuaian(option: string) {
  selectedKesesuaian.value = option;
  dropdownOpen.value = false;
}

function handleDocumentClick(e: MouseEvent) {
  if (selectContainerRef.value && !selectContainerRef.value.contains(e.target as Node)) {
    dropdownOpen.value = false;
  }
}

function refreshExtension() {
  window.location.reload();
}

async function runComparison() {
  if (comparisonMode.value !== "all") {
    const validation = validateDateRangeLimit(
      new Date(startDate.value),
      new Date(endDate.value),
      DEFAULT_MAX_DATE_RANGE_DAYS,
    );

    if (!validation.valid) {
      validationState.value = "error";
      validationMessage.value =
        validation.reason ?? "Rentang tanggal tidak valid.";
      rows.value = [];
      warnings.value = [];
      return;
    }
  }

  loading.value = true;
  warnings.value = [];

  try {
    const assistTokenResult = await requestAssistTokenFromOpenTabs();
    if (!assistTokenResult.token) {
      if (assistTokenResult.warnings.length) {
        warnings.value.push(...assistTokenResult.warnings);
      }

      throw new Error(
        "Token Assist tidak ditemukan. Buka dan login ke clinica.assist.id, lalu coba lagi.",
      );
    }

    const assistToken = assistTokenResult.token;

    let destyToken = "";
    let destyTenantId = "";
    let destyMasterWarehouseId = "";

    if (source.value !== "assist") {
      const destyTokenResult = await requestDestyTokenFromOpenTabs();
      destyToken = destyTokenResult.token;
      destyTenantId = destyTokenResult.tenantId;
      destyMasterWarehouseId = destyTokenResult.masterWarehouseId;
      if (destyTokenResult.warnings.length) {
        warnings.value.push(...destyTokenResult.warnings);
      }
    }

    const response = (await browser.runtime.sendMessage({
      type: "FETCH_STOCK_COMPARISON",
      payload: {
        comparisonMode: comparisonMode.value,
        startDate: startDate.value,
        endDate: endDate.value,
        source: source.value,
        assistToken,
        destyToken,
        destyTenantId,
        destyMasterWarehouseId,
      },
    })) as
      | { ok: true; data: StockComparisonRow[]; warnings?: string[] }
      | { ok: false; error?: string }
      | undefined;

    if (!response?.ok) {
      throw new Error(response?.error ?? "Gagal memuat data perbandingan.");
    }

    rows.value = response.data;
    warnings.value = response.warnings ?? [];
    validationState.value = "ok";

    if (comparisonMode.value === "all") {
      validationMessage.value = `Berhasil memuat perbandingan semua item (${rows.value.length} item).`;
    } else {
      const validation = validateDateRangeLimit(
        new Date(startDate.value),
        new Date(endDate.value),
        DEFAULT_MAX_DATE_RANGE_DAYS,
      );
      validationMessage.value = `Rentang valid: ${validation.days} hari dari batas ${DEFAULT_MAX_DATE_RANGE_DAYS} hari.`;
    }
  } catch (error) {
    rows.value = [];
    warnings.value = [];
    validationState.value = "error";
    validationMessage.value =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat memuat data.";
  } finally {
    loading.value = false;
  }
}

function toggleAttentionFilter(option: string) {
  if (activeAttentionFilters.value.includes(option)) {
    activeAttentionFilters.value = activeAttentionFilters.value.filter(
      (value) => value !== option,
    );
    return;
  }

  activeAttentionFilters.value = [...activeAttentionFilters.value, option];
}

function clearAttentionFilters() {
  activeAttentionFilters.value = [];
}

function normalizeAttentionFilterLabel(label: string | null): string | null {
  if (!label) {
    return null;
  }

  if (label.startsWith("Potensi kehilangan penjualan")) {
    return "Potensi kehilangan penjualan online";
  }

  return label;
}

function getKesesuaianClass(kesesuaian: KesesuaianStock): string {
  switch (kesesuaian) {
    case "Sesuai":
      return "badge-kesesuaian--sesuai";
    case "Tidak Sesuai":
      return "badge-kesesuaian--tidak-sesuai";
    case "SKU belum diisi":
      return "badge-kesesuaian--no-sku";
    case "Hanya di Assist":
      return "badge-kesesuaian--hanya-assist";
    case "Hanya di Desty":
      return "badge-kesesuaian--hanya-desty";
    default:
      return "";
  }
}

function kesesuaianRank(kesesuaian: KesesuaianStock): number {
  switch (kesesuaian) {
    case "Tidak Sesuai":
      return 1;
    case "Hanya di Assist":
      return 2;
    case "Hanya di Desty":
      return 3;
    case "SKU belum diisi":
      return 4;
    case "Sesuai":
      return 5;
    default:
      return 99;
  }
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatStockValue(value: number | null | undefined): string {
  return typeof value === "number" && !Number.isNaN(value)
    ? String(value)
    : "-";
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick);
});
</script>

<style>
/* Base Overrides and Custom Premium Styling */
.comparison-root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
  background-color: #fafbfc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  color: #1e293b;
}

/* Header styling */
.comparison-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.comparison-header h1 {
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.comparison-header p {
  font-size: 14px;
  color: #64748b;
  margin: 4px 0 0;
}

.btn-refresh-ext {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background-color: #ffffff;
  color: #0ea5e9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn-refresh-ext:hover {
  background-color: #f8fafc;
  border-color: #cbd5e1;
  color: #0284c7;
}

/* Tab Header styled navigation link */
.tabs-nav {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 24px;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 600;
  color: #00afcc;
  border-bottom: 2px solid #00afcc;
  cursor: default;
}

.tab-icon {
  stroke: #00afcc;
}

/* Mode Selector Section */
.mode-selector-section {
  display: flex;
  margin-bottom: 20px;
}

.mode-selector-pill {
  display: inline-flex;
  background-color: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.mode-btn {
  border: none;
  background: transparent;
  color: #475569;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn.active {
  background-color: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Filters Row */
.filters-row.date-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
  background: #ffffff;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
}

.filter-group label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.filter-group input[type="date"],
.filter-group select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  background-color: #ffffff;
  outline: none;
}

/* Control Bar (Search, Dropdown, Button) */
.controls-bar {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 16px;
  align-items: end;
  margin-bottom: 24px;
}

/* Search Wrapper */
.search-wrapper {
  position: relative;
  width: 100%;
}

.search-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 10px 16px 10px 38px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #00afcc;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

/* Custom Dropdown select */
.custom-select-container {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 200px;
  user-select: none;
}

.custom-select-label {
  font-size: 11px;
  font-weight: 700;
  color: #00afcc;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.custom-select-trigger {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #00afcc;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  background-color: #ffffff;
  cursor: pointer;
  transition: all 0.2s;
  height: 40px;
  box-sizing: border-box;
}

.custom-select-trigger:hover {
  background-color: #f0fdfa;
}

.custom-select-options {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  z-index: 100;
  overflow: hidden;
  padding: 4px 0;
}

.custom-select-option {
  padding: 8px 14px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
  transition: background-color 0.15s;
}

.custom-select-option:hover {
  background-color: #f1f5f9;
}

.custom-select-option.active {
  background-color: #e0f2fe;
  color: #0369a1;
  font-weight: 600;
}

/* Button Run perbandingan */
.btn-run {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: #00afcc;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
  height: 40px;
  box-sizing: border-box;
}

.btn-run:hover:not(:disabled) {
  background-color: #00839a;
}

.btn-run:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}

.btn-icon {
  stroke: #ffffff;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffffff;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Result Table Styling */
.table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  background-color: #ffffff;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
}

.result-table th {
  background-color: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}

.result-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
  vertical-align: middle;
  color: #334155;
}

.result-table tbody tr:hover td {
  background-color: #f8fafc;
}

/* Specific columns */
.col-sku { width: 18%; }
.col-name { width: 32%; }
.col-stock { width: 10%; text-align: right; }
.col-status-desty { width: 16%; }
.col-kesesuaian { width: 14%; }
.col-action { width: 10%; }

.cell-sku {
  font-family: monospace;
  font-weight: 600;
  color: #475569;
}

.cell-name {
  font-weight: 500;
  color: #0f172a;
}

.sub-code {
  font-size: 11px;
  color: #64748b;
  margin-top: 3px;
  font-family: monospace;
}

.text-right {
  text-align: right !important;
}

.desty-detail-item {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

/* Badges for status kesesuaian */
.badge-kesesuaian {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.badge-kesesuaian--sesuai {
  background-color: #f0fdf4;
  color: #16a34a;
  border: 1px solid #dcfce7;
}

.badge-kesesuaian--tidak-sesuai {
  background-color: #fffbeb;
  color: #d97706;
  border: 1px solid #fef3c7;
}

.badge-kesesuaian--no-sku {
  background-color: #fff7ed;
  color: #ea580c;
  border: 1px solid #ffedd5;
}

.badge-kesesuaian--hanya-assist {
  background-color: #f8fafc;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.badge-kesesuaian--hanya-desty {
  background-color: #fdf2f8;
  color: #db2777;
  border: 1px solid #fbcfe8;
}

/* Action Labels */
.attention-label {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.attention-label--red {
  background-color: #fef2f2;
  color: #ef4444;
  border: 1px solid #fee2e2;
}

.attention-label--yellow {
  background-color: #fffbeb;
  color: #d97706;
  border: 1px solid #fef3c7;
}

.attention-label--orange {
  background-color: #fff7ed;
  color: #ea580c;
  border: 1px solid #ffedd5;
}

.attention-label-none {
  color: #94a3b8;
}

/* Row states */
.row-no-sku td {
  background-color: #fffbeb;
}
.row-mismatch td {
  background-color: #fffbeb;
}

@media (max-width: 1024px) {
  .controls-bar {
    grid-template-columns: 1fr auto;
  }
  .btn-run {
    grid-column: span 2;
  }
}
</style>
