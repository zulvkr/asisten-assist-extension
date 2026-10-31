<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useQuasar } from "quasar";
import type { AssistCatalogItem, DestySkuMapping } from "@/types/destySync";
import type { MarketplacePricingConfig, DestyPriceRecord } from "@/types/destyPriceUpdate";
import type { DestyOrderRecord } from "@/composables/destyOmniOrderApi";
import { fetchDestyOrdersPage, fetchDestyOrderDetail } from "@/composables/destyOmniOrderApi";
import { updateDestyMasterPriceSingle, fetchDestyPricePage } from "@/composables/destyOmniPriceApi";
import {
  processRecentOrderMargins,
  buildCashierLookupMap,
  type OrderItemRealMargin,
} from "@/services/destySync/destyOrderRealMarginService";
import {
  loadMarketplacePricingConfig,
  DEFAULT_MARKETPLACE_PRICING_CONFIG,
} from "@/services/destySync/pricingConfigStorage";
import { fetchAssistDestyTransactionDetails } from "@/services/integration/assistSalesApi";
import { formatRupiah } from "@/utils/rupiahUtils";

const props = defineProps<{
  destyToken?: string;
  destyTenantId?: string;
  assistToken?: string;
  assistHospitalId?: string;
  assistApiBaseUrl?: string;
  assistCatalog: AssistCatalogItem[];
  mappings: DestySkuMapping[];
}>();

const emit = defineEmits<{
  (e: "refreshCatalog"): void;
}>();

const $q = useQuasar();

// Filter States
const selectedStatus = ref<string>("");
const statusOptions = [
  { label: "Semua Status", value: "" },
  { label: "Selesai (Delivered)", value: "Delivered" },
  { label: "Dalam Pengiriman (Shipped)", value: "Shipped" },
  { label: "Siap Dikirim (To Process)", value: "To_Process" },
  { label: "Dibatalkan / Retur (Cancellations)", value: "Cancellations" },
];

// Date Filter: default last 7 days
const todayStr = new Date().toISOString().slice(0, 10);
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const startDate = ref<string>(sevenDaysAgo);
const endDate = ref<string>(todayStr);

const searchFilter = ref<string>("");
const isLoading = ref<boolean>(false);
const rawOrders = ref<DestyOrderRecord[]>([]);
const destyPriceCatalog = ref<Record<string, DestyPriceRecord>>({});
const pricingConfig = ref<MarketplacePricingConfig>(
  JSON.parse(JSON.stringify(DEFAULT_MARKETPLACE_PRICING_CONFIG))
);

// Processed Items State
const orderItems = ref<OrderItemRealMargin[]>([]);

// Inline Update Price State
const updatingSkuId = ref<string | null>(null);
const newPricesInput = ref<Record<string, number>>({});

// Audit Dialog State
const showHistoryDialog = ref<boolean>(false);
const selectedItemForHistory = ref<OrderItemRealMargin | null>(null);
const selectedOrderDetail = ref<any | null>(null);
const isLoadingDetail = ref<boolean>(false);

// Pagination
const pagination = ref({
  page: 1,
  rowsPerPage: 25,
  rowsNumber: 0,
});

// Computed Filtered Rows
const filteredRows = computed(() => {
  const query = searchFilter.value.trim().toLowerCase();
  if (!query) return orderItems.value;

  return orderItems.value.filter((item) => {
    return (
      item.displayedOrderSn.toLowerCase().includes(query) ||
      (item.shipmentNo && item.shipmentNo.toLowerCase().includes(query)) ||
      item.productName.toLowerCase().includes(query) ||
      item.masterSku.toLowerCase().includes(query) ||
      (item.cashierName && item.cashierName.toLowerCase().includes(query)) ||
      (item.assistInvoice && item.assistInvoice.toLowerCase().includes(query))
    );
  });
});

async function loadData() {
  if (!props.destyToken) {
    $q.notify({
      type: "warning",
      message: "Token Desty tidak tersedia. Pastikan tab Desty Omni terbuka dan terhubung.",
    });
    return;
  }

  isLoading.value = true;
  try {
    pricingConfig.value = await loadMarketplacePricingConfig();

    // 1. Fetch Desty orders from API
    const response = await fetchDestyOrdersPage({
      token: props.destyToken,
      tenantId: props.destyTenantId,
      status: selectedStatus.value,
      current: pagination.value.page,
      size: 50,
    });

    rawOrders.value = response.records;
    pagination.value.rowsNumber = response.total;

    // 2. Fetch Assist transactions to correlate cashiers
    let cashierMap = new Map();
    if (props.assistToken && props.assistHospitalId) {
      try {
        const details = await fetchAssistDestyTransactionDetails({
          token: props.assistToken,
          apiBaseUrl: props.assistApiBaseUrl || "https://api-clinica.assist.id",
          hospitalId: props.assistHospitalId,
          startDate: startDate.value,
          endDate: endDate.value,
        });

        cashierMap = buildCashierLookupMap(details as any[]);
      } catch (err) {
        console.warn("Gagal mengambil data transaksi Assist untuk kasir:", err);
      }
    }

    // 3. Process orders and calculate margins
    const processed = processRecentOrderMargins({
      orders: rawOrders.value,
      assistCatalog: props.assistCatalog,
      mappings: props.mappings,
      pricingConfig: pricingConfig.value,
      destyPriceCatalog: destyPriceCatalog.value,
      cashierMap,
    });

    orderItems.value = processed;

    // Initialize inline price inputs with current Desty price or gross price
    for (const item of processed) {
      if (item.masterSkuId && !newPricesInput.value[item.masterSkuId]) {
        newPricesInput.value[item.masterSkuId] =
          item.destyCurrentPrice || item.grossSalePerUnit || 0;
      }
    }
  } catch (err: any) {
    console.error("Gagal memuat pesanan Desty:", err);
    $q.notify({
      type: "negative",
      message: "Gagal memuat pesanan: " + (err?.message || String(err)),
    });
  } finally {
    isLoading.value = false;
  }
}

async function handleUpdateDestyPrice(item: OrderItemRealMargin) {
  if (!props.destyToken) {
    $q.notify({ type: "warning", message: "Token Desty tidak ditemukan." });
    return;
  }
  const skuId = item.masterSkuId;
  if (!skuId) {
    $q.notify({ type: "warning", message: "Master SKU ID tidak tersedia untuk item ini." });
    return;
  }
  const priceToUpdate = newPricesInput.value[skuId];
  if (!priceToUpdate || priceToUpdate <= 0) {
    $q.notify({ type: "warning", message: "Masukkan harga yang valid lebih dari 0." });
    return;
  }

  updatingSkuId.value = skuId;
  try {
    await updateDestyMasterPriceSingle({
      token: props.destyToken,
      tenantId: props.destyTenantId,
      skuId: String(skuId),
      price: priceToUpdate,
    });

    item.destyCurrentPrice = priceToUpdate;

    $q.notify({
      type: "positive",
      message: `Harga Desty berhasil di-update ke ${formatRupiah(priceToUpdate)} (${item.productName})`,
      position: "top-right",
    });
  } catch (err: any) {
    console.error("Gagal update harga Desty:", err);
    $q.notify({
      type: "negative",
      message: "Gagal update harga Desty: " + (err?.message || String(err)),
      position: "top-right",
    });
  } finally {
    updatingSkuId.value = null;
  }
}

async function openHistoryDialog(item: OrderItemRealMargin) {
  selectedItemForHistory.value = item;
  selectedOrderDetail.value = null;
  showHistoryDialog.value = true;

  if (props.destyToken && item.orderId) {
    isLoadingDetail.value = true;
    try {
      const detail = await fetchDestyOrderDetail({
        token: props.destyToken,
        tenantId: props.destyTenantId,
        orderId: item.orderId,
      });
      selectedOrderDetail.value = detail.raw;
    } catch (err) {
      console.warn("Gagal memuat detail pesanan Desty:", err);
    } finally {
      isLoadingDetail.value = false;
    }
  }
}

function formatDateTime(timestamp?: number | string | null): string {
  if (!timestamp) return "-";
  const num = Number(timestamp);
  const date = Number.isFinite(num) && num > 0 ? new Date(num < 10000000000 ? num * 1000 : num) : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPlatformColor(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes("shopee")) return "deep-orange-7";
  if (p.includes("tokopedia")) return "green-7";
  if (p.includes("tiktok")) return "black";
  if (p.includes("blibli")) return "blue-7";
  if (p.includes("lazada")) return "purple-7";
  return "blue-grey-7";
}

function getStatusBadgeColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("deliver") || s.includes("selesai") || s.includes("complete")) return "positive";
  if (s.includes("ship") || s.includes("kirim")) return "teal";
  if (s.includes("process") || s.includes("pack")) return "blue-7";
  if (s.includes("cancel") || s.includes("batal") || s.includes("retur")) return "negative";
  return "grey-7";
}

onMounted(() => {
  if (props.destyToken) {
    loadData();
  }
});

watch(
  () => [props.destyToken, selectedStatus.value],
  ([token]) => {
    if (token) {
      loadData();
    }
  }
);
</script>

<template>
  <div class="desty-order-margin-tab">
    <!-- Filter Bar Card -->
    <q-card flat bordered class="q-mb-md rounded-borders bg-white shadow-subtle">
      <q-card-section class="q-py-sm">
        <div class="row q-col-gutter-sm items-center">
          <!-- Status Filter -->
          <div class="col-12 col-sm-6 col-md-3">
            <q-select
              v-model="selectedStatus"
              outlined
              dense
              emit-value
              map-options
              :options="statusOptions"
              label="Status Pesanan"
              color="teal"
              @update:model-value="loadData"
            />
          </div>

          <!-- Date Range: Start -->
          <div class="col-6 col-sm-3 col-md-2">
            <q-input
              v-model="startDate"
              outlined
              dense
              type="date"
              label="Dari Tanggal"
              color="teal"
              stack-label
            />
          </div>

          <!-- Date Range: End -->
          <div class="col-6 col-sm-3 col-md-2">
            <q-input
              v-model="endDate"
              outlined
              dense
              type="date"
              label="Sampai Tanggal"
              color="teal"
              stack-label
            />
          </div>

          <!-- Search Filter -->
          <div class="col-12 col-md-3">
            <q-input
              v-model="searchFilter"
              outlined
              dense
              placeholder="Cari No. Order, Resi, Barang, Kasir..."
              color="teal"
              clearable
            >
              <template v-slot:prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <!-- Refresh Button -->
          <div class="col-12 col-md-2 row justify-end">
            <q-btn
              color="teal"
              icon="refresh"
              label="Muat Data"
              :loading="isLoading"
              no-caps
              class="full-width text-weight-bold"
              @click="loadData"
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Main Table Card -->
    <q-card flat bordered class="rounded-borders overflow-hidden shadow-subtle">
      <q-markup-table flat dense separator="cell" class="order-margin-table">
        <thead>
          <tr class="bg-grey-1 text-blue-grey-8 font-weight-bold">
            <th class="text-left" style="width: 40px;">No.</th>
            <th class="text-left" style="min-width: 170px;">PESANAN & PLATFORM</th>
            <th class="text-left" style="min-width: 220px;">PRODUK & SKU</th>
            <th class="text-center" style="width: 60px;">QTY</th>
            <th class="text-right" style="width: 105px;">HRG JUAL</th>
            <th class="text-right" style="width: 115px;">REAL TERJUAL (NET)</th>
            <th class="text-right" style="width: 110px;">HPP ASSIST</th>
            <th class="text-right" style="width: 115px;">MARGIN REAL</th>
            <th class="text-right" style="width: 90px;">MARGIN EST.</th>
            <th class="text-center" style="width: 145px;">UPDATE DESTY</th>
            <th class="text-left" style="width: 120px;">KASIR (ASSIST)</th>
            <th class="text-center" style="width: 95px;">RIWAYAT</th>
          </tr>
        </thead>
        <tbody>
          <!-- Loading State -->
          <tr v-if="isLoading">
            <td colspan="12" class="text-center text-grey-7 q-py-xl">
              <q-spinner-dots color="teal" size="40px" /><br />
              <div class="q-mt-sm">Mengambil data pesanan dan mencocokkan margin...</div>
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-else-if="filteredRows.length === 0">
            <td colspan="12" class="text-center text-grey q-py-xl">
              <q-icon name="inbox" size="lg" class="text-grey-4 q-mb-sm" /><br />
              Tidak ada data pesanan Desty ditemukan untuk kriteria filter ini.
            </td>
          </tr>

          <!-- Rows -->
          <tr v-else v-for="(item, idx) in filteredRows" :key="item.rowId" class="order-item-row align-top-row">
            <!-- No -->
            <td class="q-pt-sm text-grey-7">{{ idx + 1 }}</td>

            <!-- Pesanan & Platform -->
            <td class="q-pt-sm">
              <div class="text-weight-bold font-mono text-body2 text-blue-grey-9">
                {{ item.displayedOrderSn }}
              </div>
              <div class="row items-center q-gutter-x-xs q-mt-xxs">
                <q-badge :color="getPlatformColor(item.platformName)" class="text-caption font-weight-medium">
                  {{ item.platformName.toUpperCase() }}
                </q-badge>
                <q-badge :color="getStatusBadgeColor(item.orderStatus)" outline class="text-caption">
                  {{ item.orderStatus }}
                </q-badge>
              </div>
              <div class="text-xxs text-grey-6 q-mt-xxs">
                {{ formatDateTime(item.orderCreateTime) }}
              </div>
              <div v-if="item.externalShopName" class="text-xxs text-blue-grey-6">
                🏪 {{ item.externalShopName }}
              </div>
            </td>

            <!-- Produk & SKU -->
            <td class="q-pt-sm">
              <div class="text-body2 text-weight-medium text-dark line-clamp-2">
                {{ item.productName }}
              </div>
              <div class="text-xxs font-mono text-grey-6 q-mt-xxs">
                Master SKU: <strong>{{ item.masterSku || '-' }}</strong>
              </div>
              <div v-if="item.assistProductName" class="text-xxs text-teal q-mt-xxs">
                ✓ Assist: {{ item.assistProductName }}
              </div>
              <div v-else class="text-xxs text-warning q-mt-xxs">
                ⚠ Belum dipetakan ke Assist
              </div>
            </td>

            <!-- Qty -->
            <td class="text-center q-pt-sm text-body2 font-weight-bold">
              {{ item.quantity }}
            </td>

            <!-- Harga Jual Tertera -->
            <td class="text-right q-pt-sm font-mono text-body2">
              <div>{{ formatRupiah(item.grossSalePerUnit) }}</div>
              <div v-if="item.itemDiscount > 0" class="text-xxs text-red">
                Disc: -{{ formatRupiah(item.itemDiscount) }}
              </div>
            </td>

            <!-- Harga Real Terjual (Net Received) -->
            <td class="text-right q-pt-sm font-mono">
              <div class="text-weight-bold text-teal text-body2">
                {{ formatRupiah(item.netPayoutPerUnit) }}
              </div>
              <div class="text-xxs text-grey-5">
                Total: {{ formatRupiah(item.totalNetPayout) }}
              </div>
            </td>

            <!-- HPP Terakhir Assist -->
            <td class="text-right q-pt-sm font-mono text-body2">
              <div v-if="item.latestBuyPrice > 0" class="text-blue-grey-8">
                {{ formatRupiah(item.latestBuyPrice) }}
              </div>
              <div v-else class="text-caption text-grey-4">-</div>
              <div v-if="item.conversionFactor > 1" class="text-xxs text-grey-5">
                Konv: ×{{ item.conversionFactor }}
              </div>
            </td>

            <!-- Margin Real -->
            <td class="text-right q-pt-sm font-mono">
              <template v-if="item.latestBuyPrice > 0">
                <q-badge
                  :color="item.realMarginPercent >= 15 ? 'positive' : item.realMarginPercent > 0 ? 'warning' : 'negative'"
                  class="q-px-sm text-weight-bold"
                >
                  {{ item.realMarginPercent > 0 ? '+' : '' }}{{ item.realMarginPercent.toFixed(1) }}%
                </q-badge>
                <div class="text-xxs text-grey-7 q-mt-xxs">
                  {{ formatRupiah(item.realProfitPerUnit) }} / unit
                </div>
              </template>
              <span v-else class="text-grey-4">-</span>
            </td>

            <!-- Margin Estimasi (Formula) -->
            <td class="text-right q-pt-sm font-mono">
              <div v-if="item.estimatedMarginPercent !== null && item.estimatedMarginPercent !== undefined">
                <span class="text-weight-medium" :class="item.estimatedMarginPercent > 0 ? 'text-teal' : 'text-red'">
                  {{ item.estimatedMarginPercent.toFixed(1) }}%
                </span>
                <div class="text-xxs text-grey-5">
                  {{ formatRupiah(item.destyCurrentPrice) }}
                </div>
              </div>
              <span v-else class="text-grey-4">-</span>
            </td>

            <!-- Update Harga Desty Langsung -->
            <td>
              <div class="row no-wrap items-center justify-end q-gutter-x-xs" v-if="item.masterSkuId">
                <span class="text-caption text-grey-6">Rp</span>
                <q-input
                  v-model.number="newPricesInput[item.masterSkuId]"
                  type="number"
                  dense
                  borderless
                  class="text-right text-body2 text-weight-medium font-mono"
                  style="width: 80px;"
                />
                <q-btn
                  flat
                  round
                  dense
                  color="teal"
                  icon="cloud_upload"
                  size="sm"
                  :loading="updatingSkuId === item.masterSkuId"
                  @click="handleUpdateDestyPrice(item)"
                >
                  <q-tooltip>Update Master Price ke Desty Omni</q-tooltip>
                </q-btn>
              </div>
              <div v-else class="text-center text-caption text-grey-4">
                SKU Id n/a
              </div>
            </td>

            <!-- Kasir Assist -->
            <td class="q-pt-sm">
              <div v-if="item.cashierName" class="text-body2 text-weight-bold text-blue-grey-9">
                👤 {{ item.cashierName }}
              </div>
              <div v-else class="text-caption text-grey-5">
                <q-badge color="grey-4" text-color="grey-8" label="Belum diimpor" />
              </div>
              <div v-if="item.assistInvoice" class="text-xxs font-mono text-grey-6 q-mt-xxs">
                {{ item.assistInvoice }}
              </div>
            </td>

            <!-- Riwayat -->
            <td class="text-center q-pt-xs">
              <q-btn
                flat
                round
                dense
                color="teal"
                icon="timeline"
                size="sm"
                @click="openHistoryDialog(item)"
              >
                <q-tooltip>Lihat Riwayat & Detail Desty</q-tooltip>
              </q-btn>
            </td>
          </tr>
        </tbody>
      </q-markup-table>
    </q-card>

    <!-- Modal Riwayat & Detail Pesanan Desty -->
    <q-dialog v-model="showHistoryDialog" max-width="650px">
      <q-card style="width: 650px; max-width: 95vw;">
        <q-card-section class="row items-center justify-between bg-teal text-white q-py-sm">
          <div class="text-subtitle1 text-weight-bold row items-center">
            <q-icon name="receipt_long" class="q-mr-sm" />
            Riwayat & Audit Pesanan Desty
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md" v-if="selectedItemForHistory">
          <!-- Overview Cards -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-6">Nomor Pesanan (Marketplace SN):</div>
              <div class="text-body1 text-weight-bold font-mono">{{ selectedItemForHistory.displayedOrderSn }}</div>
              <div class="text-caption text-grey-7">Platform: {{ selectedItemForHistory.platformName.toUpperCase() }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-6">Kurir & Resi:</div>
              <div class="text-body2 text-weight-bold">
                {{ selectedItemForHistory.courier || '-' }}
              </div>
              <div class="text-caption font-mono text-teal">
                Resi: {{ selectedItemForHistory.shipmentNo || '-' }}
              </div>
            </div>
          </div>

          <q-separator class="q-my-sm" />

          <!-- Financial Breakdown -->
          <div class="text-subtitle2 text-weight-bold text-blue-grey-9 q-mb-xs">
            Rincian Keuangan Pesanan:
          </div>
          <div class="bg-grey-1 q-pa-sm rounded-borders q-mb-md">
            <div class="row justify-between text-body2 q-py-xxs">
              <span class="text-grey-7">Harga Jual Pembeli (Gross):</span>
              <span class="font-mono text-weight-bold">{{ formatRupiah(selectedItemForHistory.grossSalePerUnit) }}</span>
            </div>
            <div class="row justify-between text-body2 q-py-xxs text-red" v-if="selectedOrderDetail?.serviceFee">
              <span>Biaya Layanan (Service Fee):</span>
              <span class="font-mono">-{{ formatRupiah(selectedOrderDetail.serviceFee) }}</span>
            </div>
            <div class="row justify-between text-body2 q-py-xxs text-red" v-if="selectedOrderDetail?.affiliateFee">
              <span>Biaya Afiliasi / Iklan:</span>
              <span class="font-mono">-{{ formatRupiah(selectedOrderDetail.affiliateFee) }}</span>
            </div>
            <div class="row justify-between text-body2 q-py-xxs text-teal text-weight-bold">
              <span>Dana Bersih Diterima Penjual (Net Settlement):</span>
              <span class="font-mono">{{ formatRupiah(selectedItemForHistory.netPayoutPerUnit) }}</span>
            </div>
            <div class="row justify-between text-body2 q-py-xxs text-grey-8">
              <span>HPP Modal Assist:</span>
              <span class="font-mono">{{ formatRupiah(selectedItemForHistory.latestBuyPrice) }}</span>
            </div>
            <q-separator class="q-my-xs" />
            <div class="row justify-between text-body1 text-weight-bold text-teal">
              <span>Keuntungan Riil (Profit Bersih):</span>
              <span class="font-mono">
                {{ formatRupiah(selectedItemForHistory.realProfitPerUnit) }} ({{ selectedItemForHistory.realMarginPercent.toFixed(1) }}%)
              </span>
            </div>
          </div>

          <!-- Cancellation Reason if any -->
          <div v-if="selectedItemForHistory.cancelReason" class="q-mb-md bg-red-1 q-pa-sm rounded-borders border-negative">
            <div class="text-weight-bold text-negative">Alasan Pembatalan / Retur:</div>
            <div class="text-body2">{{ selectedItemForHistory.cancelReason }} (Oleh: {{ selectedItemForHistory.cancelBy || 'Sistem' }})</div>
          </div>

          <!-- Timeline Status History -->
          <div class="text-subtitle2 text-weight-bold text-blue-grey-9 q-mb-xs">
            Riwayat Status Paket (Desty Audit Trail):
          </div>

          <div v-if="isLoadingDetail" class="text-center q-py-sm">
            <q-spinner-dots color="teal" size="24px" /> Memuat riwayat paket...
          </div>
          <div v-else-if="selectedOrderDetail?.packages?.[0]?.packageStatusHistory?.length">
            <q-timeline color="teal" dense class="q-pl-sm">
              <q-timeline-entry
                v-for="(hist, hIdx) in selectedOrderDetail.packages[0].packageStatusHistory"
                :key="hIdx"
                :title="hist.status"
                :subtitle="formatDateTime(hist.statusUpdateTime)"
              />
            </q-timeline>
          </div>
          <div v-else class="text-caption text-grey-6 q-py-sm">
            Status saat ini: <strong>{{ selectedItemForHistory.orderStatus }}</strong>
            <span v-if="selectedItemForHistory.labelPrinted"> (Label Resi Sudah Dicetak)</span>
          </div>

          <!-- Assist Cashier Info -->
          <q-separator class="q-my-sm" />
          <div class="row justify-between items-center text-body2">
            <span class="text-grey-7">Kasir Pemroses di Assist:</span>
            <span class="text-weight-bold text-dark">
              {{ selectedItemForHistory.cashierName || 'Belum diimpor / Belum tercatat' }}
            </span>
          </div>
          <div class="row justify-between items-center text-body2" v-if="selectedItemForHistory.assistInvoice">
            <span class="text-grey-7">Faktur / Invoice Assist:</span>
            <span class="font-mono text-weight-bold text-teal">
              {{ selectedItemForHistory.assistInvoice }}
            </span>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="bg-grey-1 q-px-md">
          <q-btn flat label="Tutup" color="dark" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.order-margin-table th {
  font-size: 11px;
  white-space: nowrap;
}
.order-margin-table td {
  font-size: 12px;
}
.align-top-row td {
  vertical-align: top;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-height-tight {
  line-height: 1.15;
}
</style>
