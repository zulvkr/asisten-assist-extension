<template>
  <main class="comparison-root">
    <header class="comparison-header">
      <h1>Stock Comparison</h1>
      <p>Versi Vue untuk validasi alur perbandingan stok.</p>
    </header>

    <section class="filters">
      <label>
        Mulai
        <input v-model="startDate" type="date" />
      </label>
      <label>
        Akhir
        <input v-model="endDate" type="date" />
      </label>
      <button type="button" :disabled="loading" @click="runComparison">
        {{ loading ? "Memuat..." : "Jalankan Perbandingan" }}
      </button>
    </section>

    <p :class="['state-msg', validationState]">{{ validationMessage }}</p>

    <ul v-if="warnings.length" class="warning-list">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>

    <section class="table-controls">
      <button type="button" @click="currentSort = 'qtySold'">
        Sort Qty Sold
      </button>
      <button type="button" @click="currentSort = 'status'">Sort Status</button>
    </section>

    <section class="table-wrap">
      <p v-if="!rows.length" class="empty">
        Belum ada hasil. Klik "Jalankan Perbandingan".
      </p>

      <table v-else class="result-table">
        <thead>
          <tr>
            <th>Kode Obat</th>
            <th>Nama Item</th>
            <th>Qty Sold</th>
            <th>Assist Stock</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in sortedRows"
            :key="`${row.medicineId}-${row.itemName}`"
          >
            <td>{{ row.kodeObat }}</td>
            <td>{{ row.itemName }}</td>
            <td>{{ row.qtySold }}</td>
            <td>{{ row.assistStock ?? "-" }}</td>
            <td>
              <span
                :class="['status', row.status]"
                :title="row.notes.join(' | ')"
              >
                {{ row.status }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  type StockComparisonRow,
  type StockStatus,
} from "@/utils/compareStockLevels";
import { validateDateRangeLimit } from "@/utils/validateDateRangeLimit";

type SortMode = "qtySold" | "status";
type ValidationState = "muted" | "ok" | "error";

const today = formatDateForInput(new Date());

const startDate = ref(today);
const endDate = ref(today);
const rows = ref<StockComparisonRow[]>([]);
const currentSort = ref<SortMode>("qtySold");
const validationMessage = ref("");
const validationState = ref<ValidationState>("muted");
const warnings = ref<string[]>([]);
const loading = ref(false);

const sortedRows = computed(() => {
  const data = [...rows.value];

  if (currentSort.value === "qtySold") {
    return data.sort((a, b) => b.qtySold - a.qtySold);
  }

  return data.sort((a, b) => statusRank(a.status) - statusRank(b.status));
});

async function runComparison() {
  const validation = validateDateRangeLimit(
    new Date(startDate.value),
    new Date(endDate.value),
    7,
  );

  if (!validation.valid) {
    validationState.value = "error";
    validationMessage.value =
      validation.reason ?? "Rentang tanggal tidak valid.";
    rows.value = [];
    warnings.value = [];
    return;
  }

  loading.value = true;
  warnings.value = [];

  try {
    const assistToken = await requestAssistTokenFromActiveTab();
    const response = (await browser.runtime.sendMessage({
      type: "FETCH_STOCK_COMPARISON",
      payload: {
        startDate: startDate.value,
        endDate: endDate.value,
        source: "assist",
        assistToken,
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
    validationMessage.value = `Rentang valid: ${validation.days} hari.`;
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

async function requestAssistTokenFromActiveTab(): Promise<string> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const candidateTabs = await browser.tabs.query({
    url: ["*://clinica.assist.id/*"],
  });

  const orderedCandidates = [
    ...(activeTab?.id ? [activeTab] : []),
    ...candidateTabs.filter((tab) => tab.id && tab.id !== activeTab?.id),
  ];

  for (const tab of orderedCandidates) {
    if (!tab.id) {
      continue;
    }

    try {
      const tokenResponse = (await browser.tabs.sendMessage(tab.id, {
        type: "GET_ASSIST_TOKEN",
      })) as { ok?: boolean; token?: string } | undefined;

      const token = tokenResponse?.token?.trim() ?? "";
      if (token) {
        return token;
      }
    } catch {
      // Skip tabs without receiving content script.
    }
  }

  throw new Error(
    "Token Assist tidak ditemukan. Buka dan login ke clinica.assist.id, lalu coba lagi.",
  );
}

function statusRank(status: StockStatus): number {
  switch (status) {
    case "critical":
      return 1;
    case "warning":
      return 2;
    case "unknown":
      return 3;
    case "good":
      return 4;
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
</script>
