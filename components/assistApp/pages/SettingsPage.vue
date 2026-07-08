<template>
  <div>
    <div class="text-h5 q-mb-md text-teal font-weight-bold">
      <q-icon name="settings" class="q-mr-sm" />
      Pengaturan Google Sheets
    </div>

    <!-- Configuration Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-md">
          Konfigurasi Google Apps Script (Ubah Margin)
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
                label="Simpan Pengaturan"
                color="teal"
                icon="save"
                class="q-px-md"
              />
            </div>
          </div>
        </form>
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

    <!-- Sync Tools Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-xs">
          Sinkronisasi Nama Barang ke Google Sheets
        </div>
        <div class="text-caption text-grey-7 q-mb-md">
          Alat ini akan mengambil seluruh daftar nama obat & BHP terbaru dari Assist, mencocokkannya dengan baris di sheet margin berdasarkan kode SKU, dan memperbarui nama barang di Google Sheets agar tersinkronisasi.
        </div>

        <q-btn
          color="teal"
          icon="sync"
          label="Sinkronkan Nama Sekarang"
          :loading="syncing"
          :disabled="!store.googleAppsScriptUrl || !store.googleAppsScriptToken || !store.assistToken"
          @click="startSync"
        />
        <div v-if="!store.googleAppsScriptToken" class="text-caption text-red q-mt-sm">
          * Harap isi Security Token di konfigurasi di atas sebelum mensinkronisasikan nama.
        </div>
        <div v-if="!store.assistToken" class="text-caption text-red q-mt-sm">
          * Harap hubungkan token Assist terlebih dahulu sebelum mensinkronisasikan nama.
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useQuasar } from "quasar";
import { useAssistStore } from "../stores/assistStore";

const $q = useQuasar();
const store = useAssistStore();

const scriptUrl = ref(store.googleAppsScriptUrl);
const scriptToken = ref(store.googleAppsScriptToken);
const excludedSkuPrefixes = ref(store.excludedDestySkuPrefixes);
const syncing = ref(false);

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

async function startSync() {
  syncing.value = true;
  try {
    const res = await store.syncNamesWithGoogleSheets();
    $q.notify({
      type: "positive",
      message: res.message || "Nama barang berhasil disinkronkan ke Google Sheet!",
      position: "top"
    });
  } catch (err: any) {
    console.error(err);
    $q.notify({
      type: "negative",
      message: err.message || "Gagal sinkronisasi nama barang.",
      position: "top"
    });
  } finally {
    syncing.value = false;
  }
}
</script>

<style scoped>
</style>
