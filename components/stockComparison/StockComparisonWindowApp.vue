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

    <section class="label-filters">
      <span class="label-filters__title">Filter label</span>
      <label
        v-for="option in kesesuaianFilterOptions"
        :key="option"
        class="label-filter-chip"
      >
        <input
          :checked="activeKesesuaianFilters.includes(option)"
          type="checkbox"
          @change="toggleKesesuaianFilter(option)"
        />
        <span>{{ option }}</span>
      </label>
      <button
        v-if="activeKesesuaianFilters.length"
        type="button"
        class="button-secondary"
        @click="clearKesesuaianFilters"
      >
        Reset Filter
      </button>
    </section>

    <section v-if="attentionFilterOptions.length" class="label-filters">
      <span class="label-filters__title">Filter tindakan</span>
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

      <p v-else-if="!filteredRows.length" class="empty">
        Tidak ada hasil yang cocok dengan filter label aktif.
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
            <th>Label</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredRows"
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
            <td>
              <template v-if="row.destyStockDetail">
                <div>
                  fisik: {{ formatStockValue(row.destyStockDetail.fisik) }}
                </div>
                <div>
                  tersedia:
                  {{ formatStockValue(row.destyStockDetail.tersedia) }}
                </div>
                <div>
                  pesanan: {{ formatStockValue(row.destyStockDetail.pesanan) }}
                </div>
              </template>
              <span v-else>-</span>
            </td>
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
            <td>
              <span
                v-if="row.attentionLabel"
                :class="[
                  'attention-label',
                  row.attentionTone && `attention-label--${row.attentionTone}`,
                ]"
              >
                {{ row.attentionLabel }}
              </span>
              <span v-else class="attention-label attention-label--neutral">
                -
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

type SortMode = "qtySold" | "kesesuaian";
type ValidationState = "muted" | "ok" | "error";
type DataSource = "assist" | "desty" | "both";

const todayDate = new Date();
const lastWeekDate = new Date(todayDate);
lastWeekDate.setDate(lastWeekDate.getDate() - 7);

const startDate = ref(formatDateForInput(lastWeekDate));
const endDate = ref(formatDateForInput(todayDate));
const rows = ref<StockComparisonRow[]>([]);
const currentSort = ref<SortMode>("qtySold");
const validationMessage = ref("");
const validationState = ref<ValidationState>("muted");
const warnings = ref<string[]>([]);
const loading = ref(false);
const source = ref<DataSource>("both");
const activeKesesuaianFilters = ref<KesesuaianStock[]>(["Tidak sesuai"]);
const activeAttentionFilters = ref<string[]>([]);

const kesesuaianFilterOptions: KesesuaianStock[] = [
  "Tidak sesuai",
  "SKU belum diisi",
  "Stok Assist tidak tersedia",
  "Stok Desty tidak tersedia",
  "Sesuai",
];

const sortedRows = computed(() => {
  const data = [...rows.value];

  if (currentSort.value === "qtySold") {
    return data.sort((a, b) => b.qtySold - a.qtySold);
  }

  return data.sort(
    (a, b) => kesesuaianRank(a.kesesuaian) - kesesuaianRank(b.kesesuaian),
  );
});

const filteredRows = computed(() => {
  const matchesKesesuaian = (row: StockComparisonRow) =>
    !activeKesesuaianFilters.value.length ||
    activeKesesuaianFilters.value.includes(row.kesesuaian);

  const matchesAttention = (row: StockComparisonRow) =>
    !activeAttentionFilters.value.length ||
    (normalizeAttentionFilterLabel(row.attentionLabel) !== null &&
      activeAttentionFilters.value.includes(
        normalizeAttentionFilterLabel(row.attentionLabel) as string,
      ));

  return sortedRows.value.filter(
    (row) => matchesKesesuaian(row) && matchesAttention(row),
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

async function runComparison() {
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
    validationMessage.value = `Rentang valid: ${validation.days} hari dari batas ${DEFAULT_MAX_DATE_RANGE_DAYS} hari.`;
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

function toggleKesesuaianFilter(option: KesesuaianStock) {
  if (activeKesesuaianFilters.value.includes(option)) {
    activeKesesuaianFilters.value = activeKesesuaianFilters.value.filter(
      (value) => value !== option,
    );
    return;
  }

  activeKesesuaianFilters.value = [...activeKesesuaianFilters.value, option];
}

function clearKesesuaianFilters() {
  activeKesesuaianFilters.value = [];
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
    return "Potensi kehilangan penjualan";
  }

  return label;
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

function formatStockValue(value: number | null | undefined): string {
  return typeof value === "number" && !Number.isNaN(value)
    ? String(value)
    : "-";
}
</script>
