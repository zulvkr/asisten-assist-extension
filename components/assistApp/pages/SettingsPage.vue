<template>
  <div>
    <div class="text-h5 q-mb-md text-teal font-weight-bold">
      <q-icon name="settings" class="q-mr-sm" />
      Pengaturan & Integrasi Database
    </div>

    <!-- Firestore Margin & SKU CSV Import Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-xs">
          <q-icon name="cloud_upload" class="q-mr-xs" />
          Impor Data Margin & Pemetaan SKU ke Firestore
        </div>
        <div class="text-caption text-grey-7 q-mb-md">
          Unggah file CSV tabel margin (misal <code>Margin - Assist.csv</code>) untuk memperbarui database Firestore secara langsung dan menggantikan Google Sheets.
        </div>

        <div class="row q-col-gutter-md items-center">
          <div class="col-12 col-md-8">
            <q-file
              v-model="csvFile"
              outlined
              dense
              label="Pilih File CSV Margin (.csv)"
              accept=".csv"
              color="teal"
              @update:model-value="onCsvFileSelected"
            >
              <template v-slot:prepend>
                <q-icon name="attach_file" color="teal" />
              </template>
              <template v-if="csvFile" v-slot:append>
                <q-icon name="close" @click.stop="clearCsvFile" class="cursor-pointer" />
              </template>
            </q-file>
          </div>
          <div class="col-12 col-md-4">
            <q-btn
              color="teal"
              icon="cloud_upload"
              label="Unggah ke Firestore"
              class="full-width"
              :loading="uploadingCsv"
              :disable="!parsedCsvItems.length || uploadingCsv"
              @click="uploadCsvToFirestore"
            />
          </div>
        </div>

        <!-- Preview Info -->
        <div v-if="parsedCsvItems.length > 0" class="q-mt-sm text-caption text-teal-8">
          <q-icon name="check_circle" color="positive" class="q-mr-xs" />
          Siap diunggah: <strong>{{ parsedCsvItems.length }}</strong> baris data ({{ parsedWithSkuCount }} dengan SKU, {{ parsedWithMarginCount }} dengan Margin).
        </div>

        <q-linear-progress
          v-if="uploadingCsv"
          :value="uploadProgress"
          color="teal"
          class="q-mt-md"
          rounded
          stripe
        />
        <div v-if="uploadingCsv" class="text-caption text-grey-7 q-mt-xs text-right">
          {{ uploadProgressText }}
        </div>
      </q-card-section>
    </q-card>

    <!-- Stock Comparison Settings Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-md">
          Pengaturan Perbandingan Stok
        </div>

        <form @submit.prevent="saveComparison">
          <div class="q-gutter-y-md">
            <q-input
              v-model="excludedSkuPrefixes"
              label="Prefix SKU Desty yang Dikecualikan"
              outlined
              dense
              placeholder="Contoh: ISA-, TST-"
              color="teal"
              hint="Masukkan prefix SKU Desty (dipisahkan dengan koma) yang ingin Anda kecualikan dari perbandingan stok. Secara default, 'ISA-' dikecualikan."
            />

            <div class="row q-mt-lg">
              <q-btn
                type="submit"
                label="Simpan Pengaturan Perbandingan"
                color="teal"
                icon="save"
                class="q-px-md"
              />
            </div>
          </div>
        </form>
      </q-card-section>
    </q-card>

    <!-- Assist Sales Configuration Card -->
    <q-card v-if="developerMode" flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-xs">
          Konfigurasi Impor Penjualan Desty
        </div>
        <div class="text-caption text-orange-9 q-mb-md">
          Isi ID akun Kas Assist yang dipakai untuk pembayaran marketplace. ID ini tidak di-hardcode dan wajib diisi sebelum impor.
        </div>
        <form @submit.prevent="saveSalesConfig">
          <q-input
            v-model="assistAccountTxId"
            label="Account Tx ID akun Kas Assist"
            outlined
            dense
            clearable
            color="teal"
            placeholder="Contoh: 68b6f3bea945e5b08b004236"
          />
          <q-btn
            type="submit"
            color="teal"
            icon="save"
            label="Simpan Konfigurasi Penjualan"
            class="q-mt-md"
          />
        </form>
      </q-card-section>
    </q-card>

    <!-- Developer Mode -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row items-center justify-between q-col-gutter-md">
        <div class="col">
          <div class="text-subtitle1 text-weight-bold text-teal">Mode Developer</div>
          <div class="text-caption text-grey-7">
            Menampilkan dry-run, preview payload, override mapping, dan alat debug crypto.
            Biarkan nonaktif untuk penggunaan operasional sehari-hari.
          </div>
        </div>
        <div class="col-auto">
          <q-toggle
            v-model="developerMode"
            color="orange"
            label="Aktifkan alat developer"
            @update:model-value="toggleDeveloperMode"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Legacy Apps Script Card (Developer Mode) -->
    <q-card v-if="developerMode" flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-grey-8 q-mb-md">
          Konfigurasi Google Apps Script (Legacy / Opsional)
        </div>

        <form @submit.prevent="save">
          <div class="q-gutter-y-md">
            <q-input
              v-model="scriptUrl"
              label="Google Apps Script Web App URL"
              outlined
              dense
              placeholder="https://script.google.com/macros/s/.../exec"
              color="teal"
              hint="URL Web App dari deployment Google Apps Script Anda"
            />

            <q-input
              v-model="scriptToken"
              label="Security Token"
              outlined
              dense
              type="password"
              placeholder="Masukkan token keamanan buatan Anda"
              color="teal"
              hint="Token ini harus sama dengan token yang diset di Google Apps Script Anda"
            />

            <div class="row q-mt-lg">
              <q-btn
                type="submit"
                label="Simpan Pengaturan Apps Script"
                color="grey-8"
                icon="save"
                class="q-px-md"
              />
            </div>
          </div>
        </form>
      </q-card-section>
    </q-card>

    <!-- Crypto Debug Card -->
    <q-card v-if="developerMode" flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-xs">
          Debug Payload Assist (AES-CBC)
        </div>
        <div class="text-caption text-orange-9 q-mb-md">
          Gunakan hanya untuk debugging lokal. Jangan membagikan token, payload pasien, atau hasil dekripsi.
          Kunci tidak pernah ditampilkan di layar.
        </div>

        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-6">
            <q-input
              v-model="cryptoPlaintext"
              type="textarea"
              outlined
              autogrow
              :input-style="{ minHeight: '180px', fontFamily: 'monospace', fontSize: '12px' }"
              label="Plaintext JSON"
              hint="Tempel payload JSON sebelum dienkripsi."
              color="teal"
            />
            <div class="row q-gutter-sm q-mt-sm">
              <q-btn
                color="teal"
                icon="lock"
                label="Enkripsi Payload"
                :loading="encrypting"
                :disable="!cryptoPlaintext.trim()"
                @click="encryptDebugPayload"
              />
              <q-btn flat color="grey-7" label="Bersihkan" @click="cryptoPlaintext = ''" />
            </div>
          </div>

          <div class="col-12 col-md-6">
            <q-input
              v-model="cryptoEncryptedInput"
              type="textarea"
              outlined
              autogrow
              :input-style="{ minHeight: '180px', fontFamily: 'monospace', fontSize: '12px' }"
              label="Ciphertext / Wrapped Payload"
              hint="Tempel nilai Base64 atau object JSON dari body KTxes/payment."
              color="teal"
            />
            <div class="row q-gutter-sm q-mt-sm">
              <q-btn
                color="blue-grey-8"
                icon="lock_open"
                label="Dekripsi Payload"
                :loading="decrypting"
                :disable="!cryptoEncryptedInput.trim()"
                @click="decryptDebugPayload"
              />
              <q-btn flat color="grey-7" label="Bersihkan" @click="cryptoEncryptedInput = ''" />
            </div>
          </div>
        </div>

        <div v-if="cryptoEncryptedOutput" class="q-mt-md">
          <q-input
            v-model="cryptoEncryptedOutput"
            type="textarea"
            outlined
            readonly
            autogrow
            :input-style="{ fontFamily: 'monospace', fontSize: '12px' }"
            label="Hasil Enkripsi (siap ditempel ke body request)"
            color="teal"
          >
            <template #append>
              <q-btn flat round dense icon="content_copy" aria-label="Salin hasil enkripsi" @click="copyCryptoValue(cryptoEncryptedOutput)" />
            </template>
          </q-input>
        </div>

        <div v-if="cryptoDecryptedOutput" class="q-mt-md">
          <q-input
            v-model="cryptoDecryptedOutput"
            type="textarea"
            outlined
            readonly
            autogrow
            :input-style="{ fontFamily: 'monospace', fontSize: '12px' }"
            label="Hasil Dekripsi"
            color="teal"
          >
            <template #append>
              <q-btn flat round dense icon="content_copy" aria-label="Salin hasil dekripsi" @click="copyCryptoValue(cryptoDecryptedOutput)" />
            </template>
          </q-input>
        </div>
      </q-card-section>
    </q-card>

    <!-- Sync Tools Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-xs">
          Sinkronisasi Nama Barang ke Firestore
        </div>
        <div class="text-caption text-grey-7 q-mb-md">
          Alat ini akan mengambil seluruh daftar nama obat & BHP terbaru dari Assist, mencocokkannya dengan baris di Firestore berdasarkan kode assist, dan memperbarui nama barang di database Firestore agar tersinkronisasi.
        </div>

        <q-btn
          color="teal"
          icon="sync"
          label="Sinkronkan Nama Sekarang"
          :loading="syncing"
          :disabled="!store.assistToken"
          @click="startSync"
        />
        <div v-if="!store.assistToken" class="text-caption text-red q-mt-sm">
          * Harap hubungkan token Assist terlebih dahulu sebelum mensinkronisasikan nama.
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import { useAssistStore } from "../stores/assistStore";
import {
  parseMarginCsv,
  batchUpsertMarginItems,
  type MarginMappingItem,
} from "@/services/marginStorage";
import {
  decryptPayload,
  decryptWrappedPayload,
  encryptPayload,
  wrapEncryptedPayload,
} from "@/utils/cryptoUtils";

const $q = useQuasar();
const store = useAssistStore();

const scriptUrl = ref(store.googleAppsScriptUrl);
const scriptToken = ref(store.googleAppsScriptToken);
const excludedSkuPrefixes = ref(store.excludedDestySkuPrefixes);
const assistAccountTxId = ref(store.assistAccountTxId);
const developerMode = ref(store.developerMode);
const syncing = ref(false);
const encrypting = ref(false);
const decrypting = ref(false);
const cryptoPlaintext = ref("");
const cryptoEncryptedInput = ref("");
const cryptoEncryptedOutput = ref("");
const cryptoDecryptedOutput = ref("");

// CSV Upload State
const csvFile = ref<File | null>(null);
const parsedCsvItems = ref<MarginMappingItem[]>([]);
const uploadingCsv = ref(false);
const uploadProgress = ref(0);
const uploadProgressText = ref("");

const parsedWithSkuCount = computed(
  () => parsedCsvItems.value.filter((i) => Boolean(i.sku)).length,
);
const parsedWithMarginCount = computed(
  () => parsedCsvItems.value.filter((i) => Boolean(i.margin)).length,
);

async function onCsvFileSelected(file: File | null) {
  if (!file) {
    clearCsvFile();
    return;
  }

  try {
    const text = await file.text();
    const items = parseMarginCsv(text);
    if (items.length === 0) {
      $q.notify({
        type: "warning",
        message: "File CSV tidak memiliki baris data yang valid.",
        position: "top",
      });
      clearCsvFile();
      return;
    }

    parsedCsvItems.value = items;
    $q.notify({
      type: "positive",
      message: `Berhasil membaca ${items.length} data dari file CSV.`,
      position: "top",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    $q.notify({
      type: "negative",
      message: `Gagal membaca file CSV: ${msg}`,
      position: "top",
    });
    clearCsvFile();
  }
}

function clearCsvFile() {
  csvFile.value = null;
  parsedCsvItems.value = [];
  uploadProgress.value = 0;
  uploadProgressText.value = "";
}

async function uploadCsvToFirestore() {
  if (parsedCsvItems.value.length === 0 || uploadingCsv.value) return;

  uploadingCsv.value = true;
  uploadProgress.value = 0;
  uploadProgressText.value = `Mengunggah 0 / ${parsedCsvItems.value.length}...`;

  try {
    await batchUpsertMarginItems(
      parsedCsvItems.value,
      (processed, total) => {
        uploadProgress.value = processed / total;
        uploadProgressText.value = `Mengunggah ${processed} / ${total} data...`;
      },
    );

    // Refresh store local cache
    await store.fetchMarginData();

    $q.notify({
      type: "positive",
      message: `Berhasil mengunggah ${parsedCsvItems.value.length} data margin & SKU ke Firestore!`,
      position: "top",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    $q.notify({
      type: "negative",
      message: `Gagal mengunggah ke Firestore: ${msg}`,
      position: "top",
    });
  } finally {
    uploadingCsv.value = false;
  }
}

function save() {
  store.saveAppsScriptConfig(scriptUrl.value.trim(), scriptToken.value.trim());

  $q.notify({
    type: "positive",
    message: "Pengaturan Google Apps Script berhasil disimpan!",
    position: "top"
  });
}

function saveComparison() {
  store.saveComparisonSettings(excludedSkuPrefixes.value);

  $q.notify({
    type: "positive",
    message: "Pengaturan perbandingan stok berhasil disimpan!",
    position: "top"
  });
}

function toggleDeveloperMode(enabled: boolean) {
  store.saveDeveloperMode(enabled);
  $q.notify({
    type: enabled ? "warning" : "positive",
    message: enabled ? "Mode developer diaktifkan." : "Mode developer dinonaktifkan.",
    position: "top",
  });
}

function saveSalesConfig() {
  store.saveAssistSalesConfig(assistAccountTxId.value);
  $q.notify({
    type: "positive",
    message: "Konfigurasi akun Kas Assist berhasil disimpan.",
    position: "top",
  });
}

async function encryptDebugPayload() {
  if (!cryptoPlaintext.value.trim() || encrypting.value) return;

  encrypting.value = true;
  try {
    const encrypted = await encryptPayload(cryptoPlaintext.value);
    cryptoEncryptedOutput.value = JSON.stringify(wrapEncryptedPayload(encrypted), null, 2);
    $q.notify({
      type: "positive",
      message: "Payload berhasil dienkripsi.",
      position: "top",
    });
  } catch (error) {
    $q.notify({
      type: "negative",
      message: error instanceof Error ? error.message : "Gagal mengenkripsi payload.",
      position: "top",
    });
  } finally {
    encrypting.value = false;
  }
}

async function decryptDebugPayload() {
  if (!cryptoEncryptedInput.value.trim() || decrypting.value) return;

  decrypting.value = true;
  try {
    const input = cryptoEncryptedInput.value.trim();
    let decrypted: string;

    try {
      const parsed = JSON.parse(input) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not wrapped payload");
      }
      decrypted = await decryptWrappedPayload(parsed as Record<string, unknown>);
    } catch (wrappedError) {
      // Also accept a bare Base64 ciphertext copied from the wrapped body.
      if (wrappedError instanceof Error && wrappedError.message !== "not wrapped payload") {
        try {
          decrypted = await decryptPayload(input);
        } catch {
          throw wrappedError;
        }
      } else {
        decrypted = await decryptPayload(input);
      }
    }

    try {
      cryptoDecryptedOutput.value = JSON.stringify(JSON.parse(decrypted), null, 2);
    } catch {
      cryptoDecryptedOutput.value = decrypted;
    }

    $q.notify({
      type: "positive",
      message: "Payload berhasil didekripsi.",
      position: "top",
    });
  } catch (error) {
    $q.notify({
      type: "negative",
      message: error instanceof Error
        ? `Gagal mendekripsi payload: ${error.message}`
        : "Gagal mendekripsi payload.",
      position: "top",
    });
  } finally {
    decrypting.value = false;
  }
}

async function copyCryptoValue(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    $q.notify({ type: "positive", message: "Payload disalin ke clipboard.", position: "top" });
  } catch {
    $q.notify({ type: "negative", message: "Gagal menyalin payload.", position: "top" });
  }
}

async function startSync() {
  syncing.value = true;
  try {
    const res = await store.syncNamesWithFirestore();
    $q.notify({
      type: "positive",
      message: res.message || "Nama barang berhasil disinkronkan ke Firestore!",
      position: "top"
    });
  } catch (err: any) {
    console.error(err);
    $q.notify({
      type: "negative",
      message: err.message || "Gagal sinkronisasi nama barang ke Firestore.",
      position: "top"
    });
  } finally {
    syncing.value = false;
  }
}
</script>

<style scoped>
</style>
