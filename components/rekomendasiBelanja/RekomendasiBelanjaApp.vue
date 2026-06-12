<template>
  <main class="recommendation-root">
    <!-- Header Section -->
    <header class="dashboard-header">
      <div class="header-title-area">
        <div class="title-with-icon">
          <span class="icon-logo">📊</span>
          <h1>Rekomendasi Belanja</h1>
        </div>
        <p class="subtitle">Optimalkan perputaran modal menggunakan visualisasi status lampu lalu lintas.</p>
      </div>
      <button 
        type="button" 
        class="settings-toggle-btn"
        @click="showSettingsPanel = !showSettingsPanel"
      >
        <span class="gear-icon">⚙️</span>
        Konfigurasi Parameter
      </button>
    </header>

    <!-- Settings Panel (Collapsible) -->
    <transition name="slide">
      <section v-show="showSettingsPanel" class="panel settings-panel">
        <div class="panel-title">
          <h2>Pengaturan Parameter</h2>
        </div>
        <p class="panel-desc">Lookback tetap 30 hari. Default disimpan lokal di extension.</p>
        
        <div class="settings-grid">
          <div class="field">
            <label for="defaultLeadTime">Lead time (hari)</label>
            <input
              id="defaultLeadTime"
              v-model.number="formSettings.defaultLeadTime"
              type="number"
              min="1"
              step="1"
            />
          </div>
          <div class="field">
            <label for="cheapProductMaxPrice">Batas harga murah (Rp)</label>
            <input
              id="cheapProductMaxPrice"
              v-model.number="formSettings.cheapProductMaxPrice"
              type="number"
              min="0"
              step="100"
            />
          </div>
          <div class="field">
            <label for="fastMovingMinDailySales">Min/hari cepat</label>
            <input
              id="fastMovingMinDailySales"
              v-model.number="formSettings.fastMovingMinDailySales"
              type="number"
              min="0"
              step="0.1"
            />
          </div>
          <div class="field">
            <label for="cheapFastMovingLeadTime">Lead cepat (hari)</label>
            <input
              id="cheapFastMovingLeadTime"
              v-model.number="formSettings.cheapFastMovingLeadTime"
              type="number"
              min="1"
              step="1"
            />
          </div>
          <div class="field">
            <label for="targetStockDays">Target hari stok</label>
            <input
              id="targetStockDays"
              v-model.number="formSettings.targetStockDays"
              type="number"
              min="1"
              step="1"
            />
          </div>
        </div>

        <div class="action-row" style="margin-top: 18px">
          <button
            type="button"
            class="primary-btn"
            :disabled="loading || !settingsDirty"
            @click="applySettings"
          >
            Terapkan &amp; Simpan Default
          </button>
          <button
            type="button"
            class="ghost-button"
            :disabled="!settingsDirty"
            @click="resetSettingsForm"
          >
            Reset Form
          </button>
          <span class="meta-status">
            {{
              settingsDirty
                ? "Ada perubahan yang belum diterapkan."
                : "Form sinkron dengan default tersimpan."
            }}
          </span>
        </div>

        <!-- Ignored Products List -->
        <div class="ignored-list-section" style="margin-top: 18px; border-top: 1px dashed #e2e8f0; padding-top: 14px;">
          <h3 style="font-size: 13.5px; font-weight: 700; margin: 0 0 8px 0; color: var(--color-slate-900);">Produk Diabaikan ({{ Object.keys(ignoredItemIds).length }})</h3>
          <div v-if="Object.keys(ignoredItemIds).length === 0" class="meta-status">
            Tidak ada produk yang diabaikan.
          </div>
          <div v-else class="ignored-items-list" style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
            <div v-for="(ignored, itemId) in ignoredItemIds" :key="itemId" class="ignored-item-row" style="display: flex; justify-content: space-between; align-items: center; background: var(--color-slate-50); padding: 6px 12px; border-radius: 8px; font-size: 12px; border: 1px solid #e2e8f0;">
              <div>
                <strong style="color: var(--color-slate-900);">{{ getProductName(itemId) }}</strong>
                <small style="color: var(--color-slate-600); margin-left: 8px;">{{ getProductCode(itemId) }}</small>
              </div>
              <button type="button" class="primary-btn sm-btn" style="padding: 4px 8px; font-size: 11px;" @click="restoreItem(itemId)">Restore</button>
            </div>
          </div>
        </div>
      </section>
    </transition>

    <!-- KPI Summary Section -->
    <section class="kpi-grid">
      <article class="kpi-card kpi-red">
        <div class="kpi-header">
          <h3>MERAH (KRITIS - &lt; 3 HARI)</h3>
          <span class="kpi-icon text-red">⚠️</span>
        </div>
        <strong class="kpi-value text-red">{{ kpis.redCount }}</strong>
        <p class="kpi-footer">Harus diorder hari ini juga</p>
      </article>

      <article class="kpi-card kpi-yellow">
        <div class="kpi-header">
          <h3>KUNING (PERINGATAN - 4..30 HARI)</h3>
          <span class="kpi-icon text-yellow">⚠️</span>
        </div>
        <strong class="kpi-value text-yellow">{{ kpis.yellowCount }}</strong>
        <p class="kpi-footer">Zona aman belanja mingguan</p>
      </article>

      <article class="kpi-card kpi-green">
        <div class="kpi-header">
          <h3>HIJAU (AMAN - &gt; 30 HARI)</h3>
          <span class="kpi-icon text-green">✔️</span>
        </div>
        <strong class="kpi-value text-green">{{ kpis.greenCount }}</strong>
        <p class="kpi-footer">Lewati dulu untuk hemat modal</p>
      </article>

      <article class="kpi-card kpi-budget">
        <div class="kpi-header">
          <h3>ESTIMASI MODAL BELANJA</h3>
          <span class="kpi-icon text-blue">💵</span>
        </div>
        <strong class="kpi-value text-blue">{{ formatRupiah(kpis.estimatedBudget) }}</strong>
        <p class="kpi-footer">Berdasarkan data merah &amp; kuning</p>
      </article>
    </section>

    <p v-if="errorMessage" class="state-banner error">{{ errorMessage }}</p>
    <p v-else-if="infoMessage" class="state-banner info">{{ infoMessage }}</p>

    <!-- Filter Panel -->
    <section class="panel filter-panel">
      <div class="filter-main-row">
        <!-- Search -->
        <div class="filter-search-box">
          <span class="search-icon">🔍</span>
          <input
            id="searchInput"
            v-model.trim="filters.search"
            type="search"
            placeholder="Cari obat atau SKU..."
          />
        </div>

        <!-- Status Filter Chips -->
        <div class="filter-group">
          <span class="filter-label">Status:</span>
          <div class="chip-group">
            <button 
              type="button" 
              class="chip-btn" 
              :class="{ active: filters.statusGroup === 'all' }"
              @click="filters.statusGroup = 'all'"
            >
              Semua
            </button>
            <button 
              type="button" 
              class="chip-btn" 
              :class="{ active: filters.statusGroup === 'red-yellow' }"
              @click="filters.statusGroup = 'red-yellow'"
            >
              <span class="status-dots"><span class="dot red"></span><span class="dot yellow"></span></span>
            </button>
            <button 
              type="button" 
              class="chip-btn" 
              :class="{ active: filters.statusGroup === 'red' }"
              @click="filters.statusGroup = 'red'"
            >
              Kritis
            </button>
            <button 
              type="button" 
              class="chip-btn" 
              :class="{ active: filters.statusGroup === 'yellow' }"
              @click="filters.statusGroup = 'yellow'"
            >
              Peringatan
            </button>
            <button 
              type="button" 
              class="chip-btn" 
              :class="{ active: filters.statusGroup === 'green' }"
              @click="filters.statusGroup = 'green'"
            >
              Aman
            </button>
          </div>
        </div>

        <!-- Pesanan Filter Chips -->
        <div class="filter-group">
          <span class="filter-label">Pesanan:</span>
          <div class="chip-group">
            <button 
              type="button" 
              class="chip-btn" 
              :class="{ active: filters.orderedFilter === 'all' }"
              @click="filters.orderedFilter = 'all'"
            >
              Semua
            </button>
            <button 
              type="button" 
              class="chip-btn" 
              :class="{ active: filters.orderedFilter === 'ordered' }"
              @click="filters.orderedFilter = 'ordered'"
            >
              📦 Dipesan
            </button>
            <button 
              type="button" 
              class="chip-btn" 
              :class="{ active: filters.orderedFilter === 'not-ordered' }"
              @click="filters.orderedFilter = 'not-ordered'"
            >
              🛒 Belum
            </button>
          </div>
        </div>
      </div>

      <!-- Opportunity Analysis Tabs -->
      <div class="tab-filters-row">
        <span class="tab-label">Analisis Peluang:</span>
        <div class="tabs-group">
          <button
            v-for="filterOption in quickFilterOptions"
            :key="filterOption.key"
            type="button"
            class="tab-btn"
            :class="{ active: filters.quickFilter === filterOption.key }"
            @click="filters.quickFilter = filterOption.key"
          >
            {{ filterOption.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- Catalog Quick Add Section -->
    <section class="panel catalog-panel">
      <div class="panel-title">
        <h2>Tambah dari Katalog</h2>
      </div>
      <div class="field">
        <input
          id="manualSearch"
          v-model.trim="manualSearch"
          type="search"
          placeholder="Cari item katalog penuh Assist untuk ditambahkan ke pesanan..."
        />
      </div>

      <div v-if="catalogSearchResults.length" class="catalog-results">
        <article
          v-for="item in catalogSearchResults"
          :key="item.itemId"
          class="catalog-item"
        >
          <div class="catalog-info">
            <h3>{{ item.itemName }}</h3>
            <p>
              {{ item.code || "Tanpa kode" }} •
              {{ item.brandName || "Tanpa brand" }} •
              {{ item.unit || "Tanpa unit" }} • {{ formatRupiah(item.buyFee) }}
            </p>
          </div>
          <button
            type="button"
            class="primary-btn sm-btn"
            @click="seedDraftFromCatalog(item)"
          >
            Tandai Dipesan
          </button>
        </article>
      </div>
      <p v-else-if="manualSearch.length >= 2" class="empty-state">
        Tidak ada produk katalog yang cocok.
      </p>
    </section>

    <!-- Recommendations Table Section -->
    <section class="table-panel">
      <header class="table-header">
        <div class="table-title-area">
          <h2>Tabel Rekomendasi</h2>
          <p class="meta-info">{{ generatedLabel }}</p>
        </div>
        
        <div class="table-actions-area">
          <button
            type="button"
            class="ghost-button"
            :disabled="!filteredRowsToOrder.length"
            @click="orderAllFilteredRows"
          >
            Tandai Semua Dipesan ({{ filteredRowsToOrder.length }})
          </button>
          
          <button
            type="button"
            class="ghost-button"
            :disabled="!draftRows.length"
            @click="clearAllOrders"
          >
            Kosongkan Pesanan
          </button>

          <button
            type="button"
            class="primary-btn"
            :disabled="!draftRows.length"
            @click="openDraftReview"
          >
            Generate Draft Belanja
          </button>
        </div>
      </header>

      <div v-if="loading" class="empty-state">
        Memuat rekomendasi belanja...
      </div>

      <div v-else-if="!filteredRows.length" class="empty-state">
        Belum ada baris yang cocok dengan filter aktif.
      </div>

      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>NAMA OBAT</th>
              <th>STOK SAAT INI</th>
              <th>ROP (UNIT)</th>
              <th class="text-center">SEDANG DIPESAN</th>
              <th>KECEPATAN JUAL (30 HARI)</th>
              <th>HARI TERSISA</th>
              <th>STATUS</th>
              <th>RESTOK DASAR</th>
              <th>RESTOK EXTRA</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="row.itemId"
              :class="{ 'active-row': selectedInsightItemId === row.itemId }"
              @click="handleRowClick(row, $event)"
            >
              <td class="product-cell">
                <strong class="product-name">{{ row.itemName }}</strong>
                <div class="product-meta">
                  {{ row.code || "Tanpa kode" }}
                </div>
                <div class="table-indicators" style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                  <span
                    v-for="indicator in getRowIndicators(row)"
                    :key="indicator.key"
                    :class="['indicator-icon', `indicator-${indicator.tone}`]"
                    role="img"
                    :aria-label="indicator.tooltip"
                    :title="indicator.tooltip"
                  >
                    {{ indicator.icon }}
                  </span>
                  <button
                    type="button"
                    class="ignore-link-btn"
                    title="Abaikan produk ini"
                    @click.stop="ignoreItem(row.itemId)"
                    style="background: none; border: none; padding: 0; color: #ef4444; font-size: 11px; cursor: pointer; text-decoration: underline;"
                  >
                    Abaikan
                  </button>
                </div>
              </td>
              <td class="stock-cell">{{ row.stockTotal }} {{ row.unit }}</td>
              <td class="rop-cell">{{ row.rop }} {{ row.unit }}</td>
              <td class="text-center checkbox-cell">
                <input
                  type="checkbox"
                  class="pending-checkbox"
                  :checked="row.pendingOrderQty > 0"
                  @change="togglePendingOrder(row)"
                  @click.stop
                />
              </td>
              <td>{{ formatDailySales(row.averageDailySales) }}/hari</td>
              <td>
                <span :class="['days-left', { 'critical': row.estimatedDaysRemaining <= row.leadTimeLimit }]">
                  {{ formatDays(row.estimatedDaysRemaining) }} hari
                </span>
              </td>
              <td>
                <span :class="['status-badge', `status-${row.statusColor}`]">
                  {{ statusLabel(row.statusColor) }}
                </span>
              </td>
              <td class="restock-cell">
                <strong>{{ row.replenishSuggestedQty }} {{ row.unit }}</strong>
              </td>
              <td class="restock-cell extra">
                {{ row.growthSuggestedQty > 0 ? `${row.growthSuggestedQty} ${row.unit}` : "-" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Product Insights Drawer -->
    <aside v-if="selectedInsightRow" class="insights-drawer">
      <div class="insights-header">
        <div>
          <p class="eyebrow">Product Insights</p>
          <h2>{{ selectedInsightRow.itemName }}</h2>
          <p class="meta">
            {{ selectedInsightRow.code || "Tanpa kode" }} •
            {{ selectedInsightRow.brandName || "Tanpa brand" }} •
            {{ selectedInsightRow.unit || "Tanpa unit" }}
          </p>
        </div>
        <button type="button" class="ghost-button" @click="closeInsights">
          Tutup
        </button>
      </div>

      <div class="insights-badges">
        <span
          :class="['status-badge', `status-${selectedInsightRow.statusColor}`]"
        >
          {{ statusLabel(selectedInsightRow.statusColor) }}
        </span>
        <span v-if="selectedInsightRow.isCappedDemand" class="tag tag-capped"
          >Demand terhambat</span
        >
        <span v-if="selectedInsightRow.isGoldenProduct" class="tag tag-golden"
          >Produk emas</span
        >
        <span v-if="selectedInsightRow.isDeadStock" class="tag tag-dead"
          >Stok mati</span
        >
        <span
          v-if="selectedInsightRow.hasUnitHistoryWarning"
          class="tag tag-review"
          :title="selectedInsightRow.unitHistoryWarning"
          >Riwayat unit campur</span
        >
      </div>

      <div class="insight-card-grid">
        <article class="insight-card emphasis-card">
          <h3>Rekomendasi Belanja</h3>
          <div class="metric-pair">
            <span>Replenish</span>
            <strong>{{ selectedInsightRow.replenishSuggestedQty }}</strong>
          </div>
          <div class="metric-pair">
            <span>Growth</span>
            <strong>{{ selectedInsightRow.growthSuggestedQty }}</strong>
          </div>
          <div class="metric-pair">
            <span>Total sistem</span>
            <strong>{{ selectedInsightRow.calculatedSuggestedQty }}</strong>
          </div>
          <details class="inline-disclosure drawer-disclosure">
            <summary>Alasan saran</summary>
            <p class="drawer-note">
              {{ selectedInsightRow.growthRecommendationNote }}
            </p>
          </details>
        </article>

        <article class="insight-card">
          <h3>Harga & Margin</h3>
          <div class="metric-pair">
            <span>Buy Fee</span>
            <strong>{{ formatRupiah(selectedInsightRow.buyFee) }}</strong>
          </div>
          <div class="metric-pair">
            <span>Selling Price</span>
            <strong>{{
              formatRupiah(selectedInsightRow.sellNormalFee)
            }}</strong>
          </div>
          <div class="metric-pair">
            <span>Margin/unit</span>
            <strong>{{
              formatRupiah(resolveUnitMargin(selectedInsightRow))
            }}</strong>
          </div>
        </article>

        <article class="insight-card">
          <h3>Velocity</h3>
          <div class="metric-pair">
            <span>Standard</span>
            <strong
              >{{
                formatDailySales(selectedInsightRow.averageDailySales)
              }}/hari</strong
            >
          </div>
          <div class="metric-pair">
            <span>True velocity</span>
            <strong
              >{{
                formatDailySales(selectedInsightRow.trueVelocity)
              }}/hari</strong
            >
          </div>
          <div class="metric-pair">
            <span>Growth potential</span>
            <strong>{{
              formatPercent(selectedInsightRow.potentialSalesGrowthPercent)
            }}</strong>
          </div>
        </article>

        <article class="insight-card">
          <h3>Coverage</h3>
          <div class="metric-pair">
            <span>Stok fisik</span>
            <strong>{{ selectedInsightRow.stockTotal }}</strong>
          </div>
          <div class="metric-pair">
            <span>Pending order</span>
            <strong>{{ selectedInsightRow.pendingOrderQty }}</strong>
          </div>
          <div class="metric-pair">
            <span>Coverage aktual</span>
            <strong
              >{{
                formatDays(selectedInsightRow.estimatedDaysRemaining)
              }}
              hari</strong
            >
          </div>
          <div class="metric-pair">
            <span>Demand constrained</span>
            <strong
              >{{
                formatDays(selectedInsightRow.estimatedDemandConstraintDays)
              }}
              hari</strong
            >
          </div>
          <div class="meter">
            <span
              :style="{ width: `${constraintMeterWidth(selectedInsightRow)}%` }"
            />
          </div>
        </article>

        <article class="insight-card">
          <h3>Peluang Bisnis</h3>
          <div class="metric-pair">
            <span>Potensi rugi omzet</span>
            <strong>{{
              formatRupiah(selectedInsightRow.potentialIncomeLoss)
            }}</strong>
          </div>
          <div class="metric-pair">
            <span>Sisa setelah draft</span>
            <strong>{{ selectedInsightRow.remainingSuggestedQty }}</strong>
          </div>
          <div class="metric-pair">
            <span>Active days</span>
            <strong>{{ selectedInsightRow.activeDays }}</strong>
          </div>
        </article>

        <article class="insight-card full-width-card">
          <h3>Catatan Analitik</h3>
          <ul class="drawer-list">
            <li v-for="note in selectedInsightRow.notes" :key="note">
              {{ note }}
            </li>
          </ul>
        </article>
      </div>
    </aside>

    <!-- Review Draft Modal -->
    <section
      v-if="reviewOpen"
      class="review-backdrop"
      @click.self="reviewOpen = false"
    >
      <div class="review-panel">
        <header>
          <h2>Review Draft Belanja</h2>
          <p class="meta">
            {{ draftRows.length }} item • Estimasi total
            {{ formatRupiah(kpis.estimatedBudget) }}
          </p>
        </header>

        <div class="review-actions">
          <div class="action-row">
            <button type="button" class="primary-btn" @click="copyDraftSummary">
              Copy Ringkasan
            </button>
            <button
              type="button"
              class="ghost-button"
              @click="downloadDraftCsv"
            >
              Unduh CSV
            </button>
          </div>
          <span class="meta-status">{{
            copyStatus || "Siap untuk diekspor atau disalin."
          }}</span>
        </div>

        <div class="review-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produk</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Buy Fee</th>
                <th>Estimasi</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in draftRows" :key="item.itemId">
                <td class="draft-entry">
                  <strong>{{ item.itemName }}</strong>
                  <small>{{ item.code || "Tanpa kode" }} • {{ item.brandName || "Tanpa brand" }}</small>
                </td>
                <td>{{ item.quantity }}</td>
                <td>{{ item.unit || "-" }}</td>
                <td>{{ formatRupiah(item.buyFee) }}</td>
                <td>{{ formatRupiah(item.estimatedCost) }}</td>
                <td>
                  <span
                    v-if="item.hasUnitHistoryWarning"
                    class="tag tag-review"
                    :title="item.unitHistoryWarning"
                    >Riwayat unit</span
                  >
                  <span v-if="item.needsManualReview" class="tag tag-review"
                    >Review unit</span
                  >
                  <span v-if="item.isDormant" class="tag tag-dormant"
                    >Dormant</span
                  >
                  <span
                    v-if="
                      !item.hasUnitHistoryWarning &&
                      !item.needsManualReview &&
                      !item.isDormant
                    "
                    >-</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="review-footer">
          <div class="meta-note">
            Draft ini disesuaikan berdasarkan item-item yang Anda tandai "Sedang Dipesan".
          </div>
          <div class="action-row">
            <button
              type="button"
              class="ghost-button"
              @click="reviewOpen = false"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { requestAssistTokenFromOpenTabs } from "@/composables/assistTokenManager";
import {
  type MarkOutstandingOrderItem,
  type RecommendationStatusColor,
  type ShoppingCatalogItem,
  type ShoppingRecommendationRow,
  type ShoppingRecommendationSettings,
} from "@/types/ShoppingRecommendation";
import { formatRupiah } from "@/utils/rupiahUtils";
import {
  compareShoppingRecommendationRows,
  resolveShoppingRecommendationSettings,
  validateShoppingRecommendationSettings,
} from "@/utils/shoppingRecommendations";

interface FetchShoppingRecommendationsResponse {
  ok: true;
  data: ShoppingRecommendationRow[];
  catalogItems: ShoppingCatalogItem[];
  warnings: string[];
  settings: ShoppingRecommendationSettings;
  lookbackDays: number;
  generatedAt: string;
}

interface FiltersState {
  search: string;
  quickFilter: QuickFilterKey;
  statusGroup: "all" | "red-yellow" | "red" | "yellow" | "green";
  orderedFilter: "all" | "ordered" | "not-ordered";
  showManualReview: boolean;
  showDormant: boolean;
}

type QuickFilterKey =
  | "all"
  | "income-loss"
  | "capped-demand"
  | "golden-product";

interface EnhancedRecommendationRow extends ShoppingRecommendationRow {
  draftedQty: number;
  remainingSuggestedQty: number;
  isCovered: boolean;
}

interface DraftSummaryRow {
  itemId: string;
  itemType: MarkOutstandingOrderItem["itemType"];
  code: string;
  itemName: string;
  brandName: string;
  unit: string;
  buyFee: number | null;
  quantity: number;
  estimatedCost: number;
  needsManualReview: boolean;
  hasUnitHistoryWarning: boolean;
  unitHistoryWarning: string;
  isDormant: boolean;
}

type IndicatorTone =
  | "review"
  | "dormant"
  | "covered"
  | "loss"
  | "capped"
  | "golden"
  | "dead";

interface ItemIndicator {
  key: string;
  icon: string;
  label: string;
  tooltip: string;
  tone: IndicatorTone;
}

const SETTINGS_STORAGE_KEY = "shoppingRecommendation:settings";
const FILTERS_STORAGE_KEY = "shoppingRecommendation:filters";
const IGNORED_STORAGE_KEY = "shoppingRecommendation:ignoredItems";

const DEFAULT_FILTERS: FiltersState = {
  search: "",
  quickFilter: "all",
  statusGroup: "red-yellow",
  orderedFilter: "not-ordered",
  showManualReview: true,
  showDormant: true,
};

const quickFilterOptions: Array<{ key: QuickFilterKey; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "income-loss", label: "Potensi Rugi" },
  { key: "capped-demand", label: "Permintaan Terhambat" },
  { key: "golden-product", label: "Produk Emas" },
];

const rows = ref<ShoppingRecommendationRow[]>([]);
const catalogItems = ref<ShoppingCatalogItem[]>([]);
const warnings = ref<string[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const infoMessage = ref("");
const generatedAt = ref("");
const lookbackDays = ref(30);
const reviewOpen = ref(false);
const copyStatus = ref("");
const manualSearch = ref("");
const selectedInsightItemId = ref("");
const showSettingsPanel = ref(false);

const activeSettings = ref<ShoppingRecommendationSettings>(loadStoredSettings());
const formSettings = ref<ShoppingRecommendationSettings>({
  ...activeSettings.value,
});
const filters = reactive<FiltersState>({ ...DEFAULT_FILTERS });
const ignoredItemIds = ref<Record<string, boolean>>(loadStoredIgnoredItems());

watch(
  filters,
  (value) => {
    saveStorage(FILTERS_STORAGE_KEY, value);
  },
  { deep: true },
);

const settingsDirty = computed(
  () =>
    JSON.stringify(formSettings.value) !== JSON.stringify(activeSettings.value),
);

const selectedInsightRow = computed(() => {
  if (!selectedInsightItemId.value) {
    return null;
  }

  return (
    enhancedRows.value.find(
      (row) => row.itemId === selectedInsightItemId.value,
    ) ?? null
  );
});

const enhancedRows = computed<EnhancedRecommendationRow[]>(() => {
  return [...rows.value]
    .map((row) => {
      const draftedQty = row.pendingOrderQty;
      const remainingSuggestedQty = Math.max(
        0,
        row.calculatedSuggestedQty - draftedQty,
      );
      const isCovered =
        row.calculatedSuggestedQty > 0 &&
        remainingSuggestedQty <= 0 &&
        draftedQty > 0;

      return {
        ...row,
        draftedQty,
        remainingSuggestedQty,
        isCovered,
      };
    })
    .sort((left, right) => {
      if (left.estimatedDaysRemaining !== right.estimatedDaysRemaining) {
        return left.estimatedDaysRemaining - right.estimatedDaysRemaining;
      }
      return left.itemName.localeCompare(right.itemName);
    });
});

const filteredRows = computed(() => {
  const search = filters.search.trim().toLowerCase();

  return enhancedRows.value.filter((row) => {
    // Exclude ignored items
    if (ignoredItemIds.value[row.itemId]) {
      return false;
    }

    const matchesSearch = !search
      ? true
      : [row.itemName, row.code, row.brandName]
          .join(" ")
          .toLowerCase()
          .includes(search);

    let matchesStatus = true;
    if (filters.statusGroup === "red-yellow") {
      matchesStatus = row.statusColor === "red" || row.statusColor === "yellow";
    } else if (filters.statusGroup === "red") {
      matchesStatus = row.statusColor === "red";
    } else if (filters.statusGroup === "yellow") {
      matchesStatus = row.statusColor === "yellow";
    } else if (filters.statusGroup === "green") {
      matchesStatus = row.statusColor === "green";
    }

    let matchesOrdered = true;
    if (filters.orderedFilter === "ordered") {
      matchesOrdered = row.pendingOrderQty > 0;
    } else if (filters.orderedFilter === "not-ordered") {
      matchesOrdered = row.pendingOrderQty <= 0;
    }

    if (!filters.showManualReview && row.needsManualReview) {
      return false;
    }
    if (!filters.showDormant && row.isDormant) {
      return false;
    }

    return matchesSearch && matchesStatus && matchesOrdered && matchesQuickFilter(row);
  });
});

const filteredRowsToOrder = computed(() => {
  return filteredRows.value.filter(
    (row) => row.pendingOrderQty <= 0 && (row.statusColor === "red" || row.statusColor === "yellow"),
  );
});

const draftRows = computed<DraftSummaryRow[]>(() => {
  return enhancedRows.value
    .filter((row) => row.pendingOrderQty > 0)
    .map((row) => ({
      itemId: row.itemId,
      itemType: row.itemType,
      code: row.code,
      itemName: row.itemName,
      brandName: row.brandName,
      unit: row.unit,
      buyFee: row.buyFee,
      quantity: row.pendingOrderQty,
      estimatedCost: row.pendingOrderQty * (row.buyFee ?? 0),
      needsManualReview: row.needsManualReview,
      hasUnitHistoryWarning: row.hasUnitHistoryWarning,
      unitHistoryWarning: row.unitHistoryWarning,
      isDormant: row.isDormant,
    }))
    .sort((left, right) => left.itemName.localeCompare(right.itemName));
});

const catalogSearchResults = computed(() => {
  const query = manualSearch.value.trim().toLowerCase();
  if (query.length < 2) {
    return [];
  }

  return catalogItems.value
    .filter((item) => {
      const haystack = [item.itemName, item.code, item.brandName]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, 8);
});

const kpis = computed(() => {
  const redCount = rows.value.filter((row) => row.statusColor === "red").length;
  const yellowCount = rows.value.filter((row) => row.statusColor === "yellow").length;
  const greenCount = rows.value.filter((row) => row.statusColor === "green").length;
  const estimatedBudget = rows.value
    .filter((row) => row.statusColor === "red" || row.statusColor === "yellow")
    .reduce((sum, row) => sum + (row.buyFee ?? 0) * row.replenishSuggestedQty, 0);

  return {
    redCount,
    yellowCount,
    greenCount,
    estimatedBudget,
  };
});

const generatedLabel = computed(() => {
  if (!generatedAt.value) {
    return `Lookback ${lookbackDays.value} hari.`;
  }

  return `Lookback ${lookbackDays.value} hari • dibuat ${new Date(generatedAt.value).toLocaleString("id-ID")}`;
});

onMounted(() => {
  void refreshData();
});

async function refreshData() {
  await loadRecommendations(activeSettings.value);
}

async function applySettings() {
  errorMessage.value = "";
  infoMessage.value = "";

  const resolved = resolveShoppingRecommendationSettings(formSettings.value);
  const validation = validateShoppingRecommendationSettings(resolved);
  if (!validation.valid) {
    errorMessage.value = validation.reason;
    return;
  }

  activeSettings.value = { ...resolved };
  formSettings.value = { ...resolved };
  saveStorage(SETTINGS_STORAGE_KEY, activeSettings.value);
  infoMessage.value = "Pengaturan tersimpan. Memuat ulang rekomendasi...";
  showSettingsPanel.value = false;
  await loadRecommendations(activeSettings.value);
}

function resetSettingsForm() {
  formSettings.value = { ...activeSettings.value };
  infoMessage.value = "Form dikembalikan ke default tersimpan.";
  errorMessage.value = "";
}

async function loadRecommendations(settings: ShoppingRecommendationSettings) {
  loading.value = true;
  errorMessage.value = "";
  warnings.value = [];

  try {
    const assistTokenResult = await requestAssistTokenFromOpenTabs();
    if (!assistTokenResult.token) {
      if (assistTokenResult.warnings.length) {
        warnings.value = [...assistTokenResult.warnings];
      }

      throw new Error(
        "Token Assist tidak ditemukan. Buka dan login ke clinica.assist.id, lalu coba lagi.",
      );
    }

    const response = (await browser.runtime.sendMessage({
      type: "FETCH_SHOPPING_RECOMMENDATIONS",
      payload: {
        assistToken: assistTokenResult.token,
        settings,
      },
    })) as
      | FetchShoppingRecommendationsResponse
      | { ok: false; error?: string }
      | undefined;

    if (!response?.ok) {
      throw new Error(response?.error ?? "Gagal memuat rekomendasi belanja.");
    }

    rows.value = response.data;
    catalogItems.value = response.catalogItems;
    warnings.value = [...assistTokenResult.warnings, ...response.warnings];
    activeSettings.value = { ...response.settings };
    formSettings.value = { ...response.settings };
    generatedAt.value = response.generatedAt;
    lookbackDays.value = response.lookbackDays;
    infoMessage.value = `Rekomendasi dimuat untuk ${response.data.length} item.`;
  } catch (error) {
    rows.value = [];
    catalogItems.value = [];
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat memuat rekomendasi belanja.";
  } finally {
    loading.value = false;
  }
}

async function togglePendingOrder(row: EnhancedRecommendationRow) {
  errorMessage.value = "";
  infoMessage.value = "";
  const isCurrentlyPending = row.pendingOrderQty > 0;
  const qty = row.calculatedSuggestedQty || row.replenishSuggestedQty || row.targetStock || 1;

  // Optimistic local update
  const localRow = rows.value.find((r) => r.itemId === row.itemId);
  if (localRow) {
    localRow.pendingOrderQty = isCurrentlyPending ? 0 : qty;
  }

  try {
    if (isCurrentlyPending) {
      await browser.runtime.sendMessage({
        type: "REMOVE_OUTSTANDING_ORDER",
        payload: { itemId: row.itemId },
      });
      infoMessage.value = `${row.itemName} dihapus dari daftar sedang dipesan.`;
    } else {
      await browser.runtime.sendMessage({
        type: "MARK_ITEMS_AS_ORDERED",
        payload: {
          items: [
            {
              itemId: row.itemId,
              itemType: row.itemType,
              itemName: row.itemName,
              code: row.code,
              unit: row.unit,
              quantity: qty,
              buyFee: row.buyFee,
              leadTimeLimit: row.leadTimeLimit,
            } satisfies MarkOutstandingOrderItem,
          ],
        },
      });
      infoMessage.value = `${row.itemName} ditandai sebagai sedang dipesan (${qty} ${row.unit}).`;
    }
  } catch (error) {
    // Revert local state on error
    if (localRow) {
      localRow.pendingOrderQty = isCurrentlyPending ? qty : 0;
    }
    errorMessage.value = "Gagal mengubah status sedang dipesan.";
  }
}

async function orderAllFilteredRows() {
  if (!filteredRowsToOrder.value.length) {
    return;
  }

  const items = filteredRowsToOrder.value.map((row) => {
    const qty = row.calculatedSuggestedQty || row.replenishSuggestedQty || row.targetStock || 1;
    return {
      itemId: row.itemId,
      itemType: row.itemType,
      itemName: row.itemName,
      code: row.code,
      unit: row.unit,
      quantity: qty,
      buyFee: row.buyFee,
      leadTimeLimit: row.leadTimeLimit,
    };
  });

  // Optimistic local update
  for (const item of items) {
    const localRow = rows.value.find((r) => r.itemId === item.itemId);
    if (localRow) {
      localRow.pendingOrderQty = item.quantity;
    }
  }

  try {
    await browser.runtime.sendMessage({
      type: "MARK_ITEMS_AS_ORDERED",
      payload: { items },
    });
    infoMessage.value = `${items.length} item ditandai sebagai sedang dipesan.`;
  } catch (error) {
    // Revert local state on error
    for (const item of items) {
      const localRow = rows.value.find((r) => r.itemId === item.itemId);
      if (localRow) {
        localRow.pendingOrderQty = 0;
      }
    }
    errorMessage.value = "Gagal menandai item.";
  }
}

async function clearAllOrders() {
  if (!confirm("Apakah Anda yakin ingin mengosongkan semua pesanan aktif?")) {
    return;
  }

  // Backup original values in case of error rollback
  const backups = rows.value.map((row) => ({ itemId: row.itemId, qty: row.pendingOrderQty }));

  // Optimistic local update
  for (const row of rows.value) {
    row.pendingOrderQty = 0;
  }

  try {
    await browser.runtime.sendMessage({
      type: "CLEAR_ALL_OUTSTANDING_ORDERS",
    });
    infoMessage.value = "Semua pesanan berhasil dikosongkan.";
  } catch (error) {
    // Revert local state on error
    for (const backup of backups) {
      const localRow = rows.value.find((r) => r.itemId === backup.itemId);
      if (localRow) {
        localRow.pendingOrderQty = backup.qty;
      }
    }
    errorMessage.value = "Gagal mengosongkan pesanan.";
  }
}

async function seedDraftFromCatalog(item: ShoppingCatalogItem) {
  try {
    await browser.runtime.sendMessage({
      type: "MARK_ITEMS_AS_ORDERED",
      payload: {
        items: [
          {
            itemId: item.itemId,
            itemType: item.itemType,
            itemName: item.itemName,
            code: item.code,
            unit: item.unit,
            quantity: 1,
            buyFee: item.buyFee,
            leadTimeLimit: 3,
          } satisfies MarkOutstandingOrderItem,
        ],
      },
    });
    manualSearch.value = "";
    infoMessage.value = `${item.itemName} berhasil ditambahkan sebagai dipesan.`;
    await refreshData();
  } catch (error) {
    errorMessage.value = "Gagal menambahkan item dari katalog.";
  }
}

function openDraftReview() {
  if (!draftRows.value.length) {
    errorMessage.value = "Tandai minimal satu item sebagai sedang dipesan terlebih dahulu.";
    return;
  }

  copyStatus.value = "";
  reviewOpen.value = true;
}

async function copyDraftSummary() {
  const lines = [
    "Kode\tNama\tQty\tUnit\tBuy Fee\tEstimasi",
    ...draftRows.value.map((item) =>
      [
        item.code || "-",
        item.itemName,
        String(item.quantity),
        item.unit || "-",
        String(item.buyFee ?? 0),
        String(Math.round(item.estimatedCost)),
      ].join("\t"),
    ),
  ];

  await navigator.clipboard.writeText(lines.join("\n"));
  copyStatus.value = "Ringkasan draft berhasil disalin.";
}

function downloadDraftCsv() {
  const rowsCsv = [
    ["code", "name", "quantity", "unit", "buyFee", "estimatedCost"],
    ...draftRows.value.map((item) => [
      item.code,
      item.itemName,
      String(item.quantity),
      item.unit,
      String(item.buyFee ?? 0),
      String(Math.round(item.estimatedCost)),
    ]),
  ];

  const csvContent = rowsCsv
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `draft-belanja-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function statusLabel(status: RecommendationStatusColor): string {
  switch (status) {
    case "red":
      return "MERAH";
    case "yellow":
      return "KUNING";
    case "green":
      return "HIJAU";
    default:
      return status;
  }
}

function handleRowClick(row: EnhancedRecommendationRow, event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, label, a, summary, details")) {
    return;
  }

  selectedInsightItemId.value = row.itemId;
}

function closeInsights() {
  selectedInsightItemId.value = "";
}

function getRowIndicators(row: EnhancedRecommendationRow): ItemIndicator[] {
  const indicators: ItemIndicator[] = [];

  if (row.hasUnitHistoryWarning) {
    indicators.push({
      key: `${row.itemId}-unit-history`,
      icon: "U",
      label: "Riwayat unit",
      tooltip:
        row.unitHistoryWarning ||
        "Riwayat transaksi memakai lebih dari satu unit, tetapi kalkulasi tetap dijalankan.",
      tone: "review",
    });
  }

  if (row.needsManualReview) {
    indicators.push({
      key: `${row.itemId}-manual-review`,
      icon: "R",
      label: "Review unit",
      tooltip:
        row.manualReviewReason ||
        "Perlu review unit sebelum jumlah beli diputuskan.",
      tone: "review",
    });
  }

  if (row.isDormant) {
    indicators.push({
      key: `${row.itemId}-dormant`,
      icon: "D",
      label: "Dormant",
      tooltip: "Tidak bergerak dalam 30 hari terakhir.",
      tone: "dormant",
    });
  }

  if (row.isCovered) {
    indicators.push({
      key: `${row.itemId}-covered`,
      icon: "C",
      label: "Covered",
      tooltip: `Sudah tercakup draft. Draft saat ini: ${row.draftedQty}.`,
      tone: "covered",
    });
  }

  if (row.pendingOrderQty > 0) {
    indicators.push({
      key: `${row.itemId}-pending-order`,
      icon: "P",
      label: "PO aktif",
      tooltip: `Ada purchase order outstanding sebanyak ${row.pendingOrderQty}.`,
      tone: "covered",
    });
  }

  if (row.potentialIncomeLoss > 0) {
    indicators.push({
      key: `${row.itemId}-loss`,
      icon: "L",
      label: "Rugi omzet",
      tooltip: `Potensi rugi omzet ${formatRupiah(row.potentialIncomeLoss)}.`,
      tone: "loss",
    });
  }

  if (row.isCappedDemand) {
    indicators.push({
      key: `${row.itemId}-capped-demand`,
      icon: "T",
      label: "Demand tertahan",
      tooltip:
        row.growthRecommendationNote ||
        "Permintaan kemungkinan tertahan oleh stok yang habis atau tipis.",
      tone: "capped",
    });
  }

  if (row.isGoldenProduct) {
    indicators.push({
      key: `${row.itemId}-golden-product`,
      icon: "G",
      label: "Produk emas",
      tooltip: "Produk dengan kontribusi profit tinggi.",
      tone: "golden",
    });
  }

  if (row.isDeadStock) {
    indicators.push({
      key: `${row.itemId}-dead-stock`,
      icon: "S",
      label: "Stok mati",
      tooltip: "Perputaran sangat lambat dan berisiko menjadi stok mati.",
      tone: "dead",
    });
  }

  return indicators;
}

function matchesQuickFilter(row: EnhancedRecommendationRow): boolean {
  switch (filters.quickFilter) {
    case "income-loss":
      return row.potentialIncomeLoss > 0;
    case "capped-demand":
      return row.isCappedDemand || row.growthSuggestedQty > 0;
    case "golden-product":
      return row.isGoldenProduct;
    case "all":
    default:
      return true;
  }
}

// Format daily sales
function formatDailySales(value: number): string {
  return value >= 10
    ? value.toFixed(0)
    : value >= 1
      ? value.toFixed(1)
      : value.toFixed(2);
}

// Format days remaining
function formatDays(value: number): string {
  if (value >= 9999) {
    return "Dormant";
  }

  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

// Format percent value
function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

// Resolve unit margin
function resolveUnitMargin(row: ShoppingRecommendationRow): number {
  return Math.max(
    0,
    (row.sellNormalFee ?? 0) - (row.avgHpp ?? row.buyFee ?? 0),
  );
}

// Constraint meter width
function constraintMeterWidth(row: ShoppingRecommendationRow): number {
  return Math.max(
    8,
    Math.min(
      100,
      (row.estimatedDemandConstraintDays / Math.max(1, row.leadTimeLimit)) *
        100,
    ),
  );
}

// Sanitize quantity
function sanitizeQuantity(value: number | string | undefined): number {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return Math.ceil(numericValue);
}

// Ignored items storage helpers
function loadStoredIgnoredItems(): Record<string, boolean> {
  return loadStorage<Record<string, boolean>>(IGNORED_STORAGE_KEY, {});
}

function saveStoredIgnoredItems(value: Record<string, boolean>) {
  saveStorage(IGNORED_STORAGE_KEY, value);
}

function ignoreItem(itemId: string) {
  if (confirm("Abaikan produk ini dari rekomendasi belanja?")) {
    ignoredItemIds.value = {
      ...ignoredItemIds.value,
      [itemId]: true,
    };
    saveStoredIgnoredItems(ignoredItemIds.value);
    infoMessage.value = "Produk berhasil diabaikan.";
  }
}

function restoreItem(itemId: string) {
  const nextIgnored = { ...ignoredItemIds.value };
  delete nextIgnored[itemId];
  ignoredItemIds.value = nextIgnored;
  saveStoredIgnoredItems(ignoredItemIds.value);
  infoMessage.value = "Produk berhasil dikembalikan.";
}

function getProductName(itemId: string): string {
  const row = rows.value.find((r) => r.itemId === itemId);
  if (row) return row.itemName;
  const cat = catalogItems.value.find((c) => c.itemId === itemId);
  if (cat) return cat.itemName;
  return "Produk " + itemId;
}

function getProductCode(itemId: string): string {
  const row = rows.value.find((r) => r.itemId === itemId);
  if (row) return row.code;
  const cat = catalogItems.value.find((c) => c.itemId === itemId);
  if (cat) return cat.code;
  return "";
}

// Load settings
function loadStoredSettings(): ShoppingRecommendationSettings {
  const parsed = loadStorage<Partial<ShoppingRecommendationSettings>>(
    SETTINGS_STORAGE_KEY,
    {},
  );
  return resolveShoppingRecommendationSettings(parsed);
}

// Load filters
function loadStoredFilters(): FiltersState {
  return {
    ...DEFAULT_FILTERS,
    ...loadStorage<Partial<FiltersState>>(FILTERS_STORAGE_KEY, DEFAULT_FILTERS),
  };
}

// Local storage helpers
function loadStorage<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function saveStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// CSV escape
function escapeCsvValue(value: string): string {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}
</script>

<style>
/* Style loaded from styles.css */
</style>
