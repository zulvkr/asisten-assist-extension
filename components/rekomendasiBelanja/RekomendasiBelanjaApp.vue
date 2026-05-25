<template>
  <main class="recommendation-root">
    <section class="hero">
      <div>
        <h1>Rekomendasi Belanja</h1>
        <p>
          Dashboard belanja mingguan berbasis Assist untuk melihat stok kritis,
          item lambat bergerak, review unit, dan draft belanja aktif dalam satu
          workspace.
        </p>
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
          :disabled="!draftRows.length"
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
        <p>Item kritis terhadap lead time.</p>
      </article>
      <article class="kpi-card kpi-yellow">
        <h3>Kuning</h3>
        <strong>{{ kpis.yellowCount }}</strong>
        <p>Butuh perhatian sebelum stok aman.</p>
      </article>
      <article class="kpi-card kpi-green">
        <h3>Hijau</h3>
        <strong>{{ kpis.greenCount }}</strong>
        <p>Masih aman untuk target stok saat ini.</p>
      </article>
      <article class="kpi-card kpi-review">
        <h3>Review Unit</h3>
        <strong>{{ kpis.manualReviewCount }}</strong>
        <p>Terjual dengan lebih dari satu unit.</p>
      </article>
      <article class="kpi-card kpi-dormant">
        <h3>Dormant</h3>
        <strong>{{ kpis.dormantCount }}</strong>
        <p>Tidak ada penjualan 30 hari terakhir.</p>
      </article>
      <article class="kpi-card kpi-budget">
        <h3>Budget Draft</h3>
        <strong>{{ formatRupiah(kpis.draftBudget) }}</strong>
        <p>{{ kpis.draftItems }} item aktif di draft kerja.</p>
      </article>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>Pengaturan Default</h2>
        <span>Lookback terkunci 30 hari, simpan lokal di extension.</span>
      </div>

      <div class="settings-grid">
        <div class="field">
          <label for="defaultLeadTime">Default lead time</label>
          <input
            id="defaultLeadTime"
            v-model.number="formSettings.defaultLeadTime"
            type="number"
            min="1"
            step="1"
          />
        </div>
        <div class="field">
          <label for="cheapProductMaxPrice">Batas produk murah</label>
          <input
            id="cheapProductMaxPrice"
            v-model.number="formSettings.cheapProductMaxPrice"
            type="number"
            min="0"
            step="100"
          />
        </div>
        <div class="field">
          <label for="fastMovingMinDailySales">Min sales/hari cepat laku</label>
          <input
            id="fastMovingMinDailySales"
            v-model.number="formSettings.fastMovingMinDailySales"
            type="number"
            min="0"
            step="0.1"
          />
        </div>
        <div class="field">
          <label for="cheapFastMovingLeadTime">Lead time murah + cepat</label>
          <input
            id="cheapFastMovingLeadTime"
            v-model.number="formSettings.cheapFastMovingLeadTime"
            type="number"
            min="1"
            step="1"
          />
        </div>
        <div class="field">
          <label for="targetStockDays">Target stok hari</label>
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
        <span
          >{{ filteredRows.length }} dari {{ enhancedRows.length }} item
          tampil</span
        >
      </div>

      <div class="filter-grid">
        <div class="field">
          <label for="searchInput">Cari produk, kode, atau brand</label>
          <input
            id="searchInput"
            v-model.trim="filters.search"
            type="search"
            placeholder="Contoh: paracetamol, MS001217, Dexa"
          />
        </div>

        <div class="toggle-row">
          <span>Status default</span>
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
          <span>State tambahan</span>
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
            yang sudah tercakup draft</label
          >
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>Tambah dari Katalog Assist</h2>
        <span>Tambah item spontan di luar red/yellow tanpa baris bebas.</span>
      </div>

      <div class="field">
        <label for="manualSearch">Cari minimal 2 karakter</label>
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
              <th>Terjual 30h</th>
              <th>Rata/Hari</th>
              <th>Sisa Hari</th>
              <th>Target</th>
              <th>Saran Sistem</th>
              <th>Buy Fee</th>
              <th>Draft Qty</th>
              <th>Sisa Saran</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.itemId">
              <td class="product-cell">
                <strong>{{ row.itemName }}</strong>
                <div class="product-meta">
                  {{ row.code || "Tanpa kode" }} •
                  {{ row.brandName || "Tanpa brand" }} •
                  {{ row.unit || "Tanpa unit" }}
                </div>
                <div class="table-actions" style="margin-top: 8px">
                  <span v-if="row.needsManualReview" class="tag tag-review"
                    >Perlu review unit</span
                  >
                  <span v-if="row.isDormant" class="tag tag-dormant"
                    >Dormant 30 hari</span
                  >
                  <span v-if="row.isCovered" class="tag tag-covered"
                    >Sudah tercakup draft</span
                  >
                </div>
                <div
                  v-if="row.notes.length"
                  class="cell-note"
                  style="margin-top: 8px"
                >
                  {{ row.notes.join(" | ") }}
                </div>
              </td>
              <td>
                <span :class="['status-badge', `status-${row.statusColor}`]">
                  {{ statusLabel(row.statusColor) }}
                </span>
              </td>
              <td>{{ row.stockTotal }}</td>
              <td>{{ row.qtySold30Days }}</td>
              <td>{{ formatDailySales(row.averageDailySales) }}</td>
              <td>{{ formatDays(row.estimatedDaysRemaining) }}</td>
              <td>{{ row.needsManualReview ? "Manual" : row.targetStock }}</td>
              <td>
                {{
                  row.needsManualReview ? "Manual" : row.calculatedSuggestedQty
                }}
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
                  <button
                    type="button"
                    class="ghost-button"
                    @click="seedDraftFromRow(row)"
                  >
                    {{
                      row.draftedQty > 0
                        ? "Isi Ulang"
                        : row.needsManualReview || row.isDormant
                          ? "Isi Manual"
                          : "Isi Saran"
                    }}
                  </button>
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
  showRed: boolean;
  showYellow: boolean;
  showGreen: boolean;
  showManualReview: boolean;
  showDormant: boolean;
  showCovered: boolean;
}

interface EnhancedRecommendationRow extends ShoppingRecommendationRow {
  draftedQty: number;
  remainingSuggestedQty: number;
  isCovered: boolean;
}

interface DraftSummaryRow {
  itemId: string;
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

const SETTINGS_STORAGE_KEY = "shoppingRecommendation:settings";
const DRAFT_STORAGE_KEY = "shoppingRecommendation:draft";
const FILTERS_STORAGE_KEY = "shoppingRecommendation:filters";
const DEFAULT_FILTERS: FiltersState = {
  search: "",
  showRed: true,
  showYellow: true,
  showGreen: false,
  showManualReview: true,
  showDormant: false,
  showCovered: true,
};

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

    if (!filters.showCovered && row.isCovered) {
      return false;
    }

    return matchesSearch && matchesStatus;
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

function seedDraftFromRow(row: EnhancedRecommendationRow) {
  const suggestedQuantity =
    row.needsManualReview || row.isDormant
      ? row.draftedQty || 1
      : row.remainingSuggestedQty ||
        row.calculatedSuggestedQty ||
        row.draftedQty ||
        1;
  setDraftQuantity(row.itemId, suggestedQuantity);
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
