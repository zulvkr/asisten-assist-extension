<template>
  <div class="hitungan-harian-page">
    <!-- Header Section -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="calculate" class="q-mr-sm" />
        Hitungan Harian Per Shift
      </div>
    </div>

    <!-- Date Filters Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-sm items-center">
        <div class="col-12 col-sm-4 col-md-3">
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
        <div class="col-12 col-sm-4 col-md-3">
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
        <div class="col-12 col-sm-4 col-md-3 row q-gutter-x-sm">
          <q-btn
            color="teal"
            icon="play_arrow"
            label="Muat Data"
            :loading="loading"
            @click="loadSummaries"
            class="col"
            dense
            no-caps
          />
          <q-btn
            color="positive"
            icon="file_download"
            label="Export Excel"
            :disabled="!canExport"
            :loading="exporting"
            @click="exportToExcel"
            class="col"
            dense
            no-caps
          />
        </div>
        <q-space />
        <div class="col-12 col-md-2 text-right">
          <span class="text-caption text-grey-7" v-if="statusText">
            {{ statusText }}
          </span>
        </div>
      </q-card-section>
    </q-card>

    <!-- Main Summaries Table -->
    <q-card flat bordered>
      <q-card-section class="q-pa-none">
        <q-table
          :rows="summaries"
          :columns="columns"
          row-key="key"
          flat
          :loading="loading"
          :pagination="{ rowsPerPage: 15 }"
          no-data-label="Tidak ada data ditemukan untuk tanggal terpilih."
        >
          <!-- Custom Body with Expansions -->
          <template v-slot:body="props">
            <q-tr :props="props">
              <q-td v-for="col in props.cols" :key="col.name" :props="props">
                <template v-if="col.name === 'action'">
                  <q-btn
                    size="sm"
                    color="teal"
                    round
                    flat
                    :icon="props.expand ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
                    @click="props.expand = !props.expand"
                  />
                </template>
                <template v-else>
                  {{ col.value }}
                </template>
              </q-td>
            </q-tr>

            <!-- Row Expansion Detail Card Stack -->
            <q-tr v-show="props.expand" :props="props" class="expanded-detail-row">
              <q-td colspan="100%" class="bg-grey-1 q-pa-md">
                <div class="text-subtitle2 q-mb-md text-teal font-weight-bold">
                  Detail Transaksi (Shift {{ props.row.shift }})
                </div>
                <q-list bordered separator class="bg-white rounded-borders" v-if="props.row.details.length">
                  <q-item v-for="detail in props.row.details" :key="detail.transactionId" class="q-py-md">
                    <q-item-section>
                      <!-- Row 1: Code, Patient Name, Time -->
                      <div class="row items-center justify-between q-mb-xs">
                        <div class="text-subtitle2 text-weight-bold text-teal">
                          {{ detail.code || "-" }} • {{ formatTime(detail.createdAt) }}
                        </div>
                        <div class="text-subtitle2 text-weight-medium">
                          Pasien: <span class="text-grey-9 text-weight-bold">{{ detail.patientName }}</span>
                        </div>
                      </div>
                      <q-separator class="q-my-xs" />

                      <!-- Row 2: Payments summary -->
                      <div class="row q-col-gutter-sm text-caption text-grey-8 q-mb-xs">
                        <div class="col-12 col-sm-6">
                          <strong>Apotek:</strong>
                          <span v-if="detail.apotek.cash > 0" class="q-ml-xs">Cash ({{ formatRupiah(detail.apotek.cash) }})</span>
                          <span v-if="detail.apotek.debit > 0" class="q-ml-xs">Debit ({{ formatRupiah(detail.apotek.debit) }})</span>
                          <span v-if="detail.apotek.shopee > 0" class="q-ml-xs">Shopee ({{ formatRupiah(detail.apotek.shopee) }})</span>
                          <span v-if="detail.apotek.tiktok > 0" class="q-ml-xs">TikTok ({{ formatRupiah(detail.apotek.tiktok) }})</span>
                          <span v-if="detail.apotek.blibli > 0" class="q-ml-xs">Blibli ({{ formatRupiah(detail.apotek.blibli) }})</span>
                          <span v-if="detail.apotek.goApotik > 0" class="q-ml-xs">GoApotik ({{ formatRupiah(detail.apotek.goApotik) }})</span>
                          <span v-if="detail.apotek.total === 0" class="q-ml-xs text-grey-4">-</span>
                        </div>
                        <div class="col-12 col-sm-6">
                          <strong>Klinik:</strong>
                          <span v-if="detail.klinik.cash > 0" class="q-ml-xs">Cash ({{ formatRupiah(detail.klinik.cash) }})</span>
                          <span v-if="detail.klinik.debit > 0" class="q-ml-xs">Debit ({{ formatRupiah(detail.klinik.debit) }})</span>
                          <span v-if="detail.klinik.total === 0" class="q-ml-xs text-grey-4">-</span>
                        </div>
                      </div>

                      <!-- Row 3: Items list -->
                      <div class="q-mt-xs">
                        <div class="text-caption text-weight-medium text-grey-7">Item Transaksi:</div>
                        <div class="q-pl-sm">
                          <div
                            v-for="item in detail.items"
                            :key="item.id"
                            class="row justify-between text-caption text-black font-mono"
                            style="max-width: 600px;"
                          >
                            <span>• {{ item.name }} ({{ formatDetailType(item) }}) x{{ item.quantity }}</span>
                            <span>{{ formatRupiah(item.totalFee) }}</span>
                          </div>
                          <div v-if="!detail.items.length" class="text-grey-4 text-italic text-caption">
                            Tidak ada item.
                          </div>
                        </div>
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-else class="text-caption text-grey-5 text-italic q-pa-sm text-center">
                  Tidak ada transaksi tercatat pada shift ini.
                </div>
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </div>
</template>

<script lang="ts" setup>
import * as XLSX from "xlsx";
import { computed, onMounted, ref } from "vue";
import { enrichPemasukanData } from "@/utils/enrichPemasukanData";
import {
  calculateShiftSummaries,
  type ShiftDetailItem,
  type ShiftSummaryRow,
} from "@/utils/hitunganHarianCalculations";
import { formatRupiah } from "@/utils/rupiahUtils";
import type { PemasukanData } from "@/types/PemasukanData";
import { fetchPemasukanData } from "@/components/hitungan-harian/pemasukan";

type StatusVariant = "muted" | "error";

const startDate = ref(formatDateForInput(new Date()));
const endDate = ref(formatDateForInput(new Date()));
const loading = ref(false);
const exporting = ref(false);
const statusMessage = ref("");
const statusVariant = ref<StatusVariant>("muted");
const summaries = ref<ShiftSummaryRow[]>([]);
const rawData = ref<PemasukanData[]>([]);

const columns = [
  { name: "displayDate", label: "Tanggal", align: "left", field: "displayDate", sortable: true },
  { name: "shift", label: "Shift", align: "left", field: "shift", sortable: true },
  { name: "apotekCash", label: "Apotek Cash", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.cash), sortable: true },
  { name: "apotekDebit", label: "Apotek Debit", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.debit), sortable: true },
  { name: "apotekShopee", label: "Shopee", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.shopee), sortable: true },
  { name: "apotekTiktok", label: "TikTok", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.tiktok), sortable: true },
  { name: "apotekBlibli", label: "Blibli", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.blibli), sortable: true },
  { name: "apotekGoApotik", label: "GoApotik", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.goApotik), sortable: true },
  { name: "apotekTotal", label: "Total Apotek", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.total), sortable: true },
  { name: "klinikCash", label: "Klinik Cash", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.klinik.cash), sortable: true },
  { name: "klinikDebit", label: "Klinik Debit", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.klinik.debit), sortable: true },
  { name: "klinikTotal", label: "Total Klinik", align: "right", field: (row: ShiftSummaryRow) => formatRupiah(row.klinik.total), sortable: true },
  { name: "action", label: "Detail", align: "center", sortable: false }
];

async function loadSummaries() {
  if (loading.value) return;
  loading.value = true;
  statusVariant.value = "muted";
  statusMessage.value = "Memuat data...";
  summaries.value = [];
  rawData.value = [];
  try {
    const pemasukanRaw = await fetchPemasukanData({
      tanggalMin: startDate.value,
      tanggalMax: endDate.value,
    });
    const enriched = enrichPemasukanData(pemasukanRaw);
    rawData.value = enriched;
    const result = calculateShiftSummaries(enriched);
    summaries.value = result;
    statusMessage.value = result.length
      ? ""
      : "Tidak ada data untuk rentang tanggal ini.";
  } catch (error) {
    console.error("Gagal memuat hitungan harian", error);
    statusVariant.value = "error";
    statusMessage.value = "Terjadi kesalahan saat memuat data.";
    summaries.value = [];
    rawData.value = [];
  } finally {
    loading.value = false;
  }
}

const statusText = computed(() => {
  if (loading.value) {
    return "Memuat data...";
  }
  return statusMessage.value;
});

const canExport = computed(() => {
  if (loading.value || exporting.value) {
    return false;
  }
  return summaries.value.length > 0 && rawData.value.length > 0;
});

function formatDetailType(item: ShiftDetailItem): string {
  const typeParts = [item.type, item.incomeType]
    .filter(Boolean)
    .map((value) => formatLabel(String(value)));
  return typeParts.length ? typeParts.join(" • ") : "-";
}

function formatLabel(value: string | undefined | null): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function exportToExcel() {
  if (!summaries.value.length || !rawData.value.length || exporting.value) {
    return;
  }

  exporting.value = true;
  try {
    const wb = XLSX.utils.book_new();

    const summaryHeaders = [
      "Tanggal",
      "Shift",
      "Cash Apotek",
      "Debit Apotek",
      "Shopee",
      "TikTok",
      "Blibli",
      "GoApotik",
      "Total Apotek",
      "Cash Klinik",
      "Debit Klinik",
      "Total Klinik",
    ];
    const summaryRows = summaries.value.map((summary) => [
      summary.displayDate,
      summary.shift,
      summary.apotek.cash,
      summary.apotek.debit,
      summary.apotek.shopee,
      summary.apotek.tiktok,
      summary.apotek.blibli,
      summary.apotek.goApotik,
      summary.apotek.total,
      summary.klinik.cash,
      summary.klinik.debit,
      summary.klinik.total,
    ]);
    const summaryWS = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    (summaryWS as any)["!cols"] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, summaryWS, "Summary");

    const rawHeaders = [
      "transaction_id",
      "transaction_status",
      "transaction_totalFee",
      "transaction_creditFee",
      "transaction_isOnlyPOS",
      "transaction_createdAt",
      "transaction_code",
      "transaction_debtFee",
      "transaction_isOutcome",
      "transaction_paidFee",
      "transaction_sumFee",
      "transaction_roundedValue",
      "transaction_practiceId",
      "transaction_appointId",
      "transaction_patientId",
      "appointment_date",
      "appointment_jenisPerawatan",
      "appointment_poli",
      "practices_Dokters_nama",
      "practices_Dokters_gelar",
      "patient_nama",
      "patient_tanggalLahir",
      "patient_address_jalan",
      "patient_address_region",
      "patient_address_city",
      "patient_address_district",
      "patient_address_postcode",
      "patient_address_subdistrict",
      "patient_address_post",
      "payment_id",
      "payment_totalFee",
      "payment_percentageTotal",
      "payment_status",
      "payment_type",
      "payment_name",
      "payment_transactionId",
      "payment_transactionDate",
      "payment_accountTxId",
      "payment_hospitalId",
      "payment_reason",
      "payment_isCovered",
      "payment_isNeedClaim",
      "payment_isOutcome",
      "payment_intent",
      "payment_createdAt",
      "payment_createdId",
      "payment_paidName",
      "payment_change",
      "payment_createdName",
      "payment_trueCreatedAt",
      "payment_discount",
      "diagnoses",
      "otherNotes",
      "patients_json",
      "practices_json",
      "item_id",
      "item_name",
      "item_type",
      "item_medicineId",
      "item_akhpId",
      "item_procedureId",
      "item_hospitalId",
      "item_transactionId",
      "item_quantity",
      "item_unit",
      "item_dosage",
      "item_stockBefore",
      "item_stockAfter",
      "item_isPendingStock",
      "item_depotId",
      "item_isSlotTransacted",
      "item_baseFee",
      "item_discount",
      "item_totalFee",
      "item_isPriceLock",
      "item_paidFee",
      "item_payableFee",
      "item_transactionType",
      "item_depotStockBefore",
      "item_depotStockAfter",
      "item_categoryId",
      "item_isPaidOff",
      "item_createdAt",
      "item_updatedAt",
      "item_createdId",
      "item_medicalHelperIds",
      "item_isFromCashier",
      "item_isIdDisc",
      "item_sellingPrice",
      "item_idTemp",
      "item_category",
      "item_jenis",
      "item_isEditFromCashier",
      "item_createdName",
      "item_kmrProcedureId",
      "item_embalaseFee",
      "item_tuslahFee",
      "item_discountType",
      "item_itemsUsed",
      "item_isPercent",
      "item_percentVal",
      "item_isInpatient",
      "item_updatedId",
      "item_updatedName",
      "item_isAdminFee",
      "item_incomeType",
    ];

    const rawRows: any[] = [];
    for (const tx of rawData.value) {
      const firstPayment = (
        tx.Payments && tx.Payments.length ? tx.Payments[0] : null
      ) as any | null;
      const appointment = (tx.Appointment || {}) as any;
      const practices = (tx.Practices || {}) as any;
      const patients = (tx.Patients || {}) as any;
      const diagnosesJson = stringify(tx.Diagnoses);
      const otherNotesJson = stringify(tx.OtherNotes);
      const practicesJson = stringify(practices);
      const patientsJson = stringify(patients);

      const items =
        Array.isArray(tx.Items) && tx.Items.length ? tx.Items : [undefined];
      for (const item of items) {
        const itm = item ?? ({} as any);
        rawRows.push([
          tx._id,
          tx.status,
          tx.totalFee,
          tx.creditFee,
          tx.isOnlyPOS,
          tx.createdAt,
          tx.code,
          tx.debtFee,
          tx.isOutcome,
          tx.paidFee,
          tx.sumFee,
          tx.roundedValue,
          tx.practiceId ?? "",
          tx.appointId ?? "",
          tx.patientId ?? "",
          appointment.date ?? "",
          appointment.jenisPerawatan ?? "",
          appointment.poli ?? "",
          practices.Dokters?.nama ?? "",
          practices.Dokters?.gelar ?? "",
          patients.nama ?? "",
          patients.tanggalLahir ?? "",
          patients.address?.jalan ?? "",
          patients.address?.region ?? "",
          patients.address?.city ?? "",
          patients.address?.district ?? "",
          patients.address?.postcode ?? "",
          patients.address?.subdistrict ?? "",
          patients.address?.post ?? "",
          firstPayment?.id ?? "",
          firstPayment?.totalFee ?? "",
          firstPayment?.percentageTotal ?? "",
          firstPayment?.status ?? "",
          firstPayment?.type ?? "",
          firstPayment?.name ?? "",
          firstPayment?.transactionId ?? "",
          firstPayment?.transactionDate ?? "",
          firstPayment?.accountTxId ?? "",
          firstPayment?.hospitalId ?? "",
          firstPayment?.reason ?? "",
          firstPayment?.isCovered ?? "",
          firstPayment?.isNeedClaim ?? "",
          firstPayment?.isOutcome ?? "",
          firstPayment?.intent ?? "",
          firstPayment?.createdAt ?? "",
          firstPayment?.createdId ?? "",
          firstPayment?.paidName ?? "",
          firstPayment?.change ?? "",
          firstPayment?.createdName ?? "",
          firstPayment?.trueCreatedAt ?? "",
          firstPayment?.discount ?? "",
          diagnosesJson,
          otherNotesJson,
          patientsJson,
          practicesJson,
          itm.id ?? "",
          itm.name ?? "",
          itm.type ?? "",
          itm.medicineId ?? "",
          itm.akhpId ?? "",
          itm.procedureId ?? "",
          itm.hospitalId ?? "",
          itm.transactionId ?? "",
          itm.quantity ?? "",
          itm.unit ?? "",
          itm.dosage ?? "",
          itm.stockBefore ?? "",
          itm.stockAfter ?? "",
          itm.isPendingStock ?? "",
          itm.depotId ?? "",
          itm.isSlotTransacted ?? "",
          itm.baseFee ?? "",
          itm.discount ?? "",
          itm.totalFee ?? "",
          itm.isPriceLock ?? "",
          itm.paidFee ?? "",
          itm.payableFee ?? "",
          itm.transactionType ?? "",
          itm.depotStockBefore ?? "",
          itm.depotStockAfter ?? "",
          itm.categoryId ?? "",
          itm.isPaidOff ?? "",
          itm.createdAt ?? "",
          itm.updatedAt ?? "",
          itm.createdId ?? "",
          itm.medicalHelperIds ? stringify(itm.medicalHelperIds) : "",
          itm.isFromCashier ?? "",
          itm.isIdDisc ?? "",
          itm.sellingPrice ?? "",
          itm.idTemp ?? "",
          itm.category ?? "",
          itm.jenis ?? "",
          itm.isEditFromCashier ?? "",
          itm.createdName ?? "",
          itm.kmrProcedureId ?? "",
          itm.embalaseFee ?? "",
          itm.tuslahFee ?? "",
          itm.discountType ?? "",
          itm.itemsUsed ? stringify(itm.itemsUsed) : "",
          itm.isPercent ?? "",
          itm.percentVal ?? "",
          itm.isInpatient ?? "",
          itm.updatedId ?? "",
          itm.updatedName ?? "",
          itm.isAdminFee ?? "",
          itm.incomeType ?? "",
        ]);
      }
    }

    const rawWS = XLSX.utils.aoa_to_sheet([rawHeaders, ...rawRows]);
    XLSX.utils.book_append_sheet(wb, rawWS, "RawData");

    XLSX.writeFile(
      wb,
      `hitungan-harian-shift-${startDate.value}-to-${endDate.value}.xlsx`,
    );
  } catch (error) {
    console.error("Gagal mengekspor data", error);
  } finally {
    exporting.value = false;
  }
}

onMounted(() => {
  void loadSummaries();
});
</script>

<style>
.hitungan-harian-page .font-mono {
  font-family: monospace;
}
.hitungan-harian-page .border-bottom {
  border-bottom: 1px solid #e0e0e0;
}
.hitungan-harian-page .border-top {
  border-top: 1px solid #e0e0e0;
}

/* Sticky action column on the right */
.hitungan-harian-page .q-table th:last-child,
.hitungan-harian-page .q-table td:last-child {
  position: sticky;
  right: 0;
  background-color: #fff !important;
  z-index: 2;
  border-left: 1px solid rgba(0, 0, 0, 0.12) !important;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.05);
}

.hitungan-harian-page .q-table th:last-child {
  z-index: 3;
}

/* Maintain hover effect on the sticky cell */
.hitungan-harian-page .q-table tbody tr:not(.expanded-detail-row):hover td:last-child {
  background-color: #f5f5f5 !important;
}

/* Expanded Detail Row Styles */
.hitungan-harian-page .expanded-detail-row,
.hitungan-harian-page .expanded-detail-row td {
  background-color: #fafafa !important;
}

.hitungan-harian-page .q-table tbody tr.expanded-detail-row:hover,
.hitungan-harian-page .q-table tbody tr.expanded-detail-row:hover td {
  background-color: #fafafa !important;
}

/* Override to disable hover color from td:before and td:after in Quasar */
.hitungan-harian-page .q-table tbody td:before,
.hitungan-harian-page .q-table tbody td:after,
.hitungan-harian-page .q-table tbody tr:hover td:before,
.hitungan-harian-page .q-table tbody tr:hover td:after {
  display: none !important;
  content: none !important;
  background: transparent !important;
  background-color: transparent !important;
  opacity: 0 !important;
}

/* Disable all hover backgrounds on rows and cells */
.hitungan-harian-page .q-table tbody tr:hover,
.hitungan-harian-page .q-table tbody tr:hover td {
  background-color: transparent !important;
  background: transparent !important;
}

/* Ensure sticky cell has no hover color since hover is disabled */
.hitungan-harian-page .q-table tbody tr:not(.expanded-detail-row):hover td:last-child {
  background-color: #fff !important;
}

/* Ensure expanded detail row stays grey-1 (#fafafa) even on hover */
.hitungan-harian-page .q-table tbody tr.expanded-detail-row,
.hitungan-harian-page .q-table tbody tr.expanded-detail-row td,
.hitungan-harian-page .q-table tbody tr.expanded-detail-row:hover,
.hitungan-harian-page .q-table tbody tr.expanded-detail-row:hover td {
  background-color: #fafafa !important;
  background: #fafafa !important;
}
</style>
