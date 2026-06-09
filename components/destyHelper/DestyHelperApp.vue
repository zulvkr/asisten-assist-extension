<template>
  <main class="desty-helper-root">
    <div class="desty-helper-header">
      <div>
        <h1>PLDMP</h1>
        <p>Salin data pesanan Desty ke Google Sheets PLDMP atau ekspor ke Excel dengan kolom terstandarisasi.</p>
      </div>
    </div>

    <!-- Filters & Actions Panel -->
    <section class="filter-panel">
      <div class="filter-controls">
        <label>
          Status Pesanan
          <select v-model="selectedStatus">
            <option
              v-for="opt in statusOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }} ({{ statusCounts[opt.countKey] !== undefined ? statusCounts[opt.countKey] : '0' }})
            </option>
          </select>
        </label>
      </div>

      <div class="action-buttons">
        <button
          type="button"
          :disabled="loading"
          @click="fetchOrders"
        >
          {{ loading ? `Memuat (${progressText})...` : "Tarik Data" }}
        </button>
        <button
          type="button"
          class="button-secondary"
          :disabled="!flattenedItems.length || loading"
          @click="copyToClipboard"
        >
          {{ copyStatusText }}
        </button>
        <button
          type="button"
          class="button-success"
          :disabled="!flattenedItems.length || loading"
          @click="exportToExcel"
        >
          {{ exporting ? "Mengekspor..." : "Ekspor Excel" }}
        </button>
      </div>
    </section>

    <!-- Status Alerts -->
    <p v-if="statusMessage" class="state-message" :class="statusVariant">
      {{ statusMessage }}
    </p>

    <!-- Result Table -->
    <section class="table-wrap">
      <div class="table-container">
        <table class="result-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Produk</th>
              <th>Market Place</th>
              <th>Input Ke Assist</th>
              <th>Jml</th>
              <th>Satuan</th>
              <th>Total Harga MP</th>
              <th>Harga Modal Satuan</th>
              <th>Total Harga Modal</th>
              <th>Tgl Pesan, Jam Pesan</th>
              <th>Kirim Sebelum</th>
              <th>Ekspedisi</th>
              <th>No. Pesanan</th>
              <th>No. Resi</th>
              <th>Nama Toko Asal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in flattenedItems" :key="idx">
              <td>{{ idx + 1 }}</td>
              <td>{{ row.productName }}</td>
              <td>
                <span class="badge badge-platform">{{ row.platformName }}</span>
              </td>
              <td>{{ row.inputKeAssist }}</td>
              <td>
                <span class="badge badge-qty">{{ row.quantity }}</span>
              </td>
              <td>{{ row.satuan }}</td>
              <td>{{ formatNumber(row.totalPrice) }}</td>
              <td>{{ row.hargaModalSatuan !== "" ? formatNumber(row.hargaModalSatuan) : "" }}</td>
              <td>{{ row.totalHargaModalCalculated !== "" ? formatNumber(row.totalHargaModalCalculated) : "" }}</td>
              <td>{{ row.formattedOrderCreateTime }}</td>
              <td>{{ row.formattedDeliveryDeadline }}</td>
              <td>{{ row.courier }}</td>
              <td class="cell-mono">{{ row.displayedOrderSn }}</td>
              <td class="cell-mono">{{ row.shipmentNo }}</td>
              <td>{{ row.externalShopName }}</td>
            </tr>
            <tr v-if="!flattenedItems.length">
              <td colspan="15" class="empty-state">
                <p>Belum ada data pesanan. Klik "Ambil Pesanan" untuk memuat data.</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import * as XLSX from "xlsx";
import { resolveDestyToken } from "@/composables/destyOmniTokenManager";
import { resolveAssistToken } from "@/composables/assistTokenManager";
import {
  fetchAllDestyOrders,
  fetchDestyOrderStatusCount,
  type DestyOrderRecord,
} from "@/composables/destyOmniOrderApi";

interface FlattenedOrderItem {
  productName: string;
  platformName: string;
  inputKeAssist: string;
  quantity: number;
  satuan: string;
  totalPrice: number;
  hargaModalSatuan: number | "";
  totalHargaModalFormula: string;
  totalHargaModalCalculated: number | "";
  formattedOrderCreateTime: string;
  formattedDeliveryDeadline: string;
  displayedOrderSn: string;
  shipmentNo: string;
  courier: string;
  externalShopName: string;
  rawOrderCreateTime: number;
  rawDeliveryDeadline: number;
  sku: string;
}

const statusOptions = [
  { value: "Unpaid", label: "Belum Bayar (Unpaid)", countKey: "unpaid" },
  { value: "New_Orders", label: "Pesanan Baru (New Orders)", countKey: "newOrders" },
  { value: "To_Process", label: "Perlu Diproses (To Process)", countKey: "toProcess" },
  { value: "Processing", label: "Sedang Diproses (Processing)", countKey: "processing" },
  { value: "Processed", label: "Selesai Diproses (Processed)", countKey: "processed" },
  { value: "In_Delivery", label: "Dalam Pengiriman (In Delivery)", countKey: "inDelivery" },
  { value: "Delivered", label: "Terkirim (Delivered)", countKey: "delivered" },
];

const statusCounts = ref<Record<string, string>>({});
const buyFeeMap = ref<Record<string, number>>({});
const unitMap = ref<Record<string, string>>({});
const destyToken = ref("");
const destyTenantId = ref("");
const tokenSource = ref<"manual" | "localStorage" | "sessionStorage" | "cookie" | "content-script" | "">("");
const probeWarnings = ref<string[]>([]);

const selectedStatus = ref("To_Process");
const loading = ref(false);
const exporting = ref(false);
const copyStatusText = ref("Salin ke Clipboard");
const statusMessage = ref("");
const statusVariant = ref<"muted" | "success" | "error">("muted");

const orders = ref<DestyOrderRecord[]>([]);
const fetchedCount = ref(0);
const totalCount = ref(0);

const progressText = computed(() => {
  if (totalCount.value === 0) return `${fetchedCount.value}`;
  return `${fetchedCount.value}/${totalCount.value}`;
});

const probeStatusClass = computed(() => {
  if (!destyToken.value) return "danger";
  if (tokenSource.value === "manual") return "warning";
  return "success";
});

// Helper functions for parsing
function parseSatuan(sku?: string): string {
  if (!sku) return "";
  const parts = sku.split("-");
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim();
    const last = lastPart.toUpperCase();
    if (/^\d+$/.test(last) && parts.length > 2) {
      const secondLast = parts[parts.length - 2].trim().toUpperCase();
      return `${secondLast}-${last}`;
    }
    return last;
  }
  return sku.trim().toUpperCase();
}

function formatTimestamp(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function formatNumber(val?: number): string {
  if (val === undefined || val === null) return "";
  return new Intl.NumberFormat("id-ID").format(val);
}

function parsePlatformName(platform?: string): string {
  if (!platform) return "";
  const lower = platform.trim().toLowerCase();
  if (lower === "shopee") {
    return "SHOPEE";
  }
  if (lower.includes("tiktok") || lower.includes("tokopedia") || lower === "tokped") {
    return "TIKTOK-TOKPED";
  }
  if (lower === "blibli") {
    return "BLIBLI";
  }
  if (lower === "desty" || lower.includes("desty")) {
    return "DESTY";
  }
  return platform.toUpperCase();
}

// Flatten order records to items
const flattenedItems = computed<FlattenedOrderItem[]>(() => {
  const result: FlattenedOrderItem[] = [];
  let rowIndex = 0;

  for (const record of orders.value) {
    const items = Array.isArray(record.items) && record.items.length ? record.items : [undefined];
    for (const item of items) {
      const sku = item?.skuCode ?? item?.masterSku ?? "";
      const excelRow = rowIndex + 2; // Rows are 1-indexed, header is row 1
      
      const itemSkuUpper = sku.trim().toUpperCase();
      const buyFee = buyFeeMap.value[itemSkuUpper];
      const hargaModalSatuan: number | "" = buyFee !== undefined ? buyFee : "";

      const assistUnit = unitMap.value[itemSkuUpper];
      const satuan = assistUnit !== undefined && assistUnit !== "" ? assistUnit : "";

      const totalHargaModalCalculated: number | "" = typeof hargaModalSatuan === "number" ? (item?.quantity ?? 0) * hargaModalSatuan : "";

      result.push({
        productName: item?.productName ?? "-",
        platformName: parsePlatformName(record.platformName),
        inputKeAssist: "",
        quantity: item?.quantity ?? 0,
        satuan,
        totalPrice: record.totalPrice ?? 0,
        hargaModalSatuan,
        totalHargaModalFormula: `=E${excelRow}*H${excelRow}`,
        totalHargaModalCalculated,
        formattedOrderCreateTime: formatTimestamp(record.orderCreateTime),
        formattedDeliveryDeadline: formatTimestamp(record.deliveryDeadline),
        displayedOrderSn: record.displayedOrderSn ?? "",
        shipmentNo: record.shipmentNo ?? "",
        courier: record.courier ?? "",
        externalShopName: record.externalShopName ?? "",
        rawOrderCreateTime: record.orderCreateTime,
        rawDeliveryDeadline: record.deliveryDeadline,
        sku
      });
      rowIndex += 1;
    }
  }

  return result;
});

async function loadStatusCounts() {
  if (!destyToken.value) return;
  try {
    const counts = await fetchDestyOrderStatusCount({
      token: destyToken.value,
      tenantId: destyTenantId.value,
      status: selectedStatus.value,
    });
    statusCounts.value = counts;
  } catch (err) {
    console.warn("Gagal memuat count status Desty:", err);
  }
}

watch(destyToken, (newToken) => {
  if (newToken) {
    void loadStatusCounts();
  } else {
    statusCounts.value = {};
  }
});

watch(destyTenantId, () => {
  if (destyToken.value) {
    void loadStatusCounts();
  }
});

async function probeTokenQuietly() {
  try {
    const res = await resolveDestyToken();
    if (res.token) {
      destyToken.value = res.token;
      destyTenantId.value = res.tenantId || destyTenantId.value;
      tokenSource.value = res.source;
    }
  } catch (err) {
    console.error("Gagal melakukan probe token Desty:", err);
  }
}

async function loadAssistBuyFees() {
  try {
    const assistTokenResult = await resolveAssistToken();
    if (!assistTokenResult.token) {
      console.warn("Gagal mendapatkan token Assist untuk pencocokan harga modal.");
      return;
    }

    const response = await browser.runtime.sendMessage({
      type: "FETCH_ASSIST_SKU_BUY_FEES",
      payload: { assistToken: assistTokenResult.token },
    });

    if (response && response.ok) {
      buyFeeMap.value = response.buyFeeBySku || {};
      unitMap.value = response.unitBySku || {};
    } else {
      console.warn("Respon background untuk SKU buy fees gagal:", response?.error);
    }
  } catch (err) {
    console.error("Gagal memuat harga modal Assist:", err);
  }
}

async function fetchOrders() {
  if (loading.value) return;
  loading.value = true;
  statusMessage.value = "";
  orders.value = [];
  fetchedCount.value = 0;
  totalCount.value = 0;

  try {
    // Quietly probe/re-probe token first if we don't have one
    if (!destyToken.value) {
      await probeTokenQuietly();
    }

    if (!destyToken.value) {
      throw new Error("Token Desty tidak ditemukan. Buka dashboard Desty (omni.desty.app) terlebih dahulu dan pastikan Anda sudah login.");
    }

    // Refresh the status counts and Assist buy fees
    void loadStatusCounts();
    void loadAssistBuyFees();

    const records = await fetchAllDestyOrders({
      token: destyToken.value,
      tenantId: destyTenantId.value,
      status: selectedStatus.value,
      onProgress: (fetched, total) => {
        fetchedCount.value = fetched;
        totalCount.value = total;
      },
    });

    orders.value = records;
    if (records.length === 0) {
      statusVariant.value = "muted";
      statusMessage.value = "Tidak ada pesanan ditemukan untuk status ini.";
    } else {
      statusVariant.value = "success";
      statusMessage.value = `Berhasil memuat ${records.length} pesanan.`;
    }
  } catch (err) {
    console.error(err);
    statusVariant.value = "error";
    statusMessage.value = err instanceof Error ? err.message : "Gagal memuat pesanan Desty.";
  } finally {
    loading.value = false;
  }
}

// Copy flattened table to Clipboard as TSV
async function copyToClipboard() {
  if (!flattenedItems.value.length) return;

  const headers = [
    "NO.",
    "NAMA PRODUK",
    "MARKET PLACE",
    "INPUT KE ASSIST",
    "JML",
    "SATUAN",
    "TOTAL HARGA MP",
    "HARGA MODAL SATUAN",
    "TOTAL HARGA MODAL",
    "TGL PESAN, JAM PESAN",
    "KIRIM SEBELUM",
    "EKSPEDISI",
    "NO. PESANAN",
    "NO. RESI",
    "NAMA TOKO ASAL",
  ];

  const rows = flattenedItems.value.map((row, idx) => [
    idx + 1,
    row.productName,
    row.platformName,
    row.inputKeAssist,
    row.quantity,
    row.satuan,
    row.totalPrice,
    row.hargaModalSatuan,
    row.totalHargaModalFormula,
    row.formattedOrderCreateTime,
    row.formattedDeliveryDeadline,
    row.courier,
    row.displayedOrderSn,
    row.shipmentNo,
    row.externalShopName,
  ]);

  const tsvContent = [
    headers.join("\t"),
    ...rows.map((row) => row.join("\t")),
  ].join("\n");

  try {
    await navigator.clipboard.writeText(tsvContent);
    copyStatusText.value = "Tersalin!";
    setTimeout(() => {
      copyStatusText.value = "Salin ke Clipboard";
    }, 2000);
  } catch (err) {
    console.error("Gagal menyalin ke clipboard:", err);
    statusVariant.value = "error";
    statusMessage.value = "Gagal menyalin data ke clipboard.";
  }
}

// Export flattened table to Excel
async function exportToExcel() {
  if (!flattenedItems.value.length || exporting.value) return;

  exporting.value = true;
  statusMessage.value = "";

  try {
    const wb = XLSX.utils.book_new();

    const headers = [
      "NO.",
      "NAMA PRODUK",
      "MARKET PLACE",
      "INPUT KE ASSIST",
      "JML",
      "SATUAN",
      "TOTAL HARGA MP",
      "HARGA MODAL SATUAN",
      "TOTAL HARGA MODAL",
      "TGL PESAN, JAM PESAN",
      "KIRIM SEBELUM",
      "EKSPEDISI",
      "NO. PESANAN",
      "NO. RESI",
      "NAMA TOKO ASAL",
    ];

    const rows = flattenedItems.value.map((row, idx) => [
      idx + 1,
      row.productName,
      row.platformName,
      row.inputKeAssist,
      row.quantity,
      row.satuan,
      row.totalPrice,
      row.hargaModalSatuan,
      { f: row.totalHargaModalFormula.substring(1) }, // Excel formula cell in SheetJS format (without leading '=')
      row.formattedOrderCreateTime,
      row.formattedDeliveryDeadline,
      row.courier,
      row.displayedOrderSn,
      row.shipmentNo,
      row.externalShopName,
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // set nice column widths
    const columnWidths = [
      { wch: 6 },  // NO.
      { wch: 30 }, // NAMA PRODUK
      { wch: 15 }, // MARKET PLACE
      { wch: 15 }, // INPUT KE ASSIST
      { wch: 8 },  // JML
      { wch: 10 }, // SATUAN
      { wch: 15 }, // TOTAL HARGA MP
      { wch: 18 }, // HARGA MODAL SATUAN
      { wch: 18 }, // TOTAL HARGA MODAL
      { wch: 20 }, // TGL PESAN, JAM PESAN
      { wch: 20 }, // KIRIM SEBELUM
      { wch: 15 }, // EKSPEDISI (courier)
      { wch: 20 }, // NO. PESANAN
      { wch: 20 }, // NO. RESI
      { wch: 20 }, // NAMA TOKO ASAL
    ];
    ws["!cols"] = columnWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Desty Orders");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pldmp_${selectedStatus.value}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    statusVariant.value = "success";
    statusMessage.value = "Excel berhasil diekspor.";
  } catch (err) {
    console.error("Gagal mengekspor excel:", err);
    statusVariant.value = "error";
    statusMessage.value = "Gagal mengekspor data ke Excel.";
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  await probeTokenQuietly();
  void loadStatusCounts();
  void loadAssistBuyFees();
});
</script>
