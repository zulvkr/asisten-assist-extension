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
      <label>
        Sumber
        <select v-model="source">
          <option value="both">Both</option>
          <option value="assist">Assist</option>
          <option value="desty">Desty Omni</option>
        </select>
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
      <button type="button" @click="currentSort = 'kesesuaian'">
        Sort Kesesuaian
      </button>
    </section>

    <section class="table-wrap">
      <p v-if="!rows.length" class="empty">
        Belum ada hasil. Klik "Jalankan Perbandingan".
      </p>

      <table v-else class="result-table">
        <thead>
          <tr>
            <th>Kode Obat</th>
            <th>SKU</th>
            <th>Nama Item</th>
            <th>Qty Sold</th>
            <th>Assist Stock</th>
            <th>Desty Stock</th>
            <th>Kesesuaian</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in sortedRows"
            :key="`${row.medicineId}-${row.sku ?? ''}-${row.itemName}`"
            :class="{
              'row-no-sku': row.kesesuaian === 'SKU belum diisi',
              'row-mismatch': row.kesesuaian === 'Tidak sesuai',
            }"
          >
            <td>{{ row.kodeObat }}</td>
            <td>
              <template v-if="row.sku">{{ row.sku }}</template>
              <span v-else class="sku-missing"
                >Belum diisi — lengkapi kode obat &amp; SKU di sheet
                margin</span
              >
            </td>
            <td>{{ row.itemName }}</td>
            <td>{{ row.qtySold }}</td>
            <td>{{ row.assistStock ?? "-" }}</td>
            <td>{{ row.destyStock ?? "-" }}</td>
            <td>
              <span
                :class="[
                  'kesesuaian',
                  row.kesesuaian === 'Sesuai' && 'kesesuaian--sesuai',
                  row.kesesuaian === 'Tidak sesuai' &&
                    'kesesuaian--tidak-sesuai',
                  row.kesesuaian === 'SKU belum diisi' && 'kesesuaian--no-sku',
                  row.kesesuaian === 'Stok Assist tidak tersedia' &&
                    'kesesuaian--assist-kosong',
                  row.kesesuaian === 'Stok Desty tidak tersedia' &&
                    'kesesuaian--desty-kosong',
                ]"
                :title="row.notes.join(' | ')"
              >
                {{ row.kesesuaian }}
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
import { requestDestyTokenFromOpenTabs } from "@/composables/destyOmniTokenManager";
import {
  type KesesuaianStock,
  type StockComparisonRow,
} from "@/utils/compareStockLevels";
import { validateDateRangeLimit } from "@/utils/validateDateRangeLimit";

type SortMode = "qtySold" | "kesesuaian";
type ValidationState = "muted" | "ok" | "error";
type DataSource = "assist" | "desty" | "both";

const today = formatDateForInput(new Date());

const startDate = ref(today);
const endDate = ref(today);
const rows = ref<StockComparisonRow[]>([]);
const currentSort = ref<SortMode>("qtySold");
const validationMessage = ref("");
const validationState = ref<ValidationState>("muted");
const warnings = ref<string[]>([]);
const loading = ref(false);
const source = ref<DataSource>("both");

const sortedRows = computed(() => {
  const data = [...rows.value];

  if (currentSort.value === "qtySold") {
    return data.sort((a, b) => b.qtySold - a.qtySold);
  }

  return data.sort(
    (a, b) => kesesuaianRank(a.kesesuaian) - kesesuaianRank(b.kesesuaian),
  );
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

  // Try to get token from content script on clinica.assist.id tabs
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

  // Fallback: Try to get from extension storage as backup
  try {
    const stored = await browser.storage.local.get("assistToken");
    if (stored.assistToken && typeof stored.assistToken === "string") {
      const token = stored.assistToken.trim();
      if (token) {
        return token;
      }
    }
  } catch {
    // Ignore storage errors
  }

  throw new Error(
    "Token Assist tidak ditemukan. Buka dan login ke clinica.assist.id, lalu coba lagi.",
  );
}

function kesesuaianRank(kesesuaian: KesesuaianStock): number {
  switch (kesesuaian) {
    case "Tidak sesuai":
      return 1;
    case "Stok Assist tidak tersedia":
      return 2;
    case "Stok Desty tidak tersedia":
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
</script>
