<template>
  <div>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="compare_arrows" class="q-mr-sm" />
        Perbandingan Stok (Assist vs Desty)
      </div>
      <q-btn-toggle
        v-model="comparisonMode"
        toggle-color="teal"
        flat
        stretch
        :options="[
          { label: 'Berdasarkan Tanggal', value: 'dates' },
          { label: 'Semua Item', value: 'all' }
        ]"
      />
    </div>

    <!-- Date Filters & Source Selector -->
    <q-card flat bordered class="q-mb-md" v-if="comparisonMode === 'dates'">
      <q-card-section class="row q-col-gutter-md items-center">
        <div class="col-12 col-md-4">
          <q-input
            v-model="startDate"
            type="date"
            outlined
            dense
            label="Mulai Tanggal"
            color="teal"
            stack-label
          />
        </div>
        <div class="col-12 col-md-4">
          <q-input
            v-model="endDate"
            type="date"
            outlined
            dense
            label="Akhir Tanggal"
            color="teal"
            stack-label
          />
        </div>
        <div class="col-12 col-md-4">
          <q-select
            v-model="source"
            outlined
            dense
            emit-value
            map-options
            :options="[
              { label: 'Semua (Both)', value: 'both' },
              { label: 'Assist', value: 'assist' },
              { label: 'Desty Omni', value: 'desty' }
            ]"
            label="Sumber Data"
            color="teal"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Main Controls -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-md items-center">
        <div class="col-12 col-md-5">
          <q-input
            v-model="searchQuery"
            outlined
            dense
            placeholder="Cari SKU, nama produk, atau kode..."
            color="teal"
            clearable
          >
            <template v-slot:prepend>
              <q-icon name="search" />
            </template>
          </q-input>
        </div>

        <div class="col-12 col-md-4">
          <q-select
            v-model="selectedKesesuaian"
            outlined
            dense
            :options="kesesuaianDropdownOptions"
            label="Status Kesesuaian"
            color="teal"
          />
        </div>

        <div class="col-12 col-md-3">
          <q-btn
            color="teal"
            icon="play_arrow"
            label="Jalankan Perbandingan"
            :loading="loading"
            @click="runComparison"
            class="full-width"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Actions / Attention Filters -->
    <div v-if="attentionFilterOptions.length" class="row items-center q-gutter-sm q-mb-md">
      <span class="text-subtitle2 text-grey-7">Filter Tindakan:</span>
      <q-chip
        v-for="option in attentionFilterOptions"
        :key="option"
        clickable
        :color="activeAttentionFilters.includes(option) ? 'teal' : 'grey-3'"
        :text-color="activeAttentionFilters.includes(option) ? 'white' : 'black'"
        @click="toggleAttentionFilter(option)"
        class="q-px-md"
      >
        {{ option }}
      </q-chip>
      <q-btn
        v-if="activeAttentionFilters.length"
        flat
        dense
        color="negative"
        label="Reset Tindakan"
        @click="clearAttentionFilters"
      />
    </div>

    <!-- State Validation Banner -->
    <q-banner
      v-if="validationMessage"
      rounded
      :class="validationState === 'error' ? 'bg-red-1 text-red-9' : 'bg-green-1 text-green-9'"
      class="q-mb-md"
    >
      <template v-slot:avatar>
        <q-icon :name="validationState === 'error' ? 'error' : 'check_circle'" />
      </template>
      {{ validationMessage }}
    </q-banner>

    <!-- Warnings List Banner -->
    <q-banner v-if="warnings.length" rounded class="bg-warning text-black q-mb-md">
      <template v-slot:avatar>
        <q-icon name="warning" />
      </template>
      <div class="text-weight-bold">Peringatan:</div>
      <ul class="q-my-none q-pl-md">
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </q-banner>

    <!-- Results Table -->
    <q-card flat bordered>
      <q-card-section class="q-pa-none">
        <q-table
          :rows="filteredRows"
          :columns="columns"
          row-key="medicineId"
          flat
          :loading="loading"
          :pagination="{ rowsPerPage: 15 }"
          no-data-label="Belum ada hasil. Klik 'Jalankan Perbandingan' untuk memuat."
        >
          <template v-slot:body-cell-itemName="props">
            <q-td :props="props">
              <div class="text-weight-bold">{{ props.value }}</div>
              <div class="text-caption text-grey-6" v-if="props.row.kodeObat">Kode: {{ props.row.kodeObat }}</div>
            </q-td>
          </template>

          <template v-slot:body-cell-destyStatus="props">
            <q-td :props="props">
              <div v-if="props.value">
                <div>Fisik: {{ formatStockValue(props.value.fisik) }}</div>
                <div>Tersedia: {{ formatStockValue(props.value.tersedia) }}</div>
              </div>
              <span v-else class="text-grey-5">-</span>
            </q-td>
          </template>

          <template v-slot:body-cell-kesesuaian="props">
            <q-td :props="props">
              <q-badge
                :color="getKesesuaianColor(props.value)"
                class="q-px-sm q-py-xs text-weight-bold"
                :title="props.row.notes?.join(' | ')"
              >
                {{ props.value }}
              </q-badge>
            </q-td>
          </template>

          <template v-slot:body-cell-attention="props">
            <q-td :props="props">
              <div v-if="props.row.attentionLabel" class="row items-center q-gutter-xs">
                <q-icon
                  name="warning"
                  :color="props.row.attentionTone === 'red' ? 'negative' : props.row.attentionTone === 'orange' ? 'warning' : 'grey'"
                />
                <span class="text-caption text-weight-bold">
                  {{ props.row.attentionLabel }}
                </span>
              </div>
              <div class="text-caption text-grey-6 q-mt-xs" v-for="(note, nIdx) in props.row.notes" :key="nIdx">
                • {{ note }}
              </div>
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </div>
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
import { formatRupiah } from "@/utils/rupiahUtils";

type ValidationState = "muted" | "ok" | "error";
type DataSource = "assist" | "desty" | "both";

const todayDate = new Date();
const lastWeekDate = new Date(todayDate);
lastWeekDate.setDate(lastWeekDate.getDate() - 7);

const comparisonMode = ref<"dates" | "all">("dates");
const startDate = ref(formatDateForInput(lastWeekDate));
const endDate = ref(formatDateForInput(todayDate));
const searchQuery = ref("");
const selectedKesesuaian = ref<string>("All");

const rows = ref<StockComparisonRow[]>([]);
const validationMessage = ref("");
const validationState = ref<ValidationState>("muted");
const warnings = ref<string[]>([]);
const loading = ref(false);
const source = ref<DataSource>("both");
const activeAttentionFilters = ref<string[]>([]);

const kesesuaianDropdownOptions = [
  "All",
  "Sesuai",
  "Tidak Sesuai",
  "Hanya di Assist",
  "Hanya di Desty",
  "SKU belum diisi"
];

const columns = [
  { name: "sku", label: "SKU Desty", align: "left", field: "sku", sortable: true },
  { name: "itemName", label: "Nama Produk / Obat", align: "left", field: "itemName", sortable: true },
  { name: "assistStock", label: "Stok Apotek", align: "right", field: "assistStock", sortable: true },
  { name: "destyStock", label: "Stok Desty", align: "right", field: "destyStock", sortable: true },
  { name: "destyStatus", label: "Status Desty", align: "left", field: "destyStockDetail", sortable: false },
  { name: "kesesuaian", label: "Status Kesesuaian", align: "center", field: "kesesuaian", sortable: true },
  { name: "attention", label: "Tindakan / Catatan", align: "left", field: "attentionLabel", sortable: true }
];

const sortedRows = computed(() => {
  const data = [...rows.value];
  return data.sort((a, b) => {
    const rankA = kesesuaianRank(a.kesesuaian);
    const rankB = kesesuaianRank(b.kesesuaian);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.itemName.localeCompare(b.itemName);
  });
});

const filteredRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  
  const matchesSearch = (row: StockComparisonRow) => {
    if (!query) return true;
    return (
      row.itemName.toLowerCase().includes(query) ||
      (row.sku && row.sku.toLowerCase().includes(query)) ||
      (row.kodeObat && row.kodeObat.toLowerCase().includes(query))
    );
  };

  const matchesKesesuaian = (row: StockComparisonRow) => {
    if (selectedKesesuaian.value === "All") return true;
    return row.kesesuaian === selectedKesesuaian.value;
  };

  const matchesAttention = (row: StockComparisonRow) => {
    if (!activeAttentionFilters.value.length) return true;
    const norm = normalizeAttentionFilterLabel(row.attentionLabel);
    return norm !== null && activeAttentionFilters.value.includes(norm);
  };

  return sortedRows.value.filter(
    (row) => matchesSearch(row) && matchesKesesuaian(row) && matchesAttention(row)
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

function getKesesuaianColor(val: string): string {
  if (val === "Sesuai") return "positive";
  if (val === "Tidak Sesuai") return "negative";
  if (val === "SKU belum diisi") return "warning";
  if (val === "Hanya di Desty") return "secondary";
  if (val === "Hanya di Assist") return "primary";
  return "grey";
}

async function runComparison() {
  if (comparisonMode.value !== "all") {
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
  }

  loading.value = true;
  warnings.value = [];
  validationMessage.value = "";

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
        comparisonMode: comparisonMode.value,
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

    if (comparisonMode.value === "all") {
      validationMessage.value = `Berhasil memuat perbandingan semua item (${rows.value.length} item).`;
    } else {
      const validation = validateDateRangeLimit(
        new Date(startDate.value),
        new Date(endDate.value),
        DEFAULT_MAX_DATE_RANGE_DAYS,
      );
      if (validation.valid) {
        validationMessage.value = `Menampilkan perbandingan transaksi dari ${new Date(
          startDate.value,
        ).toLocaleDateString("id-ID")} hingga ${new Date(
          endDate.value,
        ).toLocaleDateString("id-ID")} (${rows.value.length} item).`;
      }
    }
  } catch (error) {
    validationState.value = "error";
    validationMessage.value =
      error instanceof Error ? error.message : "Gagal memproses perbandingan.";
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function toggleAttentionFilter(label: string) {
  const index = activeAttentionFilters.value.indexOf(label);
  if (index === -1) {
    activeAttentionFilters.value.push(label);
  } else {
    activeAttentionFilters.value.splice(index, 1);
  }
}

function clearAttentionFilters() {
  activeAttentionFilters.value = [];
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatStockValue(val: number | null | undefined): string {
  if (val === null || val === undefined) return "-";
  return String(val);
}

function normalizeAttentionFilterLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  if (lower.includes("selisih stok") || lower.includes("assist lebih tinggi") || lower.includes("desty lebih tinggi")) {
    return "Selisih Stok";
  }
  if (lower.includes("habis") || lower.includes("desty kosong") || lower.includes("stok kosong")) {
    return "Stok Kosong";
  }
  return label.trim();
}

function kesesuaianRank(status: KesesuaianStock): number {
  switch (status) {
    case "Tidak Sesuai":
      return 1;
    case "SKU belum diisi":
      return 2;
    case "Hanya di Assist":
      return 3;
    case "Hanya di Desty":
      return 4;
    case "Sesuai":
      return 5;
    default:
      return 6;
  }
}
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
