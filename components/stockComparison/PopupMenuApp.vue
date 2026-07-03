<template>
  <main class="popup-menu-root">
    <h1>Menu</h1>
    <p class="subtitle">
      Akses dashboard terintegrasi untuk mengelola stok obat, BHP, restock, perbandingan, rekomendasi belanja, dan lainnya.
    </p>

    <button
      type="button"
      style="background: #009688; color: white;"
      :disabled="Boolean(openingTarget)"
      @click="openAssistAppWindow"
    >
      {{
        openingTarget === "assistApp"
          ? "Membuka..."
          : "Buka Dashboard Assist (Quasar)"
      }}
    </button>

    <button
      type="button"
      class="button-secondary"
      :disabled="Boolean(openingTarget)"
      @click="openKesehatanInventoriWindow"
    >
      {{
        openingTarget === "kesehatanInventori"
          ? "Membuka..."
          : "Buka Kesehatan Inventori"
      }}
    </button>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";

type OpeningTarget =
  | "kesehatanInventori"
  | "assistApp"
  | null;

const openingTarget = ref<OpeningTarget>(null);
const errorMessage = ref("");

async function openKesehatanInventoriWindow() {
  openingTarget.value = "kesehatanInventori";
  errorMessage.value = "";

  try {
    const url = new URL(
      "./kesehatan-inventori.html",
      browser.runtime.getURL("/popup.html"),
    ).toString();
    await browser.windows.create({
      url,
      type: "popup",
      width: 1400,
      height: 860,
    });

    window.close();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Gagal membuka jendela Kesehatan Inventori.";
  } finally {
    openingTarget.value = null;
  }
}

async function openAssistAppWindow() {
  openingTarget.value = "assistApp";
  errorMessage.value = "";

  try {
    const url = new URL(
      "./assist-app.html",
      browser.runtime.getURL("/popup.html"),
    ).toString();
    await browser.windows.create({
      url,
      type: "popup",
      width: 1400,
      height: 860,
    });

    window.close();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Gagal membuka jendela Dashboard Assist.";
  } finally {
    openingTarget.value = null;
  }
}
</script>
