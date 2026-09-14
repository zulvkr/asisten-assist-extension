<template>
  <div v-if="modelValue" class="price-dialog-backdrop" @click.self="close">
    <div class="price-dialog-modal">
      <!-- Header -->
      <header class="dialog-header">
        <div class="header-main">
          <div class="header-info">
            <h2>{{ item?.itemName || "Detail & Riwayat Produk" }}</h2>
            <p class="header-meta">
              <span>Kode: <strong>{{ item?.code || "-" }}</strong></span>
              <span>•</span>
              <span>Satuan: <strong>{{ item?.unit || "-" }}</strong></span>
              <span>•</span>
              <span>Stok Saat Ini: <strong>{{ item?.stockTotal ?? 0 }} {{ item?.unit }}</strong></span>
            </p>
          </div>
          <button type="button" class="btn-close" @click="close" aria-label="Tutup">✕</button>
        </div>

        <!-- Navigation Tabs -->
        <nav class="dialog-tabs" aria-label="Tab Menu">
          <button
            type="button"
            class="dialog-tab-btn"
            :class="{ active: activeTab === 'supplier' }"
            @click="activeTab = 'supplier'"
          >
            <span class="tab-icon">🏷️</span>
            <span>Supplier</span>
          </button>
          <button
            type="button"
            class="dialog-tab-btn"
            :class="{ active: activeTab === 'trend' }"
            @click="activeTab = 'trend'"
          >
            <span class="tab-icon">📈</span>
            <span>Tren &amp; Analitik</span>
          </button>
        </nav>
      </header>

      <!-- Tab 1: Supplier & Price History -->
      <div v-show="activeTab === 'supplier'" class="dialog-tab-content">
        <!-- Loading State -->
        <div v-if="loading" class="dialog-loading">
          <div class="spinner"></div>
          <p>Mengambil riwayat harga dan supplier dari Assist...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="dialog-error">
          <span class="error-icon">⚠️</span>
          <p class="error-text">{{ error }}</p>
          <button type="button" class="btn-retry" @click="loadData">Coba Lagi</button>
        </div>

        <!-- Content Body -->
        <div v-else class="dialog-body">
          <!-- Metric Summary Cards -->
          <section class="summary-cards-grid">
            <div class="summary-card cheapest-card">
              <span class="card-tag tag-green">Supplier Termurah</span>
              <strong class="card-value">{{ formatRupiah(historyData?.lowestNetPrice) }}</strong>
              <p class="card-subtitle">{{ historyData?.cheapestSupplierName || "Belum ada riwayat" }}</p>
            </div>

            <div class="summary-card latest-card">
              <span class="card-tag tag-blue">Penerimaan Terakhir</span>
              <strong class="card-value">{{ formatRupiah(historyData?.latestNetPrice) }}</strong>
              <p class="card-subtitle">
                {{ historyData?.latestSupplierName || "-" }}
                <span v-if="latestDate" class="card-date">({{ formatDate(latestDate) }})</span>
              </p>
            </div>

            <div class="summary-card average-card">
              <span class="card-tag tag-slate">Rata-Rata Beli</span>
              <strong class="card-value">{{ formatRupiah(historyData?.averageNetPrice) }}</strong>
              <p class="card-subtitle">
                {{ historyData?.totalTransactions || 0 }} Faktur • {{ historyData?.totalPurchasedQuantity || 0 }} {{ item?.unit || "Unit" }}
              </p>
            </div>
          </section>

          <!-- Price Trend Chart Section -->
          <section class="chart-section">
            <div class="section-title-row">
              <h3>📈 Tren Fluktuasi Harga Beli Netto</h3>
              <span class="section-desc">Grafik per tanggal penerimaan faktur</span>
            </div>
            <div v-if="hasChartData" ref="chartRef" class="chart-container"></div>
            <div v-else class="empty-placeholder">
              Belum ada cukup data historis untuk memvisualisasikan grafik tren harga.
            </div>
          </section>

          <!-- Supplier Comparison Table -->
          <section class="table-section" style="margin-top: 20px;">
            <div class="section-title-row">
              <h3>🤝 Pembanding Antar Supplier</h3>
              <span class="section-desc">Peringkat harga dari yang paling murah</span>
            </div>
            <div class="table-wrap">
              <table class="supplier-table">
                <thead>
                  <tr>
                    <th>Nama Supplier / Distributor</th>
                    <th class="text-right">Harga Termurah</th>
                    <th class="text-right">Harga Terakhir</th>
                    <th class="text-right">Rata-Rata</th>
                    <th class="text-center">Selisih</th>
                    <th class="text-right">Total Order</th>
                    <th>Order Terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!historyData?.supplierComparisons?.length">
                    <td colspan="7" class="text-center text-muted">Tidak ada catatan supplier untuk produk ini.</td>
                  </tr>
                  <tr
                    v-for="sup in historyData?.supplierComparisons"
                    :key="sup.supplierId"
                    :class="{ 'highlight-cheapest': sup.isCheapest }"
                  >
                    <td class="supplier-name-cell">
                      <strong>{{ sup.supplierName }}</strong>
                      <span v-if="sup.isCheapest" class="badge-termurah">⭐ Termurah</span>
                    </td>
                    <td class="text-right font-mono font-bold">{{ formatRupiah(sup.lowestNetPrice) }}</td>
                    <td class="text-right font-mono">{{ formatRupiah(sup.latestNetPrice) }}</td>
                    <td class="text-right font-mono">{{ formatRupiah(sup.averageNetPrice) }}</td>
                    <td class="text-center">
                      <span
                        v-if="sup.isCheapest"
                        class="diff-badge diff-cheapest"
                      >0% (Best)</span>
                      <span
                        v-else-if="sup.priceDifferencePercent > 0"
                        class="diff-badge diff-higher"
                      >+{{ sup.priceDifferencePercent }}%</span>
                      <span v-else class="diff-badge">-</span>
                    </td>
                    <td class="text-right">
                      {{ sup.purchaseCount }}x ({{ sup.totalQuantityPurchased }} {{ item?.unit }})
                    </td>
                    <td class="text-muted">{{ formatDate(sup.lastPurchasedDate) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Full History Invoices Records Table -->
          <section class="table-section" style="margin-top: 20px;">
            <div class="section-title-row">
              <h3>📑 Riwayat Faktur Penerimaan Barang</h3>
              <span class="section-desc">Daftar lengkap transaksi restock</span>
            </div>
            <div class="table-wrap" style="max-height: 240px; overflow-y: auto;">
              <table class="invoices-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>No. Faktur</th>
                    <th>Supplier</th>
                    <th>Batch / ED</th>
                    <th class="text-right">Qty</th>
                    <th class="text-right">Harga Netto</th>
                    <th class="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!historyData?.historyRecords?.length">
                    <td colspan="7" class="text-center text-muted">Belum ada catatan faktur.</td>
                  </tr>
                  <tr v-for="rec in historyData?.historyRecords" :key="rec.transactionId">
                    <td class="text-nowrap">{{ formatDate(rec.receivedDate) }}</td>
                    <td class="font-mono text-nowrap">{{ rec.invoiceNumber }}</td>
                    <td>{{ rec.supplierName }}</td>
                    <td class="font-mono text-xs">
                      {{ rec.batchNumber }}
                      <span v-if="rec.expiryDate" class="text-muted"> (ED: {{ formatDate(rec.expiryDate) }})</span>
                    </td>
                    <td class="text-right">{{ rec.quantity }} {{ rec.unitName || item?.unit }}</td>
                    <td class="text-right font-mono font-bold">{{ formatRupiah(rec.netUnitPrice) }}</td>
                    <td class="text-right font-mono">{{ formatRupiah(rec.subtotal) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <!-- Tab 2: Sales Trend & Product Analytics -->
      <div v-show="activeTab === 'trend'" class="dialog-tab-content">
        <div v-if="!item" class="dialog-empty">
          <p>Data produk tidak tersedia.</p>
        </div>
        <div v-else class="dialog-body">
          <!-- Badges -->
          <div class="insights-badges">
            <span :class="['status-badge', `status-${item.statusColor}`]">
              {{ statusLabel(item.statusColor) }}
            </span>
            <span v-if="item.isFastMoving" class="tag tag-fast">⚡ Fast Moving</span>
            <span v-if="item.isGoldenProduct" class="tag tag-golden">⭐ Produk Emas</span>
            <span v-if="item.isDeadStock" class="tag tag-dead">🛑 Stok Mati</span>
            <span
              v-if="item.hasUnitHistoryWarning"
              class="tag tag-review"
              :title="item.unitHistoryWarning"
            >⚠️ Riwayat unit campur</span>
          </div>

          <!-- Trend & Analytics Grid -->
          <div class="insight-card-grid">
            <!-- 30 Days Sales Trend (Full Width) -->
            <article class="insight-card full-width-card">
              <div class="section-title-row" style="margin-bottom: 8px;">
                <h3 style="margin: 0;">📊 Tren Penjualan Harian (30 Hari Terakhir)</h3>
                <span style="font-size: 11px; color: #64748b;">
                  {{ item.salesEvents }}x transaksi • {{ item.qtySold30Days }} unit terjual
                </span>
              </div>
              <div
                class="trend-bars-container"
                style="display: flex; align-items: flex-end; gap: 3px; height: 90px; padding: 6px 0; border-bottom: 1px solid #e2e8f0;"
              >
                <div
                  v-for="d in item.dailySalesTrend"
                  :key="d.date"
                  style="flex: 1; height: 100%; display: flex; align-items: flex-end; justify-content: center;"
                  :title="`${d.date}: ${d.qty} unit (${d.events}x order)`"
                >
                  <div
                    :style="{
                      height: `${Math.max(d.qty > 0 ? 15 : 0, Math.min(100, (d.qty / Math.max(1, maxDailyQty(item))) * 100))}%`,
                      width: '100%',
                      background: d.qty > 0 ? '#0d9488' : '#e2e8f0',
                      borderRadius: '2px 2px 0 0'
                    }"
                  />
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; margin-top: 4px;">
                <span>30 hari lalu</span>
                <span>Hari ini</span>
              </div>
            </article>

            <div class="two-col-grid">
              <!-- Rekomendasi Belanja -->
              <article class="insight-card emphasis-card">
                <h3>🛒 Rekomendasi Belanja</h3>
                <div class="metric-pair">
                  <span>Replenish</span>
                  <strong>{{ item.replenishSuggestedQty }} {{ item.unit }}</strong>
                </div>
                <div class="metric-pair">
                  <span>Growth</span>
                  <strong>{{ item.growthSuggestedQty }} {{ item.unit }}</strong>
                </div>
                <div class="metric-pair">
                  <span>Total Saran Sistem</span>
                  <strong style="color: #0d9488; font-size: 14px;">{{ item.calculatedSuggestedQty }} {{ item.unit }}</strong>
                </div>
                <details v-if="item.growthRecommendationNote" class="inline-disclosure drawer-disclosure">
                  <summary>Alasan saran</summary>
                  <p class="drawer-note">
                    {{ item.growthRecommendationNote }}
                  </p>
                </details>
              </article>

              <!-- Harga & Margin -->
              <article class="insight-card">
                <h3>💰 Harga &amp; Margin</h3>
                <div class="metric-pair">
                  <span>Buy Fee (HPP)</span>
                  <strong>{{ formatRupiah(item.buyFee) }}</strong>
                </div>
                <div class="metric-pair">
                  <span>Selling Price</span>
                  <strong>{{ formatRupiah(item.sellNormalFee) }}</strong>
                </div>
                <div class="metric-pair">
                  <span>Margin / Unit</span>
                  <strong style="color: #16a34a;">{{ formatRupiah(resolveUnitMargin(item)) }}</strong>
                </div>
              </article>

              <!-- Velocity & Frekuensi -->
              <article class="insight-card">
                <h3>⚡ Velocity &amp; Frekuensi</h3>
                <div class="metric-pair">
                  <span>Vol. Harian</span>
                  <strong>{{ formatDailySales(item.averageDailySales) }} / hari</strong>
                </div>
                <div class="metric-pair">
                  <span>Frekuensi Order</span>
                  <strong>{{ item.salesEvents }}x order ({{ formatDailySales(item.eventDailyVelocity) }}/hari)</strong>
                </div>
                <div class="metric-pair">
                  <span>Rata-rata / Order</span>
                  <strong>{{ formatDailySales(item.avgUnitsPerTransaction) }} unit</strong>
                </div>
                <div class="metric-pair">
                  <span>True Velocity</span>
                  <strong>{{ formatDailySales(item.trueVelocity) }} / hari</strong>
                </div>
                <div class="metric-pair">
                  <span>Pola Permintaan</span>
                  <strong :style="{ color: item.isBulkSpike ? '#f59e0b' : item.isFastMoving ? '#0d9488' : '#64748b' }">
                    {{ item.demandPattern }}
                  </strong>
                </div>
              </article>

              <!-- Coverage -->
              <article class="insight-card">
                <h3>📦 Coverage Stok</h3>
                <div class="metric-pair">
                  <span>Stok Fisik</span>
                  <strong>{{ item.stockTotal }} {{ item.unit }}</strong>
                </div>
                <div class="metric-pair">
                  <span>Pending Order</span>
                  <strong>{{ item.pendingOrderQty }} {{ item.unit }}</strong>
                </div>
                <div class="metric-pair">
                  <span>Coverage Aktual</span>
                  <strong>{{ formatDays(item.estimatedDaysRemaining) }} hari</strong>
                </div>
                <div class="metric-pair">
                  <span>Demand Constrained</span>
                  <strong>{{ formatDays(item.estimatedDemandConstraintDays) }} hari</strong>
                </div>
                <div class="meter">
                  <span :style="{ width: `${constraintMeterWidth(item)}%` }" />
                </div>
              </article>

              <!-- Peluang Bisnis -->
              <article class="insight-card">
                <h3>💡 Peluang Bisnis</h3>
                <div class="metric-pair">
                  <span>Potensi Rugi Omzet</span>
                  <strong style="color: #ef4444;">{{ formatRupiah(item.potentialIncomeLoss) }}</strong>
                </div>
                <div class="metric-pair">
                  <span>Sisa Belum Dipesan</span>
                  <strong>{{ Math.max(0, item.calculatedSuggestedQty - item.pendingOrderQty) }} {{ item.unit }}</strong>
                </div>
                <div class="metric-pair">
                  <span>Hari Aktif Transaksi</span>
                  <strong>{{ item.activeDays }} hari</strong>
                </div>
              </article>

              <!-- Catatan Analitik -->
              <article v-if="item.notes?.length" class="insight-card">
                <h3>📝 Catatan Analitik</h3>
                <ul class="drawer-list" style="margin: 0; padding-left: 18px; font-size: 12px; color: #475569; display: flex; flex-direction: column; gap: 4px;">
                  <li v-for="note in item.notes" :key="note">
                    {{ note }}
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="dialog-footer">
        <span class="footer-hint">
          {{ activeTab === 'supplier' ? 'Data riwayat supplier diperoleh dari mutasi & transaksi restock Assist.' : 'Data dihitung dari riwayat transaksi penjualan 30 hari terakhir.' }}
        </span>
        <button type="button" class="btn-close-footer" @click="close">Tutup</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import * as echarts from "echarts";
import type {
  ProductPurchaseHistoryResponse,
  RecommendationStatusColor,
  ShoppingRecommendationRow,
} from "@/types/ShoppingRecommendation";
import { formatRupiah } from "@/utils/rupiahUtils";

const props = defineProps<{
  modelValue: boolean;
  item: ShoppingRecommendationRow | null;
  assistToken: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const activeTab = ref<"supplier" | "trend">("supplier");

const loading = ref(false);
const error = ref("");
const historyData = ref<ProductPurchaseHistoryResponse | null>(null);
const chartRef = ref<HTMLDivElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const latestDate = computed(() => {
  return historyData.value?.historyRecords?.[0]?.receivedDate || null;
});

const hasChartData = computed(() => {
  return (historyData.value?.historyRecords?.length ?? 0) > 0;
});

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen && props.item) {
      activeTab.value = "supplier";
      await loadData();
    } else {
      destroyChart();
      historyData.value = null;
      error.value = "";
    }
  },
);

watch(
  () => props.item?.itemId,
  async () => {
    if (props.modelValue && props.item) {
      activeTab.value = "supplier";
      await loadData();
    }
  },
);

watch(activeTab, async (tab) => {
  if (tab === "supplier") {
    await nextTick();
    if (hasChartData.value) {
      renderChart();
    }
  }
});

watch(chartRef, async (el) => {
  if (el && hasChartData.value && !chartInstance && activeTab.value === "supplier") {
    await nextTick();
    renderChart();
  }
});

async function loadData() {
  if (!props.item || !props.assistToken) return;

  loading.value = true;
  error.value = "";
  try {
    const response = (await browser.runtime.sendMessage({
      type: "FETCH_PRODUCT_PRICE_HISTORY",
      payload: {
        assistToken: props.assistToken,
        itemId: props.item.itemId,
        itemType: props.item.itemType,
        itemName: props.item.itemName,
        code: props.item.code,
      },
    })) as { ok: true; data: ProductPurchaseHistoryResponse } | { ok: false; error: string };

    if (!response?.ok) {
      throw new Error(response?.error || "Gagal mengambil data riwayat harga.");
    }

    historyData.value = response.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
  } finally {
    loading.value = false;
  }

  // Ensure DOM with chartRef is rendered before initializing ECharts
  await nextTick();
  if (activeTab.value === "supplier") {
    renderChart();
  }
}

function renderChart() {
  if (!chartRef.value || !historyData.value?.historyRecords?.length) return;

  // If container has zero width (e.g. during modal transition or hidden tab), retry on next animation frame
  if (chartRef.value.clientWidth === 0) {
    requestAnimationFrame(() => {
      if (chartRef.value && chartRef.value.clientWidth > 0) {
        renderChart();
      }
    });
    return;
  }

  destroyChart();
  chartInstance = echarts.init(chartRef.value);

  // Filter valid prices and sort ascending by date for line trend
  const records = [...historyData.value.historyRecords]
    .filter((r) => r && (r.netUnitPrice > 0 || r.buyPrice > 0))
    .sort(
      (a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime(),
    );

  if (!records.length) return;

  const dates = records.map((r) => r.receivedDate || "Tgl ?");
  const values = records.map((r) => (r.netUnitPrice > 0 ? r.netUnitPrice : r.buyPrice));

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding =
    minVal === maxVal
      ? Math.max(1000, Math.round(minVal * 0.15))
      : Math.max(1000, Math.round((maxVal - minVal) * 0.15));
  const yMin = Math.max(0, Math.floor((minVal - padding) / 1000) * 1000);
  const yMax = Math.ceil((maxVal + padding) / 1000) * 1000;

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#334155",
      textStyle: { color: "#ffffff", fontSize: 12 },
      formatter: (params: any) => {
        const item = Array.isArray(params) ? params[0] : params;
        if (!item) return "";
        const record = records[item.dataIndex];
        if (!record) return "";
        return `
          <div style="font-weight: 700; margin-bottom: 4px; color: #38bdf8;">${record.supplierName}</div>
          <div style="margin-bottom: 2px;">Harga Netto: <b>${formatRupiah(record.netUnitPrice)}</b></div>
          <div style="font-size: 11px; color: #cbd5e1;">Faktur: ${record.invoiceNumber} | Qty: ${record.quantity}</div>
          <div style="font-size: 11px; color: #94a3b8;">Tgl: ${formatDate(record.receivedDate)} | Batch: ${record.batchNumber}</div>
        `;
      },
    },
    grid: {
      left: 10,
      right: 20,
      top: 25,
      bottom: 10,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: values.length === 1,
      axisLabel: {
        fontSize: 10,
        color: "#64748b",
        formatter: (val: string) => {
          if (!val) return "";
          const p = val.split("-");
          return p.length === 3 ? `${p[2]}/${p[1]}` : val;
        },
      },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
    },
    yAxis: {
      type: "value",
      min: yMin,
      max: yMax,
      axisLabel: {
        fontSize: 10,
        color: "#64748b",
        formatter: (v: number) => {
          if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
          if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
          return `${v}`;
        },
      },
      splitLine: { lineStyle: { type: "dashed", color: "#f1f5f9" } },
    },
    series: [
      {
        name: "Harga Netto",
        type: "line",
        data: values,
        smooth: true,
        showSymbol: true,
        symbolSize: values.length === 1 ? 12 : 8,
        itemStyle: { color: "#0d9488" },
        lineStyle: { width: 3, color: "#0d9488" },
        markPoint:
          values.length === 1
            ? {
                data: [{ type: "max", name: "Harga Faktur" }],
              }
            : undefined,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(13, 148, 136, 0.25)" },
            { offset: 1, color: "rgba(13, 148, 136, 0.01)" },
          ]),
        },
      },
    ],
  };

  chartInstance.setOption(option);

  // Bind ResizeObserver to dynamically resize ECharts
  if (window.ResizeObserver && chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize();
    });
    resizeObserver.observe(chartRef.value);
  }
}

function destroyChart() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: RecommendationStatusColor): string {
  switch (status) {
    case "red":
      return "🔴 Kritis / Habis";
    case "yellow":
      return "🟡 Menipis";
    case "green":
      return "🟢 Aman";
    default:
      return status;
  }
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
      (row.estimatedDemandConstraintDays / Math.max(1, row.leadTimeLimit)) * 100,
    ),
  );
}

function maxDailyQty(row: ShoppingRecommendationRow | null): number {
  if (!row?.dailySalesTrend?.length) return 1;
  return Math.max(1, ...row.dailySalesTrend.map((d) => d.qty));
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

function close() {
  emit("update:modelValue", false);
}

onBeforeUnmount(() => {
  destroyChart();
});
</script>

<style scoped>
.price-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.price-dialog-modal {
  background: #ffffff;
  border-radius: 14px;
  width: 840px;
  max-width: 96vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 35px -8px rgba(15, 23, 42, 0.3);
  overflow: hidden;
  font-family: inherit;
}

.dialog-header {
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 24px 12px;
}

.header-info h2 {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 18px;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}

.btn-close:hover {
  background: #e2e8f0;
  color: #0f172a;
}

/* Dialog Tabs */
.dialog-tabs {
  display: flex;
  gap: 4px;
  padding: 0 24px;
  border-top: 1px solid #f1f5f9;
  background: #ffffff;
}

.dialog-tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.dialog-tab-btn:hover {
  color: #0d9488;
  background: #f8fafc;
}

.dialog-tab-btn.active {
  color: #0d9488;
  border-bottom-color: #0d9488;
  background: #f0fdfa;
}

.tab-icon {
  font-size: 14px;
}

.dialog-tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.dialog-loading,
.dialog-error,
.dialog-empty {
  padding: 60px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #64748b;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #0d9488;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.error-text {
  color: #ef4444;
  font-weight: 600;
  margin-bottom: 12px;
}

.btn-retry {
  background: #0d9488;
  color: #ffffff;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
}

.dialog-body {
  flex: 1;
  padding: 20px 24px;
}

.summary-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.summary-card {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-tag {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tag-green { color: #16a34a; }
.tag-blue { color: #0284c7; }
.tag-slate { color: #475569; }

.card-value {
  font-size: 19px;
  font-weight: 800;
  color: #0f172a;
}

.card-subtitle {
  font-size: 11.5px;
  color: #64748b;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title-row h3 {
  font-size: 13.5px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.section-desc {
  font-size: 11px;
  color: #64748b;
}

.chart-container {
  width: 100%;
  height: 180px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 4px;
}

.empty-placeholder {
  padding: 30px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  font-size: 12px;
  text-align: center;
  color: #94a3b8;
}

.table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

th {
  background: #f1f5f9;
  padding: 8px 12px;
  text-align: left;
  font-weight: 700;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

td {
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}

tr:last-child td {
  border-bottom: none;
}

.highlight-cheapest {
  background: #f0fdf4;
}

.supplier-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge-termurah {
  background: #dcfce7;
  color: #15803d;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 12px;
}

.diff-badge {
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 6px;
}

.diff-cheapest {
  background: #dcfce7;
  color: #15803d;
}

.diff-higher {
  background: #fee2e2;
  color: #b91c1c;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.font-bold {
  font-weight: 700;
}

.text-right {
  text-align: right;
}

.text-center {
  text-align: center;
}

.text-muted {
  color: #94a3b8;
}

.text-nowrap {
  white-space: nowrap;
}

.text-xs {
  font-size: 11px;
}

/* Tab 2 Trend & Insights Styles */
.insights-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
}

.status-red { background: #fee2e2; color: #b91c1c; }
.status-yellow { background: #fef3c7; color: #b45309; }
.status-green { background: #dcfce7; color: #15803d; }

.tag {
  display: inline-flex;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.tag-fast { background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
.tag-golden { background-color: #fef3c7; color: #b45309; }
.tag-dead { background-color: #ede9fe; color: #6d28d9; }
.tag-review { background-color: #f1f5f9; color: #475569; }

.insight-card-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.two-col-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

@media (max-width: 640px) {
  .two-col-grid {
    grid-template-columns: 1fr;
  }
}

.insight-card {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
}

.insight-card h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.emphasis-card {
  background-color: #f0fdfa;
  border-color: #ccfbf1;
}

.metric-pair {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.metric-pair:last-child {
  margin-bottom: 0;
}

.metric-pair span {
  font-size: 12px;
  color: #64748b;
}

.metric-pair strong {
  font-size: 12.5px;
  font-weight: 700;
  color: #0f172a;
}

.meter {
  height: 6px;
  background-color: #e2e8f0;
  border-radius: 99px;
  margin-top: 10px;
  overflow: hidden;
}

.meter span {
  display: block;
  height: 100%;
  background-color: #0d9488;
  border-radius: 99px;
}

.drawer-disclosure {
  margin-top: 8px;
  border-top: 1px dashed #cbd5e1;
  padding-top: 6px;
}

.drawer-disclosure summary {
  font-size: 11px;
  font-weight: 600;
  color: #0d9488;
  cursor: pointer;
}

.drawer-note {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: #475569;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.footer-hint {
  font-size: 11px;
  color: #94a3b8;
}

.btn-close-footer {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-close-footer:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
</style>
