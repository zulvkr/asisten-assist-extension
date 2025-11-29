<template>
  <div class="hitungan-harian-root">
    <button class="tailwind-btn" type="button" @click="openDialog">
      Show Hitungan Harian
    </button>

    <teleport to="body">
      <div
        v-if="isDialogOpen"
        class="hitungan-harian-overlay"
        @click.self="closeDialog"
      >
        <div class="hitungan-harian-dialog" role="dialog" aria-modal="true">
          <header class="dialog-header">
            <h2>Hitungan Harian</h2>
            <button type="button" @click="closeDialog">X</button>
          </header>

          <form class="dialog-controls" @submit.prevent="loadSummaries">
            <input type="date" v-model="startDate" name="tanggalMin" />
            <input type="date" v-model="endDate" name="tanggalMax" />
            <button class="tailwind-btn" type="submit" :disabled="loading">
              {{ loading ? "Memuat..." : "Muat Data" }}
            </button>
            <div class="status-label" :class="statusVariant">
              {{ statusText }}
            </div>
          </form>

          <div class="table-container">
            <table v-if="summaries.length" class="summary-table">
              <thead>
                <tr>
                  <th
                    v-for="header in tableHeaders"
                    :key="header.label"
                    :class="['cell', header.align]"
                  >
                    {{ header.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="summary in summaries" :key="summary.key">
                  <tr>
                    <td class="cell left">{{ summary.displayDate }}</td>
                    <td class="cell left">{{ summary.shift }}</td>
                    <td class="cell right">
                      {{ formatRupiah(summary.apotek.cash) }}
                    </td>
                    <td class="cell right">
                      {{ formatRupiah(summary.apotek.debit) }}
                    </td>
                    <td class="cell right">
                      {{ formatRupiah(summary.apotek.total) }}
                    </td>
                    <td class="cell right">
                      {{ formatRupiah(summary.klinik.cash) }}
                    </td>
                    <td class="cell right">
                      {{ formatRupiah(summary.klinik.debit) }}
                    </td>
                    <td class="cell right">
                      {{ formatRupiah(summary.klinik.total) }}
                    </td>
                    <td class="cell action">
                      <button
                        class="tailwind-btn"
                        type="button"
                        @click="toggleDetails(summary.key)"
                      >
                        {{ expandedRows.has(summary.key) ? "Tutup" : "Detail" }}
                      </button>
                    </td>
                  </tr>
                  <tr v-show="expandedRows.has(summary.key)" class="detail-row">
                    <td :colspan="columnCount">
                      <div v-if="summary.details.length" class="detail-stack">
                        <article
                          v-for="detail in summary.details"
                          :key="detail.transactionId"
                          class="detail-card"
                        >
                          <div class="detail-card__header">
                            <div class="detail-card__title">
                              {{ detail.code || "-" }} •
                              {{ formatTime(detail.createdAt) }}
                            </div>
                            <div class="detail-card__patient">
                              Pasien: {{ detail.patientName }}
                            </div>
                          </div>

                          <div class="detail-section">
                            <span class="detail-section__label">Apotek:</span>
                            <span class="detail-section__cash">
                              Cash {{ formatRupiah(detail.apotek.cash) }}
                            </span>
                            <span class="detail-section__debit">
                              Debit {{ formatRupiah(detail.apotek.debit) }}
                            </span>
                          </div>

                          <div class="detail-section">
                            <span class="detail-section__label">Klinik:</span>
                            <span class="detail-section__cash">
                              Cash {{ formatRupiah(detail.klinik.cash) }}
                            </span>
                            <span class="detail-section__debit">
                              Debit {{ formatRupiah(detail.klinik.debit) }}
                            </span>
                          </div>

                          <div class="detail-items">
                            <div class="detail-items__title">Items</div>
                            <template v-if="detail.items.length">
                              <div
                                v-for="item in detail.items"
                                :key="item.id"
                                class="detail-item-row"
                              >
                                <span class="detail-item-row__label">
                                  {{ item.name }}
                                  ({{ formatDetailType(item) }})
                                </span>
                                <span class="detail-item-row__price">
                                  {{ formatRupiah(item.totalFee) }}
                                </span>
                              </div>
                            </template>
                            <div v-else class="detail-items__empty">
                              Tidak ada item pada transaksi ini.
                            </div>
                          </div>
                        </article>
                      </div>
                      <div v-else class="detail-empty">
                        Tidak ada transaksi pada shift ini.
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>

            <div v-else class="table-empty" :class="statusVariant">
              {{ emptyStateText }}
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { enrichPemasukanData } from "@/utils/enrichPemasukanData";
import {
  calculateShiftSummaries,
  type ShiftDetailItem,
  type ShiftSummaryRow,
} from "@/utils/hitunganHarianCalculations";
import { formatRupiah } from "@/utils/rupiahUtils";
import { fetchPemasukanData } from "./pemasukan";

type StatusVariant = "muted" | "error";

const tableHeaders = [
  { label: "Tanggal", align: "left" },
  { label: "Shift", align: "left" },
  { label: "Cash Apotek", align: "right" },
  { label: "Debit Apotek", align: "right" },
  { label: "Total Apotek", align: "right" },
  { label: "Cash Klinik", align: "right" },
  { label: "Debit Klinik", align: "right" },
  { label: "Total Klinik", align: "right" },
  { label: "Keterangan", align: "center" },
] as const;

const columnCount = tableHeaders.length;

const isDialogOpen = ref(false);
const startDate = ref(formatDateForInput(new Date()));
const endDate = ref(formatDateForInput(new Date()));
const loading = ref(false);
const statusMessage = ref("Memuat data...");
const statusVariant = ref<StatusVariant>("muted");
const summaries = ref<ShiftSummaryRow[]>([]);
const expandedRows = ref<Set<string>>(new Set());

function resetDateRange() {
  const today = formatDateForInput(new Date());
  startDate.value = today;
  endDate.value = today;
}

function openDialog() {
  resetDateRange();
  summaries.value = [];
  expandedRows.value = new Set();
  statusVariant.value = "muted";
  statusMessage.value = "Memuat data...";
  isDialogOpen.value = true;
  void loadSummaries();
}

function closeDialog() {
  isDialogOpen.value = false;
  expandedRows.value = new Set();
}

async function loadSummaries() {
  if (loading.value) return;
  loading.value = true;
  statusVariant.value = "muted";
  statusMessage.value = "Memuat data...";
  summaries.value = [];
  try {
    const pemasukanRaw = await fetchPemasukanData({
      tanggalMin: startDate.value,
      tanggalMax: endDate.value,
    });
    const enriched = enrichPemasukanData(pemasukanRaw);
    const result = calculateShiftSummaries(enriched);
    summaries.value = result;
    statusMessage.value = result.length
      ? ""
      : "Tidak ada data untuk rentang tanggal ini.";
    expandedRows.value = new Set();
  } catch (error) {
    console.error("Gagal memuat hitungan harian", error);
    statusVariant.value = "error";
    statusMessage.value = "Terjadi kesalahan saat memuat data.";
    summaries.value = [];
  } finally {
    loading.value = false;
  }
}

function toggleDetails(key: string) {
  const next = new Set(expandedRows.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedRows.value = next;
}

const statusText = computed(() => {
  if (loading.value) {
    return "Memuat data...";
  }
  return statusMessage.value;
});

const emptyStateText = computed(() => {
  if (loading.value) {
    return "Memuat data...";
  }
  if (statusVariant.value === "error") {
    return statusMessage.value;
  }
  return statusMessage.value || "Tidak ada data untuk rentang tanggal ini.";
});

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    closeDialog();
  }
};

watch(isDialogOpen, (open) => {
  if (open) {
    document.addEventListener("keydown", handleKeydown);
  } else {
    document.removeEventListener("keydown", handleKeydown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown);
});

function formatDetailType(item: ShiftDetailItem): string {
  const typeParts = [item.type, item.incomeType]
    .filter(Boolean)
    .map((value) => formatLabel(String(value)));
  return typeParts.length ? typeParts.join(" • ") : "-";
}

function formatLabel(value: string | undefined | null): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
</script>

<style scoped>
.hitungan-harian-root {
  display: inline-block;
}

.hitungan-harian-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 24px;
  overflow-y: auto;
}

.hitungan-harian-dialog {
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
  max-width: 1080px;
  width: 100%;
  padding: 24px;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.dialog-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.dialog-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.dialog-controls input[type="date"] {
  border-radius: 0.375rem;
  border: 1px solid #d4d4d8;
  padding: 8px 12px;
}

.dialog-controls button {
  align-self: center;
}

.status-label {
  flex-basis: 100%;
  font-size: 14px;
  color: #4b5563;
}

.status-label.error {
  color: #b91c1c;
}

.table-container {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

.summary-table thead th {
  background-color: #1d4ed8;
  color: #fff;
  padding: 10px;
  border: 1px solid #1e3a8a;
  font-weight: 600;
  font-size: 14px;
}

.cell {
  border: 1px solid #e2e8f0;
  padding: 10px;
  font-size: 14px;
}

.cell.left {
  text-align: left;
}

.cell.right {
  text-align: right;
}

.cell.action {
  text-align: center;
}

.detail-row {
  background-color: #f8fafc;
}

.detail-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-card {
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  padding: 12px;
  background-color: #fff;
}

.detail-card__title {
  font-weight: 600;
  margin-bottom: 6px;
}

.detail-card__patient {
  margin-bottom: 8px;
  color: #475569;
}

.detail-section {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #0f172a;
  margin-bottom: 6px;
}

.detail-section__label {
  min-width: 72px;
  font-weight: 500;
}

.detail-section__cash {
  color: #047857;
}

.detail-section__debit {
  color: #4338ca;
}

.detail-items {
  border-top: 1px solid #e2e8f0;
  padding-top: 8px;
  margin-top: 6px;
}

.detail-items__title {
  font-weight: 500;
  margin-bottom: 4px;
  color: #1f2937;
}

.detail-item-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  margin-bottom: 4px;
  color: #0f172a;
}

.detail-item-row__label {
  flex: 1;
}

.detail-item-row__price {
  min-width: 120px;
  text-align: right;
  font-weight: 500;
}

.detail-items__empty,
.detail-empty {
  color: #64748b;
  font-size: 14px;
}

.table-empty {
  padding: 24px;
  text-align: center;
  color: #64748b;
}

.table-empty.error {
  color: #b91c1c;
}
</style>
