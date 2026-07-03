<template>
  <MainLayout v-model:page="currentPage">
    <div v-show="currentPage === 'obat'">
      <ObatPage />
    </div>
    <div v-show="currentPage === 'bhp'">
      <BhpPage />
    </div>
    <div v-show="currentPage === 'restock'">
      <RestockReturnPage />
    </div>
    <div v-show="currentPage === 'comparison'">
      <StockComparisonPage />
    </div>
    <div v-show="currentPage === 'recommendation'">
      <RekomendasiBelanjaPage />
    </div>
    <div v-show="currentPage === 'destyHelper'">
      <DestyHelperPage />
    </div>
    <div v-show="currentPage === 'hitunganHarian'">
      <HitunganHarianPage />
    </div>
    <div v-show="currentPage === 'kesehatanInventori'">
      <KesehatanInventoriPage />
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import MainLayout from "./layouts/MainLayout.vue";
import ObatPage from "./pages/ObatPage.vue";
import BhpPage from "./pages/BhpPage.vue";
import RestockReturnPage from "./pages/RestockReturnPage.vue";
import StockComparisonPage from "./pages/StockComparisonPage.vue";
import RekomendasiBelanjaPage from "./pages/RekomendasiBelanjaPage.vue";
import DestyHelperPage from "./pages/DestyHelperPage.vue";
import HitunganHarianPage from "./pages/HitunganHarianPage.vue";
import KesehatanInventoriPage from "./pages/KesehatanInventoriPage.vue";
import { useAssistStore } from "./stores/assistStore";

const currentPage = ref("obat");
const store = useAssistStore();

onMounted(async () => {
  await store.loadTokenAutomatically();
  await store.loadDestyTokenAutomatically();
});
</script>

<style>
/* Global styling inside the Quasar app context */
body {
  background-color: #fafafa;
}

.body--dark body {
  background-color: #121212;
}
</style>
