<template>
  <q-layout view="hHh Lpr lFf">
    <!-- Header -->
    <q-header elevated class="bg-teal text-white">
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title class="row items-center no-wrap">
          <q-icon name="healing" size="28px" class="q-mr-sm" />
          <span class="text-weight-bold">Asisten Assist</span>
          <span class="q-ml-sm text-subtitle2 text-teal-2 font-mono">v1.1</span>
        </q-toolbar-title>

        <!-- Token Status Indicators -->
        <div class="row items-center q-gutter-x-sm">
          <!-- Assist Token Badge -->
          <q-badge 
            v-if="store.assistToken" 
            color="positive" 
            text-color="white" 
            class="q-py-xs q-px-sm cursor-pointer"
            @click="handleReloadAssist"
          >
            <q-icon name="check_circle" class="q-mr-xs" />
            Terhubung ke Assist
            <q-tooltip>Klik untuk reload token Assist</q-tooltip>
          </q-badge>
          <q-badge 
            v-else 
            color="negative" 
            text-color="white" 
            class="q-py-xs q-px-sm cursor-pointer"
            @click="handleReloadAssist"
          >
            <q-icon name="warning" class="q-mr-xs" />
            Token Assist Belum Diisi
            <q-tooltip>Klik untuk reload token Assist</q-tooltip>
          </q-badge>

          <!-- Desty Token Badge -->
          <q-badge 
            v-if="store.destyToken" 
            color="positive" 
            text-color="white" 
            class="q-py-xs q-px-sm cursor-pointer"
            @click="handleReloadDesty"
          >
            <q-icon name="check_circle" class="q-mr-xs" />
            Terhubung ke Desty
            <q-tooltip>Klik untuk reload token Desty</q-tooltip>
          </q-badge>
          <q-badge 
            v-else 
            color="negative" 
            text-color="white" 
            class="q-py-xs q-px-sm cursor-pointer"
            @click="handleReloadDesty"
          >
            <q-icon name="warning" class="q-mr-xs" />
            Token Desty Belum Diisi
            <q-tooltip>Klik untuk reload token Desty</q-tooltip>
          </q-badge>
        </div>
      </q-toolbar>
    </q-header>

    <!-- Sidebar Drawer -->
    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
      :mini="miniState"
      class="bg-grey-1 text-grey-9"
    >
      <q-list>
        <q-item-label header class="text-teal text-weight-bold text-uppercase" v-if="!miniState">
          Navigasi Fitur
        </q-item-label>

        <!-- Stok Obat Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'obat'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('obat')"
        >
          <q-item-section avatar>
            <q-icon name="vaccines" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Stok Obat
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Stok Obat</q-item-label>
            <q-item-label caption>Kelola & filter stok obat</q-item-label>
          </q-item-section>
        </q-item>

        <!-- Stok BHP Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'bhp'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('bhp')"
        >
          <q-item-section avatar>
            <q-icon name="healing" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Stok BHP
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Stok BHP</q-item-label>
            <q-item-label caption>Bahan Habis Pakai (AKHP)</q-item-label>
          </q-item-section>
        </q-item>

        <!-- Restock & Return Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'restock'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('restock')"
        >
          <q-item-section avatar>
            <q-icon name="receipt_long" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Restock & Return
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Restock & Return</q-item-label>
            <q-item-label caption>Transaksi masuk & distributor</q-item-label>
          </q-item-section>
        </q-item>

        <q-separator class="q-my-sm" />

        <q-item-label header class="text-teal text-weight-bold text-uppercase q-pt-none" v-if="!miniState">
          Alat Integrasi
        </q-item-label>

        <!-- Perbandingan Stok Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'comparison'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('comparison')"
        >
          <q-item-section avatar>
            <q-icon name="compare_arrows" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Perbandingan Stok
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Perbandingan Stok</q-item-label>
            <q-item-label caption>Komparasi stok Assist & Desty</q-item-label>
          </q-item-section>
        </q-item>

        <!-- Rekomendasi Belanja Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'recommendation'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('recommendation')"
        >
          <q-item-section avatar>
            <q-icon name="shopping_cart" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Rekomendasi Belanja
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Rekomendasi Belanja</q-item-label>
            <q-item-label caption>Saran belanja mingguan/bulanan</q-item-label>
          </q-item-section>
        </q-item>

        <!-- PLDMP Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'destyHelper'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('destyHelper')"
        >
          <q-item-section avatar>
            <q-icon name="sync" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Desty Helper
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Desty Helper</q-item-label>
            <q-item-label caption>PLDMP & sinkronisasi penjualan</q-item-label>
          </q-item-section>
        </q-item>

        <!-- Kesehatan Inventori Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'kesehatanInventori'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('kesehatanInventori')"
        >
          <q-item-section avatar>
            <q-icon name="health_and_safety" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Kesehatan Inventori
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Kesehatan Inventori</q-item-label>
            <q-item-label caption>Analisis risiko & ED obat</q-item-label>
          </q-item-section>
        </q-item>

        <!-- Hitungan Harian Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'hitunganHarian'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('hitunganHarian')"
        >
          <q-item-section avatar>
            <q-icon name="calculate" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Hitungan Harian
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Hitungan Harian</q-item-label>
            <q-item-label caption>Pemasukan harian klinik</q-item-label>
          </q-item-section>
        </q-item>

        <!-- Valuasi HNA & HPP Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'hnaValuation'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('hnaValuation')"
        >
          <q-item-section avatar>
            <q-icon name="payments" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Valuasi HNA & HPP
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Valuasi HNA & HPP</q-item-label>
            <q-item-label caption>HPP Penjualan & Nilai Stok</q-item-label>
          </q-item-section>
        </q-item>

        <!-- Pengaturan Tab -->
        <q-item
          clickable
          v-ripple
          :active="page === 'settings'"
          active-class="bg-teal-1 text-teal text-weight-bold"
          @click="emitPage('settings')"
        >
          <q-item-section avatar>
            <q-icon name="settings" />
            <q-tooltip v-if="miniState" anchor="center right" self="center left">
              Pengaturan
            </q-tooltip>
          </q-item-section>
          <q-item-section>
            <q-item-label>Pengaturan</q-item-label>
            <q-item-label caption>Koneksi API & Google Sheets</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <!-- Page Content Container -->
    <q-page-container>
      <q-page padding class="q-gutter-md">
        <slot />
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useQuasar } from "quasar";
import { useAssistStore } from "../stores/assistStore";

const props = defineProps<{
  page: string;
}>();

const emit = defineEmits<{
  (e: "update:page", page: string): void;
}>();

const $q = useQuasar();
const store = useAssistStore();

const leftDrawerOpen = ref(false);
const miniState = ref(true);

function toggleLeftDrawer() {
  if ($q.screen.gt.sm) {
    miniState.value = !miniState.value;
  } else {
    leftDrawerOpen.value = !leftDrawerOpen.value;
  }
}

function emitPage(pageName: string) {
  emit("update:page", pageName);
}

async function handleReloadAssist() {
  $q.loading.show({ message: "Memuat ulang token Assist..." });
  const res = await store.reloadAssistToken();
  $q.loading.hide();
  if (res.success) {
    $q.notify({
      type: "positive",
      message: "Token Assist berhasil dimuat ulang!",
      position: "top"
    });
  } else {
    $q.notify({
      type: "warning",
      message: "Gagal memuat token Assist. Pastikan tab clinica.assist.id terbuka.",
      position: "top"
    });
  }
}

async function handleReloadDesty() {
  $q.loading.show({ message: "Memuat ulang token Desty..." });
  const res = await store.reloadDestyToken();
  $q.loading.hide();
  if (res.success) {
    $q.notify({
      type: "positive",
      message: "Token Desty berhasil dimuat ulang!",
      position: "top"
    });
  } else {
    $q.notify({
      type: "warning",
      message: "Gagal memuat token Desty. Pastikan tab omni.desty.app terbuka.",
      position: "top"
    });
  }
}

// Force light mode
onMounted(() => {
  $q.dark.set(false);
});
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
