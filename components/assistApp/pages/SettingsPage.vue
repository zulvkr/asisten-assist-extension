<template>
  <div>
    <div class="text-h5 q-mb-md text-teal font-weight-bold">
      <q-icon name="settings" class="q-mr-sm" />
      Pengaturan Koneksi Assist API
    </div>

    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-md">
          Konfigurasi Kredensial
        </div>

        <form @submit.prevent="save">
          <div class="q-gutter-y-md">
            <q-input
              v-model="token"
              label="Authorization Token"
              outlined
              dense
              type="textarea"
              rows="3"
              hint="Masukkan Token Authorization yang valid (bisa diambil dari headers request di clinica.assist.id)"
              placeholder="Contoh: rRjD6nEn2My... atau Bearer rRjD6n..."
              color="teal"
            />

            <q-input
              v-model="hospId"
              label="Hospital ID"
              outlined
              dense
              hint="ID Rumah Sakit / Klinik Anda"
              placeholder="Contoh: 6874f9569abc98f9c645b330"
              color="teal"
            />

            <q-input
              v-model="apiBase"
              label="Base API URL"
              outlined
              dense
              hint="Alamat dasar API clinica assist"
              placeholder="https://api-clinica.assist.id/api"
              color="teal"
              disabled
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

    <!-- Guide Card -->
    <q-card flat bordered class="bg-teal-1 text-teal-9">
      <q-card-section>
        <div class="text-subtitle2 text-weight-bold q-mb-sm row items-center">
          <q-icon name="info" size="20px" class="q-mr-xs" />
          Cara Mendapatkan Authorization Token
        </div>
        <ol class="q-pl-md q-my-none text-body2">
          <li class="q-mb-xs">Buka tab baru dan login ke <a href="https://clinica.assist.id/" target="_blank" class="text-teal text-weight-bold">clinica.assist.id</a></li>
          <li class="q-mb-xs">Buka <strong>Developer Tools</strong> (tekan <kbd class="bg-teal-2 q-px-xs rounded">F12</kbd> atau klik kanan -> Inspect) lalu pilih tab <strong>Network</strong>.</li>
          <li class="q-mb-xs">Segarkan/refresh halaman Assist atau klik menu mana saja (misal Apotek / Obat).</li>
          <li class="q-mb-xs">Klik salah satu request API (misal request ke `KMedicineStocks` atau `KTxes`).</li>
          <li class="q-mb-xs">Di bagian <strong>Request Headers</strong>, cari baris <code>authorization</code>.</li>
          <li>Salin nilai token tersebut dan tempel ke kolom di atas, lalu tekan Simpan.</li>
        </ol>
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

const token = ref(store.assistToken);
const hospId = ref(store.hospitalId);
const apiBase = ref(store.apiBaseUrl);

function save() {
  if (!token.value.trim()) {
    $q.notify({
      type: "warning",
      message: "Token tidak boleh kosong!",
      position: "top"
    });
    return;
  }

  // Auto clean Bearer prefix if any
  let cleanToken = token.value.trim();
  if (cleanToken.toLowerCase().startsWith("bearer ")) {
    cleanToken = cleanToken.slice(7).trim();
  }

  store.saveConfig(cleanToken, hospId.value.trim());

  $q.notify({
    type: "positive",
    message: "Konfigurasi koneksi berhasil disimpan!",
    position: "top"
  });
}
</script>

<style scoped>
kbd {
  font-family: monospace;
}
</style>
