<template>
  <div class="q-pa-md">
    <!-- Header -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal text-weight-bold row items-center">
        <q-icon name="fact_check" class="q-mr-sm" />
        Stock Opname
      </div>
      <div class="row q-gutter-x-sm">
        <q-btn
          outline
          color="teal"
          icon="refresh"
          label="Segarkan"
          :loading="loading"
          @click="loadSessions"
        />
        <q-btn
          color="teal"
          icon="add"
          label="Mulai Opname Baru"
          class="text-weight-bold"
          :disable="!store.assistToken"
          @click="openStartDialog"
        >
          <q-tooltip v-if="!store.assistToken">Token Assist belum terdeteksi</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Token Check Warning -->
    <q-banner v-if="!store.assistToken" rounded class="bg-warning text-black q-mb-md">
      <template v-slot:avatar>
        <q-icon name="warning" color="black" />
      </template>
      Token Assist belum terdeteksi. Silakan klik label <strong>Token Assist Belum Diisi</strong> di header atas untuk memuat token dari tab clinica.assist.id yang aktif.
    </q-banner>

    <!-- Sessions Table Card -->
    <q-card flat bordered class="rounded-borders">
      <q-table
        :rows="sessions"
        :columns="columns"
        row-key="id"
        :loading="loading"
        flat
        dense
        :pagination="pagination"
        no-data-label="Belum ada riwayat stock opname. Klik 'Mulai Opname Baru' untuk memulai."
      >
        <!-- Scope Column -->
        <template v-slot:body-cell-scope="props">
          <q-td :props="props">
            <q-badge :color="getScopeBadgeColor(props.row.scope)" outline class="text-weight-bold">
              {{ getScopeBadgeLabel(props.row.scope) }}
            </q-badge>
            <div v-if="props.row.scopeDetails?.shiftLabel" class="text-caption text-grey-7 q-mt-xs" style="font-size: 11px">
              {{ props.row.scopeDetails.shiftLabel }}
            </div>
          </q-td>
        </template>

        <!-- Status Column -->
        <template v-slot:body-cell-status="props">
          <q-td :props="props">
            <q-badge :color="getStatusColor(props.value)" class="q-px-sm text-weight-bold">
              {{ getStatusLabel(props.value) }}
            </q-badge>
          </q-td>
        </template>

        <!-- Created At Column -->
        <template v-slot:body-cell-createdAt="props">
          <q-td :props="props">
            {{ formatDateTime(props.value) }}
          </q-td>
        </template>

        <!-- Progress Column -->
        <template v-slot:body-cell-progress="props">
          <q-td :props="props">
            <div class="row items-center no-wrap q-gutter-x-sm">
              <span class="text-weight-bold">{{ props.row.countedItems }}</span>
              <span class="text-grey-6">/ {{ props.row.totalItems }}</span>
              <q-badge color="teal-1" text-color="teal-9">
                {{ props.row.totalItems > 0 ? Math.round((props.row.countedItems / props.row.totalItems) * 100) : 0 }}%
              </q-badge>
            </div>
          </q-td>
        </template>

        <!-- Total Variance Column -->
        <template v-slot:body-cell-totalVariance="props">
          <q-td :props="props">
            <span
              v-if="props.row.totalVariance !== 0"
              :class="props.row.totalVariance > 0 ? 'text-positive text-weight-bold' : 'text-negative text-weight-bold'"
            >
              {{ props.row.totalVariance > 0 ? '+' : '' }}{{ props.row.totalVariance }}
            </span>
            <span v-else class="text-grey-6">0</span>
          </q-td>
        </template>

        <!-- Actions Column -->
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-x-xs">
            <q-btn
              flat
              dense
              round
              color="teal"
              :icon="props.row.status === 'InProgress' ? 'edit' : 'visibility'"
              size="sm"
              @click="openWorkspace(props.row.id)"
            >
              <q-tooltip>{{ props.row.status === 'InProgress' ? 'Buka Workspace Hitungan' : 'Lihat Hasil Opname' }}</q-tooltip>
            </q-btn>

            <q-btn
              v-if="props.row.status === 'InProgress'"
              flat
              dense
              round
              color="negative"
              icon="cancel"
              size="sm"
              :disable="!permissions.canCancelOpname"
              @click="confirmCancelSession(props.row)"
            >
              <q-tooltip v-if="permissions.canCancelOpname">Batalkan Sesi Opname</q-tooltip>
              <q-tooltip v-else>Hanya Auditor atau Owner yang dapat membatalkan sesi</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- Dialog Mulai Sesi Baru -->
    <q-dialog v-model="startDialogOpen" persistent>
      <q-card style="min-width: 520px; max-width: 600px" class="q-pa-sm">
        <q-card-section class="bg-teal text-white rounded-borders">
          <div class="row items-center no-wrap">
            <q-avatar icon="inventory_2" color="teal-8" text-color="white" class="q-mr-sm" />
            <div>
              <div class="text-h6 text-weight-bold">Mulai Stock Opname Baru</div>
              <div class="text-caption text-teal-1">Hitungan Fisik Stok Apotek vs Sistem Assist</div>
            </div>
          </div>
        </q-card-section>

        <q-card-section class="q-pt-md q-gutter-y-md">
          <div v-if="loadingMaster" class="text-center q-pa-lg">
            <q-spinner-dots color="teal" size="36px" />
            <div class="text-caption text-grey-7 q-mt-sm">Mengambil katalog produk dari Assist...</div>
          </div>

          <div v-else class="q-gutter-y-md">
            <!-- Mode / Scope Selector -->
            <div>
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">Mode / Cakupan Opname:</div>
              <q-btn-toggle
                v-model="selectedScope"
                spread
                no-caps
                rounded
                unelevated
                toggle-color="teal"
                color="grey-2"
                text-color="grey-8"
                :options="[
                  { label: 'Full Opname (Semua Item)', value: 'Full' },
                  { label: 'Per Shift (Item Terjual)', value: 'PerShift' }
                ]"
                @update:model-value="onScopeChange"
              />
            </div>

            <!-- Scope Details: Full -->
            <q-banner v-if="selectedScope === 'Full'" rounded class="bg-indigo-1 text-indigo-9 text-caption">
              <template v-slot:avatar>
                <q-icon name="inventory" color="indigo" />
              </template>
              Mencakup <strong>seluruh stok barang (Obat & BHP)</strong> di Apotek. Seluruh staf kasir dan auditor dapat berpartisipasi menghitung fisik.
            </q-banner>

            <!-- Scope Details: PerShift -->
            <div v-else-if="selectedScope === 'PerShift'" class="q-gutter-y-sm bg-teal-1 q-pa-sm rounded-borders">
              <div class="text-caption text-teal-9 text-weight-bold row items-center">
                <q-icon name="schedule" class="q-mr-xs" />
                Filter Shift Penjualan (Sesuai Apotek Isa):
              </div>

              <div class="row q-col-gutter-sm">
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="shiftDate"
                    type="date"
                    outlined
                    dense
                    bg-color="white"
                    label="Tanggal Transaksi"
                    color="teal"
                    @update:model-value="loadShiftItems"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="shiftType"
                    outlined
                    dense
                    bg-color="white"
                    label="Pilih Shift"
                    color="teal"
                    emit-value
                    map-options
                    :options="shiftOptions"
                    @update:model-value="loadShiftItems"
                  />
                </div>
              </div>

              <div v-if="loadingShift" class="row items-center q-gutter-x-sm q-py-xs">
                <q-spinner-dots color="teal" size="20px" />
                <span class="text-caption text-grey-7">Mengambil transaksi penjualan dari Assist...</span>
              </div>
              <div v-else class="row items-center justify-between text-caption text-teal-9">
                <span>{{ shiftSummaryText }}</span>
                <q-btn flat dense size="sm" color="teal" icon="refresh" label="Cek Ulang" @click="loadShiftItems" />
              </div>

              <div v-if="!loadingShift && shiftItemCount === 0" class="text-caption text-negative text-weight-medium">
                Peringatan: Tidak ada transaksi penjualan obat/BHP pada shift & tanggal yang dipilih.
              </div>
            </div>

            <!-- Total Item to be counted -->
            <div class="row justify-between items-center bg-grey-1 q-pa-sm rounded-borders text-caption text-grey-8">
              <span>Total Item Siap Dihitung:</span>
              <strong class="text-teal text-subtitle2">{{ currentScopeItemCount }} item</strong>
            </div>

            <q-input
              v-model="sessionNotes"
              outlined
              dense
              label="Catatan Sesi (Opsional)"
              placeholder="Misal: Opname Tutup Shift Pagi / Opname Bulanan"
              color="teal"
            />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pt-none">
          <q-btn flat label="Batal" color="grey-7" v-close-popup :disable="startingSession" />
          <q-btn
            color="teal"
            label="Mulai Sekarang"
            icon="play_arrow"
            class="text-weight-bold"
            :loading="startingSession"
            :disable="loadingMaster || loadingShift || currentScopeItemCount === 0"
            @click="handleCreateSession"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { useAssistStore } from "../stores/assistStore";
import { useFirebaseAuth } from "@/composables/useFirebaseAuth";
import type {
  StockOpnameSession,
  StockOpnameStatus,
  StockOpnameScope,
  StockOpnameItemRow,
} from "@/types/stockOpname";
import {
  fetchStockOpnameSessions,
  createStockOpnameSession,
  updateStockOpnameStatus,
} from "@/services/stockOpname/stockOpnameStorage";
import { fetchAssistStockOpnameMaster } from "@/services/integration/assistStockOpnameApi";
import { filterMasterItemsByScope } from "@/services/stockOpname/stockOpnameService";
import { fetchAllAssistPemasukan } from "@/services/destySync/offlineStockSync";
import {
  filterTransactionsByInferredShift,
  aggregateSoldItemsFromTransactions,
} from "@/services/destySync/destyStockOpnameService";

const router = useRouter();
const $q = useQuasar();
const store = useAssistStore();
const { userEmail, permissions } = useFirebaseAuth();

const sessions = ref<StockOpnameSession[]>([]);
const loading = ref(false);
const startDialogOpen = ref(false);
const loadingMaster = ref(false);
const startingSession = ref(false);
const sessionNotes = ref("");

// Mode / Scope state
const selectedScope = ref<StockOpnameScope>("Full");
const rawMasterCatalog = ref<StockOpnameItemRow[]>([]);

// PerShift state
const shiftDate = ref(new Date().toLocaleDateString("en-CA")); // YYYY-MM-DD
const shiftType = ref<"pagi" | "siang" | "semua">("pagi");
const shiftOptions = [
  { label: "Shift Pagi (06:00 - 14:00)", value: "pagi" },
  { label: "Shift Siang (14:00 - 22:00)", value: "siang" },
  { label: "Semua Shift Hari Ini (00:00 - 23:59)", value: "semua" },
];
const shiftItemIds = ref<string[]>([]);
const loadingShift = ref(false);
const shiftSummaryText = ref("");

const shiftItemCount = computed(() => {
  if (selectedScope.value !== "PerShift") return 0;
  return filterMasterItemsByScope(rawMasterCatalog.value, "PerShift", shiftItemIds.value).length;
});

const currentScopeItemCount = computed(() => {
  if (selectedScope.value === "Full") {
    return rawMasterCatalog.value.length;
  }
  if (selectedScope.value === "PerShift") {
    return shiftItemCount.value;
  }
  return 0;
});

const pagination = ref({
  rowsPerPage: 15,
  sortBy: "createdAt",
  descending: true,
});

const columns = [
  { name: "opnameNumber", label: "Nomor Opname", field: "opnameNumber", align: "left" as const, sortable: true },
  { name: "scope", label: "Cakupan", field: "scope", align: "center" as const, sortable: true },
  { name: "status", label: "Status", field: "status", align: "center" as const, sortable: true },
  { name: "createdAt", label: "Tanggal Dibuat", field: "createdAt", align: "left" as const, sortable: true },
  { name: "progress", label: "Progres Hitungan", field: "countedItems", align: "left" as const },
  { name: "discrepancyCount", label: "Item Selisih", field: "discrepancyCount", align: "center" as const },
  { name: "totalVariance", label: "Total Selisih", field: "totalVariance", align: "right" as const },
  { name: "createdBy", label: "Dibuat Oleh", field: "createdBy", align: "left" as const },
  { name: "actions", label: "Aksi", field: "id", align: "center" as const },
];

function getStatusColor(status: StockOpnameStatus): string {
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

function getStatusLabel(status: StockOpnameStatus): string {
  switch (status) {
    case "InProgress":
      return "Sedang Berjalan";
    case "Completed":
      return "Selesai";
    case "Cancelled":
      return "Dibatalkan";
    default:
      return status;
  }
}

function getScopeBadgeColor(scope?: StockOpnameScope): string {
  switch (scope) {
    case "Full":
      return "indigo";
    case "PerShift":
      return "teal";
    default:
      return "grey";
  }
}

function getScopeBadgeLabel(scope?: StockOpnameScope): string {
  switch (scope) {
    case "Full":
      return "Full";
    case "PerShift":
      return "Per Shift";
    default:
      return scope || "Full";
  }
}

function formatDateTime(iso: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
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

async function loadSessions() {
  loading.value = true;
  try {
    sessions.value = await fetchStockOpnameSessions();
  } catch (err) {
    console.error("Gagal memuat sesi opname:", err);
    $q.notify({ type: "negative", message: "Gagal memuat daftar sesi opname." });
  } finally {
    loading.value = false;
  }
}

async function openStartDialog() {
  startDialogOpen.value = true;
  sessionNotes.value = "";
  selectedScope.value = "Full";
  loadingMaster.value = true;
  try {
    const items = await fetchAssistStockOpnameMaster({
      apiBaseUrl: store.apiBaseUrl,
      token: store.assistToken,
      hospitalId: store.hospitalId,
    });
    rawMasterCatalog.value = items;
  } catch (err) {
    console.error("Gagal mengambil katalog produk Assist:", err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal mengambil data produk dari Assist.",
    });
  } finally {
    loadingMaster.value = false;
  }
}

function onScopeChange(val: StockOpnameScope) {
  if (val === "PerShift") {
    loadShiftItems();
  }
}

async function loadShiftItems() {
  if (selectedScope.value !== "PerShift") return;
  loadingShift.value = true;
  shiftSummaryText.value = "";
  try {
    const txs = await fetchAllAssistPemasukan(
      shiftDate.value,
      shiftDate.value,
      store.assistToken,
    );
    const shiftTxs = filterTransactionsByInferredShift(
      txs,
      shiftType.value,
      shiftDate.value,
    );
    const soldItems = aggregateSoldItemsFromTransactions(shiftTxs);

    const ids: string[] = [];
    for (const it of soldItems) {
      if (it.assistItemId) ids.push(it.assistItemId);
      if (it.assistCode) ids.push(it.assistCode);
    }
    shiftItemIds.value = ids;

    const matching = filterMasterItemsByScope(rawMasterCatalog.value, "PerShift", ids);
    shiftSummaryText.value = `Ditemukan ${matching.length} item terjual (${shiftTxs.length} transaksi)`;
  } catch (err) {
    console.error("Gagal memuat item shift:", err);
    shiftSummaryText.value = "Gagal memuat data penjualan shift.";
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal mengambil data transaksi penjualan.",
    });
  } finally {
    loadingShift.value = false;
  }
}

async function handleCreateSession() {
  const targetCount = currentScopeItemCount.value;
  if (targetCount === 0) return;
  startingSession.value = true;
  try {
    const shiftLabelMap: Record<string, string> = {
      pagi: "Shift Pagi (06:00 - 14:00)",
      siang: "Shift Siang (14:00 - 22:00)",
      semua: "Semua Shift",
    };

    const scopeDetails =
      selectedScope.value === "PerShift"
        ? {
            shiftDate: shiftDate.value,
            shiftType: shiftType.value,
            shiftLabel: `${shiftLabelMap[shiftType.value] || shiftType.value} • ${shiftDate.value}`,
            itemCountSold: shiftItemIds.value.length,
          }
        : undefined;

    const session = await createStockOpnameSession({
      createdBy: userEmail.value || "Staf",
      totalItems: targetCount,
      scope: selectedScope.value,
      scopeDetails,
      itemIdsFilter: selectedScope.value === "PerShift" ? shiftItemIds.value : undefined,
      notes: sessionNotes.value.trim(),
    });

    $q.notify({
      type: "positive",
      message: `Sesi opname ${session.opnameNumber} (${getScopeBadgeLabel(session.scope)}) berhasil dibuat!`,
    });
    startDialogOpen.value = false;
    router.push(`/stock-opname/${session.id}`);
  } catch (err) {
    console.error("Gagal membuat sesi opname:", err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal membuat sesi opname baru.",
    });
  } finally {
    startingSession.value = false;
  }
}

function openWorkspace(sessionId: string) {
  router.push(`/stock-opname/${sessionId}`);
}

function confirmCancelSession(session: StockOpnameSession) {
  $q.dialog({
    title: "Konfirmasi Pembatalan",
    message: `Apakah Anda yakin ingin membatalkan sesi ${session.opnameNumber}? Sesi yang dibatalkan tidak akan mengubah stok apapun di Assist.`,
    cancel: { label: "Kembali", flat: true },
    ok: { label: "Ya, Batalkan", color: "negative" },
    persistent: true,
  }).onOk(async () => {
    try {
      await updateStockOpnameStatus(session.id, "Cancelled", userEmail.value || "Staf");
      $q.notify({ type: "positive", message: `Sesi ${session.opnameNumber} telah dibatalkan.` });
      await loadSessions();
    } catch (err) {
      console.error("Gagal membatalkan sesi:", err);
      $q.notify({ type: "negative", message: "Gagal membatalkan sesi opname." });
    }
  });
}

onMounted(() => {
  loadSessions();
});
</script>
