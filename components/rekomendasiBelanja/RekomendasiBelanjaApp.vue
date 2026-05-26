<template>
  <main class="recommendation-root">
    <section class="hero">
      <div>
        <h1>Rekomendasi Belanja</h1>
        <p>Ringkasan stok prioritas dan draft belanja aktif.</p>
        <details class="help-disclosure">
          <summary>Tentang tampilan ini</summary>
          <p>
            Memusatkan item kritis, review unit, dormant, dan draft belanja
            dalam satu workspace.
          </p>
        </details>
      </div>

      <div class="hero-actions">
        <button
          type="button"
          class="ghost-button"
          :disabled="loading"
          @click="refreshData"
        >
          {{ loading ? "Memuat..." : "Refresh Data" }}
        </button>
        <button type="button" class="ghost-button" @click="clearDraft">
          Kosongkan Draft
        </button>
        <button
          type="button"
          :disabled="!draftRows.length || markingOrdered"
          @click="openDraftReview"
        >
          Generate Draft Belanja
        </button>
      </div>
    </section>

    <p v-if="errorMessage" class="state-banner error">{{ errorMessage }}</p>
    <p v-else-if="infoMessage" class="state-banner info">{{ infoMessage }}</p>

    <ul v-if="warnings.length" class="warning-list">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>

    <section class="kpi-grid">
      <article class="kpi-card kpi-red">
        <h3>Merah</h3>
        <strong>{{ kpis.redCount }}</strong>
        <p>Kritis</p>
      </article>
      <article class="kpi-card kpi-yellow">
        <h3>Kuning</h3>
        <strong>{{ kpis.yellowCount }}</strong>
        <p>Waspada</p>
      </article>
      <article class="kpi-card kpi-green">
        <h3>Hijau</h3>
        <strong>{{ kpis.greenCount }}</strong>
        <p>Aman</p>
      </article>
      <article class="kpi-card kpi-review">
        <h3>Review Unit</h3>
        <strong>{{ kpis.manualReviewCount }}</strong>
        <p>Cek unit</p>
      </article>
      <article class="kpi-card kpi-dormant">
        <h3>Dormant</h3>
        <strong>{{ kpis.dormantCount }}</strong>
        <p>30h sepi</p>
      </article>
      <article class="kpi-card kpi-budget">
        <h3>Budget Draft</h3>
        <strong>{{ formatRupiah(kpis.draftBudget) }}</strong>
        <p>{{ kpis.draftItems }} item</p>
      </article>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>Pengaturan</h2>
      </div>

      <details class="help-disclosure panel-help">
        <summary>Panduan pengaturan</summary>
        <p>Lookback tetap 30 hari dan default disimpan lokal di extension.</p>
      </details>

      <div class="settings-grid">
        <div class="field">
          <label for="defaultLeadTime">Lead time</label>
          <input
            id="defaultLeadTime"
            v-model.number="formSettings.defaultLeadTime"
            type="number"
            min="1"
            step="1"
          />
        </div>
        <div class="field">
          <label for="cheapProductMaxPrice">Batas murah</label>
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
          <label for="cheapFastMovingLeadTime">Lead cepat</label>
          <input
            id="cheapFastMovingLeadTime"
            v-model.number="formSettings.cheapFastMovingLeadTime"
            type="number"
            min="1"
            step="1"
          />
        </div>
        <div class="field">
          <label for="targetStockDays">Target hari</label>
          <input
            id="targetStockDays"
            v-model.number="formSettings.targetStockDays"
            type="number"
            min="1"
            step="1"
          />
        </div>
      </div>

      <div class="action-row" style="margin-top: 14px">
        <button
          type="button"
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
        <span class="meta">
          {{
            settingsDirty
              ? "Ada perubahan yang belum diterapkan."
              : "Form sinkron dengan default tersimpan."
          }}
        </span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>Filter Kerja</h2>
        <span>{{ filteredRows.length }}/{{ enhancedRows.length }} item</span>
      </div>

      <details class="help-disclosure panel-help">
        <summary>Panduan filter</summary>
        <p>
          Gunakan chip untuk fokus cepat, lalu sempitkan hasil dengan status dan
          pencarian.
        </p>
      </details>

      <div class="quick-filter-row" role="tablist" aria-label="Quick filter">
        <button
          v-for="filterOption in quickFilterOptions"
          :key="filterOption.key"
          type="button"
          :class="[
            'chip-button',
            { active: filters.quickFilter === filterOption.key },
          ]"
          @click="setQuickFilter(filterOption.key)"
        >
          {{ filterOption.label }}
        </button>
      </div>

      <div class="filter-grid">
        <div class="field">
          <label for="searchInput">Cari item</label>
          <input
            id="searchInput"
            v-model.trim="filters.search"
            type="search"
            placeholder="Contoh: paracetamol, MS001217, Dexa"
          />
        </div>

        <div class="toggle-row">
          <span>Status</span>
          <div class="toggle-list">
            <label
              ><input v-model="filters.showRed" type="checkbox" /> Merah</label
            >
            <label
              ><input v-model="filters.showYellow" type="checkbox" />
              Kuning</label
            >
            <label
              ><input v-model="filters.showGreen" type="checkbox" />
              Hijau</label
            >
          </div>
        </div>

        <div class="checkbox-stack">
          <span>Tambahan</span>
          <label
            ><input v-model="filters.showManualReview" type="checkbox" /> Review
            unit</label
          >
          <label
            ><input v-model="filters.showDormant" type="checkbox" />
            Dormant</label
          >
          <label
            ><input v-model="filters.showCovered" type="checkbox" /> Tampilkan
            tercakup draft</label
          >
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>Tambah dari Katalog</h2>
      </div>

      <details class="help-disclosure panel-help">
        <summary>Kapan dipakai</summary>
        <p>
          Untuk menambah item di luar hasil merah atau kuning langsung ke draft.
        </p>
      </details>

      <div class="field">
        <label for="manualSearch">Cari katalog</label>
        <input
          id="manualSearch"
          v-model.trim="manualSearch"
          type="search"
          placeholder="Cari item katalog penuh Assist"
        />
      </div>

      <div v-if="catalogSearchResults.length" class="catalog-results">
        <article
          v-for="item in catalogSearchResults"
          :key="item.itemId"
          class="catalog-item"
        >
          <div>
            <h3>{{ item.itemName }}</h3>
            <p>
              {{ item.code || "Tanpa kode" }} •
              {{ item.brandName || "Tanpa brand" }} •
              {{ item.unit || "Tanpa unit" }} • {{ formatRupiah(item.buyFee) }}
            </p>
          </div>

          <div class="catalog-result-actions">
            <button
              type="button"
              class="ghost-button"
              @click="seedDraftFromCatalog(item)"
            >
              Tambah ke Draft
            </button>
          </div>
        </article>
      </div>

      <p v-else class="empty-state">
        {{
          manualSearch.length < 2
            ? "Ketik 2 karakter untuk mulai mencari katalog."
            : "Tidak ada produk katalog yang cocok."
        }}
      </p>
    </section>

    <section class="table-panel">
      <header>
        <h2>Tabel Rekomendasi</h2>
        <p class="meta">
          {{ generatedLabel }}
        </p>
        <div class="indicator-legend" aria-label="Legend indikator item">
          <span
            v-for="indicator in indicatorLegend"
            :key="indicator.key"
            class="legend-item"
          >
            <span
              :class="['indicator-icon', `indicator-${indicator.tone}`]"
              aria-hidden="true"
            >
              {{ indicator.icon }}
            </span>
            <span>{{ indicator.label }}</span>
          </span>
        </div>
      </header>

      <div v-if="!filteredRows.length" class="empty-state">
        Belum ada baris yang cocok dengan filter aktif.
      </div>

      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produk</th>
              <th>Status</th>
              <th>Stok</th>
              <th>Sedang Dipesan</th>
              <th>Terjual 30h</th>
              <th>Rata/Hari</th>
              <th>Sisa Hari</th>
              <th>Target</th>
              <th>Replenish</th>
              <th>Growth</th>
              <th>Buy Fee</th>
              <th>Draft Qty</th>
              <th>Sisa Total</th>
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
                <strong>{{ row.itemName }}</strong>
                <div class="product-meta">
                  {{ row.code || "Tanpa kode" }} •
                  {{ row.brandName || "Tanpa brand" }} •
                  {{ row.unit || "Tanpa unit" }}
                </div>
                <div class="table-actions" style="margin-top: 8px">
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
                </div>
                <div
                  v-if="row.notes.length"
                  class="inline-disclosure-wrap"
                  style="margin-top: 8px"
                >
                  <details class="inline-disclosure">
                    <summary>{{ row.notes.length }} catatan</summary>
                    <div class="cell-note">{{ row.notes.join(" | ") }}</div>
                  </details>
                </div>
              </td>
              <td>
                <span :class="['status-badge', `status-${row.statusColor}`]">
                  {{ statusLabel(row.statusColor) }}
                </span>
              </td>
              <td>{{ row.stockTotal }}</td>
              <td>{{ row.pendingOrderQty || "-" }}</td>
              <td>{{ row.qtySold30Days }}</td>
              <td>{{ formatDailySales(row.averageDailySales) }}</td>
              <td>{{ formatDays(row.estimatedDaysRemaining) }}</td>
              <td>{{ row.needsManualReview ? "Manual" : row.targetStock }}</td>
              <td>
                <strong>{{
                  row.needsManualReview ? "Manual" : row.replenishSuggestedQty
                }}</strong>
                <button
                  v-if="!row.needsManualReview"
                  type="button"
                  class="cell-action-button"
                  :disabled="row.replenishSuggestedQty <= 0"
                  @click.stop="
                    setDraftQuantity(row.itemId, row.replenishSuggestedQty)
                  "
                >
                  Isi Replenish
                </button>
                <div class="cell-note">Pulihkan demand dasar</div>
              </td>
              <td>
                <strong>{{
                  row.needsManualReview ? "Manual" : row.calculatedSuggestedQty
                }}</strong>
                <button
                  v-if="!row.needsManualReview"
                  type="button"
                  class="cell-action-button"
                  :disabled="row.calculatedSuggestedQty <= 0"
                  @click.stop="
                    setDraftQuantity(row.itemId, row.calculatedSuggestedQty)
                  "
                >
                  Isi Growth
                </button>
                <div class="cell-note">Replenish + tambahan growth</div>
              </td>
              <td>
                <strong>{{ formatRupiah(row.buyFee) }}</strong>
                <div class="cell-note">avgHPP: {{ row.avgHpp ?? "-" }}</div>
              </td>
              <td>
                <div class="draft-controls">
                  <input
                    class="draft-input"
                    :value="row.draftedQty || ''"
                    type="number"
                    min="0"
                    step="1"
                    @input="updateDraftQtyFromEvent(row.itemId, $event)"
                  />
                </div>
              </td>
              <td>
                {{
                  row.needsManualReview ? "Manual" : row.remainingSuggestedQty
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

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
            {{ formatRupiah(kpis.draftBudget) }}
          </p>
        </header>

        <div class="review-actions">
          <div class="action-row">
            <button type="button" @click="copyDraftSummary">
              Copy Ringkasan
            </button>
            <button
              type="button"
              :disabled="markingOrdered || !draftRows.length"
              @click="markDraftAsOrdered"
            >
              {{ markingOrdered ? "Menyimpan..." : "Tandai Sudah Dipesan" }}
            </button>
            <button
              type="button"
              class="ghost-button"
              @click="downloadDraftCsv"
            >
              Unduh CSV
            </button>
          </div>
          <span class="meta">{{
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
                  <small
                    >{{ item.code || "Tanpa kode" }} •
                    {{ item.brandName || "Tanpa brand" }}</small
                  >
                </td>
                <td>{{ item.quantity }}</td>
                <td>{{ item.unit || "-" }}</td>
                <td>{{ formatRupiah(item.buyFee) }}</td>
                <td>{{ formatRupiah(item.estimatedCost) }}</td>
                <td>
                  <span v-if="item.needsManualReview" class="tag tag-review"
                    >Review unit</span
                  >
                  <span v-if="item.isDormant" class="tag tag-dormant"
                    >Dormant</span
                  >
                  <span v-if="!item.needsManualReview && !item.isDormant"
                    >-</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="review-footer">
          <div class="meta">
            Draft ini adalah workspace lokal extension. Belum mengirim PO ke
            Assist.
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

interface MarkItemsAsOrderedResponse {
  ok: true;
  markedCount: number;
}

interface FiltersState {
  search: string;
  quickFilter: QuickFilterKey;
  showRed: boolean;
  showYellow: boolean;
  showGreen: boolean;
  showManualReview: boolean;
  showDormant: boolean;
  showCovered: boolean;
}

type QuickFilterKey =
  | "all"
  | "need-buy"
  | "income-loss"
  | "capped-demand"
  | "golden-product"
  | "dead-stock";

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
const DRAFT_STORAGE_KEY = "shoppingRecommendation:draft";
const FILTERS_STORAGE_KEY = "shoppingRecommendation:filters";
const DEFAULT_FILTERS: FiltersState = {
  search: "",
  quickFilter: "all",
  showRed: true,
  showYellow: true,
  showGreen: false,
  showManualReview: true,
  showDormant: false,
  showCovered: true,
};

const quickFilterOptions: Array<{ key: QuickFilterKey; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "need-buy", label: "Butuh Beli" },
  { key: "income-loss", label: "Potensi Rugi" },
  { key: "capped-demand", label: "Permintaan Terhambat" },
  { key: "golden-product", label: "Produk Emas" },
  { key: "dead-stock", label: "Stok Mati" },
];

const indicatorLegend: ItemIndicator[] = [
  {
    key: "manual-review",
    icon: "R",
    label: "Review unit",
    tooltip: "Perlu review unit sebelum jumlah beli diputuskan.",
    tone: "review",
  },
  {
    key: "dormant",
    icon: "D",
    label: "Dormant",
    tooltip: "Tidak bergerak dalam 30 hari terakhir.",
    tone: "dormant",
  },
  {
    key: "covered",
    icon: "C",
    label: "Covered",
    tooltip: "Kebutuhan item ini sudah tercakup draft atau stok masuk.",
    tone: "covered",
  },
  {
    key: "pending-order",
    icon: "P",
    label: "PO aktif",
    tooltip: "Ada purchase order outstanding untuk item ini.",
    tone: "covered",
  },
  {
    key: "loss",
    icon: "L",
    label: "Rugi omzet",
    tooltip: "Potensi kehilangan omzet terdeteksi.",
    tone: "loss",
  },
  {
    key: "capped-demand",
    icon: "T",
    label: "Demand tertahan",
    tooltip: "Permintaan kemungkinan tertahan oleh stok yang habis atau tipis.",
    tone: "capped",
  },
  {
    key: "golden-product",
    icon: "G",
    label: "Produk emas",
    tooltip: "Produk dengan kontribusi profit tinggi.",
    tone: "golden",
  },
  {
    key: "dead-stock",
    icon: "S",
    label: "Stok mati",
    tooltip: "Perputaran sangat lambat dan berisiko menjadi stok mati.",
    tone: "dead",
  },
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
const markingOrdered = ref(false);
const selectedInsightItemId = ref("");

const activeSettings =
  ref<ShoppingRecommendationSettings>(loadStoredSettings());
const formSettings = ref<ShoppingRecommendationSettings>({
  ...activeSettings.value,
});
const draftQuantities = ref<Record<string, number>>(loadStoredDraft());
const filters = reactive<FiltersState>(loadStoredFilters());

watch(
  draftQuantities,
  (value) => {
    saveStorage(DRAFT_STORAGE_KEY, value);
  },
  { deep: true },
);

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

const rowById = computed(
  () => new Map(rows.value.map((row) => [row.itemId, row])),
);

const catalogById = computed(
  () => new Map(catalogItems.value.map((item) => [item.itemId, item])),
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
      const draftedQty = sanitizeQuantity(draftQuantities.value[row.itemId]);
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
      return (
        compareShoppingRecommendationRows(left, right) ||
        right.remainingSuggestedQty - left.remainingSuggestedQty
      );
    });
});

const filteredRows = computed(() => {
  const search = filters.search.trim().toLowerCase();

  return enhancedRows.value.filter((row) => {
    const matchesSearch = !search
      ? true
      : [row.itemName, row.code, row.brandName]
          .join(" ")
          .toLowerCase()
          .includes(search);

    const matchesStatus =
      (filters.showRed && row.statusColor === "red") ||
      (filters.showYellow && row.statusColor === "yellow") ||
      (filters.showGreen && row.statusColor === "green") ||
      (filters.showManualReview && row.needsManualReview) ||
      (filters.showDormant && row.isDormant);

    if (!filters.showCovered && row.isCovered && row.draftedQty <= 0) {
      return false;
    }

    return matchesSearch && matchesStatus && matchesQuickFilter(row);
  });
});

const draftRows = computed<DraftSummaryRow[]>(() => {
  return Object.entries(draftQuantities.value)
    .map(([itemId, quantity]) => {
      const safeQuantity = sanitizeQuantity(quantity);
      if (safeQuantity <= 0) {
        return null;
      }

      const row = rowById.value.get(itemId);
      const catalogItem = catalogById.value.get(itemId);
      const baseName = row?.itemName ?? catalogItem?.itemName ?? "Unknown";
      return {
        itemId,
        itemType: row?.itemType ?? catalogItem?.itemType ?? "prescription",
        code: row?.code ?? catalogItem?.code ?? "",
        itemName: baseName,
        brandName: row?.brandName ?? catalogItem?.brandName ?? "",
        unit: row?.unit ?? catalogItem?.unit ?? "",
        buyFee: row?.buyFee ?? catalogItem?.buyFee ?? null,
        quantity: safeQuantity,
        estimatedCost: safeQuantity * (row?.buyFee ?? catalogItem?.buyFee ?? 0),
        needsManualReview: row?.needsManualReview ?? false,
        isDormant: row?.isDormant ?? false,
      } satisfies DraftSummaryRow;
    })
    .filter((item): item is DraftSummaryRow => Boolean(item))
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

const kpis = computed(() => ({
  redCount: rows.value.filter((row) => row.statusColor === "red").length,
  yellowCount: rows.value.filter((row) => row.statusColor === "yellow").length,
  greenCount: rows.value.filter((row) => row.statusColor === "green").length,
  manualReviewCount: rows.value.filter((row) => row.needsManualReview).length,
  dormantCount: rows.value.filter((row) => row.isDormant).length,
  draftBudget: draftRows.value.reduce((sum, row) => sum + row.estimatedCost, 0),
  draftItems: draftRows.value.length,
}));

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

function updateDraftQtyFromEvent(itemId: string, event: Event) {
  const target = event.target as HTMLInputElement | null;
  setDraftQuantity(itemId, target?.value ?? "0");
}

function setDraftQuantity(itemId: string, value: number | string) {
  const quantity = sanitizeQuantity(value);
  draftQuantities.value = {
    ...draftQuantities.value,
  };

  if (quantity <= 0) {
    delete draftQuantities.value[itemId];
    draftQuantities.value = { ...draftQuantities.value };
    return;
  }

  draftQuantities.value[itemId] = quantity;
  draftQuantities.value = { ...draftQuantities.value };
}

function setQuickFilter(filterKey: QuickFilterKey) {
  filters.quickFilter = filterKey;
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

function seedDraftFromCatalog(item: ShoppingCatalogItem) {
  setDraftQuantity(item.itemId, draftQuantities.value[item.itemId] || 1);
  manualSearch.value = "";
  infoMessage.value = `${item.itemName} ditambahkan ke draft aktif.`;
}

function clearDraft() {
  draftQuantities.value = {};
  reviewOpen.value = false;
  copyStatus.value = "";
  infoMessage.value = "Draft kerja dikosongkan.";
}

function openDraftReview() {
  if (!draftRows.value.length) {
    errorMessage.value =
      "Tambahkan minimal satu item ke draft terlebih dahulu.";
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

async function markDraftAsOrdered() {
  if (!draftRows.value.length || markingOrdered.value) {
    return;
  }

  markingOrdered.value = true;
  errorMessage.value = "";

  try {
    const response = (await browser.runtime.sendMessage({
      type: "MARK_ITEMS_AS_ORDERED",
      payload: {
        items: draftRows.value.map(
          (item) =>
            ({
              itemId: item.itemId,
              itemType: item.itemType,
              itemName: item.itemName,
              code: item.code,
              unit: item.unit,
              quantity: item.quantity,
              buyFee: item.buyFee,
            }) satisfies MarkOutstandingOrderItem,
        ),
      },
    })) as
      | MarkItemsAsOrderedResponse
      | { ok: false; error?: string }
      | undefined;

    if (!response?.ok) {
      throw new Error(
        response?.error ?? "Gagal menandai draft sebagai sudah dipesan.",
      );
    }

    draftQuantities.value = {};
    reviewOpen.value = false;
    copyStatus.value = "";
    infoMessage.value = `${response.markedCount} item ditandai sebagai sedang dipesan.`;
    await refreshData();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat menyimpan outstanding order.";
  } finally {
    markingOrdered.value = false;
  }
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
      return "Kritis";
    case "yellow":
      return "Warning";
    case "green":
      return "Aman";
    default:
      return status;
  }
}

function getRowIndicators(row: EnhancedRecommendationRow): ItemIndicator[] {
  const indicators: ItemIndicator[] = [];

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
    case "need-buy":
      return row.statusColor !== "green" || row.calculatedSuggestedQty > 0;
    case "income-loss":
      return row.potentialIncomeLoss > 0;
    case "capped-demand":
      return row.isCappedDemand || row.growthSuggestedQty > 0;
    case "golden-product":
      return row.isGoldenProduct;
    case "dead-stock":
      return row.isDeadStock;
    case "all":
    default:
      return true;
  }
}

function formatDailySales(value: number): string {
  return value >= 10
    ? value.toFixed(0)
    : value >= 1
      ? value.toFixed(1)
      : value.toFixed(2);
}

function formatDays(value: number): string {
  if (value >= 9999) {
    return "Dormant";
  }

  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function resolveUnitMargin(row: ShoppingRecommendationRow): number {
  return Math.max(
    0,
    (row.sellNormalFee ?? 0) - (row.avgHpp ?? row.buyFee ?? 0),
  );
}

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

function sanitizeQuantity(value: number | string | undefined): number {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return Math.ceil(numericValue);
}

function loadStoredSettings(): ShoppingRecommendationSettings {
  const parsed = loadStorage<Partial<ShoppingRecommendationSettings>>(
    SETTINGS_STORAGE_KEY,
    {},
  );
  return resolveShoppingRecommendationSettings(parsed);
}

function loadStoredDraft(): Record<string, number> {
  const parsed = loadStorage<Record<string, number>>(DRAFT_STORAGE_KEY, {});
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      sanitizeQuantity(value),
    ]),
  );
}

function loadStoredFilters(): FiltersState {
  return {
    ...DEFAULT_FILTERS,
    ...loadStorage<Partial<FiltersState>>(FILTERS_STORAGE_KEY, DEFAULT_FILTERS),
  };
}

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

function escapeCsvValue(value: string): string {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}
</script>
