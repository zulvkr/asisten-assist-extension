<template>
  <div>
    <!-- Header Section -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="sync" class="q-mr-sm" />
        PLDMP (Desty Helper Integration)
      </div>
    </div>

    <!-- Probe Status / Warnings -->
    <q-banner
      v-if="!destyToken"
      rounded
      class="bg-warning text-black q-mb-md"
    >
      <template v-slot:avatar>
        <q-icon name="warning" color="black" />
      </template>
      Token Desty Omni tidak ditemukan. Silakan buka tab Desty Omni, masuk/login, lalu segarkan halaman ini.
    </q-banner>

    <q-banner v-if="probeWarnings.length" rounded class="bg-warning text-black q-mb-md">
      <template v-slot:avatar>
        <q-icon name="warning" />
      </template>
      <div class="text-weight-bold font-title">Peringatan Token:</div>
      <ul class="q-my-none q-pl-md">
        <li v-for="w in probeWarnings" :key="w">{{ w }}</li>
      </ul>
    </q-banner>

    <!-- Filters & Actions Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-md items-center">
        <!-- Status Dropdown Selector -->
        <div class="col-12 col-md-4">
          <q-select
            v-model="selectedStatus"
            outlined
            dense
            emit-value
            map-options
            :options="statusOptions.map(o => ({
              label: `${o.label} (${statusCounts[o.countKey] !== undefined ? statusCounts[o.countKey] : '0'})`,
              value: o.value
            }))"
            label="Status Pesanan Desty"
            color="teal"
            :disabled="!destyToken"
          />
        </div>

        <q-space />

        <!-- Control Buttons -->
        <div class="col-12 col-md-6 row q-gutter-sm justify-end">
          <q-btn
            color="teal"
            icon="download"
            :loading="loading"
            :label="loading ? `Memuat (${progressText})...` : 'Tarik Data'"
            @click="fetchOrders"
            :disabled="!destyToken"
          />
          <q-btn
            color="teal"
            outline
            icon="content_copy"
            :disabled="!flattenedItems.length || loading"
            :label="copyStatusText"
            @click="copyToClipboard"
          />
          <q-btn
            color="positive"
            icon="file_download"
            :disabled="!flattenedItems.length || loading"
            :loading="exporting"
            label="Ekspor Excel"
            @click="exportToExcel"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Status Alerts -->
    <q-banner
      v-if="statusMessage"
      rounded
      :class="statusVariant === 'success' ? 'bg-green-1 text-green-9' : statusVariant === 'error' ? 'bg-red-1 text-red-9' : 'bg-grey-2 text-grey-8'"
      class="q-mb-md"
    >
      <template v-slot:avatar>
        <q-icon :name="statusVariant === 'success' ? 'check_circle' : statusVariant === 'error' ? 'error' : 'info'" />
      </template>
      {{ statusMessage }}
    </q-banner>

    <!-- Results Table Card -->
    <q-card flat bordered>
      <q-card-section class="q-pa-none">
        <q-table
          :rows="flattenedItems"
          :columns="tableColumns"
          row-key="displayedOrderSn"
          flat
          :loading="loading"
          :pagination="{ rowsPerPage: 15 }"
          no-data-label="Belum ada data pesanan. Klik 'Tarik Data' untuk memuat."
        >
          <!-- Index column -->
          <template v-slot:body-cell-no="props">
            <q-td :props="props" class="text-center font-mono">
              {{ props.rowIndex + 1 }}
            </q-td>
          </template>

          <template v-slot:body-cell-platformName="props">
            <q-td :props="props">
              <q-badge
                :color="props.value === 'SHOPEE' ? 'orange' : props.value.includes('TIKTOK') ? 'black' : 'teal'"
                class="q-px-sm text-weight-bold"
              >
                {{ props.value }}
              </q-badge>
            </q-td>
          </template>

          <template v-slot:body-cell-quantity="props">
            <q-td :props="props">
              <q-badge color="teal-1" text-color="teal-9" class="q-px-sm text-weight-bold text-subtitle2">
                {{ props.value }}
              </q-badge>
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </div>
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
const progressPhase = ref<"list" | "detail">("list");

const progressText = computed(() => {
  const suffix = progressPhase.value === "detail" ? " detail" : "";
  if (totalCount.value === 0) return `${fetchedCount.value}${suffix}`;
  return `${fetchedCount.value}/${totalCount.value}${suffix}`;
});

const tableColumns = [
  { name: "no", label: "No", align: "center", field: (row: any, idx: number) => idx + 1, sortable: false },
  { name: "productName", label: "Nama Produk", align: "left", field: "productName", sortable: true },
  { name: "platformName", label: "Market Place", align: "center", field: "platformName", sortable: true },
  { name: "inputKeAssist", label: "Input Ke Assist", align: "left", field: "inputKeAssist" },
  { name: "quantity", label: "Jml", align: "right", field: "quantity", sortable: true },
  { name: "satuan", label: "Satuan", align: "center", field: "satuan" },
  { name: "totalPrice", label: "Total Harga MP", align: "right", field: "totalPrice", sortable: true, format: (val: any) => formatNumber(val) },
  { name: "hargaModalSatuan", label: "Harga Modal Satuan", align: "right", field: "hargaModalSatuan", sortable: true, format: (val: any) => val !== "" ? formatNumber(val) : "" },
  { name: "totalHargaModalCalculated", label: "Total Harga Modal", align: "right", field: "totalHargaModalCalculated", sortable: true, format: (val: any) => val !== "" ? formatNumber(val) : "" },
  { name: "formattedOrderCreateTime", label: "Tgl Pesan", align: "center", field: "formattedOrderCreateTime", sortable: true },
  { name: "formattedDeliveryDeadline", label: "Kirim Sebelum", align: "center", field: "formattedDeliveryDeadline", sortable: true },
  { name: "courier", label: "Ekspedisi", align: "left", field: "courier" },
  { name: "displayedOrderSn", label: "No. Pesanan", align: "left", field: "displayedOrderSn", classes: "font-mono" },
  { name: "shipmentNo", label: "No. Resi", align: "left", field: "shipmentNo", classes: "font-mono" },
  { name: "externalShopName", label: "Nama Toko Asal", align: "left", field: "externalShopName" }
];

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

const flattenedItems = computed<FlattenedOrderItem[]>(() => {
  const result: FlattenedOrderItem[] = [];
  let rowIndex = 0;

  for (const record of orders.value) {
    const items = Array.isArray(record.items) && record.items.length ? record.items : [undefined];
    for (const item of items) {
      const sku = item?.skuCode ?? item?.masterSku ?? "";
      const excelRow = rowIndex + 2;
      
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
        totalPrice: record.totalSales ?? 0,
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
    console.error("Gagal mengambil info hitungan status:", err);
  }
}

async function probeTokens() {
  probeWarnings.value = [];
  statusMessage.value = "";
  statusVariant.value = "muted";

  // Always load Assist maps on start
  await loadAssistLocalMaps();

  try {
    const result = await resolveDestyToken();
    destyToken.value = result.token;
    destyTenantId.value = result.tenantId;
    tokenSource.value = result.source;
    probeWarnings.value = result.warnings;

    if (!destyToken.value) {
      statusMessage.value = "Token Desty Omni tidak terdeteksi. Silakan login ke Desty Omni.";
      statusVariant.value = "error";
      return;
    }

    await loadStatusCounts();
  } catch (err) {
    console.error("Gagal mendeteksi token:", err);
    statusMessage.value = "Gagal mendeteksi status token.";
    statusVariant.value = "error";
  }
}

async function loadAssistLocalMaps() {
  try {
    const result = await resolveAssistToken();
    const token = result.token;
    if (!token) return;

    const response = await browser.runtime.sendMessage({
      type: "FETCH_ASSIST_SKU_BUY_FEES",
      payload: { assistToken: token },
    });

    if (response && response.ok) {
      buyFeeMap.value = response.buyFeeBySku || {};
      unitMap.value = response.unitBySku || {};
    }
  } catch (err) {
    console.error("Gagal memuat catalog map dari Assist:", err);
  }
}

async function fetchOrders() {
  if (!destyToken.value) {
    statusMessage.value = "Token Desty Omni tidak terdeteksi. Silakan login.";
    statusVariant.value = "error";
    return;
  }

  loading.value = true;
  statusMessage.value = "Memulai pengambilan data pesanan...";
  statusVariant.value = "muted";
  orders.value = [];
  fetchedCount.value = 0;
  totalCount.value = 0;
  progressPhase.value = "list";

  try {
    const fetched = await fetchAllDestyOrders({
      token: destyToken.value,
      tenantId: destyTenantId.value,
      status: selectedStatus.value,
      onProgress: (p) => {
        fetchedCount.value = p.fetched;
        totalCount.value = p.total;
        progressPhase.value = p.phase;
      },
    });

    orders.value = fetched;
    statusMessage.value = `Berhasil menarik ${orders.value.length} pesanan dengan total ${flattenedItems.value.length} baris barang.`;
    statusVariant.value = "success";

    await loadStatusCounts();
  } catch (err) {
    console.error("Gagal mengambil data pesanan:", err);
    statusMessage.value = err instanceof Error ? err.message : "Terjadi kesalahan saat mengambil pesanan.";
    statusVariant.value = "error";
  } finally {
    loading.value = false;
  }
}

async function copyToClipboard() {
  if (!flattenedItems.value.length) return;

  copyStatusText.value = "Menyalin...";
  try {
    const tsvLines = flattenedItems.value.map((row, idx) =>
      [
        String(idx + 1),
        row.productName,
        row.platformName,
        row.inputKeAssist,
        String(row.quantity),
        row.satuan,
        String(row.totalPrice),
        row.hargaModalSatuan !== "" ? String(row.hargaModalSatuan) : "",
        row.totalHargaModalCalculated !== "" ? String(row.totalHargaModalCalculated) : "",
        row.formattedOrderCreateTime,
        row.formattedDeliveryDeadline,
        row.courier,
        row.displayedOrderSn,
        row.shipmentNo,
        row.externalShopName,
      ].join("\t"),
    );

    const headers = [
      "No",
      "Nama Produk",
      "Market Place",
      "Input Ke Assist",
      "Jml",
      "Satuan",
      "Total Harga MP",
      "Harga Modal Satuan",
      "Total Harga Modal",
      "Tgl Pesan, Jam Pesan",
      "Kirim Sebelum",
      "Ekspedisi",
      "No. Pesanan",
      "No. Resi",
      "Nama Toko Asal",
    ].join("\t");

    const textToCopy = [headers, ...tsvLines].join("\n");
    await navigator.clipboard.writeText(textToCopy);

    copyStatusText.value = "Berhasil Disalin!";
    setTimeout(() => {
      copyStatusText.value = "Salin ke Clipboard";
    }, 2000);
  } catch (err) {
    console.error(err);
    copyStatusText.value = "Gagal Menyalin";
    setTimeout(() => {
      copyStatusText.value = "Salin ke Clipboard";
    }, 2000);
  }
}

function exportToExcel() {
  if (!flattenedItems.value.length) return;
  exporting.value = true;

  try {
    const headers = [
      "No",
      "Nama Produk",
      "Market Place",
      "Input Ke Assist",
      "Jml",
      "Satuan",
      "Total Harga MP",
      "Harga Modal Satuan",
      "Total Harga Modal",
      "Tgl Pesan, Jam Pesan",
      "Kirim Sebelum",
      "Ekspedisi",
      "No. Pesanan",
      "No. Resi",
      "Nama Toko Asal",
    ];

    const rowsData = flattenedItems.value.map((row, idx) => [
      idx + 1,
      row.productName,
      row.platformName,
      row.inputKeAssist,
      row.quantity,
      row.satuan,
      row.totalPrice,
      row.hargaModalSatuan,
      { f: row.totalHargaModalFormula },
      row.formattedOrderCreateTime,
      row.formattedDeliveryDeadline,
      row.courier,
      row.displayedOrderSn,
      row.shipmentNo,
      row.externalShopName,
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PLDMP Orders");

    XLSX.writeFile(workbook, `pldmp-orders-${selectedStatus.value}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    statusMessage.value = "File Excel berhasil dibuat.";
    statusVariant.value = "success";
  } catch (err) {
    console.error(err);
    statusMessage.value = "Gagal membuat berkas Excel.";
    statusVariant.value = "error";
  } finally {
    exporting.value = false;
  }
}

watch(selectedStatus, () => {
  void loadStatusCounts();
});

onMounted(() => {
  void probeTokens();
});
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
