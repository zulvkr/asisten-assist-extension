<template>
  <div class="q-pa-md" tabindex="0" @keydown="handleGlobalKeydown">
    <!-- Header -->
    <div class="row items-center justify-between q-mb-md">
      <div class="row items-center q-gutter-sm">
        <q-btn flat round icon="arrow_back" color="teal" @click="backToList" />
        <div>
          <div class="row items-center q-gutter-x-sm">
            <h1 class="text-h5 text-weight-bold text-teal q-my-none">
              {{ session?.opnameNumber || "Memuat..." }}
            </h1>
            <q-badge :color="getStatusColor(session?.status)" class="text-weight-bold q-px-sm">
              {{ getStatusLabel(session?.status) }}
            </q-badge>
            <q-badge :color="getScopeBadgeColor(session?.scope)" outline class="text-weight-bold q-px-sm">
              {{ getScopeBadgeLabel(session?.scope) }}
            </q-badge>
            <q-badge v-if="session?.scopeDetails?.shiftLabel" color="grey-3" text-color="grey-9" class="q-px-sm">
              {{ session.scopeDetails.shiftLabel }}
            </q-badge>
            <q-badge v-if="hasUnsavedChanges" color="warning" text-color="black" class="q-ml-xs">
              Perubahan Belum Tersimpan
            </q-badge>
            <q-spinner-dots v-if="isSavingBatch" color="teal" size="20px" class="q-ml-xs" />
          </div>
          <div class="text-caption text-grey-7 q-mt-xs">
            Dibuat: {{ formatDateTime(session?.createdAt) }} oleh <strong>{{ session?.createdBy }}</strong>
            <span v-if="session?.notes"> • Catatan: <em>{{ session.notes }}</em></span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="row q-gutter-sm" v-if="session?.status === 'InProgress'">
        <q-btn
          color="teal"
          icon="save"
          label="Simpan (Ctrl+S)"
          no-caps
          unelevated
          :loading="isSavingBatch"
          :disable="!hasUnsavedChanges"
          @click="saveAllDirty"
        />

        <q-btn
          color="positive"
          icon="check_circle"
          label="Selesaikan & Posting (F5)"
          no-caps
          unelevated
          :disable="!permissions.canFinalizeOpname"
          @click="openFinishDialog"
        >
          <q-tooltip v-if="!permissions.canFinalizeOpname">
            Hanya Auditor atau Owner yang memiliki izin memposting ke Assist
          </q-tooltip>
        </q-btn>

        <q-btn
          color="negative"
          icon="cancel"
          label="Batalkan"
          no-caps
          flat
          :disable="!permissions.canCancelOpname"
          @click="confirmCancel"
        >
          <q-tooltip v-if="!permissions.canCancelOpname">
            Hanya Auditor atau Owner yang dapat membatalkan sesi
          </q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loadingMaster" class="text-center q-pa-xl">
      <q-spinner-dots color="teal" size="50px" />
      <div class="text-subtitle1 text-grey-7 q-mt-md">Mengambil katalog produk dari Assist...</div>
    </div>

    <div v-else>
      <!-- Action Zone: Search & Scan Barcode (F1) -->
      <div class="row q-mb-md relative-position" v-if="session?.status === 'InProgress'">
        <div class="col-12">
          <q-input
            ref="productSearchInputRef"
            v-model="productSearch"
            label="Scan Barcode / Cari Produk (F1)"
            outlined
            dense
            bg-color="white"
            placeholder="Scan barcode atau ketik nama obat / kode..."
            color="teal"
            clearable
            @keydown.enter="selectFirstProduct"
          >
            <template v-slot:prepend>
              <q-icon name="qr_code_scanner" color="teal" />
            </template>
          </q-input>

          <!-- Dropdown Hasil Pencarian Cepat -->
          <q-list
            v-if="quickSearchResults.length > 0"
            bordered
            separator
            class="bg-white q-mt-xs absolute-top shadow-5 rounded-borders"
            style="z-index: 1000; width: 100%; top: 100%; max-height: 280px; overflow-y: auto;"
          >
            <q-item
              v-for="(item, idx) in quickSearchResults"
              :key="item.id"
              clickable
              v-ripple
              dense
              :active="idx === 0"
              active-class="bg-teal-1 text-teal-9"
              @click="selectQuickProduct(item)"
            >
              <q-item-section>
                <q-item-label class="text-weight-medium">{{ item.name }}</q-item-label>
                <q-item-label caption class="row items-center q-gutter-x-xs">
                  <span class="font-mono bg-grey-3 q-px-xs rounded">{{ item.code }}</span>
                  <span>•</span>
                  <span>Satuan: {{ item.unit }}</span>
                  <template v-if="permissions.canViewSystemQty">
                    <span>•</span>
                    <span>Stok Sistem: <strong>{{ item.systemQuantity }}</strong></span>
                  </template>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge :color="item.isCounted ? 'positive' : 'grey'">
                  {{ item.isCounted ? `Fisik: ${item.countedQuantity}` : 'Belum dihitung' }}
                </q-badge>
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </div>

      <!-- KPI Progress Card -->
      <q-card flat bordered class="q-mb-md bg-grey-1 rounded-borders">
        <q-card-section>
          <div class="row items-center q-col-gutter-md">
            <!-- Progress Bar -->
            <div class="col-12 col-md-4">
              <div class="text-caption text-grey-7 q-mb-xs">Progres Penghitungan Fisik</div>
              <q-linear-progress
                :value="progressPercent / 100"
                size="24px"
                color="teal"
                track-color="grey-3"
                class="rounded-borders"
              >
                <div class="absolute-full flex flex-center">
                  <span class="text-weight-bold text-white text-caption">{{ progressPercent }}% Selesai</span>
                </div>
              </q-linear-progress>
            </div>

            <!-- Total Item -->
            <div class="col-6 col-md-2 text-center">
              <div class="text-caption text-grey-7">Total Item</div>
              <div class="text-h6 text-weight-bold text-blue-grey-9">{{ summary.totalItems }}</div>
            </div>

            <!-- Sudah Dihitung -->
            <div class="col-6 col-md-2 text-center">
              <div class="text-caption text-grey-7">Sudah Dihitung</div>
              <div class="text-h6 text-weight-bold text-teal">{{ summary.countedItems }}</div>
            </div>

            <!-- Item Berselisih -->
            <div class="col-6 col-md-2 text-center">
              <div class="text-caption text-grey-7">Ada Selisih</div>
              <div class="text-h6 text-weight-bold text-negative">{{ summary.discrepancyCount }}</div>
            </div>

            <!-- Total Selisih -->
            <div class="col-6 col-md-2 text-center" v-if="permissions.canViewSystemQty">
              <div class="text-caption text-grey-7">Total Selisih (+/-)</div>
              <div
                class="text-h6 text-weight-bold"
                :class="summary.totalVariance > 0 ? 'text-positive' : summary.totalVariance < 0 ? 'text-negative' : 'text-grey-7'"
              >
                {{ summary.totalVariance > 0 ? '+' : '' }}{{ summary.totalVariance }}
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Table Filter Bar -->
      <div class="row items-center justify-between q-mb-sm q-col-gutter-sm">
        <div class="col-12 col-md-5">
          <q-input
            v-model="tableFilter"
            dense
            outlined
            bg-color="white"
            placeholder="Saring daftar (nama obat, kode, BHP)..."
            color="teal"
            clearable
          >
            <template v-slot:prepend>
              <q-icon name="filter_alt" />
            </template>
          </q-input>
        </div>

        <div class="col-12 col-md-7 row justify-end q-gutter-x-xs">
          <q-btn-toggle
            v-model="statusFilterTab"
            dense
            no-caps
            rounded
            unelevated
            toggle-color="teal"
            color="grey-3"
            text-color="grey-8"
            :options="[
              { label: 'Semua', value: 'all' },
              { label: `Ada Selisih (${summary.discrepancyCount})`, value: 'discrepancy' },
              { label: 'Sesuai (Selisih 0)', value: 'matched' },
              { label: `Belum Dihitung (${summary.uncountedItems})`, value: 'uncounted' },
            ]"
          />
        </div>
      </div>

      <!-- Main Opname Table -->
      <q-card flat bordered class="rounded-borders">
        <q-table
          :rows="filteredItems"
          :columns="itemColumns"
          row-key="id"
          flat
          dense
          v-model:pagination="tablePagination"
          :rows-per-page-options="[20, 50, 100, 250, 0]"
          no-data-label="Tidak ada item yang cocok dengan filter."
        >
          <template v-slot:body="props">
            <q-tr
              :props="props"
              :class="{
                'bg-red-1': permissions.canViewSystemQty && props.row.isCounted && props.row.countedQuantity !== props.row.systemQuantity,
                'bg-teal-1': props.row.isCounted && props.row.countedQuantity === props.row.systemQuantity,
              }"
            >
              <!-- Nama & Kode Produk -->
              <q-td key="name" :props="props">
                <div class="column">
                  <span class="text-weight-bold text-blue-grey-9">{{ props.row.name }}</span>
                  <div class="row items-center q-gutter-x-xs text-caption text-grey-7">
                    <span class="font-mono bg-grey-3 q-px-xs rounded">{{ props.row.code }}</span>
                    <span>•</span>
                    <q-badge outline :color="props.row.itemValue === 'akhp' ? 'orange' : 'teal'" size="xs">
                      {{ props.row.itemValue === 'akhp' ? 'BHP' : 'Obat' }}
                    </q-badge>
                  </div>
                </div>
              </q-td>

              <!-- Satuan -->
              <q-td key="unit" :props="props">
                {{ props.row.unit }}
              </q-td>

              <!-- Stok Sistem (Jika Berizin) -->
              <q-td v-if="permissions.canViewSystemQty" key="systemQuantity" :props="props" class="text-right">
                <span class="text-weight-medium">{{ props.row.systemQuantity }}</span>
              </q-td>

              <!-- Input Stok Fisik -->
              <q-td key="countedQuantity" :props="props" class="text-right">
                <q-input
                  v-model.number="props.row.countedQuantity"
                  type="number"
                  dense
                  outlined
                  bg-color="white"
                  input-class="text-right text-weight-bold"
                  style="max-width: 110px; margin-left: auto;"
                  :disable="session?.status !== 'InProgress'"
                  @update:model-value="() => onCountChanged(props.row)"
                  @keydown.enter="focusNextRow(props.pageIndex)"
                />
              </q-td>

              <!-- Selisih (Jika Berizin) -->
              <q-td v-if="permissions.canViewSystemQty" key="variance" :props="props" class="text-right">
                <template v-if="props.row.isCounted && props.row.countedQuantity !== null">
                  <span
                    :class="
                      props.row.countedQuantity - props.row.systemQuantity > 0
                        ? 'text-positive text-weight-bold'
                        : props.row.countedQuantity - props.row.systemQuantity < 0
                        ? 'text-negative text-weight-bold'
                        : 'text-grey-6'
                    "
                  >
                    {{ props.row.countedQuantity - props.row.systemQuantity > 0 ? '+' : '' }}
                    {{ props.row.countedQuantity - props.row.systemQuantity }}
                  </span>
                  <q-icon
                    v-if="props.row.countedQuantity - props.row.systemQuantity !== 0"
                    name="warning"
                    color="negative"
                    size="xs"
                    class="q-ml-xs"
                  />
                </template>
                <span v-else class="text-grey-4">-</span>
              </q-td>

              <!-- Alasan Selisih -->
              <q-td key="reason" :props="props">
                <div class="row items-center no-wrap q-gutter-x-xs">
                  <q-select
                    v-model="props.row.reason"
                    dense
                    outlined
                    bg-color="white"
                    :options="reasonPresets"
                    style="min-width: 170px; max-width: 220px;"
                    placeholder="Pilih Alasan..."
                    :disable="session?.status !== 'InProgress'"
                    @update:model-value="() => onCountChanged(props.row)"
                  />
                  <q-btn
                    flat
                    round
                    dense
                    color="grey-7"
                    icon="edit_note"
                    size="sm"
                    :disable="session?.status !== 'InProgress'"
                    @click="openReasonDialog(props.row)"
                  >
                    <q-tooltip>Ketik alasan custom</q-tooltip>
                  </q-btn>
                </div>
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </q-card>
    </div>

    <!-- Dialog Selesaikan & Posting (F5) -->
    <q-dialog v-model="finishDialogOpen" persistent>
      <q-card style="min-width: 500px; max-width: 600px" class="q-pa-sm shadow-10">
        <q-card-section class="bg-teal text-white rounded-borders">
          <div class="row items-center no-wrap">
            <q-avatar icon="fact_check" color="teal-8" text-color="white" class="q-mr-sm" />
            <div>
              <div class="text-h6 text-weight-bold">Selesaikan & Posting Opname</div>
              <div class="text-caption text-teal-1">Konfirmasi Penyesuaian Stok ke Assist</div>
            </div>
          </div>
        </q-card-section>

        <q-card-section class="q-pt-md q-gutter-y-md">
          <!-- Refreshing Live Stock State -->
          <div v-if="verifyingLiveStock" class="text-center q-pa-md">
            <q-spinner-dots color="teal" size="30px" />
            <div class="text-caption text-grey-7 q-mt-xs">Mengambil stok terbaru dari Assist untuk verifikasi...</div>
          </div>

          <div v-else class="q-gutter-y-sm">
            <!-- Peringatan Item Belum Dihitung -->
            <q-banner v-if="summary.uncountedItems > 0" rounded class="bg-amber-1 text-brown-9">
              <template v-slot:avatar>
                <q-icon name="warning" color="warning" />
              </template>
              Terdapat <strong>{{ summary.uncountedItems }} item</strong> yang belum dihitung. Item tersebut akan <strong>diabaikan</strong> dan stoknya di Assist tetap tidak berubah.
            </q-banner>

            <!-- Ringkasan Penyesuaian -->
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-card flat bordered class="bg-grey-1 text-center q-pa-sm">
                  <div class="text-caption text-grey-7">Item Dihitung Sesuai</div>
                  <div class="text-subtitle1 text-weight-bold text-teal">
                    {{ summary.countedItems - summary.discrepancyCount }} item
                  </div>
                </q-card>
              </div>
              <div class="col-6">
                <q-card flat bordered class="bg-grey-1 text-center q-pa-sm">
                  <div class="text-caption text-grey-7">Item Berselisih</div>
                  <div class="text-subtitle1 text-weight-bold text-negative">
                    {{ summary.discrepancyCount }} item
                  </div>
                </q-card>
              </div>
            </div>

            <div class="text-caption text-grey-8 q-mt-sm">
              Sistem akan memposting penyesuaian stok untuk <strong>{{ summary.discrepancyCount }} item</strong> melalui API resmi Assist (<code>PUT /KTxes/repairStockOpname</code>).
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pt-none">
          <q-btn flat label="Batal" color="grey-7" v-close-popup :disable="submittingFinish" />
          <q-btn
            color="positive"
            label="Ya, Posting ke Assist"
            icon="check_circle"
            class="text-weight-bold"
            :loading="submittingFinish"
            :disable="verifyingLiveStock || summary.countedItems === 0"
            @click="executePostingToAssist"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog Edit Alasan Custom -->
    <q-dialog v-model="reasonDialogOpen">
      <q-card style="min-width: 360px">
        <q-card-section class="q-pb-none">
          <div class="text-subtitle1 text-weight-bold">Alasan Selisih Produk</div>
          <div class="text-caption text-grey-7">{{ activeRowForReason?.name }}</div>
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="customReasonInput"
            outlined
            dense
            label="Catatan / Alasan"
            placeholder="Tulis alasan selisih..."
            autofocus
            @keydown.enter="saveCustomReason"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Batal" v-close-popup />
          <q-btn color="teal" label="Simpan" @click="saveCustomReason" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { useAssistStore } from "../stores/assistStore";
import { useFirebaseAuth } from "@/composables/useFirebaseAuth";
import type {
  StockOpnameSession,
  StockOpnameStatus,
  StockOpnameItemRow,
  StockOpnameCountsMap,
} from "@/types/stockOpname";
import {
  DISCREPANCY_REASON_PRESETS,
  DEFAULT_DISCREPANCY_REASON,
} from "@/types/stockOpname";
import {
  fetchStockOpnameSessionById,
  fetchStockOpnameCounts,
  saveStockOpnameCounts,
  updateStockOpnameStatus,
} from "@/services/stockOpname/stockOpnameStorage";
import {
  fetchAssistStockOpnameMaster,
  submitAssistStockOpnameRepair,
} from "@/services/integration/assistStockOpnameApi";
import {
  filterMasterItemsByScope,
  mergeMasterWithCounts,
  calculateOpnameSummary,
  buildAssistRepairPayload,
} from "@/services/stockOpname/stockOpnameService";

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const store = useAssistStore();
const { userEmail, permissions } = useFirebaseAuth();

const sessionId = computed(() => route.params.id as string);
const session = ref<StockOpnameSession | null>(null);

const rawMasterItems = ref<StockOpnameItemRow[]>([]);
const localItems = ref<StockOpnameItemRow[]>([]);
const localCounts = ref<StockOpnameCountsMap>({});
const dirtyIds = ref(new Set<string>());

const loadingMaster = ref(false);
const isSavingBatch = ref(false);
let autoSaveTimer: any = null;

// Search & Filters
const productSearchInputRef = ref<any>(null);
const productSearch = ref("");
const tableFilter = ref("");
const statusFilterTab = ref<string>("all");

// Dialogs
const finishDialogOpen = ref(false);
const verifyingLiveStock = ref(false);
const submittingFinish = ref(false);

const reasonDialogOpen = ref(false);
const activeRowForReason = ref<StockOpnameItemRow | null>(null);
const customReasonInput = ref("");

const reasonPresets = [...DISCREPANCY_REASON_PRESETS];

const tablePagination = ref({
  rowsPerPage: 50,
  sortBy: "name",
  descending: false,
});

const hasUnsavedChanges = computed(() => dirtyIds.value.size > 0);

const summary = computed(() => calculateOpnameSummary(localItems.value));
const progressPercent = computed(() => {
  if (summary.value.totalItems === 0) return 0;
  return Math.round((summary.value.countedItems / summary.value.totalItems) * 100);
});

// Dropdown pencarian cepat (F1)
const quickSearchResults = computed(() => {
  const query = productSearch.value.trim().toLowerCase();
  if (!query || query.length < 2) return [];

  return localItems.value
    .filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query),
    )
    .slice(0, 10);
});

// Filter tabel
const filteredItems = computed(() => {
  let list = localItems.value;

  // 1. Text filter
  if (tableFilter.value.trim()) {
    const q = tableFilter.value.trim().toLowerCase();
    list = list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.unit.toLowerCase().includes(q),
    );
  }

  // 2. Tab filter
  if (statusFilterTab.value === "discrepancy") {
    list = list.filter(
      (item) => item.isCounted && item.countedQuantity !== null && item.countedQuantity !== item.systemQuantity,
    );
  } else if (statusFilterTab.value === "matched") {
    list = list.filter(
      (item) => item.isCounted && item.countedQuantity !== null && item.countedQuantity === item.systemQuantity,
    );
  } else if (statusFilterTab.value === "uncounted") {
    list = list.filter((item) => !item.isCounted || item.countedQuantity === null);
  }

  return list;
});

const itemColumns = computed(() => {
  const cols: any[] = [
    { name: "name", label: "Nama Produk / Kode", field: "name", align: "left" as const, sortable: true },
    { name: "unit", label: "Satuan", field: "unit", align: "left" as const },
  ];

  if (permissions.value.canViewSystemQty) {
    cols.push({
      name: "systemQuantity",
      label: "Stok Sistem",
      field: "systemQuantity",
      align: "right" as const,
      sortable: true,
    });
  }

  cols.push({
    name: "countedQuantity",
    label: "Stok Fisik",
    field: "countedQuantity",
    align: "right" as const,
    style: "width: 130px",
  });

  if (permissions.value.canViewSystemQty) {
    cols.push({
      name: "variance",
      label: "Selisih",
      field: "variance",
      align: "right" as const,
      sortable: true,
      style: "width: 100px",
    });
  }

  cols.push({
    name: "reason",
    label: "Catatan / Alasan",
    field: "reason",
    align: "left" as const,
    style: "width: 250px",
  });

  return cols;
});

function getStatusColor(status?: StockOpnameStatus): string {
  switch (status) {
    case "InProgress":
      return "primary";
    case "Completed":
      return "positive";
    case "Cancelled":
      return "negative";
    default:
      return "grey";
  }
}

function getStatusLabel(status?: StockOpnameStatus): string {
  switch (status) {
    case "InProgress":
      return "Sedang Berjalan";
    case "Completed":
      return "Selesai";
    case "Cancelled":
      return "Dibatalkan";
    default:
      return status || "";
  }
}

function getScopeBadgeColor(scope?: string): string {
  switch (scope) {
    case "Full":
      return "indigo";
    case "PerShift":
      return "teal";
    default:
      return "grey";
  }
}

function getScopeBadgeLabel(scope?: string): string {
  switch (scope) {
    case "Full":
      return "Full";
    case "PerShift":
      return "Per Shift";
    default:
      return scope || "Full";
  }
}

function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Inisialisasi Data
async function loadWorkspaceData() {
  loadingMaster.value = true;
  try {
    // 1. Ambil session header & counts dari Firestore
    const [sess, counts] = await Promise.all([
      fetchStockOpnameSessionById(sessionId.value),
      fetchStockOpnameCounts(sessionId.value),
    ]);
    session.value = sess;
    localCounts.value = counts;

    // 2. Ambil master katalog dari Assist
    const master = await fetchAssistStockOpnameMaster({
      apiBaseUrl: store.apiBaseUrl,
      token: store.assistToken,
      hospitalId: store.hospitalId,
    });
    rawMasterItems.value = master;

    // 3. Gabungkan master dengan data counts (disaring sesuai scope sesi)
    const filteredMaster = sess?.scope
      ? filterMasterItemsByScope(master, sess.scope, sess.itemIdsFilter)
      : master;
    localItems.value = mergeMasterWithCounts(filteredMaster, counts);
  } catch (err) {
    console.error("Gagal memuat data workspace:", err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal memuat data workspace.",
    });
  } finally {
    loadingMaster.value = false;
  }
}

// Inline editing & Debounce auto-save
function onCountChanged(item: StockOpnameItemRow) {
  if (item.countedQuantity !== null && item.countedQuantity !== undefined) {
    item.isCounted = true;
    item.variance = item.countedQuantity - item.systemQuantity;
    if (item.variance !== 0 && !item.reason) {
      item.reason = DEFAULT_DISCREPANCY_REASON;
    }

    localCounts.value[item.id] = {
      countedQuantity: item.countedQuantity,
      reason: item.reason,
      updatedAt: new Date().toISOString(),
      updatedBy: userEmail.value || "Staf",
    };
    dirtyIds.value.add(item.id);
  } else {
    item.isCounted = false;
    item.variance = null;
    delete localCounts.value[item.id];
    dirtyIds.value.add(item.id);
  }

  // Trigger debounce autosave 3 detik
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveAllDirty();
  }, 3000);
}

async function saveAllDirty() {
  if (isSavingBatch.value || dirtyIds.value.size === 0 || !sessionId.value) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);

  isSavingBatch.value = true;
  try {
    const s = summary.value;
    await saveStockOpnameCounts(sessionId.value, localCounts.value, {
      countedItems: s.countedItems,
      discrepancyCount: s.discrepancyCount,
      totalVariance: s.totalVariance,
    });
    dirtyIds.value.clear();
  } catch (err) {
    console.error("Gagal auto-save ke Firestore:", err);
    $q.notify({ type: "negative", message: "Gagal menyimpan perubahan ke server." });
  } finally {
    isSavingBatch.value = false;
  }
}

// Keyboard shortcuts (F1, Ctrl+S, F5)
function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === "F1") {
    e.preventDefault();
    productSearchInputRef.value?.focus();
    return;
  }

  if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    saveAllDirty();
    return;
  }

  if (e.key === "F5") {
    e.preventDefault();
    if (permissions.value.canFinalizeOpname && session.value?.status === "InProgress") {
      openFinishDialog();
    }
  }
}

function selectFirstProduct() {
  if (quickSearchResults.value.length > 0) {
    selectQuickProduct(quickSearchResults.value[0]);
  }
}

function selectQuickProduct(item: StockOpnameItemRow) {
  tableFilter.value = item.name;
  productSearch.value = "";
  // Auto focus field countedQuantity
  nextTick(() => {
    const target = localItems.value.find((i) => i.id === item.id);
    if (target && target.countedQuantity === null) {
      target.countedQuantity = permissions.value.canViewSystemQty ? target.systemQuantity : 0;
      onCountChanged(target);
    }
  });
}

function focusNextRow(pageIndex: number) {
  // Simple UX to allow fluid Enter navigation
}

// Reason dialog
function openReasonDialog(row: StockOpnameItemRow) {
  activeRowForReason.value = row;
  customReasonInput.value = row.reason || "";
  reasonDialogOpen.value = true;
}

function saveCustomReason() {
  if (activeRowForReason.value) {
    activeRowForReason.value.reason = customReasonInput.value.trim();
    onCountChanged(activeRowForReason.value);
  }
  reasonDialogOpen.value = false;
}

// Finish & Posting Dialog
async function openFinishDialog() {
  finishDialogOpen.value = true;
  verifyingLiveStock.value = true;
  try {
    // Pastikan data tersimpan dulu
    await saveAllDirty();

    // Re-fetch live stock dari Assist untuk memastikan qtyBefore mutakhir
    const latestMaster = await fetchAssistStockOpnameMaster({
      apiBaseUrl: store.apiBaseUrl,
      token: store.assistToken,
      hospitalId: store.hospitalId,
    });

    const liveMap: Record<string, number> = {};
    for (const it of latestMaster) {
      liveMap[it.id] = it.systemQuantity;
    }

    // Refresh systemQuantity pada localItems dengan stok live terkini
    for (const item of localItems.value) {
      if (liveMap[item.id] !== undefined) {
        item.systemQuantity = liveMap[item.id];
        if (item.isCounted && item.countedQuantity !== null) {
          item.variance = item.countedQuantity - item.systemQuantity;
        }
      }
    }
  } catch (err) {
    console.error("Gagal verifikasi stok live:", err);
  } finally {
    verifyingLiveStock.value = false;
  }
}

async function executePostingToAssist() {
  submittingFinish.value = true;
  try {
    // 1. Bangun payload repairStockOpname
    const repairPayload = buildAssistRepairPayload({
      items: localItems.value,
      hospitalId: store.hospitalId,
    });

    if (repairPayload.length > 0) {
      const res = await submitAssistStockOpnameRepair({
        apiBaseUrl: store.apiBaseUrl,
        token: store.assistToken,
        items: repairPayload,
      });

      if (res.errors.length > 0) {
        throw new Error(`Sebagian item gagal diposting: ${res.errors.join(", ")}`);
      }
    }

    // 2. Kunci sesi menjadi Completed di Firestore
    await updateStockOpnameStatus(sessionId.value, "Completed", userEmail.value || "Staf");

    $q.notify({
      type: "positive",
      message: `Stock Opname selesai! ${repairPayload.length} item berhasil disinkronkan ke Assist.`,
      position: "top",
    });

    finishDialogOpen.value = false;
    await loadWorkspaceData();
  } catch (err) {
    console.error("Gagal posting stock opname:", err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal memposting stock opname ke Assist.",
      position: "top",
    });
  } finally {
    submittingFinish.value = false;
  }
}

function confirmCancel() {
  $q.dialog({
    title: "Konfirmasi Pembatalan",
    message: "Apakah Anda yakin ingin membatalkan sesi ini? Perubahan fisik yang belum diposting tidak akan diterapkan ke Assist.",
    cancel: { label: "Kembali", flat: true },
    ok: { label: "Ya, Batalkan", color: "negative" },
    persistent: true,
  }).onOk(async () => {
    try {
      await updateStockOpnameStatus(sessionId.value, "Cancelled", userEmail.value || "Staf");
      $q.notify({ type: "positive", message: "Sesi opname telah dibatalkan." });
      backToList();
    } catch (err) {
      console.error("Gagal membatalkan sesi:", err);
      $q.notify({ type: "negative", message: "Gagal membatalkan sesi opname." });
    }
  });
}

function backToList() {
  router.push("/stock-opname");
}

onMounted(() => {
  loadWorkspaceData();
});

onUnmounted(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
});
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
