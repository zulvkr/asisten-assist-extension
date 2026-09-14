<template>
  <div>
    <!-- Header Section -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="analytics" class="q-mr-sm" />
        Rekomendasi Belanja
        <q-chip
          v-if="isAuthenticated"
          dense
          size="sm"
          color="teal-1"
          text-color="teal-9"
          icon="cloud_sync"
          class="q-ml-sm"
        >
          {{ isSyncing ? 'Menyinkronkan...' : (lastSyncTime ? `Sinkron (${lastSyncTime})` : 'Tersinkron Online') }}
        </q-chip>
      </div>
      <div class="row q-gutter-sm">
        <q-btn
          flat
          dense
          color="teal"
          icon="settings"
          label="Konfigurasi"
          @click="showSettingsPanel = !showSettingsPanel"
        />
        <q-btn
          color="teal"
          icon="refresh"
          label="Segarkan"
          :loading="loading"
          @click="refreshData"
        />
      </div>
    </div>

    <!-- Collapsible Settings Panel -->
    <q-expansion-item
      v-model="showSettingsPanel"
      icon="settings"
      label="Parameter Konfigurasi Belanja"
      caption="Ubah lead time, target stok, dan produk diabaikan"
      header-class="bg-teal-1 text-teal text-weight-bold"
      class="q-mb-md border rounded"
      expand-icon-class="text-teal"
    >
      <q-card flat bordered class="q-pa-md">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model.number="formSettings.defaultLeadTime"
              type="number"
              outlined
              dense
              label="Lead time (hari)"
              color="teal"
            />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model.number="formSettings.fastMovingMinDailySales"
              type="number"
              step="0.1"
              outlined
              dense
              label="Min/hari cepat"
              color="teal"
            />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model.number="formSettings.fastMovingLeadTime"
              type="number"
              outlined
              dense
              label="Lead cepat (hari)"
              color="teal"
            />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model.number="formSettings.fastMovingMinSalesEvents"
              type="number"
              outlined
              dense
              label="Min transaksi cepat"
              color="teal"
            />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model.number="formSettings.targetStockDays"
              type="number"
              outlined
              dense
              label="Target hari stok"
              color="teal"
            />
          </div>
        </div>

        <div class="row items-center justify-between q-mt-md">
          <div class="row q-gutter-sm">
            <q-btn
              color="teal"
              label="Simpan & Terapkan"
              :disabled="loading || !settingsDirty"
              @click="applySettings"
            />
            <q-btn
              flat
              color="grey"
              label="Reset Form"
              :disabled="!settingsDirty"
              @click="resetSettingsForm"
            />
          </div>
          <div class="text-caption text-grey">
            {{ settingsDirty ? "Ada perubahan yang belum disimpan." : "Parameter sinkron." }}
          </div>
        </div>

        <!-- Ignored Products List -->
        <div class="q-mt-lg q-pt-md border-top">
          <div class="text-subtitle2 q-mb-sm text-grey-8">
            Produk Diabaikan ({{ Object.keys(ignoredItemIds).length }})
          </div>
          <div v-if="Object.keys(ignoredItemIds).length === 0" class="text-caption text-grey">
            Tidak ada produk yang diabaikan.
          </div>
          <div v-else class="row q-col-gutter-xs">
            <div
              v-for="(ignored, itemId) in ignoredItemIds"
              :key="itemId"
              class="col-12 col-sm-6 col-md-4"
            >
              <q-card flat bordered class="bg-grey-1 q-pa-sm row items-center justify-between">
                <div class="col-9">
                  <div class="text-weight-bold text-truncate text-caption">{{ getProductName(itemId) }}</div>
                  <div class="text-caption text-grey font-mono">{{ getProductCode(itemId) }}</div>
                </div>
                <q-btn
                  size="sm"
                  color="teal"
                  label="Restore"
                  flat
                  dense
                  @click="restoreItem(itemId)"
                />
              </q-card>
            </div>
          </div>
        </div>
      </q-card>
    </q-expansion-item>

    <!-- KPI Summary Section (Compact 1 Line) -->
    <div class="row q-col-gutter-xs items-center q-mb-sm">
      <div class="col">
        <q-card 
          flat 
          bordered 
          class="bg-red-1 text-red-9 q-pa-xs cursor-pointer hover-card"
          @click="filters.statusGroup = 'red'"
        >
          <div class="row items-center justify-between q-px-xs">
            <span class="text-caption text-weight-bold">🔴 MERAH</span>
            <span class="text-subtitle2 text-weight-bolder">{{ kpis.redCount }}</span>
          </div>
        </q-card>
      </div>

      <div class="col">
        <q-card 
          flat 
          bordered 
          class="bg-orange-1 text-orange-9 q-pa-xs cursor-pointer hover-card"
          @click="filters.statusGroup = 'yellow'"
        >
          <div class="row items-center justify-between q-px-xs">
            <span class="text-caption text-weight-bold">🟡 KUNING</span>
            <span class="text-subtitle2 text-weight-bolder">{{ kpis.yellowCount }}</span>
          </div>
        </q-card>
      </div>

      <div class="col">
        <q-card 
          flat 
          bordered 
          class="bg-green-1 text-green-9 q-pa-xs cursor-pointer hover-card"
          @click="filters.statusGroup = 'green'"
        >
          <div class="row items-center justify-between q-px-xs">
            <span class="text-caption text-weight-bold">🟢 HIJAU</span>
            <span class="text-subtitle2 text-weight-bolder">{{ kpis.greenCount }}</span>
          </div>
        </q-card>
      </div>

      <div class="col">
        <q-card 
          flat 
          bordered 
          class="bg-grey-2 text-grey-9 q-pa-xs cursor-pointer hover-card"
          @click="filters.orderedFilter = 'skip'"
        >
          <div class="row items-center justify-between q-px-xs">
            <span class="text-caption text-weight-bold">⏭️ SKIP</span>
            <span class="text-subtitle2 text-weight-bolder">{{ kpis.skipCount }}</span>
          </div>
        </q-card>
      </div>

      <div class="col-12 col-sm-4 col-md-3">
        <q-card
          flat
          bordered
          class="bg-blue-1 text-blue-9 cursor-pointer hover-card q-pa-xs"
          @click="openDraftReview"
        >
          <div class="row items-center justify-between q-px-xs">
            <span class="text-caption text-weight-bold">🛒 DRAFT ({{ draftRows.length }})</span>
            <span class="text-caption text-weight-bold">{{ formatRupiah(draftRows.reduce((s, r) => s + r.estimatedCost, 0)) }}</span>
          </div>
        </q-card>
      </div>
    </div>

    <!-- Info Messages -->
    <q-banner v-if="errorMessage" rounded class="bg-red-1 text-red-9 q-mb-md">
      <template v-slot:avatar>
        <q-icon name="error" />
      </template>
      {{ errorMessage }}
    </q-banner>

    <q-banner v-if="infoMessage" rounded class="bg-blue-1 text-blue-9 q-mb-md">
      <template v-slot:avatar>
        <q-icon name="info" />
      </template>
      {{ infoMessage }}
    </q-banner>

    <q-banner v-if="warnings.length" rounded class="bg-warning text-black q-mb-md">
      <template v-slot:avatar>
        <q-icon name="warning" />
      </template>
      <div class="text-weight-bold">Catatan Peringatan:</div>
      <ul class="q-my-none q-pl-md">
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </q-banner>

    <!-- Filters Section -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-sm items-center">
        <!-- Search Input -->
        <div class="col-12 col-md-3">
          <q-input
            v-model="filters.search"
            outlined
            dense
            placeholder="Cari nama, kode, brand..."
            color="teal"
            clearable
          >
            <template v-slot:prepend>
              <q-icon name="search" />
            </template>
          </q-input>
        </div>

        <!-- Quick Filters -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-select
            v-model="filters.quickFilter"
            outlined
            dense
            emit-value
            map-options
            :options="quickFilterOptions.map(o => ({ label: o.label, value: o.key }))"
            label="Kategori Cepat"
            color="teal"
          />
        </div>

        <!-- Status Group -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-select
            v-model="filters.statusGroup"
            outlined
            dense
            emit-value
            map-options
            :options="[
              { label: '🔴🟡 Kritis & Peringatan (R/Y)', value: 'red-yellow' },
              { label: '📋 Semua Status (R/Y/G)', value: 'all' },
              { label: '🔴 Hanya Kritis (Merah)', value: 'red' },
              { label: '🟡 Hanya Peringatan (Kuning)', value: 'yellow' },
              { label: '🟢 Hanya Aman (Hijau)', value: 'green' }
            ]"
            label="Status Stok"
            color="teal"
          />
        </div>

        <!-- Ordered Filter -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-select
            v-model="filters.orderedFilter"
            outlined
            dense
            emit-value
            map-options
            :options="[
              { label: '🛒 Belum Dipesan', value: 'not-ordered' },
              { label: '📋 Semua', value: 'all' },
              { label: '📦 Sudah Dipesan', value: 'ordered' },
              { label: '⏭️ Skip', value: 'skip' }
            ]"
            label="Status Order"
            color="teal"
          />
        </div>

        <!-- Checkboxes -->
        <div class="col-12 row items-center q-gutter-md q-mt-xs">
          <q-checkbox v-model="filters.showManualReview" label="Tampilkan Review Manual" color="teal" />
          <q-checkbox v-model="filters.showDormant" label="Tampilkan Barang Pasif (Dormant)" color="teal" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Main Results Table -->
    <q-card flat bordered>
      <q-card-section class="q-pa-none">
        <q-table
          :rows="filteredRows"
          :columns="tableColumns"
          row-key="itemId"
          flat
          :loading="loading"
          :pagination="{ sortBy: 'averageDailySales', descending: true, rowsPerPage: 15 }"
          no-data-label="Tidak ada rekomendasi belanja ditemukan."
          @row-click="handleRowClick"
          class="cursor-pointer"
        >
          <template v-slot:body-cell-statusColor="props">
            <q-td :props="props">
              <q-badge
                :color="props.value === 'red' ? 'negative' : props.value === 'yellow' ? 'warning' : 'positive'"
                class="q-px-sm q-py-xs text-weight-bold"
              >
                {{ statusLabel(props.value) }}
              </q-badge>
            </q-td>
          </template>

          <template v-slot:body-cell-itemName="props">
            <q-td :props="props">
              <div class="text-weight-bold">{{ props.value }}</div>
              <div class="text-caption text-grey-6 row items-center q-gutter-x-sm">
                <span class="font-mono">{{ props.row.code }}</span>
                <span v-if="props.row.brandName">• {{ props.row.brandName }}</span>
              </div>
              <div class="row q-gutter-xs q-mt-xs" v-if="getRowIndicators(props.row).length">
                <q-badge
                  v-for="ind in getRowIndicators(props.row)"
                  :key="ind.key"
                  :color="ind.tone === 'review' ? 'negative' : ind.tone === 'dormant' ? 'purple-7' : ind.tone === 'fast' ? 'blue-8' : ind.tone === 'golden' ? 'amber-9' : 'teal'"
                  size="sm"
                  class="q-px-xs"
                  style="cursor: help"
                  :title="ind.tooltip"
                >
                  {{ ind.icon }} {{ ind.label }}
                </q-badge>
              </div>
            </q-td>
          </template>

          <template v-slot:body-cell-replenishSuggestedQty="props">
            <q-td :props="props">
              <div class="text-weight-bold text-teal">
                {{ props.value }} {{ props.row.unit }}
              </div>
              <div class="text-caption text-grey">
                Estimasi: {{ formatRupiah(props.value * (props.row.buyFee || 0)) }}
              </div>
            </q-td>
          </template>

          <template v-slot:body-cell-estimatedDaysRemaining="props">
            <q-td :props="props" class="text-right">
              <div class="text-weight-bold">
                {{ formatDays(props.value) }}
              </div>
              <div class="text-caption text-grey">hari</div>
            </q-td>
          </template>

          <template v-slot:body-cell-pendingOrder="props">
            <q-td :props="props" @click.stop class="text-center">
              <q-checkbox
                :model-value="props.row.pendingOrderQty > 0"
                @update:model-value="togglePendingOrder(props.row)"
                color="teal"
                dense
              />
            </q-td>
          </template>

          <template v-slot:body-cell-skipOrder="props">
            <q-td :props="props" @click.stop class="text-center">
              <q-checkbox
                :model-value="Boolean(skippedItemIds[props.row.itemId])"
                @update:model-value="toggleSkipItem(props.row)"
                color="grey-7"
                dense
              />
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <!-- Draft Review Dialog (Right drawer style) -->
    <q-dialog v-model="reviewOpen" position="right" full-height>
      <q-card style="width: 500px; max-width: 90vw;" class="column full-height">
        <q-card-section class="row items-center justify-between border-bottom">
          <div class="text-h6 text-teal font-weight-bold">
            <q-icon name="shopping_cart" /> Draft Order ({{ draftRows.length }})
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <!-- Draft List Items -->
        <q-card-section class="col scroll q-pa-sm">
          <q-list separator>
            <q-item v-for="item in draftRows" :key="item.itemId" class="q-py-md">
              <q-item-section>
                <q-item-label class="text-weight-bold">{{ item.itemName }}</q-item-label>
                <q-item-label caption class="font-mono">{{ item.code }} ({{ item.unit || '-' }})</q-item-label>
                <q-item-label caption class="text-teal text-weight-bold">
                  Beli: {{ formatRupiah(item.buyFee) }} • Est: {{ formatRupiah(item.estimatedCost) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <!-- Qty Adjustment -->
                <div class="row items-center q-gutter-xs">
                  <q-btn size="sm" color="teal" round icon="remove" flat @click="updateDraftQty(item, item.quantity - 1)" />
                  <span class="text-body2 text-weight-bold q-px-sm" style="min-width: 25px; text-align: center;">{{ item.quantity }}</span>
                  <q-btn size="sm" color="teal" round icon="add" flat @click="updateDraftQty(item, item.quantity + 1)" />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-separator />

        <!-- Actions panel at bottom of draft -->
        <q-card-section class="q-pa-md bg-grey-1">
          <div class="row justify-between text-subtitle1 text-weight-bold q-mb-md">
            <span>Total Estimasi Budget:</span>
            <span class="text-teal">{{ formatRupiah(draftRows.reduce((s, r) => s + r.estimatedCost, 0)) }}</span>
          </div>

          <div class="row q-col-gutter-xs">
            <div class="col-6">
              <q-btn color="teal" class="full-width" label="Salin Ringkasan" icon="content_copy" @click="copyDraftSummary" />
            </div>
            <div class="col-6">
              <q-btn color="teal" outline class="full-width" label="Unduh CSV" icon="file_download" @click="downloadDraftCsv" />
            </div>
            <div class="col-12 q-mt-sm">
              <q-btn color="red" class="full-width" label="Kosongkan Draft Belanja" icon="delete" flat @click="clearAllOrders" />
            </div>
          </div>
          <div class="text-center text-caption text-green q-mt-sm text-weight-bold" v-if="copyStatus">
            {{ copyStatus }}
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Product Price History & Supplier Comparison Modal -->
    <ProductPriceHistoryDialog
      v-model="showPriceHistoryDialog"
      :item="selectedPriceHistoryItem"
      :assist-token="assistToken"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useQuasar } from "quasar";
import ProductPriceHistoryDialog from "../components/ProductPriceHistoryDialog.vue";
import { useAssistStore } from "../stores/assistStore";
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
  resolveShoppingRecommendationSettings,
  validateShoppingRecommendationSettings,
} from "@/utils/shoppingRecommendations";
import { useShoppingRecommendationSync } from "@/composables/useShoppingRecommendationSync";
import { useFirebaseAuth } from "@/composables/useFirebaseAuth";

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
  orderedFilter: "all" | "ordered" | "not-ordered" | "skip";
  showManualReview: boolean;
  showDormant: boolean;
}

type QuickFilterKey =
  | "all"
  | "fast-moving"
  | "bulk-spike"
  | "golden-product";

interface EnhancedRecommendationRow extends ShoppingRecommendationRow {
  draftedQty: number;
  remainingSuggestedQty: number;
  isCovered: boolean;
  isSkipped: boolean;
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
  | "fast"
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
const SKIPPED_STORAGE_KEY = "shoppingRecommendation:skippedItems";

const DEFAULT_FILTERS: FiltersState = {
  search: "",
  quickFilter: "all",
  statusGroup: "red-yellow",
  orderedFilter: "not-ordered",
  showManualReview: true,
  showDormant: true,
};

const quickFilterOptions: Array<{ key: QuickFilterKey; label: string }> = [
  { key: "all", label: "📋 Semua" },
  { key: "fast-moving", label: "⚡ Fast Moving" },
  { key: "bulk-spike", label: "📦 Bulk Spike" },
  { key: "golden-product", label: "⭐ Produk Emas" },
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
const showSettingsPanel = ref(false);

const showPriceHistoryDialog = ref(false);
const selectedPriceHistoryItem = ref<ShoppingRecommendationRow | null>(null);
const assistToken = ref("");

function openPriceHistory(row: ShoppingRecommendationRow) {
  selectedPriceHistoryItem.value = row;
  showPriceHistoryDialog.value = true;
}

function maxDailyQty(row: ShoppingRecommendationRow | null): number {
  if (!row?.dailySalesTrend?.length) return 1;
  return Math.max(1, ...row.dailySalesTrend.map((d) => d.qty));
}

const activeSettings = ref<ShoppingRecommendationSettings>(loadStoredSettings());
const formSettings = ref<ShoppingRecommendationSettings>({
  ...activeSettings.value,
});
const filters = reactive<FiltersState>({ ...DEFAULT_FILTERS });
const ignoredItemIds = ref<Record<string, boolean>>(loadStoredIgnoredItems());
const skippedItemIds = ref<Record<string, boolean>>(loadStoredSkippedItems());

const { isAuthenticated } = useFirebaseAuth();
const { isSyncing, lastSyncTime, syncError, subscribeToSharedState, updateSharedState } =
  useShoppingRecommendationSync();

onMounted(() => {
  subscribeToSharedState((sharedState) => {
    if (sharedState.skippedItemIds !== undefined) {
      skippedItemIds.value = sharedState.skippedItemIds;
      saveStorage(SKIPPED_STORAGE_KEY, sharedState.skippedItemIds);
    }
    if (sharedState.ignoredItemIds !== undefined) {
      ignoredItemIds.value = sharedState.ignoredItemIds;
      saveStorage(IGNORED_STORAGE_KEY, sharedState.ignoredItemIds);
    }
    if (sharedState.settings !== undefined) {
      const resolved = resolveShoppingRecommendationSettings(sharedState.settings);
      activeSettings.value = { ...resolved };
      formSettings.value = { ...resolved };
      saveStorage(SETTINGS_STORAGE_KEY, resolved);
    }
  });
});

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
      const isSkipped = Boolean(skippedItemIds.value[row.itemId]);

      return {
        ...row,
        draftedQty,
        remainingSuggestedQty,
        isCovered,
        isSkipped,
      };
    })
    .sort((left, right) => {
      if (right.averageDailySales !== left.averageDailySales) {
        return right.averageDailySales - left.averageDailySales;
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

    const isSkipped = Boolean(skippedItemIds.value[row.itemId]);

    if (filters.orderedFilter === "skip") {
      if (!isSkipped) return false;
    } else {
      if (isSkipped) return false;

      if (filters.orderedFilter === "ordered") {
        if (row.pendingOrderQty <= 0) return false;
      } else if (filters.orderedFilter === "not-ordered") {
        if (row.pendingOrderQty > 0) return false;
      }
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

    if (!filters.showManualReview && row.needsManualReview) {
      return false;
    }
    if (!filters.showDormant && row.isDormant) {
      return false;
    }

    return matchesSearch && matchesStatus && matchesQuickFilter(row);
  });
});

const draftRows = computed<DraftSummaryRow[]>(() => {
  return enhancedRows.value
    .filter(
      (row) =>
        row.pendingOrderQty > 0 &&
        !skippedItemIds.value[row.itemId] &&
        !ignoredItemIds.value[row.itemId],
    )
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

const kpis = computed(() => {
  const activeRows = rows.value.filter(
    (row) =>
      !skippedItemIds.value[row.itemId] && !ignoredItemIds.value[row.itemId],
  );
  const redCount = activeRows.filter((row) => row.statusColor === "red").length;
  const yellowCount = activeRows.filter((row) => row.statusColor === "yellow").length;
  const greenCount = activeRows.filter((row) => row.statusColor === "green").length;
  const skipCount = rows.value.filter(
    (row) =>
      Boolean(skippedItemIds.value[row.itemId]) &&
      !ignoredItemIds.value[row.itemId],
  ).length;
  const estimatedBudget = activeRows
    .filter((row) => row.statusColor === "red" || row.statusColor === "yellow")
    .reduce((sum, row) => sum + (row.buyFee ?? 0) * row.replenishSuggestedQty, 0);

  return {
    redCount,
    yellowCount,
    greenCount,
    skipCount,
    estimatedBudget,
  };
});

const tableColumns = [
  { name: "code", label: "Kode", align: "left", field: "code", sortable: true, classes: "font-mono" },
  { name: "itemName", label: "Nama Produk", align: "left", field: "itemName", sortable: true },
  { name: "stockTotal", label: "Stok", align: "right", field: "stockTotal", sortable: true },
  { name: "pendingOrder", label: "Sudah Dipesan", align: "center", field: "pendingOrderQty", sortable: true },
  { name: "skipOrder", label: "Skip", align: "center", field: "isSkipped", sortable: true },
  { name: "estimatedDaysRemaining", label: "Sisa Hari", align: "right", field: "estimatedDaysRemaining", sortable: true },
  { name: "averageDailySales", label: "Jual/Hari", align: "right", field: "averageDailySales", sortable: true, format: (val: number) => formatDailySales(val) },
  { name: "statusColor", label: "Status", align: "center", field: "statusColor", sortable: true },
  { name: "replenishSuggestedQty", label: "Saran Order", align: "right", field: "replenishSuggestedQty", sortable: true },
];

watch(
  () => store.assistToken,
  (newToken) => {
    if (newToken) {
      void refreshData();
    }
  },
  { immediate: true }
);

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
  void updateSharedState({ settings: activeSettings.value });
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

  const token = store.assistToken;
  if (!token) {
    errorMessage.value = "Token Assist belum terdeteksi. Silakan klik label 'Token Assist Belum Diisi' di bagian atas (header) untuk memuat token dari tab clinica.assist.id yang aktif.";
    loading.value = false;
    return;
  }

  assistToken.value = token;

  try {
    const response = (await browser.runtime.sendMessage({
      type: "FETCH_SHOPPING_RECOMMENDATIONS",
      payload: {
        assistToken: token,
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
    warnings.value = [...response.warnings];
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
      infoMessage.value = `${row.itemName} dihapus dari draf belanja.`;
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
      infoMessage.value = `${row.itemName} ditambahkan ke draf belanja (${qty} ${row.unit}).`;
    }
  } catch (error) {
    // Revert local state on error
    if (localRow) {
      localRow.pendingOrderQty = isCurrentlyPending ? qty : 0;
    }
    errorMessage.value = "Gagal mengubah status belanja.";
  }
}

async function updateDraftQty(item: DraftSummaryRow, newQty: number) {
  if (newQty <= 0) {
    const row = enhancedRows.value.find((r) => r.itemId === item.itemId);
    if (row) togglePendingOrder(row);
  } else {
    const localRow = rows.value.find((r) => r.itemId === item.itemId);
    if (localRow) {
      localRow.pendingOrderQty = newQty;
    }
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
            quantity: newQty,
            buyFee: item.buyFee,
            leadTimeLimit: 3
          }
        ]
      }
    });
  }
}



async function clearAllOrders() {
  if (!confirm("Apakah Anda yakin ingin mengosongkan semua pesanan aktif?")) {
    return;
  }

  const backups = rows.value.map((row) => ({ itemId: row.itemId, qty: row.pendingOrderQty }));

  for (const row of rows.value) {
    row.pendingOrderQty = 0;
  }

  try {
    await browser.runtime.sendMessage({
      type: "CLEAR_ALL_OUTSTANDING_ORDERS",
    });
    infoMessage.value = "Semua pesanan berhasil dikosongkan.";
    reviewOpen.value = false;
  } catch (error) {
    for (const backup of backups) {
      const localRow = rows.value.find((r) => r.itemId === backup.itemId);
      if (localRow) {
        localRow.pendingOrderQty = backup.qty;
      }
    }
    errorMessage.value = "Gagal mengosongkan pesanan.";
  }
}

function openDraftReview() {
  if (!draftRows.value.length) {
    $q.notify({
      type: "warning",
      message: "Tandai minimal satu item sebagai draf belanja terlebih dahulu.",
      position: "top"
    });
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
  copyStatus.value = "Ringkasan draft berhasil disalin ke clipboard.";
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
      return "🔴 MERAH";
    case "yellow":
      return "🟡 KUNING";
    case "green":
      return "🟢 HIJAU";
    default:
      return status;
  }
}

function handleRowClick(event: any, row: EnhancedRecommendationRow) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, label, a, summary, details, .q-btn, .q-checkbox")) {
    return;
  }

  openPriceHistory(row);
}

const $q = useQuasar();
const store = useAssistStore();

function getRowIndicators(row: EnhancedRecommendationRow): ItemIndicator[] {
  const indicators: ItemIndicator[] = [];

  if (row.hasUnitHistoryWarning) {
    indicators.push({
      key: `${row.itemId}-unit-history`,
      icon: "⚠️",
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
      icon: "🔍",
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
      icon: "💤",
      label: "Dormant",
      tooltip: "Tidak bergerak dalam 30 hari terakhir.",
      tone: "dormant",
    });
  }

  if (row.isCovered) {
    indicators.push({
      key: `${row.itemId}-covered`,
      icon: "✅",
      label: "Covered",
      tooltip: `Sudah tercakup draft. Draft saat ini: ${row.draftedQty}.`,
      tone: "covered",
    });
  }

  if (row.pendingOrderQty > 0) {
    indicators.push({
      key: `${row.itemId}-pending-order`,
      icon: "📦",
      label: "PO aktif",
      tooltip: `Ada purchase order outstanding sebanyak ${row.pendingOrderQty}.`,
      tone: "covered",
    });
  }

  if (row.isFastMoving) {
    indicators.push({
      key: `${row.itemId}-fast-moving`,
      icon: "⚡",
      label: "Fast Moving",
      tooltip: `Produk cepat laku (${formatDailySales(row.averageDailySales)}/hari, ${row.salesEvents}x transaksi).`,
      tone: "fast",
    });
  }

  if (row.isBulkSpike) {
    indicators.push({
      key: `${row.itemId}-bulk-spike`,
      icon: "📦",
      label: "Bulk Spike",
      tooltip: `Lonjakan borongan (${row.qtySold30Days} unit dalam ${row.salesEvents}x order). Kecepatan belanja diredam agar modal aman.`,
      tone: "review",
    });
  }

  if (row.isGoldenProduct) {
    indicators.push({
      key: `${row.itemId}-golden-product`,
      icon: "⭐",
      label: "Produk emas",
      tooltip: "Produk dengan kontribusi profit tinggi.",
      tone: "golden",
    });
  }

  if (row.isDeadStock) {
    indicators.push({
      key: `${row.itemId}-dead-stock`,
      icon: "🛑",
      label: "Stok mati",
      tooltip: "Perputaran sangat lambat dan berisiko menjadi stok mati.",
      tone: "dead",
    });
  }

  return indicators;
}

function matchesQuickFilter(row: EnhancedRecommendationRow): boolean {
  switch (filters.quickFilter) {
    case "fast-moving":
      return row.isFastMoving;
    case "bulk-spike":
      return row.isBulkSpike;
    case "golden-product":
      return row.isGoldenProduct;
    case "all":
    default:
      return true;
  }
}

function formatDailySales(value: number): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "-";
  }
  return value >= 10
    ? value.toFixed(0)
    : value >= 1
      ? value.toFixed(1)
      : value.toFixed(2);
}

function formatDays(value: number): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "-";
  }
  if (value >= 9999) {
    return "Dormant";
  }

  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function restoreItem(itemId: string) {
  const nextIgnored = { ...ignoredItemIds.value };
  delete nextIgnored[itemId];
  ignoredItemIds.value = nextIgnored;
  saveStoredIgnoredItems(ignoredItemIds.value);
  void updateSharedState({ ignoredItemIds: nextIgnored });
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

function loadStoredSettings(): ShoppingRecommendationSettings {
  const parsed = loadStorage<Partial<ShoppingRecommendationSettings>>(
    SETTINGS_STORAGE_KEY,
    {},
  );
  return resolveShoppingRecommendationSettings(parsed);
}

function saveStoredIgnoredItems(value: Record<string, boolean>) {
  saveStorage(IGNORED_STORAGE_KEY, value);
}

function loadStoredIgnoredItems(): Record<string, boolean> {
  return loadStorage<Record<string, boolean>>(IGNORED_STORAGE_KEY, {});
}

// Skipped items storage helpers
function loadStoredSkippedItems(): Record<string, boolean> {
  return loadStorage<Record<string, boolean>>(SKIPPED_STORAGE_KEY, {});
}

function saveStoredSkippedItems(value: Record<string, boolean>) {
  saveStorage(SKIPPED_STORAGE_KEY, value);
}

function toggleSkipItem(row: EnhancedRecommendationRow | ShoppingRecommendationRow) {
  const isSkipped = Boolean(skippedItemIds.value[row.itemId]);
  const nextSkipped = { ...skippedItemIds.value };
  if (isSkipped) {
    delete nextSkipped[row.itemId];
    infoMessage.value = `${row.itemName} dihapus dari status skip.`;
  } else {
    nextSkipped[row.itemId] = true;
    infoMessage.value = `${row.itemName} ditandai sebagai skip.`;
  }
  skippedItemIds.value = nextSkipped;
  saveStoredSkippedItems(nextSkipped);
  void updateSharedState({ skippedItemIds: nextSkipped });
}

function ignoreItem(itemId: string) {
  if (confirm("Abaikan produk ini dari rekomendasi belanja?")) {
    ignoredItemIds.value = {
      ...ignoredItemIds.value,
      [itemId]: true,
    };
    saveStoredIgnoredItems(ignoredItemIds.value);
    void updateSharedState({ ignoredItemIds: ignoredItemIds.value });
    infoMessage.value = "Produk berhasil diabaikan.";
  }
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

<style scoped>
.font-mono {
  font-family: monospace;
}
.hover-card:hover {
  background-color: #e3f2fd !important;
  transition: background-color 0.2s ease-in-out;
}
.border-bottom {
  border-bottom: 1px solid #e0e0e0;
}
.border-top {
  border-top: 1px solid #e0e0e0;
}
</style>
