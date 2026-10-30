<template>
  <div class="desty-cancelled-orders-tab">
    <!-- Filter & Action Toolbar -->
    <div class="row q-col-gutter-sm items-center q-mb-md">
      <!-- Status Desty Filter -->
      <div class="col-12 col-sm-6 col-md-2">
        <q-select
          v-model="statusFilter"
          outlined
          dense
          emit-value
          map-options
          :options="statusFilterOptions"
          label="Status Desty"
          color="teal"
          bg-color="white"
          @update:model-value="fetchCancelledOrders"
        />
      </div>

      <!-- Status Penyerahan Ekspedisi Filter -->
      <div class="col-12 col-sm-6 col-md-2">
        <q-select
          v-model="handoverFilter"
          outlined
          dense
          emit-value
          map-options
          :options="handoverFilterOptions"
          label="Penyerahan Kurir"
          color="teal"
          bg-color="white"
        />
      </div>

      <!-- Status Penerimaan Fisik Apotek Filter -->
      <div class="col-12 col-sm-6 col-md-2">
        <q-select
          v-model="receptionFilter"
          outlined
          dense
          emit-value
          map-options
          :options="receptionFilterOptions"
          label="Fisik di Apotek"
          color="teal"
          bg-color="white"
        />
      </div>

      <!-- Platform Marketplace Filter -->
      <div class="col-12 col-sm-6 col-md-2">
        <q-select
          v-model="platformFilter"
          outlined
          dense
          emit-value
          map-options
          :options="platformFilterOptions"
          label="Marketplace"
          color="teal"
          bg-color="white"
        />
      </div>

      <!-- Search Input -->
      <div class="col-12 col-sm-6 col-md-2">
        <q-input
          v-model="searchQuery"
          outlined
          dense
          clearable
          placeholder="Cari Pesanan, Resi, Obat..."
          color="teal"
          bg-color="white"
        >
          <template v-slot:prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>

      <!-- Action Buttons & Limit -->
      <div class="col-12 col-sm-6 col-md-2 row q-gutter-x-xs justify-end items-center no-wrap">
        <q-select
          v-model="maxPagesToFetch"
          outlined
          dense
          emit-value
          map-options
          :options="pageLimitOptions"
          label="Limit"
          color="teal"
          bg-color="white"
          style="min-width: 90px;"
          :disable="loading"
        />
        <q-btn
          v-if="!loading"
          color="teal"
          icon="download"
          label="Tarik"
          @click="fetchCancelledOrders"
          :disabled="!token"
          no-caps
        />
        <q-btn
          v-else
          color="negative"
          icon="cancel"
          label="Batal"
          @click="abortFetch"
          no-caps
        />
        <q-btn
          color="positive"
          outline
          icon="file_download"
          :disabled="!filteredOrders.length || loading"
          @click="exportToExcel"
          no-caps
        >
          <q-tooltip>Ekspor ke Excel</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Summary KPI Cards -->
    <div class="row q-col-gutter-sm q-mb-md">
      <!-- Total Pesanan -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered class="bg-blue-1 text-blue-10">
          <q-card-section class="q-py-sm">
            <div class="text-caption text-weight-medium">Total Batal & Retur</div>
            <div class="text-h6 text-weight-bolder">{{ orders.length }} <span class="text-caption text-weight-normal">pesanan</span></div>
            <div class="text-2xs text-grey-8">{{ totalItemsCount }} total fisik produk</div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Sudah Sampai di Apotek -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered class="bg-green-1 text-green-10">
          <q-card-section class="q-py-sm">
            <div class="text-caption text-weight-medium">Sudah Sampai Apotek</div>
            <div class="text-h6 text-weight-bolder text-positive">{{ receivedOrdersCount }} <span class="text-caption text-weight-normal">pesanan</span></div>
            <div class="text-2xs text-green-9">Fisik barang telah diverifikasi</div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Pengiriman Gagal (Sudah di Kurir) -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered class="bg-red-1 text-red-10">
          <q-card-section class="q-py-sm">
            <div class="text-caption text-weight-medium">Pengiriman Gagal (Di Kurir)</div>
            <div class="text-h6 text-weight-bolder text-negative">{{ deliveryFailedCount }} <span class="text-caption text-weight-normal">pesanan</span></div>
            <div class="text-2xs text-red-9">Pasti di kurir & retur ke penjual</div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Siap Kirim / Resi Dicetak -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered class="bg-amber-1 text-amber-10">
          <q-card-section class="q-py-sm">
            <div class="text-caption text-weight-medium">Resi Dicetak / Siap Kirim</div>
            <div class="text-h6 text-weight-bolder text-amber-9">{{ readyToShipCount }} <span class="text-caption text-weight-normal">pesanan</span></div>
            <div class="text-2xs text-amber-9">Cek tumpukan siap kirim apotek</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Main Orders Table (6 Consolidated, Clean Columns) -->
    <div class="table-scroll-container">
      <q-table
        :rows="filteredOrders"
        :columns="tableColumns"
        row-key="rowId"
        flat
        bordered
        :loading="loading"
        :pagination="{ rowsPerPage: 15 }"
        no-data-label="Belum ada pesanan batal atau retur. Klik 'Tarik' untuk memuat dari Desty."
        class="cancelled-orders-table"
      >
        <!-- Kolom 1: Status Fisik Apotek & Ceklis -->
        <template v-slot:body-cell-reception="props">
          <q-td :props="props" class="text-center">
            <div class="column items-center q-gutter-y-xs">
              <q-checkbox
                :model-value="props.row.isReceived"
                color="positive"
                size="md"
                @update:model-value="() => handleToggleCheck(props.row)"
              >
                <q-tooltip>
                  {{ props.row.isReceived ? 'Klik untuk membatalkan status diterima (Uncheck)' : 'Ceklis jika fisik paket sudah diterima di apotek' }}
                </q-tooltip>
              </q-checkbox>

              <q-chip
                dense
                size="xs"
                :color="props.row.isReceived ? 'positive' : 'grey-3'"
                :text-color="props.row.isReceived ? 'white' : 'grey-8'"
                class="text-weight-bold"
                :icon="props.row.isReceived ? 'check_circle' : 'hourglass_empty'"
              >
                {{ props.row.isReceived ? 'Sudah Sampai' : 'Belum Sampai' }}
              </q-chip>

              <div v-if="props.row.isReceived && (props.row.checkedBy || props.row.checkedByEmail)" class="text-center text-3xs text-teal">
                <div class="text-weight-bold ellipsis" style="max-width: 130px;" :title="props.row.checkedBy || props.row.checkedByEmail">
                  <q-icon name="person" size="xs" /> {{ props.row.checkedBy || props.row.checkedByEmail }}
                </div>
                <div class="text-grey-7" v-if="props.row.checkedAt">
                  {{ formatDateTime(props.row.checkedAt) }}
                </div>
              </div>
            </div>
          </q-td>
        </template>

        <!-- Kolom 2: Marketplace & Pesanan -->
        <template v-slot:body-cell-orderSn="props">
          <q-td :props="props">
            <div class="column q-gutter-y-xs">
              <div class="row items-center q-gutter-x-xs no-wrap">
                <q-badge
                  :color="getPlatformBadgeColor(props.row.platformName)"
                  text-color="white"
                  class="text-weight-bold q-px-xs text-3xs"
                >
                  {{ props.row.platformName }}
                </q-badge>
                <span class="font-mono text-weight-bold text-caption ellipsis" style="max-width: 140px;" :title="props.row.displayedOrderSn">
                  {{ props.row.displayedOrderSn }}
                </span>
                <q-btn
                  flat
                  round
                  dense
                  size="xs"
                  color="grey-7"
                  icon="content_copy"
                  @click="copyText(props.row.displayedOrderSn, 'Nomor pesanan')"
                >
                  <q-tooltip>Salin nomor pesanan</q-tooltip>
                </q-btn>
              </div>

              <div class="text-2xs text-grey-8">
                Dibuat: {{ formatDate(props.row.orderCreatedAt) }}
              </div>

              <div class="row items-center q-gutter-x-xs">
                <q-badge color="grey-3" text-color="grey-9" class="text-3xs q-px-xs">
                  Batal: {{ props.row.cancelBy === 'buyer' ? 'Pembeli' : props.row.cancelBy || '-' }}
                </q-badge>
              </div>

              <div v-if="props.row.cancelReason" class="text-3xs text-grey-7 ellipsis-2-lines" :title="props.row.cancelReason">
                Alasan: <em>{{ props.row.cancelReason }}</em>
              </div>
            </div>
          </q-td>
        </template>

        <!-- Kolom 3: Status Logistik & Ekspedisi -->
        <template v-slot:body-cell-shippingLogistics="props">
          <q-td :props="props">
            <div class="column q-gutter-y-xs">
              <!-- Penyerahan Callout Badge -->
              <div v-if="props.row.handoverStatus === 'DELIVERY_FAILED'">
                <q-badge color="red-1" text-color="red-10" class="q-pa-xs text-weight-bold border-red">
                  <q-icon name="error" color="red" size="xs" class="q-mr-xs" />
                  Pengiriman Gagal (Sudah di Kurir)
                </q-badge>
              </div>
              <div v-else-if="props.row.handoverStatus === 'READY_TO_SHIP'">
                <q-badge color="amber-1" text-color="amber-10" class="q-pa-xs text-weight-bold border-amber">
                  <q-icon name="inventory_2" color="amber-9" size="xs" class="q-mr-xs" />
                  Resi Dicetak (Perlu Cek Fisik)
                </q-badge>
              </div>
              <div v-else>
                <q-badge color="grey-2" text-color="grey-8" class="q-pa-xs text-weight-medium">
                  <q-icon name="block" color="grey-6" size="xs" class="q-mr-xs" />
                  Belum Pernah Diproses / Dikirim
                </q-badge>
              </div>

              <!-- Desty Extra Badges -->
              <div class="row items-center q-gutter-x-xs q-mt-2xs">
                <q-badge v-if="props.row.logisticsStatus === 'Error'" color="red-2" text-color="red-10" class="text-3xs">
                  Kesalahan Logistik ⓘ
                </q-badge>
                <q-badge v-if="props.row.requestCancelStatus === 2" color="green-2" text-color="green-10" class="text-3xs">
                  Permintaan Batal Disetujui
                </q-badge>
              </div>

              <!-- Resi & Kurir Info -->
              <div class="q-mt-xs">
                <div v-if="props.row.trackingNumber" class="row items-center q-gutter-x-xs no-wrap">
                  <span class="font-mono text-weight-bold text-caption ellipsis" style="max-width: 140px;" :title="props.row.trackingNumber">
                    {{ props.row.trackingNumber }}
                  </span>
                  <q-btn
                    flat
                    round
                    dense
                    size="xs"
                    color="grey-7"
                    icon="content_copy"
                    @click="copyText(props.row.trackingNumber, 'Nomor resi')"
                  >
                    <q-tooltip>Salin nomor resi</q-tooltip>
                  </q-btn>
                </div>
                <div v-else class="text-2xs text-grey-5 italic">
                  Tanpa Nomor Resi
                </div>

                <div v-if="props.row.courier" class="text-3xs text-grey-8">
                  Kurir: {{ props.row.courier }}
                </div>
              </div>
            </div>
          </q-td>
        </template>

        <!-- Kolom 4: Produk / Obat -->
        <template v-slot:body-cell-items="props">
          <q-td :props="props">
            <div class="column q-gutter-y-xs">
              <div
                v-for="(item, idx) in props.row.items.slice(0, 3)"
                :key="idx"
                class="row items-start justify-between text-2xs q-py-2xs border-bottom-light"
              >
                <div class="col-8 text-weight-medium ellipsis" :title="item.productName">
                  <strong class="text-teal-9">{{ item.quantity }}x</strong> {{ item.productName }}
                </div>
                <div class="col-4 text-grey-7 font-mono text-right text-3xs ellipsis" :title="item.sku">
                  {{ item.sku || '-' }}
                </div>
              </div>

              <div
                v-if="props.row.items.length > 3"
                class="text-3xs text-teal cursor-pointer text-weight-bold q-pt-2xs"
                @click="openItemsDialog(props.row)"
              >
                + {{ props.row.items.length - 3 }} produk lainnya (klik rincian)
              </div>
            </div>
          </q-td>
        </template>

        <!-- Kolom 5: Kasir, Packing & Kronologi -->
        <template v-slot:body-cell-processing="props">
          <q-td :props="props" class="text-center">
            <div class="column items-center q-gutter-y-xs">
              <!-- Jika pernah diproses kasir -->
              <div v-if="props.row.hasBeenProcessed && props.row.orderProcessedAt">
                <div class="text-weight-bold text-2xs text-teal-9">
                  Tgl Packing: {{ formatDate(props.row.orderProcessedAt) }}
                </div>
                <div class="text-3xs text-grey-7">
                  {{ formatTime(props.row.orderProcessedAt) }}
                </div>

                <q-btn
                  size="xs"
                  color="teal"
                  icon="receipt_long"
                  label="Lihat Transaksi Kasir"
                  class="q-mt-xs full-width"
                  @click="navigateToTransactionDate(props.row)"
                  no-caps
                />

                <q-badge
                  v-if="props.row.assistInvoice"
                  color="green-1"
                  text-color="green-9"
                  class="text-3xs font-mono q-mt-2xs"
                >
                  Inv: {{ props.row.assistInvoice }}
                </q-badge>
              </div>

              <!-- Jika belum pernah diproses kasir -->
              <div v-else>
                <q-badge color="grey-3" text-color="grey-8" class="q-px-xs text-3xs">
                  Belum Diproses Kasir
                </q-badge>
              </div>

              <!-- Riwayat On-Demand Detail Desty -->
              <q-btn
                size="xs"
                outline
                color="grey-8"
                icon="history"
                label="Riwayat Status"
                @click="openOrderDetailHistoryDialog(props.row)"
                no-caps
                dense
                class="q-px-xs q-mt-xs"
              >
                <q-tooltip>Lihat kronologi status paket di Desty</q-tooltip>
              </q-btn>
            </div>
          </q-td>
        </template>

        <!-- Kolom 6: Catatan Kondisi -->
        <template v-slot:body-cell-notes="props">
          <q-td :props="props">
            <div class="row items-center justify-between no-wrap">
              <div class="ellipsis text-2xs" :class="props.row.notes ? 'text-black' : 'text-grey-5 italic'" style="max-width: 120px;" :title="props.row.notes">
                {{ props.row.notes || 'Belum ada catatan' }}
              </div>
              <q-btn
                flat
                round
                dense
                size="xs"
                color="teal"
                icon="edit_note"
                @click="openNotesDialog(props.row)"
              >
                <q-tooltip>Edit catatan kondisi barang</q-tooltip>
              </q-btn>
            </div>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Dialog Detail Kronologi & Riwayat Status Desty -->
    <q-dialog v-model="historyDialogVisible">
      <q-card style="min-width: 480px; max-width: 620px;">
        <q-card-section class="row items-center q-pb-none bg-grey-1">
          <div class="text-subtitle1 text-weight-bold row items-center">
            <q-icon name="history" color="teal" class="q-mr-sm" />
            Kronologi & Riwayat Pesanan
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-sm" v-if="loadingHistory">
          <div class="row justify-center items-center q-pa-lg text-grey-8">
            <q-spinner color="teal" size="32px" class="q-mr-sm" />
            Memuat riwayat dari Desty...
          </div>
        </q-card-section>

        <q-card-section class="q-pt-sm" v-else-if="activeHistoryOrder">
          <div class="q-mb-sm text-caption">
            <div>Pesanan: <strong>{{ activeHistoryOrder.displayedOrderSn }}</strong> ({{ activeHistoryOrder.platformName }})</div>
            <div v-if="activeHistoryDetail?.cancelReason" class="text-negative text-weight-medium q-mt-xs">
              Alasan Pembatalan: <strong>{{ activeHistoryDetail.cancelReason }}</strong> (Oleh: {{ activeHistoryDetail.cancelBy || 'Buyer' }})
            </div>
            <div v-if="activeHistoryDetail?.labelPrinted !== undefined" class="text-grey-8 q-mt-xs">
              Label Resi: <strong>{{ activeHistoryDetail.labelPrinted ? 'Sudah Pernah Dicetak' : 'Belum Pernah Dicetak' }}</strong>
            </div>
          </div>

          <div class="text-subtitle2 text-weight-bold text-teal q-mt-md q-mb-xs">
            Kronologi Status Paket
          </div>
          <q-timeline color="teal" dense class="q-px-sm" v-if="activeHistoryDetail?.packageStatusHistory?.length">
            <q-timeline-entry
              v-for="(hist, idx) in activeHistoryDetail.packageStatusHistory"
              :key="idx"
              :title="formatStatusName(hist.status)"
              :subtitle="formatDateTimeFromMs(hist.statusUpdateTime)"
              :color="hist.status === 'Processed' ? 'teal' : hist.status === 'Cancellations' ? 'red' : 'primary'"
            />
          </q-timeline>
          <div v-else class="text-grey-7 text-caption q-pa-sm italic">
            Belum ada riwayat status terperinci dari Desty.
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pb-md q-px-md">
          <q-btn flat label="Tutup" color="teal" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog Edit Catatan Kondisi -->
    <q-dialog v-model="notesDialogVisible">
      <q-card style="min-width: 400px;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-bold">
            Catatan Kondisi Barang
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-sm">
          <div class="text-caption text-grey-8 q-mb-sm">
            Pesanan: <strong>{{ activeEditingOrder?.displayedOrderSn }}</strong>
          </div>
          <q-input
            v-model="activeEditingNotes"
            type="textarea"
            outlined
            dense
            rows="3"
            placeholder="Contoh: Paket diterima utuh, segel terbuka, obat botol pecah..."
            color="teal"
          />
        </q-card-section>

        <q-card-actions align="right" class="q-pb-md q-px-md">
          <q-btn flat label="Batal" color="grey" v-close-popup />
          <q-btn
            color="teal"
            label="Simpan Catatan"
            :loading="savingNotes"
            @click="saveNotes"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog Rincian Seluruh Produk -->
    <q-dialog v-model="itemsDialogVisible">
      <q-card style="min-width: 450px;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-bold">
            Rincian Produk di Pesanan
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-sm">
          <div class="text-caption text-grey-8 q-mb-sm">
            Pesanan: <strong>{{ activeViewingOrder?.displayedOrderSn }}</strong>
          </div>
          <q-list separator bordered dense class="rounded-borders">
            <q-item v-for="(it, idx) in activeViewingOrder?.items" :key="idx">
              <q-item-section>
                <q-item-label class="text-weight-bold">{{ it.productName }}</q-item-label>
                <q-item-label caption class="font-mono">SKU: {{ it.sku || '-' }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge color="teal" text-color="white" class="text-weight-bold">
                  {{ it.quantity }} {{ it.unit || 'pcs' }}
                </q-badge>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-card-actions align="right" class="q-pb-md q-px-md">
          <q-btn flat label="Tutup" color="teal" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import * as XLSX from "xlsx";
import { useFirebaseAuth } from "@/composables/useFirebaseAuth";
import {
  fetchDestyCancelledOrdersFast,
  fetchDestyOrderDetail,
  type DestyOrderRecord,
  type DestyOrderDetailResult,
} from "@/composables/destyOmniOrderApi";
import {
  getReturnCheckRecords,
  saveReturnCheckRecord,
  toggleReturnCheckOrder,
  updateOrderNotes,
  subscribeReturnChecks,
} from "@/services/destySync/destyReturnCheckStorage";
import { getDestyImportLedger } from "@/services/destySync/importLedgerStorage";
import type {
  CancelledOrderRow,
  DestyReturnCheckRecord,
} from "@/types/destyCancelledReturn";

const props = defineProps<{
  token: string;
  tenantId?: string;
}>();

const $q = useQuasar();
const router = useRouter();
const { currentUser, userEmail } = useFirebaseAuth();

// State
const loading = ref(false);
const progressText = ref("");
const orders = ref<CancelledOrderRow[]>([]);
const checkRecordsMap = ref<Record<string, DestyReturnCheckRecord>>({});
const maxPagesToFetch = ref<number>(2);
const activeAbortController = ref<AbortController | null>(null);

const pageLimitOptions = [
  { label: "100 Data (2 Hal)", value: 2 },
  { label: "250 Data (5 Hal)", value: 5 },
  { label: "500 Data (10 Hal)", value: 10 },
  { label: "Semua (25 Hal)", value: 25 },
];

// Filters - Using exact Desty API status strings
const statusFilter = ref<"ALL" | "Cancellations" | "Returns">("ALL");
const handoverFilter = ref<string>("ALL");
const receptionFilter = ref<string>("ALL");
const platformFilter = ref<string>("ALL");
const searchQuery = ref<string>("");

// Dialogs
const notesDialogVisible = ref(false);
const savingNotes = ref(false);
const activeEditingOrder = ref<CancelledOrderRow | null>(null);
const activeEditingNotes = ref("");

const itemsDialogVisible = ref(false);
const activeViewingOrder = ref<CancelledOrderRow | null>(null);

const historyDialogVisible = ref(false);
const loadingHistory = ref(false);
const activeHistoryOrder = ref<CancelledOrderRow | null>(null);
const activeHistoryDetail = ref<DestyOrderDetailResult | null>(null);

let unsubscribeSnapshot: (() => void) | null = null;

const statusFilterOptions = [
  { label: "Semua Batal & Retur", value: "ALL" },
  { label: "Dibatalkan (Cancellations)", value: "Cancellations" },
  { label: "Pengembalian (Returns)", value: "Returns" },
];

const handoverFilterOptions = [
  { label: "Semua Status Kurir", value: "ALL" },
  { label: "🔴 Pengiriman Gagal (Di Kurir)", value: "DELIVERY_FAILED" },
  { label: "🟡 Resi Dicetak (Perlu Cek)", value: "READY_TO_SHIP" },
  { label: "⚪ Belum Diproses (Tanpa Resi)", value: "NOT_HANDED_OVER" },
];

const receptionFilterOptions = [
  { label: "Semua Status Fisik", value: "ALL" },
  { label: "Belum Diterima di Apotek", value: "UNCHECKED" },
  { label: "Sudah Sampai di Apotek", value: "CHECKED" },
];

const platformFilterOptions = computed(() => {
  const platforms = new Set<string>();
  orders.value.forEach((o) => {
    if (o.platformName) platforms.add(o.platformName);
  });
  const list = Array.from(platforms).map((p) => ({ label: p, value: p }));
  return [{ label: "Semua Marketplace", value: "ALL" }, ...list];
});

// KPI Metrics
const totalItemsCount = computed(() => {
  return orders.value.reduce((acc, o) => acc + o.totalQuantity, 0);
});

const receivedOrdersCount = computed(() => {
  return orders.value.filter((o) => o.isReceived).length;
});

const deliveryFailedCount = computed(() => {
  return orders.value.filter((o) => o.handoverStatus === "DELIVERY_FAILED").length;
});

const readyToShipCount = computed(() => {
  return orders.value.filter((o) => o.handoverStatus === "READY_TO_SHIP").length;
});

// Filtered Orders
const filteredOrders = computed(() => {
  let list = orders.value;

  if (statusFilter.value !== "ALL") {
    const target = statusFilter.value.toLowerCase();
    list = list.filter((o) => o.destyStatus.toLowerCase().includes(target));
  }

  if (handoverFilter.value !== "ALL") {
    list = list.filter((o) => o.handoverStatus === handoverFilter.value);
  }

  if (receptionFilter.value === "CHECKED") {
    list = list.filter((o) => o.isReceived);
  } else if (receptionFilter.value === "UNCHECKED") {
    list = list.filter((o) => !o.isReceived);
  }

  if (platformFilter.value !== "ALL") {
    list = list.filter((o) => o.platformName.toLowerCase() === platformFilter.value.toLowerCase());
  }

  if (searchQuery.value && searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter((o) => {
      return (
        o.displayedOrderSn.toLowerCase().includes(q) ||
        (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q)) ||
        (o.courier && o.courier.toLowerCase().includes(q)) ||
        (o.checkedBy && o.checkedBy.toLowerCase().includes(q)) ||
        (o.notes && o.notes.toLowerCase().includes(q)) ||
        o.items.some(
          (it) =>
            it.productName.toLowerCase().includes(q) ||
            it.sku.toLowerCase().includes(q),
        )
      );
    });
  }

  return list;
});

// Table Columns Definition (6 Consolidated, Balanced Columns)
const tableColumns = [
  { name: "reception", label: "Status Fisik Apotek", align: "center" as const, field: "isReceived", sortable: true, style: "width: 140px; min-width: 140px;" },
  { name: "orderSn", label: "Marketplace & Pesanan", align: "left" as const, field: "displayedOrderSn", sortable: true, style: "width: 210px; min-width: 210px;" },
  { name: "shippingLogistics", label: "Status Ekspedisi & Logistik", align: "left" as const, field: "handoverStatus", sortable: true, style: "width: 250px; min-width: 250px;" },
  { name: "items", label: "Produk / Obat", align: "left" as const, field: "items", style: "width: 260px; min-width: 260px;" },
  { name: "processing", label: "Kasir & Kronologi", align: "center" as const, field: "orderProcessedAt", sortable: true, style: "width: 210px; min-width: 210px;" },
  { name: "notes", label: "Catatan Kondisi", align: "left" as const, field: "notes", style: "width: 150px; min-width: 150px;" },
];

/**
 * Normalizes Desty timestamp to ISO string
 */
function normalizeDestyTimestamp(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  const ms = num < 10_000_000_000 ? num * 1000 : num;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Builds CancelledOrderRow from Desty records and checks
 */
function buildCancelledOrderRows(
  records: DestyOrderRecord[],
  checks: Record<string, DestyReturnCheckRecord>,
  ledgerByOrderSn: Record<string, { invoice?: string; txId?: string }>,
): CancelledOrderRow[] {
  return records.map((rec) => {
    const orderId = String(rec.orderId || rec.id || "");
    const orderSn = String(rec.orderSn || rec.displayedOrderSn || orderId).trim();
    const displayedOrderSn = String(rec.displayedOrderSn || rec.orderSn || orderId).trim();
    const key = orderSn.toUpperCase();

    const checkRecord = checks[key] || checks[orderId.toUpperCase()];

    // Determine processed / packed time
    const rawProcessedTime = rec.orderProcessTime || rec.packageTime;
    const orderProcessedAt = normalizeDestyTimestamp(rawProcessedTime) || checkRecord?.processedAt;
    const hasBeenProcessed = Boolean(orderProcessedAt);

    const orderCreatedAt = normalizeDestyTimestamp(rec.orderCreateTime) || checkRecord?.createdAt;

    const items = (rec.items || []).map((it) => ({
      sku: String(it.skuCode || it.masterSku || "").trim(),
      productName: String(it.productName || "Produk").trim(),
      quantity: Number(it.quantity || 1),
      unit: undefined,
      unitPrice: undefined,
      totalPrice: undefined,
    }));

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    // Ledger lookup for Assist invoice
    const ledger =
      ledgerByOrderSn[orderSn.toUpperCase()] ||
      (rec.bookingSn ? ledgerByOrderSn[rec.bookingSn.trim().toUpperCase()] : undefined) ||
      (rec.shipmentNo ? ledgerByOrderSn[rec.shipmentNo.trim().toUpperCase()] : undefined);

    const isReceived = Boolean(checkRecord?.received);
    const checkedBy = checkRecord?.checkedByName || checkRecord?.checkedByEmail;
    const checkedByEmail = checkRecord?.checkedByEmail;
    const checkedAt = checkRecord?.checkedAt;
    const notes = checkRecord?.notes;

    // Logistics & Handover categorization
    const logisticsStatus = rec.logisticsStatus;
    const requestCancelStatus = rec.requestCancelStatus;
    const hasResi = Boolean(rec.shipmentNo && String(rec.shipmentNo).trim() !== "" && String(rec.shipmentNo).trim() !== "-");
    const isLabelPrinted = Boolean(rec.labelPrinted);

    let handoverStatus: "DELIVERY_FAILED" | "READY_TO_SHIP" | "NOT_HANDED_OVER";
    if (logisticsStatus === "DeliveryFailed") {
      handoverStatus = "DELIVERY_FAILED";
    } else if (isLabelPrinted || hasResi) {
      handoverStatus = "READY_TO_SHIP";
    } else {
      handoverStatus = "NOT_HANDED_OVER";
    }

    return {
      rowId: orderId || orderSn,
      orderId,
      orderSn,
      displayedOrderSn,
      bookingSn: rec.bookingSn,
      trackingNumber: rec.shipmentNo,
      courier: rec.courier,
      platformName: rec.platformName || "Marketplace",
      destyStatus: rec.status || "Cancellations",
      orderCreatedAt,
      orderProcessedAt,
      hasBeenProcessed,
      labelPrinted: rec.labelPrinted,
      cancelBy: rec.cancelBy,
      cancelReason: rec.cancelReason,
      logisticsStatus,
      requestCancelStatus,
      handoverStatus,
      packageStatusHistory: rec.packageStatusHistory,
      items,
      totalQuantity,
      totalPrice: Number(rec.totalSales || rec.totalPrice || 0),
      isReceived,
      checkedBy,
      checkedByEmail,
      checkedAt,
      notes,
      assistInvoice: ledger?.invoice,
      assistTxId: ledger?.txId,
    };
  });
}

/**
 * Aborts active fetching process
 */
function abortFetch() {
  if (activeAbortController.value) {
    activeAbortController.value.abort();
    activeAbortController.value = null;
    loading.value = false;
    $q.notify({
      type: "warning",
      message: "Proses penarikan data dibatalkan.",
    });
  }
}

/**
 * Fetch Cancelled / Return orders from Desty Omni using fast paginated endpoint
 */
async function fetchCancelledOrders() {
  if (!props.token || loading.value) return;

  const controller = new AbortController();
  activeAbortController.value = controller;
  loading.value = true;
  progressText.value = "Menghubungi Desty...";

  try {
    // 1. Fetch Desty orders fast with page limit & abort signal
    const allFetchedRecords = await fetchDestyCancelledOrdersFast({
      token: props.token,
      tenantId: props.tenantId,
      status: statusFilter.value,
      maxPages: maxPagesToFetch.value,
      signal: controller.signal,
      onProgress: (fetched, total, st, currentPage, totalPages) => {
        progressText.value = `${st} (Hal ${currentPage ?? 1}/${totalPages ?? 1}): ${fetched}/${total}`;
      },
    });

    // 2. Load Firestore / Local check records
    const checks = await getReturnCheckRecords();
    checkRecordsMap.value = checks;

    // 3. Load Assist import ledger to link invoices
    const ledger = await getDestyImportLedger();
    const ledgerByOrderSn: Record<string, { invoice?: string; txId?: string }> = {};
    for (const entry of ledger) {
      if (entry.marketplaceOrderSn) {
        ledgerByOrderSn[entry.marketplaceOrderSn.trim().toUpperCase()] = {
          invoice: entry.invoice,
          txId: entry.txId,
        };
      }
      if (entry.bookingSn) {
        ledgerByOrderSn[entry.bookingSn.trim().toUpperCase()] = {
          invoice: entry.invoice,
          txId: entry.txId,
        };
      }
      if (entry.trackingNumber) {
        ledgerByOrderSn[entry.trackingNumber.trim().toUpperCase()] = {
          invoice: entry.invoice,
          txId: entry.txId,
        };
      }
    }

    // 4. Build unified rows
    orders.value = buildCancelledOrderRows(allFetchedRecords, checks, ledgerByOrderSn);

    $q.notify({
      type: "positive",
      message: `Berhasil memuat ${orders.value.length} pesanan batal / retur Desty.`,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return; // Handled by abortFetch
    }
    const msg = err instanceof Error ? err.message : String(err);
    $q.notify({
      type: "negative",
      message: `Gagal memuat pesanan batal Desty: ${msg}`,
    });
  } finally {
    loading.value = false;
    activeAbortController.value = null;
  }
}

/**
 * Opens on-demand history and detail dialog for an order
 */
async function openOrderDetailHistoryDialog(row: CancelledOrderRow) {
  activeHistoryOrder.value = row;
  activeHistoryDetail.value = null;
  historyDialogVisible.value = true;
  loadingHistory.value = true;

  try {
    const detail = await fetchDestyOrderDetail({
      token: props.token,
      tenantId: props.tenantId,
      orderId: row.orderId,
    });
    activeHistoryDetail.value = detail;

    // Update row with detail information
    if (detail.cancelReason) row.cancelReason = detail.cancelReason;
    if (detail.cancelBy) row.cancelBy = detail.cancelBy;
    if (detail.labelPrinted !== undefined) row.labelPrinted = detail.labelPrinted;
    if (detail.logisticsStatus) row.logisticsStatus = detail.logisticsStatus;
    if (detail.requestCancelStatus !== undefined) row.requestCancelStatus = detail.requestCancelStatus;
    if (detail.packageStatusHistory) row.packageStatusHistory = detail.packageStatusHistory;

    // Re-evaluate handover status
    if (row.logisticsStatus === "DeliveryFailed") {
      row.handoverStatus = "DELIVERY_FAILED";
    } else if (row.labelPrinted || Boolean(row.trackingNumber)) {
      row.handoverStatus = "READY_TO_SHIP";
    }

    // If detail found when the order was marked "Processed", update and persist!
    if (detail.processedTime && !row.orderProcessedAt) {
      const processedIso = new Date(detail.processedTime).toISOString();
      row.orderProcessedAt = processedIso;
      row.hasBeenProcessed = true;

      // Persist to storage
      await toggleReturnCheckOrder({
        orderId: row.orderId,
        orderSn: row.orderSn,
        displayedOrderSn: row.displayedOrderSn,
        bookingSn: row.bookingSn,
        trackingNumber: row.trackingNumber,
        platformName: row.platformName,
        processedAt: processedIso,
        createdAt: row.orderCreatedAt,
        forceReceived: row.isReceived,
      });
    }
  } catch (err: unknown) {
    $q.notify({
      type: "warning",
      message: `Gagal memuat riwayat status Desty: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    loadingHistory.value = false;
  }
}

/**
 * Toggle check status for an order
 */
async function handleToggleCheck(row: CancelledOrderRow) {
  try {
    const user = currentUser.value;
    const newRecord = await toggleReturnCheckOrder({
      orderId: row.orderId,
      orderSn: row.orderSn,
      displayedOrderSn: row.displayedOrderSn,
      bookingSn: row.bookingSn,
      trackingNumber: row.trackingNumber,
      platformName: row.platformName,
      userUid: user?.uid,
      userEmail: user?.email || userEmail.value,
      userName: user?.displayName || userEmail.value?.split("@")[0] || "Petugas",
      processedAt: row.orderProcessedAt,
      createdAt: row.orderCreatedAt,
      notes: row.notes,
    });

    // Update row state
    row.isReceived = newRecord.received;
    row.checkedBy = newRecord.checkedByName || newRecord.checkedByEmail;
    row.checkedByEmail = newRecord.checkedByEmail;
    row.checkedAt = newRecord.checkedAt;

    checkRecordsMap.value[row.orderSn.toUpperCase()] = newRecord;

    $q.notify({
      type: row.isReceived ? "positive" : "info",
      message: row.isReceived
        ? `Pesanan ${row.displayedOrderSn} ditandai SUDAH SAMPAI di apotek.`
        : `Pesanan ${row.displayedOrderSn} ditandai BELUM SAMPAI.`,
    });
  } catch (err: unknown) {
    $q.notify({
      type: "negative",
      message: `Gagal memperbarui status checklist: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * Open notes editing dialog
 */
function openNotesDialog(row: CancelledOrderRow) {
  activeEditingOrder.value = row;
  activeEditingNotes.value = row.notes || "";
  notesDialogVisible.value = true;
}

/**
 * Save notes to storage
 */
async function saveNotes() {
  if (!activeEditingOrder.value) return;
  savingNotes.value = true;
  try {
    const row = activeEditingOrder.value;
    const notes = activeEditingNotes.value.trim();

    // Ensure record exists or update notes
    let rec = checkRecordsMap.value[row.orderSn.toUpperCase()];
    if (!rec) {
      rec = await toggleReturnCheckOrder({
        orderId: row.orderId,
        orderSn: row.orderSn,
        displayedOrderSn: row.displayedOrderSn,
        bookingSn: row.bookingSn,
        trackingNumber: row.trackingNumber,
        platformName: row.platformName,
        processedAt: row.orderProcessedAt,
        createdAt: row.orderCreatedAt,
        notes,
        forceReceived: row.isReceived,
      });
    } else {
      rec = (await updateOrderNotes(row.orderSn, notes)) ?? rec;
    }

    row.notes = notes;
    notesDialogVisible.value = false;
    $q.notify({
      type: "positive",
      message: "Catatan kondisi berhasil disimpan.",
    });
  } catch (err: unknown) {
    $q.notify({
      type: "negative",
      message: `Gagal menyimpan catatan: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    savingNotes.value = false;
  }
}

/**
 * Open dialog to view all items
 */
function openItemsDialog(row: CancelledOrderRow) {
  activeViewingOrder.value = row;
  itemsDialogVisible.value = true;
}

/**
 * Navigates directly to the transactions page on the exact date when the order was processed
 */
function navigateToTransactionDate(row: CancelledOrderRow) {
  if (!row.orderProcessedAt) {
    $q.notify({
      type: "warning",
      message: "Pesanan ini belum pernah diproses di apotek sehingga tidak memiliki tanggal transaksi.",
    });
    return;
  }

  const dateOnly = row.orderProcessedAt.slice(0, 10); // YYYY-MM-DD
  const searchKey = row.displayedOrderSn || row.trackingNumber || row.bookingSn || "";

  void router.push({
    path: "/hitunganHarian",
    query: {
      date: dateOnly,
      tab: "transaksi",
      search: searchKey,
    },
  });
}

/**
 * Copies text to clipboard
 */
async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    $q.notify({
      type: "positive",
      message: `${label} disalin ke clipboard: ${text}`,
    });
  } catch {
    $q.notify({
      type: "warning",
      message: `Gagal menyalin ${label}.`,
    });
  }
}

/**
 * Helper date formatters
 */
function formatDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}, ${formatTime(iso)}`;
}

function formatDateTimeFromMs(ms?: number): string {
  if (!ms) return "-";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  return `${d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatStatusName(st: string): string {
  switch (st) {
    case "To_Process":
      return "Perlu Diproses";
    case "Processed":
      return "Diproses / Label Dicetak (Packing)";
    case "Shipping":
      return "Menunggu Kurir / Pickup";
    case "In_Delivery":
      return "Dalam Pengiriman Ekspedisi";
    case "Delivered":
      return "Terkirim ke Pembeli";
    case "Cancellations":
      return "Dibatalkan";
    case "Returns":
      return "Pengembalian Barang";
    default:
      return st;
  }
}

function getPlatformBadgeColor(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes("shopee")) return "orange-8";
  if (p.includes("tokopedia")) return "green-7";
  if (p.includes("tiktok")) return "black";
  if (p.includes("lazada")) return "blue-8";
  return "teal";
}

/**
 * Exports currently filtered rows to Excel
 */
function exportToExcel() {
  if (!filteredOrders.value.length) return;

  const rows = filteredOrders.value.map((o, idx) => ({
    No: idx + 1,
    "Status Fisik": o.isReceived ? "Sudah Sampai" : "Belum Sampai",
    "Diterima Oleh": o.checkedBy || "-",
    "Waktu Ceklis": o.checkedAt ? formatDateTime(o.checkedAt) : "-",
    Marketplace: o.platformName,
    "No Pesanan": o.displayedOrderSn,
    "No Resi": o.trackingNumber || "-",
    Kurir: o.courier || "-",
    "Status Penyerahan Kurir":
      o.handoverStatus === "DELIVERY_FAILED"
        ? "Pengiriman Gagal (Sudah di Kurir)"
        : o.handoverStatus === "READY_TO_SHIP"
          ? "Resi Dicetak / Siap Kirim (Cek Fisik)"
          : "Belum Pernah Diproses / Tanpa Resi",
    "Status Logistik Desty": o.logisticsStatus || "-",
    "Status Desty": o.destyStatus,
    "Alasan Batal": o.cancelReason || "-",
    "Dibatalkan Oleh": o.cancelBy || "-",
    "Resi Dicetak": o.labelPrinted ? "Ya" : "Tidak",
    "Tgl Dibuat": o.orderCreatedAt ? formatDateTime(o.orderCreatedAt) : "-",
    "Tgl Diproses / Packing": o.orderProcessedAt ? formatDateTime(o.orderProcessedAt) : "Belum Diproses",
    "Total Qty": o.totalQuantity,
    "Rincian Produk": o.items.map((i) => `${i.productName} (${i.quantity} pcs)`).join("; "),
    "Catatan Kondisi": o.notes || "-",
    "Invoice Assist": o.assistInvoice || "-",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pesanan Batal & Retur");
  XLSX.writeFile(wb, `desty-batal-retur-${new Date().toISOString().slice(0, 10)}.xlsx`);

  $q.notify({
    type: "positive",
    message: "Data pesanan batal berhasil diekspor ke Excel.",
  });
}

onMounted(() => {
  // Listen for real-time check updates from other devices
  unsubscribeSnapshot = subscribeReturnChecks((updatedMap) => {
    checkRecordsMap.value = updatedMap;
    // Update local rows
    orders.value.forEach((row) => {
      const rec = updatedMap[row.orderSn.toUpperCase()];
      if (rec) {
        row.isReceived = rec.received;
        row.checkedBy = rec.checkedByName || rec.checkedByEmail;
        row.checkedByEmail = rec.checkedByEmail;
        row.checkedAt = rec.checkedAt;
        if (rec.notes !== undefined) row.notes = rec.notes;
        if (rec.processedAt && !row.orderProcessedAt) {
          row.orderProcessedAt = rec.processedAt;
          row.hasBeenProcessed = true;
        }
      }
    });
  });

  // Pre-load saved check records immediately from local cache so table is immediately useful
  void getReturnCheckRecords().then((checks) => {
    checkRecordsMap.value = checks;
  });

  // Load initially if token is ready
  if (props.token) {
    void fetchCancelledOrders();
  }
});

// Watch token in case it resolved after component mount
watch(
  () => props.token,
  (newToken) => {
    if (newToken && orders.value.length === 0 && !loading.value) {
      void fetchCancelledOrders();
    }
  },
);

onUnmounted(() => {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
});
</script>

<style scoped>
.desty-cancelled-orders-tab .font-mono {
  font-family: monospace;
}

.table-scroll-container {
  width: 100%;
  overflow-x: auto;
}

.cancelled-orders-table {
  min-width: 1150px;
  max-height: 650px;
}

.cancelled-orders-table :deep(td) {
  white-space: normal !important;
  word-break: break-word !important;
  padding: 8px 10px !important;
  vertical-align: top;
}

.border-bottom-light {
  border-bottom: 1px dashed #e0e0e0;
}

.border-red {
  border: 1px solid #ef5350;
}

.border-amber {
  border: 1px solid #ffb74d;
}

.text-2xs {
  font-size: 11px;
}

.text-3xs {
  font-size: 10px;
}
</style>
