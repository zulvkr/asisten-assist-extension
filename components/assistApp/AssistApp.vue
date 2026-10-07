<template>
  <MainLayout>
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" :key="$route.name || $route.path" />
      </keep-alive>
    </router-view>
  </MainLayout>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import MainLayout from "./layouts/MainLayout.vue";
import { useAssistStore } from "./stores/assistStore";

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
