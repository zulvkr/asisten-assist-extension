<template>
  <main class="popup-menu-root">
    <h1>Menu</h1>
    <p class="subtitle">Akses fitur perbandingan stok dari jendela terpisah.</p>

    <button type="button" :disabled="opening" @click="openComparisonWindow">
      {{ opening ? "Membuka..." : "Buka Perbandingan Stok" }}
    </button>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";

const opening = ref(false);
const errorMessage = ref("");

async function openComparisonWindow() {
  opening.value = true;
  errorMessage.value = "";

  try {
    const url = browser.runtime.getURL("/stock-comparison.html");
    await browser.windows.create({
      url,
      type: "popup",
      width: 1120,
      height: 760,
    });

    window.close();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Gagal membuka jendela perbandingan.";
  } finally {
    opening.value = false;
  }
}
</script>
