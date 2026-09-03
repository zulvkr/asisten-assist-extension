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

    <!-- Desty Sales Synchronization -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-sm">
          Sinkronisasi Penjualan Desty → Assist
        </div>
        <q-tabs v-model="syncTab" dense active-color="teal" indicator-color="teal" align="left">
          <q-tab name="import" label="Impor Pesanan" />
          <q-tab v-if="store.developerMode" name="mapping" label="Pemetaan/Override SKU" />
          <q-tab name="log" label="Log Impor" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="syncTab" animated>
          <q-tab-panel name="import" class="q-px-none">
            <div class="row q-col-gutter-sm items-end">
              <div class="col-12 col-md-6">
                <q-select
                  v-model="selectedOrderKey"
                  :options="orderOptions"
                  emit-value
                  map-options
                  outlined
                  dense
                  label="Order yang akan direview"
                  :disable="!orders.length"
                />
              </div>
              <div class="col-auto">
                <q-btn outline color="blue-grey-8" label="Muat Katalog Assist" :loading="syncBusy" @click="loadSyncCatalog" />
              </div>
              <div v-if="store.developerMode" class="col-auto">
                <q-btn outline color="teal" label="Validasi" :disable="!selectedOrder" @click="validateSelectedOrder" />
              </div>
              <div v-if="store.developerMode" class="col-auto">
                <q-btn color="teal" label="Dry-run" :disable="!selectedOrder" :loading="syncBusy" @click="dryRunSelectedOrder" />
              </div>
              <div class="col-auto">
                <q-btn color="positive" label="Impor ke Assist" :disable="!selectedOrder || !store.assistAccountTxId" :loading="syncBusy" @click="importSelectedOrder" />
              </div>
              <div class="col-auto">
                <q-btn color="positive" outline label="Impor Semua Valid" :disable="!orders.length || !store.assistAccountTxId" :loading="syncBusy" @click="bulkImportOrders" />
              </div>
            </div>
            <div v-if="!store.assistAccountTxId" class="text-caption text-red q-mt-sm">
              Isi accountTxId akun Kas di Pengaturan sebelum mengirim transaksi.
            </div>
            <q-banner v-if="syncValidationMessage" rounded class="q-mt-md bg-grey-2">
              {{ syncValidationMessage }}
            </q-banner>
            <q-list v-if="syncIssues.length" bordered separator class="q-mt-md">
              <q-item v-for="issue in syncIssues" :key="`${issue.code}-${issue.sku ?? issue.message}`">
                <q-item-section avatar><q-icon name="error" color="negative" /></q-item-section>
                <q-item-section>{{ issue.message }}</q-item-section>
              </q-item>
            </q-list>
            <q-input
              v-if="store.developerMode && syncPayloadPreview"
              v-model="syncPayloadPreview"
              class="q-mt-md"
              type="textarea"
              outlined
              readonly
              autogrow
              label="Preview payload (dry-run)"
              :input-style="{ fontFamily: 'monospace', fontSize: '11px' }"
            />
          </q-tab-panel>

          <q-tab-panel v-if="store.developerMode" name="mapping" class="q-px-none">
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-md-3"><q-input v-model="mappingDraft.destySku" outlined dense label="SKU Desty" /></div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistCode" outlined dense label="Kode Assist" /></div>
              <div class="col-12 text-caption text-grey-7 q-mb-sm">Mapping utama diambil otomatis dari Google Sheet (SKU kolom F → kode Assist kolom A). Form berikut hanya untuk pengecualian/manual override.</div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistId" outlined dense label="ID Assist" /></div>
              <div class="col-12 col-md-3"><q-input v-model="mappingDraft.assistName" outlined dense label="Nama Assist" /></div>
              <div class="col-12 col-md-2"><q-select v-model="mappingDraft.assistType" :options="['prescription', 'akhp']" outlined dense label="Tipe" /></div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistUnit" outlined dense label="Unit Assist" /></div>
              <div class="col-12 col-md-2"><q-input v-model.number="mappingDraft.conversionFactor" type="number" min="0.0001" step="any" outlined dense label="Faktor konversi" /></div>
              <div class="col-12 col-md-3 flex items-center text-caption text-grey-7">Depot default: {{ DEFAULT_ASSIST_DEPOT_ID }}</div>
              <div class="col-12 col-md-3 flex items-center"><q-checkbox v-model="mappingDraft.active" label="Aktif" /></div>
              <div class="col-12 row q-gutter-sm">
                <q-btn color="teal" icon="save" label="Simpan Mapping" :loading="syncBusy" @click="saveMapping" />
                <q-btn outline color="teal" icon="file_download" label="Ekspor JSON" :disable="syncBusy" @click="exportMappings" />
                <q-btn outline color="teal" icon="file_upload" label="Impor JSON" :disable="syncBusy" @click="mappingFileInput?.click()" />
                <input ref="mappingFileInput" type="file" accept="application/json,.json" style="display:none" @change="importMappings" />
              </div>
            </div>
            <q-table class="q-mt-md" flat bordered dense :rows="mappings" :columns="mappingColumns" row-key="destySku" no-data-label="Belum ada mapping SKU.">
              <template #body-cell-actions="props">
                <q-td :props="props" class="q-gutter-xs">
                  <q-btn flat round dense icon="edit" color="teal" aria-label="Edit mapping" @click="editMapping(props.row)" />
                  <q-btn flat round dense icon="delete" color="negative" aria-label="Hapus mapping" @click="deleteMapping(props.row.destySku)" />
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <q-tab-panel name="log" class="q-px-none">
            <q-table flat bordered dense :rows="importLedger" :columns="ledgerColumns" row-key="marketplaceOrderSn" no-data-label="Belum ada log impor." />
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>
    </q-card>

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

          <template v-slot:body-cell-inputKeAssist="props">
            <q-td :props="props">
              <q-badge
                :color="props.value.startsWith('Sudah diimpor') ? 'positive' : props.value.includes('Void') ? 'orange' : props.value.startsWith('Belum') ? 'grey-6' : 'negative'"
                class="q-px-sm"
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
import { useAssistStore } from "../stores/assistStore";
import { fetchAssistCatalog, buildAssistDepotIndex, buildAssistStockIndex } from "@/services/integration/assistCatalogApi";
import {
  createAssistSaleOrder,
  DestyOrderValidationError,
  fetchAssistDestyTransactionDetails,
} from "@/services/integration/assistSalesApi";
import { normalizeDestyOrder } from "@/services/destySync/orderNormalizer";
import { validateDestyOrder } from "@/utils/destyOrderValidation";
import {
  buildDestyDuplicateIndex,
  getDestyImportLedger,
  getDestyOrderIdentifiers,
  reconcileDestyImportLedger,
  recordDestyImport,
} from "@/services/destySync/importLedgerStorage";
import { bulkImportDestyOrders } from "@/services/destySync/bulkImport";
import {
  buildMappingsFromGoogleSheet,
  DEFAULT_ASSIST_DEPOT_ID,
  exportDestySkuMappings,
  getDestySkuMappings,
  importDestySkuMappings,
  removeDestySkuMapping,
  upsertDestySkuMapping,
} from "@/services/destySync/mappingStorage";
import type {
  AssistCatalogItem,
  DestyImportLedgerEntry,
  DestyOrderValidationIssue,
  DestySkuMapping,
  DestySkuMappingInput,
} from "@/types/destySync";
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
  assistInvoice: string;
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

const store = useAssistStore();
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
const syncTab = ref<"import" | "mapping" | "log">("import");
const selectedOrderKey = ref("");
const mappings = ref<DestySkuMapping[]>([]);
const assistCatalog = ref<AssistCatalogItem[]>([]);
const assistDetailsByIdentifier = ref<Record<string, { invoice?: string; txId?: string; status: string; voided: boolean }>>({});
const assistLookupCompleted = ref(false);
const importLedger = ref<DestyImportLedgerEntry[]>([]);
const syncIssues = ref<DestyOrderValidationIssue[]>([]);
const syncValidationMessage = ref("");
const syncPayloadPreview = ref("");
const syncBusy = ref(false);
const mappingFileInput = ref<HTMLInputElement | null>(null);
const mappingDraft = ref<DestySkuMappingInput & { depotId?: string }>({
  destySku: "",
  assistCode: "",
  assistType: "prescription",
  assistId: "",
  assistName: "",
  destyUnit: "",
  assistUnit: "",
  depotId: "",
  conversionFactor: 1,
  active: true,
});
const fetchedCount = ref(0);
const totalCount = ref(0);
const progressPhase = ref<"list" | "detail">("list");

const progressText = computed(() => {
  const suffix = progressPhase.value === "detail" ? " detail" : "";
  if (totalCount.value === 0) return `${fetchedCount.value}${suffix}`;
  return `${fetchedCount.value}/${totalCount.value}${suffix}`;
});

const orderOptions = computed(() => orders.value.map((order) => ({
  label: `${order.displayedOrderSn || order.orderId || order.id || "(tanpa nomor)"} — ${parsePlatformName(order.platformName)}`,
  value: order.displayedOrderSn || order.orderId || order.id || "",
})));

const mappingColumns = [
  { name: "destySku", label: "SKU Desty", field: "destySku", align: "left" },
  { name: "assistCode", label: "Kode Assist", field: "assistCode", align: "left" },
  { name: "assistName", label: "Item Assist", field: "assistName", align: "left" },
  { name: "assistType", label: "Tipe", field: "assistType", align: "left" },
  { name: "conversionFactor", label: "Faktor", field: "conversionFactor", align: "right" },
  { name: "depotId", label: "Depot", field: "depotId", align: "left" },
  { name: "active", label: "Aktif", field: (row: DestySkuMapping) => row.active ? "Ya" : "Tidak", align: "center" },
  { name: "actions", label: "Aksi", field: "destySku", align: "center" },
];

const ledgerColumns = [
  { name: "marketplaceOrderSn", label: "Order", field: "marketplaceOrderSn", align: "left" },
  { name: "status", label: "Status", field: "status", align: "left" },
  { name: "txId", label: "txId", field: "txId", align: "left" },
  { name: "invoice", label: "Invoice", field: "invoice", align: "left" },
  { name: "error", label: "Error", field: "error", align: "left" },
  { name: "updatedAt", label: "Diperbarui", field: "updatedAt", align: "left" },
];

const tableColumns = [
  { name: "no", label: "No", align: "center", field: (row: any, idx: number) => idx + 1, sortable: false },
  { name: "productName", label: "Nama Produk", align: "left", field: "productName", sortable: true },
  { name: "platformName", label: "Market Place", align: "center", field: "platformName", sortable: true },
  { name: "inputKeAssist", label: "Input Ke Assist", align: "left", field: "inputKeAssist" },
  { name: "assistInvoice", label: "Invoice Assist", align: "left", field: "assistInvoice" },
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

function applyAssistTransactionDetails(details: Awaited<ReturnType<typeof fetchAssistDestyTransactionDetails>>) {
  const next = { ...assistDetailsByIdentifier.value };
  for (const detail of details) {
    for (const identifier of detail.identifiers) {
      next[identifier] = { invoice: detail.invoice, txId: detail.txId, status: detail.status, voided: detail.voided };
    }
  }
  assistDetailsByIdentifier.value = next;
}

function assistDetailsForOrder(orderNumber: string) {
  const record = orders.value.find((order) => (order.displayedOrderSn ?? order.orderId ?? order.id ?? "") === orderNumber);
  const identifiers = record
    ? getDestyOrderIdentifiers(normalizeDestyOrder(record))
    : [orderNumber.trim().toUpperCase()];
  return identifiers.map((identifier) => assistDetailsByIdentifier.value[identifier]).find(Boolean);
}

function assistInvoiceForOrder(orderNumber: string): string {
  return assistDetailsForOrder(orderNumber)?.invoice || "-";
}

function importStatusForOrder(orderNumber: string): string {
  const remote = assistDetailsForOrder(orderNumber);
  if (remote) return remote.voided ? "Void — dapat diimpor ulang" : "Sudah diimpor (Assist)";
  return assistLookupCompleted.value ? "Belum diimpor" : "Belum dicek";
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
        inputKeAssist: importStatusForOrder(record.displayedOrderSn ?? record.orderId ?? record.id ?? ""),
        assistInvoice: assistInvoiceForOrder(record.displayedOrderSn ?? record.orderId ?? record.id ?? ""),
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

const selectedOrder = computed(() => {
  if (!selectedOrderKey.value) return undefined;
  return orders.value.find((order) =>
    (order.displayedOrderSn || order.orderId || order.id || "") === selectedOrderKey.value,
  );
});

function buildSyncContext() {
  // Assist history is the source of truth. The local ledger is for audit/logging only.
  const duplicateIndex = new Set(
    Object.entries(assistDetailsByIdentifier.value)
      .filter(([, detail]) => !detail.voided)
      .map(([identifier]) => identifier),
  );
  const depotIndex = buildAssistDepotIndex(assistCatalog.value);
  for (const mapping of mappings.value) {
    if (mapping.depotId) depotIndex[mapping.assistId] = mapping.depotId;
  }
  return {
    mappings: mappings.value,
    assistCatalog: assistCatalog.value.length ? assistCatalog.value : undefined,
    stockByAssistId: buildAssistStockIndex(assistCatalog.value),
    depotByAssistId: depotIndex,
    duplicateOrderNumbers: duplicateIndex,
    defaultDepotId: DEFAULT_ASSIST_DEPOT_ID,
  };
}

function validateSelectedOrder() {
  syncPayloadPreview.value = "";
  syncIssues.value = [];
  syncValidationMessage.value = "";
  if (!selectedOrder.value) {
    syncValidationMessage.value = "Pilih order terlebih dahulu.";
    return false;
  }
  const validation = validateDestyOrder(
    normalizeDestyOrder(selectedOrder.value),
    buildSyncContext(),
  );
  syncIssues.value = validation.issues;
  syncValidationMessage.value = validation.valid
    ? "Order valid dan siap untuk dry-run."
    : `Order tidak valid (${validation.issues.length} masalah).`;
  return validation.valid;
}

async function loadSyncData() {
  mappings.value = await getDestySkuMappings();
  importLedger.value = await getDestyImportLedger();
}

async function loadRemoteAssistDetails(orderList: DestyOrderRecord[]) {
  if (!orderList.length) return;
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) return;
    const normalizedOrders = orderList.map(normalizeDestyOrder);
    const dates = normalizedOrders.map((order) => order.createdAt?.slice(0, 10)).filter(Boolean).sort() as string[];
    const details = await fetchAssistDestyTransactionDetails({
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
      startDate: dates[0] || new Date().toISOString().slice(0, 10),
      endDate: dates[dates.length - 1] || dates[0] || new Date().toISOString().slice(0, 10),
    });
    applyAssistTransactionDetails(details);
    assistLookupCompleted.value = true;
  } catch {
    // Invoice lookup is informative; import duplicate-check remains authoritative.
  }
}

async function loadSyncCatalog() {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    const result = await resolveAssistToken();
    if (!result.token) throw new Error("Token Assist tidak ditemukan. Buka tab clinica.assist.id.");
    assistCatalog.value = await fetchAssistCatalog({
      token: result.token,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
    });
    await store.fetchMarginData();
    const autoMapping = buildMappingsFromGoogleSheet(
      store.marginData,
      assistCatalog.value,
      mappings.value,
      DEFAULT_ASSIST_DEPOT_ID,
    );
    mappings.value = autoMapping.mappings;
    // Keep automatic Sheet → Assist mappings runtime-only; only manual overrides are persisted.
    syncValidationMessage.value = `Katalog ${assistCatalog.value.length} item dan ${mappings.value.length} mapping otomatis dimuat (tidak disimpan).` +
      (autoMapping.unmatchedSkus.length ? ` ${autoMapping.unmatchedSkus.length} SKU tidak ditemukan di katalog Assist.` : "");
    if (selectedOrder.value) validateSelectedOrder();
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal memuat katalog Assist.";
  } finally {
    syncBusy.value = false;
  }
}

function editMapping(mapping: DestySkuMapping) {
  mappingDraft.value = { ...mapping };
  syncTab.value = "mapping";
}

async function deleteMapping(destySku: string) {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    mappings.value = await removeDestySkuMapping(destySku);
    syncValidationMessage.value = `Mapping ${destySku} dihapus.`;
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal menghapus mapping.";
  } finally {
    syncBusy.value = false;
  }
}

function exportMappings() {
  const blob = new Blob([exportDestySkuMappings(mappings.value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `desty-sku-mappings-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  syncValidationMessage.value = "Mapping berhasil diekspor.";
}

async function importMappings(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    mappings.value = await importDestySkuMappings(await file.text());
    syncValidationMessage.value = `${mappings.value.length} mapping berhasil diimpor.`;
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal mengimpor mapping.";
  } finally {
    input.value = "";
  }
}

async function saveMapping() {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    mappings.value = await upsertDestySkuMapping(mappingDraft.value);
    syncValidationMessage.value = `Mapping ${mappingDraft.value.destySku} berhasil disimpan.`;
    mappingDraft.value = {
      destySku: "", assistCode: "", assistType: "prescription", assistId: "", assistName: "",
      destyUnit: "", assistUnit: "", depotId: "", conversionFactor: 1, active: true,
    };
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal menyimpan mapping.";
  } finally {
    syncBusy.value = false;
  }
}

async function dryRunSelectedOrder() {
  if (!selectedOrder.value || syncBusy.value) return;
  syncBusy.value = true;
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) throw new Error("Token Assist tidak ditemukan.");
    const context = buildSyncContext();
    const result = await createAssistSaleOrder(selectedOrder.value, mappings.value, {
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      accountTxId: store.assistAccountTxId,
      hospitalId: store.hospitalId,
      depotIdByAssistId: context.depotByAssistId,
      ...context,
      dryRun: true,
    });
    syncIssues.value = [];
    syncPayloadPreview.value = JSON.stringify(result.payload, null, 2);
    syncValidationMessage.value = "Dry-run berhasil. Tidak ada transaksi atau perubahan stok yang dikirim.";
  } catch (error) {
    syncIssues.value = error instanceof DestyOrderValidationError ? error.validation.issues : [];
    syncValidationMessage.value = error instanceof Error ? error.message : "Dry-run gagal.";
  } finally {
    syncBusy.value = false;
  }
}

async function importSelectedOrder() {
  if (!selectedOrder.value || syncBusy.value) return;
  syncBusy.value = true;
  const normalizedOrder = normalizeDestyOrder(selectedOrder.value);
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) throw new Error("Token Assist tidak ditemukan.");
    if (!assistCatalog.value.length) throw new Error("Muat katalog dan stok Assist terlebih dahulu sebelum impor.");

    // Query Assist immediately before sending. A failed remote check aborts the send.
    const date = normalizedOrder.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const remoteDetails = await fetchAssistDestyTransactionDetails({
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
      startDate: date,
    });
    applyAssistTransactionDetails(remoteDetails);
    assistLookupCompleted.value = true;
    const remoteDuplicates = new Set(remoteDetails.filter((detail) => !detail.voided).flatMap((detail) => [...detail.identifiers]));
    const checkedIdentifiers = getDestyOrderIdentifiers(normalizedOrder);
    importLedger.value = await reconcileDestyImportLedger(remoteDuplicates, checkedIdentifiers);
    // A successful Assist history query is authoritative; local ledger is fallback only.
    const duplicateIndex = new Set(remoteDuplicates);
    const context = buildSyncContext();
    const result = await createAssistSaleOrder(selectedOrder.value, mappings.value, {
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      accountTxId: store.assistAccountTxId,
      hospitalId: store.hospitalId,
      depotIdByAssistId: context.depotByAssistId,
      ...context,
      duplicateOrderNumbers: duplicateIndex,
      dryRun: false,
    });
    await recordDestyImport({
      marketplaceOrderSn: normalizedOrder.marketplaceOrderSn,
      bookingSn: normalizedOrder.bookingSn,
      trackingNumber: normalizedOrder.trackingNumber,
      platformName: normalizedOrder.platformName,
      status: "success",
      txId: result.txId,
      invoice: result.invoice,
    });
    importLedger.value = await getDestyImportLedger();
    await loadRemoteAssistDetails([normalizedOrder]);
    syncValidationMessage.value = `Impor berhasil${result.txId ? ` (txId: ${result.txId})` : ""}${result.invoice ? `, invoice: ${result.invoice}` : ""}.`;
    syncPayloadPreview.value = "";
  } catch (error) {
    if (error instanceof DestyOrderValidationError) syncIssues.value = error.validation.issues;
    if (normalizedOrder.marketplaceOrderSn) {
      const isDuplicate = error instanceof DestyOrderValidationError && error.validation.issues.some((issue) => issue.code === "duplicate-order");
      const remoteReference = getDestyOrderIdentifiers(normalizedOrder)
        .map((identifier) => assistDetailsByIdentifier.value[identifier])
        .find(Boolean);
      await recordDestyImport({
        marketplaceOrderSn: normalizedOrder.marketplaceOrderSn,
        bookingSn: normalizedOrder.bookingSn,
        trackingNumber: normalizedOrder.trackingNumber,
        platformName: normalizedOrder.platformName,
        status: isDuplicate ? "duplicate" : "failed",
        txId: remoteReference?.txId,
        invoice: remoteReference?.invoice,
        error: error instanceof Error ? error.message : "Gagal impor.",
      });
      importLedger.value = await getDestyImportLedger();
    }
    syncValidationMessage.value = error instanceof Error ? error.message : "Impor gagal. Jangan retry sebelum duplicate-check ulang.";
  } finally {
    syncBusy.value = false;
  }
}

async function bulkImportOrders() {
  if (!orders.value.length || syncBusy.value) return;
  syncBusy.value = true;
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) throw new Error("Token Assist tidak ditemukan.");
    if (!assistCatalog.value.length) throw new Error("Muat katalog dan stok Assist terlebih dahulu sebelum bulk import.");
    const normalizedOrders = orders.value.map(normalizeDestyOrder);
    const dates = normalizedOrders.map((order) => order.createdAt?.slice(0, 10)).filter(Boolean).sort() as string[];
    const startDate = dates[0] || new Date().toISOString().slice(0, 10);
    const endDate = dates[dates.length - 1] || startDate;
    const remoteDetails = await fetchAssistDestyTransactionDetails({
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
      startDate,
      endDate,
    });
    applyAssistTransactionDetails(remoteDetails);
    assistLookupCompleted.value = true;
    const remoteDuplicates = new Set(remoteDetails.filter((detail) => !detail.voided).flatMap((detail) => [...detail.identifiers]));
    const context = buildSyncContext();
    const checkedIdentifiers = normalizedOrders.flatMap((order) => getDestyOrderIdentifiers(order));
    importLedger.value = await reconcileDestyImportLedger(remoteDuplicates, checkedIdentifiers);
    // Server history is authoritative after a successful query; do not retain stale local duplicates.
    const duplicateIndex = new Set(remoteDuplicates);
    const results = await bulkImportDestyOrders({
      orders: orders.value,
      mappings: mappings.value,
      config: {
        token: assistToken,
        apiBaseUrl: store.apiBaseUrl,
        accountTxId: store.assistAccountTxId,
        hospitalId: store.hospitalId,
        assistCatalog: assistCatalog.value.length ? assistCatalog.value : undefined,
        stockByAssistId: context.stockByAssistId,
        depotIdByAssistId: context.depotByAssistId,
        defaultDepotId: DEFAULT_ASSIST_DEPOT_ID,
        duplicateOrderNumbers: duplicateIndex,
      },
      concurrency: 2,
      onProgress: (completed, total, item) => {
        syncValidationMessage.value = `Proses impor ${completed}/${total}: ${item.order.marketplaceOrderSn} (${item.status}).`;
      },
    });
    importLedger.value = await getDestyImportLedger();
    await loadRemoteAssistDetails(orders.value);
    const successCount = results.filter((item) => item.status === "success").length;
    syncValidationMessage.value = `Bulk import selesai: ${successCount}/${results.length} berhasil. Order invalid/duplicate tidak dikirim.`;
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Bulk import gagal dan tidak dilanjutkan.";
  } finally {
    syncBusy.value = false;
  }
}

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
    selectedOrderKey.value = orderOptions.value[0]?.value ?? "";
    void loadRemoteAssistDetails(fetched);
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

watch(() => store.developerMode, (enabled) => {
  if (!enabled && syncTab.value === "mapping") syncTab.value = "import";
  if (!enabled) syncPayloadPreview.value = "";
});

onMounted(() => {
  void probeTokens();
  void loadSyncData();
});
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
