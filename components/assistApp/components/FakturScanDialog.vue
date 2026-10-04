<template>
  <q-dialog v-model="isOpen" persistent maximized transition-show="slide-up" transition-hide="slide-down">
    <q-card class="column no-wrap bg-grey-2" style="height: 100vh;">
      <!-- Top App Bar -->
      <q-bar class="bg-teal text-white q-py-md">
        <q-icon name="document_scanner" size="24px" class="q-mr-sm" />
        <div class="text-subtitle1 text-weight-bold">
          Scan Faktur AI (Penerimaan Barang)
        </div>
        <q-space />
        <div v-if="tokenUsage" class="text-caption text-teal-1 q-mr-md font-mono hide-on-mobile">
          {{ tokenUsage.model }} • {{ (tokenUsage.elapsedMilliseconds / 1000).toFixed(1) }}s • {{ tokenUsage.totalTokens.toLocaleString() }} tokens (~Rp {{ tokenUsage.estimatedCostIdr.toLocaleString('id-ID') }})
        </div>
        <q-btn dense flat round icon="close" v-close-popup @click="resetDialog" />
      </q-bar>

      <!-- Main Body Container -->
      <q-card-section class="col q-pa-md scroll">
        <!-- 1. Upload & Camera Dropzone View (Initial State) -->
        <div v-if="!extractionResult && !isExtracting" class="column items-center justify-center full-height q-pa-lg">
          <q-card flat bordered class="q-pa-xl text-center rounded-borders shadow-subtle bg-white" style="max-width: 760px; width: 100%;">
            <div
              class="drop-zone q-pa-xl rounded-borders cursor-pointer column items-center justify-center"
              :class="{ 'drop-zone-active': isDragOver }"
              @dragover.prevent="isDragOver = true"
              @dragleave.prevent="isDragOver = false"
              @drop.prevent="handleDrop"
              @click="triggerFileInput"
            >
              <q-icon name="cloud_upload" size="72px" color="teal" class="q-mb-md" />
              <div class="text-h6 text-weight-bold text-blue-grey-9 q-mb-xs">
                Tarik & Lepas Foto Faktur di Sini
              </div>
              <div class="text-body2 text-grey-7 q-mb-lg">
                atau klik untuk memilih file dari komputer / galeri HP
              </div>

              <div class="row q-gutter-sm justify-center">
                <q-btn
                  color="teal"
                  icon="attach_file"
                  label="Pilih File Faktur"
                  no-caps
                  class="q-px-md text-weight-bold"
                  @click.stop="triggerFileInput"
                />
                <q-btn
                  outline
                  color="teal"
                  icon="photo_camera"
                  label="Ambil Foto Kamera"
                  no-caps
                  class="q-px-md"
                  @click.stop="triggerCameraInput"
                />
              </div>

              <div class="text-caption text-grey-6 q-mt-md">
                Format didukung: <strong>JPG, PNG, WEBP, PDF</strong> (Maks. 25 MB)
              </div>
            </div>

            <!-- Hidden File & Camera Inputs -->
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              class="hidden"
              @change="handleFileSelect"
            />
            <input
              ref="cameraInputRef"
              type="file"
              accept="image/*"
              capture="environment"
              class="hidden"
              @change="handleFileSelect"
            />

            <!-- Guidance Checklist -->
            <div class="q-mt-lg text-left bg-blue-grey-1 q-pa-md rounded-borders text-caption text-blue-grey-8">
              <div class="text-weight-bold q-mb-xs row items-center">
                <q-icon name="lightbulb" color="amber-9" size="18px" class="q-mr-xs" />
                Tips Scan Faktur PBF Farmasi:
              </div>
              <ul class="q-ma-none q-pl-md q-gutter-y-xs">
                <li>Pastikan foto faktur cukup terang, teks dot-matrix tidak buram, dan nomor faktur terlihat jelas.</li>
                <li>AI akan otomatis mengekstrak nomor faktur, tanggal, nama PBF, obat, nomor batch, ED, diskon, dan PPN.</li>
                <li>AI otomatis memeriksa kecocokan dosis (misal 500mg vs 1000mg) dan satuan kemasan (Box/Strip/Pcs).</li>
              </ul>
            </div>
          </q-card>
        </div>

        <!-- 2. Stepper Loading Animation (While AI is processing) -->
        <div v-else-if="isExtracting" class="column items-center justify-center full-height q-pa-xl">
          <q-card flat bordered class="q-pa-xl text-center rounded-borders shadow-subtle bg-white" style="max-width: 520px; width: 100%;">
            <q-spinner-dots size="64px" color="teal" class="q-mb-lg" />
            <div class="text-h6 text-teal-9 text-weight-bold q-mb-sm">
              AI Sedang Memproses Faktur...
            </div>
            <div class="text-body2 text-blue-grey-7 q-mb-lg font-medium">
              {{ processingSteps[processingStep] || "Menganalisis dokumen..." }}
            </div>

            <q-linear-progress
              :value="(processingStep + 1) / processingSteps.length"
              color="teal"
              track-color="teal-1"
              rounded
              size="8px"
              class="q-mb-md"
            />

            <div class="text-caption text-grey-5">
              Mohon tunggu, proses ini biasanya membutuhkan 2–5 detik.
            </div>
          </q-card>
        </div>

        <!-- 3. Verification & Review Table View (Extraction Complete) -->
        <div v-else-if="extractionResult" class="column q-gutter-y-md">
          <!-- Summary Cards Row -->
          <div class="row q-col-gutter-md">
            <!-- Header Invoice Info Card -->
            <div class="col-12 col-md-8">
              <q-card flat bordered class="rounded-borders bg-white full-height">
                <q-card-section class="q-py-sm bg-grey-1 border-bottom row items-center justify-between">
                  <div class="text-subtitle2 text-blue-grey-9 text-weight-bold row items-center">
                    <q-icon name="receipt" color="teal" size="18px" class="q-mr-xs" />
                    Informasi Faktur Terdeteksi
                  </div>
                  <q-badge
                    v-if="extractionResult.matchedSupplierName"
                    color="positive"
                    class="q-px-sm"
                  >
                    Distributor Cocok ({{ Math.round(extractionResult.supplierMatchConfidence * 100) }}%)
                  </q-badge>
                </q-card-section>

                <q-card-section class="row q-col-gutter-sm">
                  <!-- Supplier / Distributor -->
                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="extractionResult.matchedSupplierId"
                      outlined
                      dense
                      emit-value
                      map-options
                      use-input
                      input-debounce="300"
                      :options="distributorOptions"
                      option-value="id"
                      option-label="supplierName"
                      label="Distributor / PBF *"
                      color="teal"
                      @filter="filterDistributor"
                      @update:model-value="onDistributorSelected"
                    >
                      <template v-slot:no-option>
                        <q-item>
                          <q-item-section class="text-grey text-caption">
                            Distributor tidak ditemukan di master
                          </q-item-section>
                        </q-item>
                      </template>
                    </q-select>
                    <div class="text-xxs text-grey-6 q-mt-xxs q-pl-xs">
                      Teks Faktur: <strong>{{ extractionResult.extractedSupplierName || "-" }}</strong>
                    </div>
                  </div>

                  <!-- Nomor Faktur -->
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="extractionResult.invoiceNumber"
                      outlined
                      dense
                      label="No. Faktur *"
                      color="teal"
                    />
                  </div>

                  <!-- Tanggal Faktur -->
                  <div class="col-12 col-sm-4">
                    <q-input
                      v-model="extractionResult.invoiceDate"
                      outlined
                      dense
                      type="date"
                      label="Tanggal Faktur *"
                      color="teal"
                      stack-label
                    />
                  </div>

                  <!-- Tanggal Jatuh Tempo -->
                  <div class="col-12 col-sm-4">
                    <q-input
                      v-model="extractionResult.dueDate"
                      outlined
                      dense
                      type="date"
                      label="Jatuh Tempo"
                      color="teal"
                      stack-label
                    />
                  </div>

                  <!-- Tipe PPN Toggle -->
                  <div class="col-12 col-sm-4">
                    <q-select
                      v-model="extractionResult.ppnType"
                      outlined
                      dense
                      emit-value
                      map-options
                      :options="ppnTypeOptions"
                      label="Tipe PPN"
                      color="teal"
                      @update:model-value="recalculateAll"
                    />
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- KPI Summary Cards -->
            <div class="col-12 col-md-4">
              <q-card flat bordered class="rounded-borders bg-white full-height column justify-between">
                <q-card-section class="q-py-sm bg-grey-1 border-bottom">
                  <div class="text-subtitle2 text-blue-grey-9 text-weight-bold">
                    Statistik & Margin Guard
                  </div>
                </q-card-section>

                <q-card-section class="row q-col-gutter-sm">
                  <div class="col-6">
                    <div class="kpi-box bg-teal-1 text-teal-9 text-center q-pa-sm rounded-borders">
                      <div class="text-caption text-weight-medium">Item Terdeteksi</div>
                      <div class="text-h6 text-weight-bolder">
                        {{ extractionResult.items.length }}
                      </div>
                      <div class="text-xxs text-grey-7">
                        {{ extractionResult.matchedProductsCount }} tercocokkan
                      </div>
                    </div>
                  </div>

                  <div class="col-6">
                    <div
                      class="kpi-box text-center q-pa-sm rounded-borders"
                      :class="extractionResult.priceIncreaseCount > 0 ? 'bg-red-1 text-negative' : 'bg-positive-1 text-positive'"
                    >
                      <div class="text-caption text-weight-medium">Kenaikan HPP</div>
                      <div class="text-h6 text-weight-bolder">
                        {{ extractionResult.priceIncreaseCount }} Item
                      </div>
                      <div class="text-xxs">
                        {{ extractionResult.priceIncreaseCount > 0 ? 'Perlu tinjau harga jual' : 'Harga stabil' }}
                      </div>
                    </div>
                  </div>

                  <div class="col-12 q-mt-xs">
                    <div class="bg-blue-grey-1 q-pa-sm rounded-borders text-right">
                      <div class="text-caption text-grey-7">Total Faktur (Setelah PPN):</div>
                      <div class="text-h6 text-weight-bolder text-teal-9">
                        Rp {{ Number(extractionResult.grandTotal || 0).toLocaleString("id-ID") }}
                      </div>
                    </div>
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <!-- Items Table Card -->
          <q-card flat bordered class="rounded-borders bg-white shadow-subtle overflow-hidden">
            <q-card-section class="q-py-sm bg-grey-1 border-bottom row items-center justify-between">
              <div class="row items-center q-gutter-x-sm">
                <div class="text-subtitle2 text-blue-grey-9 text-weight-bold">
                  Daftar Barang Hasil Pemindaian ({{ extractionResult.items.length }} Baris)
                </div>
                <q-badge color="teal" class="q-px-xs">
                  Review & Sesuaikan Sebelum Diterapkan
                </q-badge>
              </div>

              <div class="row q-gutter-x-sm">
                <q-btn
                  flat
                  dense
                  color="teal"
                  icon="add"
                  label="Tambah Baris Manual"
                  no-caps
                  size="sm"
                  @click="addNewItemRow"
                />
              </div>
            </q-card-section>

            <div class="table-responsive">
              <q-markup-table flat dense separator="cell" class="invoice-review-table">
                <thead>
                  <tr class="bg-grey-1 text-blue-grey-8">
                    <th style="width: 40px;">No.</th>
                    <th style="min-width: 280px;" class="text-left">NAMA FAKTUR & CATALOG ASSIST</th>
                    <th style="width: 110px;" class="text-left">BATCH</th>
                    <th style="width: 130px;" class="text-left">ED (EXP)</th>
                    <th style="width: 90px;" class="text-center">QTY FAKTUR</th>
                    <th style="width: 90px;" class="text-center">KONVERSI</th>
                    <th style="width: 90px;" class="text-center">QTY MASUK</th>
                    <th style="width: 120px;" class="text-right">HRG BELI</th>
                    <th style="width: 80px;" class="text-right">DISKON %</th>
                    <th style="width: 120px;" class="text-right">HRG NETTO</th>
                    <th style="width: 120px;" class="text-right">HPP LAMA</th>
                    <th style="width: 140px;" class="text-right">SARAN HRG JUAL</th>
                    <th style="width: 130px;" class="text-right">SUBTOTAL</th>
                    <th style="width: 50px;" class="text-center">AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, idx) in extractionResult.items"
                    :key="idx"
                    class="align-top-row"
                    :class="{ 'bg-red-0': item.isPriceIncreased, 'bg-amber-0': !item.matchedProductId }"
                  >
                    <!-- No -->
                    <td class="text-center q-pt-sm">{{ idx + 1 }}</td>

                    <!-- Product Match -->
                    <td>
                      <!-- Raw Text from Invoice -->
                      <div class="text-caption text-weight-bold text-blue-grey-9 q-mb-xs">
                        {{ item.rawProductName }}
                      </div>

                      <!-- Matched Assist Product Selector -->
                      <div class="row no-wrap items-center">
                        <q-select
                          v-model="item.matchedProductId"
                          dense
                          outlined
                          emit-value
                          map-options
                          use-input
                          input-debounce="300"
                          :options="productCandidates"
                          option-value="id"
                          option-label="name"
                          label="Pilih Produk Assist..."
                          color="teal"
                          class="col font-weight-medium"
                          @filter="filterProducts"
                          @update:model-value="(val) => onProductSelected(val, item)"
                        >
                          <template v-slot:selected-item="scope">
                            <div class="ellipsis text-caption font-mono">
                              {{ item.matchedProductName || scope.opt.name }} [{{ item.matchedCode || scope.opt.code || '-' }}]
                            </div>
                          </template>
                          <template v-slot:no-option>
                            <q-item dense>
                              <q-item-section class="text-grey text-caption">
                                Tidak ada produk ditemukan
                              </q-item-section>
                            </q-item>
                          </template>
                        </q-select>

                        <q-btn
                          v-if="item.matchedProductId"
                          flat
                          round
                          dense
                          size="xs"
                          color="grey-6"
                          icon="close"
                          class="q-ml-xs"
                          @click="clearProductMatch(item)"
                        >
                          <q-tooltip>Lepas pencocokan</q-tooltip>
                        </q-btn>
                      </div>

                      <!-- Match Confidence & Category Chip -->
                      <div class="row items-center q-gutter-x-xs q-mt-xxs">
                        <q-badge
                          v-if="item.matchedProductId"
                          :color="item.productMatchConfidence >= 0.8 ? 'positive' : 'amber-9'"
                          class="text-xxs q-px-xs"
                        >
                          {{ Math.round(item.productMatchConfidence * 100) }}% Cocok
                        </q-badge>
                        <q-badge v-else color="negative" class="text-xxs q-px-xs">
                          Belum Terhubung
                        </q-badge>
                        <span v-if="item.extractedUnitName" class="text-xxs text-grey-6">
                          Satuan Faktur: {{ item.extractedUnitName }}
                        </span>
                      </div>
                    </td>

                    <!-- Batch Number -->
                    <td>
                      <q-input
                        v-model="item.batchNumber"
                        dense
                        outlined
                        placeholder="Batch"
                        class="font-mono text-caption"
                      />
                    </td>

                    <!-- Expiry Date -->
                    <td>
                      <q-input
                        v-model="item.expiryDate"
                        type="date"
                        dense
                        outlined
                        class="text-caption"
                      />
                      <div v-if="item.isNearExpiry" class="text-negative text-xxs q-mt-xxs row items-center">
                        <q-icon name="warning" size="12px" class="q-mr-xxs" /> ED &lt; 6 Bulan!
                      </div>
                    </td>

                    <!-- Qty Faktur -->
                    <td class="text-center">
                      <q-input
                        v-model.number="item.rawQuantity"
                        type="number"
                        dense
                        outlined
                        class="text-center text-caption"
                        style="width: 70px; margin: 0 auto;"
                        @update:model-value="recalcRow(item)"
                      />
                      <div class="text-xxs text-grey-6 q-mt-xxs">
                        {{ item.extractedUnitName || 'Pack' }}
                      </div>
                    </td>

                    <!-- Conversion Factor -->
                    <td class="text-center">
                      <q-input
                        v-model.number="item.conversionFactor"
                        type="number"
                        dense
                        outlined
                        class="text-center text-caption"
                        style="width: 65px; margin: 0 auto;"
                        @update:model-value="recalcRow(item)"
                      />
                      <div v-if="item.packInfo" class="text-xxs text-teal text-weight-medium q-mt-xxs">
                        {{ item.packInfo }}
                      </div>
                    </td>

                    <!-- Converted Qty Masuk -->
                    <td class="text-center q-pt-sm">
                      <div class="text-caption text-weight-bolder text-teal-9">
                        {{ item.quantity }}
                      </div>
                      <div class="text-xxs text-grey-6">
                        {{ item.matchedUnitName || 'PCS' }}
                      </div>
                    </td>

                    <!-- Buy Price (Stated per Pack) -->
                    <td>
                      <q-input
                        v-model.number="item.rawUnitPrice"
                        type="number"
                        dense
                        outlined
                        class="text-right text-caption"
                        @update:model-value="recalcRow(item)"
                      />
                      <div v-if="item.conversionFactor > 1" class="text-xxs text-grey-5 text-right q-mt-xxs">
                        Rp {{ item.unitPrice.toLocaleString('id-ID') }}/{{ item.matchedUnitName || 'pcs' }}
                      </div>
                    </td>

                    <!-- Discount % -->
                    <td>
                      <q-input
                        v-model.number="item.discountPercent1"
                        type="number"
                        dense
                        outlined
                        suffix="%"
                        class="text-right text-caption"
                        @update:model-value="recalcRow(item)"
                      />
                    </td>

                    <!-- Net Price per Unit -->
                    <td class="text-right q-pt-sm">
                      <div class="text-caption text-weight-bold text-blue-grey-9">
                        Rp {{ Math.round(item.netPricePerUnit).toLocaleString('id-ID') }}
                      </div>
                      <div class="text-xxs text-grey-5">
                        per {{ item.matchedUnitName || 'pcs' }}
                      </div>
                    </td>

                    <!-- Old HPP & Price Hike Indicator -->
                    <td class="text-right q-pt-sm">
                      <div v-if="item.previousBuyPrice" class="text-caption">
                        Rp {{ Math.round(item.previousBuyPrice).toLocaleString('id-ID') }}
                      </div>
                      <div v-else class="text-caption text-grey-4">-</div>

                      <div v-if="item.isPriceIncreased" class="text-xxs text-negative text-weight-bolder row items-center justify-end q-mt-xxs">
                        <q-icon name="trending_up" size="12px" class="q-mr-xxs" /> +{{ item.hppChangePercent }}% Naik
                      </div>
                      <div v-else-if="item.previousBuyPrice && item.hppChangePercent" class="text-xxs text-positive row items-center justify-end q-mt-xxs">
                        {{ item.hppChangePercent }}%
                      </div>
                    </td>

                    <!-- Suggested Sell Price & New Sell Price Input -->
                    <td>
                      <q-input
                        v-model.number="item.newSellPrice"
                        type="number"
                        dense
                        outlined
                        class="text-right text-caption text-weight-bold"
                        @update:model-value="() => { item._sellPriceManuallyEdited = true; }"
                      />
                      <div v-if="item.suggestedSellPrice" class="text-xxs text-grey-6 text-right q-mt-xxs">
                        Saran ({{ item.targetMarginPercent || 15 }}%): Rp {{ item.suggestedSellPrice.toLocaleString('id-ID') }}
                      </div>
                    </td>

                    <!-- Subtotal -->
                    <td class="text-right q-pt-sm">
                      <div class="text-caption text-weight-bolder text-teal-9">
                        Rp {{ Math.round(item.subtotal).toLocaleString('id-ID') }}
                      </div>
                    </td>

                    <!-- Actions -->
                    <td class="text-center q-pt-xs">
                      <q-btn
                        flat
                        round
                        dense
                        size="sm"
                        color="negative"
                        icon="delete"
                        @click="removeItemRow(idx)"
                      >
                        <q-tooltip>Hapus baris ini</q-tooltip>
                      </q-btn>
                    </td>
                  </tr>
                </tbody>
              </q-markup-table>
            </div>
          </q-card>
        </div>
      </q-card-section>

      <!-- Bottom Action Bar -->
      <q-card-actions class="bg-white border-top q-px-lg q-py-sm row items-center justify-between">
        <div class="row q-gutter-x-sm">
          <q-btn
            v-if="extractionResult"
            flat
            color="blue-grey-7"
            icon="restart_alt"
            label="Scan Faktur Lain"
            no-caps
            @click="resetDialog"
          />
        </div>

        <div class="row q-gutter-x-sm">
          <q-btn
            flat
            color="grey-8"
            label="Tutup"
            no-caps
            v-close-popup
            @click="resetDialog"
          />
          <q-btn
            v-if="extractionResult"
            color="teal"
            icon="check_circle"
            label="Terapkan ke Faktur Penerimaan"
            no-caps
            class="q-px-lg text-weight-bold"
            @click="applyToReceivingForm"
          />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import type {
  AiTokenUsage,
  ExtractedInvoiceItem,
  ExtractInvoiceResult,
} from "@/types/fakturScan";
import { extractInvoiceWithGemini } from "@/services/gemini/geminiInvoiceOcrService";
import {
  type CatalogCandidate,
  type DistributorCandidate,
  matchAndAnalyzeInvoice,
} from "@/services/gemini/invoiceMatchingService";
import { fetchMarginMappings } from "@/services/marginStorage";

const props = defineProps<{
  modelValue: boolean;
  distributors: DistributorCandidate[];
  products: CatalogCandidate[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "apply", data: ExtractInvoiceResult): void;
}>();

const $q = useQuasar();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const isDragOver = ref(false);
const isExtracting = ref(false);
const processingStep = ref(0);
const processingSteps = [
  "AI sedang membaca dan memindai dokumen faktur...",
  "Mengekstrak nomor faktur, tanggal, dan PPN...",
  "Membaca daftar obat, nomor batch, dan tanggal kedaluwarsa...",
  "Mencocokkan item dengan katalog Assist...",
  "Menganalisis pergerakan HPP dan margin target..."
];

const fileInputRef = ref<HTMLInputElement | null>(null);
const cameraInputRef = ref<HTMLInputElement | null>(null);

const extractionResult = ref<ExtractInvoiceResult | null>(null);
const tokenUsage = ref<AiTokenUsage | null>(null);

const distributorOptions = ref<DistributorCandidate[]>([...props.distributors]);
const productCandidates = ref<CatalogCandidate[]>([...props.products]);

const ppnTypeOptions = [
  { label: "PPN Termasuk (Include)", value: "Include" },
  { label: "PPN Belum Termasuk (Exclude)", value: "Exclude" }
];

function triggerFileInput() {
  fileInputRef.value?.click();
}

function triggerCameraInput() {
  cameraInputRef.value?.click();
}

function resetDialog() {
  extractionResult.value = null;
  tokenUsage.value = null;
  isExtracting.value = false;
  processingStep.value = 0;
  if (fileInputRef.value) fileInputRef.value.value = "";
  if (cameraInputRef.value) cameraInputRef.value.value = "";
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    processFile(target.files[0]);
  }
}

function handleDrop(event: DragEvent) {
  isDragOver.value = false;
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    processFile(event.dataTransfer.files[0]);
  }
}

/**
 * Compresses camera photo on canvas before sending to Gemini API
 */
async function compressImageIfNeeded(file: File, maxDimension = 2400, quality = 0.88): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width <= maxDimension && height <= maxDimension && file.size < 800 * 1024) {
        resolve(file);
        return;
      }

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

async function processFile(file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) {
    $q.notify({
      type: "negative",
      message: "Format file tidak didukung. Mohon gunakan JPG, PNG, WEBP, atau PDF.",
      position: "top"
    });
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    $q.notify({
      type: "negative",
      message: "Ukuran file terlalu besar (Maksimal 25 MB).",
      position: "top"
    });
    return;
  }

  isExtracting.value = true;
  processingStep.value = 0;

  const stepInterval = setInterval(() => {
    if (processingStep.value < processingSteps.length - 1) {
      processingStep.value++;
    }
  }, 1200);

  try {
    const compressed = await compressImageIfNeeded(file);
    const rawExtraction = await extractInvoiceWithGemini(compressed, compressed.type);
    tokenUsage.value = rawExtraction.tokenUsage || null;

    // Load margin mappings from Firestore
    let marginItems: any[] = [];
    try {
      const marginRes = await fetchMarginMappings();
      marginItems = marginRes.items || [];
    } catch (err) {
      console.warn("Could not fetch margin mappings:", err);
    }

    // Match with Assist catalog
    const analyzed = matchAndAnalyzeInvoice(
      rawExtraction,
      props.distributors,
      props.products,
      marginItems,
      file.name
    );

    clearInterval(stepInterval);
    extractionResult.value = analyzed;

    $q.notify({
      type: "positive",
      message: `Faktur berhasil diekstrak (${analyzed.items.length} item ditemukan)!`,
      position: "top",
      timeout: 3000
    });
  } catch (err: any) {
    clearInterval(stepInterval);
    console.error("Ekstraksi Faktur Gagal:", err);
    $q.notify({
      type: "negative",
      message: `Ekstraksi Gagal: ${err instanceof Error ? err.message : String(err)}`,
      position: "top",
      timeout: 6000
    });
  } finally {
    isExtracting.value = false;
  }
}

function filterDistributor(val: string, update: Function) {
  if (val === "") {
    update(() => {
      distributorOptions.value = [...props.distributors];
    });
    return;
  }
  update(() => {
    const needle = val.toLowerCase();
    distributorOptions.value = props.distributors.filter(
      (d) => d.supplierName.toLowerCase().indexOf(needle) > -1
    );
  });
}

function onDistributorSelected(val: any) {
  if (!extractionResult.value) return;
  const match = props.distributors.find((d) => d.id === val);
  if (match) {
    extractionResult.value.matchedSupplierName = match.supplierName;
    extractionResult.value.supplierMatchConfidence = 1.0;
  }
}

function filterProducts(val: string, update: Function) {
  if (val === "") {
    update(() => {
      productCandidates.value = props.products.slice(0, 50);
    });
    return;
  }
  update(() => {
    const needle = val.toLowerCase();
    productCandidates.value = props.products
      .filter((p) => p.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle))
      .slice(0, 50);
  });
}

function onProductSelected(productId: string, row: ExtractedInvoiceItem) {
  const prod = props.products.find((p) => p.id === productId);
  if (!prod) return;

  row.matchedProductId = prod.id;
  row.matchedProductName = prod.name;
  row.matchedCode = prod.code;
  row.matchedType = prod.type;
  row.isBHP = prod.isBHP;
  row.depotId = prod.depotId;
  row.medicineId = prod.medicineId;
  row.akhpId = prod.akhpId;
  row.matchedUnitName = prod.unit || "PCS";
  row.previousBuyPrice = prod.buyFee || prod.avgHPP;
  row.currentSellPrice = prod.sellNormalFee;
  row.productMatchConfidence = 1.0;
  row._isUserModified = true;

  recalcRow(row);
  if (extractionResult.value) {
    extractionResult.value.matchedProductsCount = extractionResult.value.items.filter((i) => !!i.matchedProductId).length;
  }
}

function clearProductMatch(row: ExtractedInvoiceItem) {
  row.matchedProductId = undefined;
  row.matchedProductName = undefined;
  row.matchedCode = undefined;
  row.productMatchConfidence = 0;
  row.previousBuyPrice = undefined;
  row.currentSellPrice = undefined;
  row._isUserModified = true;
  if (extractionResult.value) {
    extractionResult.value.matchedProductsCount = extractionResult.value.items.filter((i) => !!i.matchedProductId).length;
  }
}

function recalcRow(row: ExtractedInvoiceItem) {
  const rawQty = Math.max(1, Number(row.rawQuantity) || 1);
  const factor = Math.max(1, Number(row.conversionFactor) || 1);
  row.rawQuantity = rawQty;
  row.conversionFactor = factor;
  row.quantity = rawQty * factor;

  const rawPrice = Number(row.rawUnitPrice) || 0;
  row.unitPrice = factor > 1 ? Number((rawPrice / factor).toFixed(2)) : rawPrice;

  const disc1 = Math.min(100, Math.max(0, Number(row.discountPercent1) || 0));
  const disc2 = Math.min(100, Math.max(0, Number(row.discountPercent2) || 0));
  row.netPricePerUnit = Number((row.unitPrice * (1 - disc1 / 100) * (1 - disc2 / 100)).toFixed(2));
  row.discountAmount = Number(((row.unitPrice - row.netPricePerUnit) * row.quantity).toFixed(2));
  row.subtotal = Number((row.rawQuantity * rawPrice * (1 - disc1 / 100) * (1 - disc2 / 100)).toFixed(2));

  // Margin Guard
  const costWithPpn = extractionResult.value?.ppnType === "Include"
    ? row.netPricePerUnit
    : row.netPricePerUnit * 1.11;

  if (row.previousBuyPrice && row.previousBuyPrice > 0) {
    row.isPriceIncreased = costWithPpn > row.previousBuyPrice;
    row.hppChangePercent = Number((((costWithPpn - row.previousBuyPrice) / row.previousBuyPrice) * 100).toFixed(1));
  } else {
    row.isPriceIncreased = false;
  }

  if (row.targetMarginPercent && costWithPpn > 0) {
    const rawSuggested = costWithPpn * (1 + row.targetMarginPercent / 100);
    row.suggestedSellPrice = Math.ceil(rawSuggested / 100) * 100;
    if (!row._sellPriceManuallyEdited) {
      row.newSellPrice = row.suggestedSellPrice;
    }
  }

  recalculateTotals();
}

function recalculateTotals() {
  if (!extractionResult.value) return;
  const items = extractionResult.value.items;
  const totalBeforeDiscount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const totalDiscount = items.reduce((sum, i) => sum + i.discountAmount, 0);
  let grandTotal = totalBeforeDiscount - totalDiscount;

  let totalPpn = 0;
  if (extractionResult.value.ppnType === "Exclude") {
    totalPpn = grandTotal * 0.11;
    grandTotal += totalPpn;
  } else {
    totalPpn = grandTotal - grandTotal / 1.11;
  }

  extractionResult.value.totalBeforeDiscount = Math.round(totalBeforeDiscount);
  extractionResult.value.totalDiscount = Math.round(totalDiscount);
  extractionResult.value.totalPpn = Math.round(totalPpn);
  extractionResult.value.grandTotal = Math.round(grandTotal);
  extractionResult.value.priceIncreaseCount = items.filter((i) => i.isPriceIncreased).length;
}

function recalculateAll() {
  if (!extractionResult.value) return;
  extractionResult.value.items.forEach(recalcRow);
}

function addNewItemRow() {
  if (!extractionResult.value) return;
  extractionResult.value.items.push({
    rawProductName: "Item Tambahan Manual",
    productMatchConfidence: 0,
    batchNumber: "",
    expiryDate: new Date().toISOString().split("T")[0],
    isNearExpiry: false,
    quantity: 1,
    rawQuantity: 1,
    conversionFactor: 1,
    unitPrice: 0,
    rawUnitPrice: 0,
    discountPercent1: 0,
    discountPercent2: 0,
    discountAmount: 0,
    subtotal: 0,
    netPricePerUnit: 0,
    isPriceIncreased: false,
    newSellPrice: 0,
  });
  recalculateTotals();
}

function removeItemRow(idx: number) {
  if (!extractionResult.value) return;
  extractionResult.value.items.splice(idx, 1);
  recalculateTotals();
}

function applyToReceivingForm() {
  if (!extractionResult.value) return;
  emit("apply", extractionResult.value);
  isOpen.value = false;
  resetDialog();
}
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}

.text-xxs {
  font-size: 10px;
}

.border-bottom {
  border-bottom: 1px solid #e0e0e0;
}

.border-top {
  border-top: 1px solid #e0e0e0;
}

.drop-zone {
  border: 2px dashed #80cbc4;
  background-color: #f0fdfa;
  transition: all 0.2s ease-in-out;
}

.drop-zone:hover,
.drop-zone-active {
  border-color: #00897b;
  background-color: #e0f2f1;
}

.shadow-subtle {
  box-shadow: 0 1px 4px rgba(0,0,0,0.03) !important;
}

.table-responsive {
  overflow-x: auto;
  max-height: calc(100vh - 360px);
}

.invoice-review-table th {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #455a64;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  background-color: #f5f5f5;
  z-index: 10;
}

.align-top-row td {
  vertical-align: top;
  padding-top: 6px;
  padding-bottom: 6px;
}

.bg-red-0 {
  background-color: #fff5f5;
}

.bg-amber-0 {
  background-color: #fffdf5;
}

@media (max-width: 600px) {
  .hide-on-mobile {
    display: none;
  }
}
</style>
