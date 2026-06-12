<template>
  <main class="popup-menu-root">
    <h1>Menu</h1>
    <p class="subtitle">
      Akses fitur perbandingan stok dan rekomendasi belanja dari jendela
      terpisah.
    </p>

    <button
      type="button"
      :disabled="Boolean(openingTarget)"
      @click="openComparisonWindow"
    >
      {{
        openingTarget === "comparison" ? "Membuka..." : "Buka Perbandingan Stok"
      }}
    </button>

    <button
      type="button"
      class="button-secondary"
      :disabled="Boolean(openingTarget)"
      @click="openRecommendationWindow"
    >
      {{
        openingTarget === "recommendation"
          ? "Membuka..."
          : "Buka Rekomendasi Belanja"
      }}
    </button>

    <button
      type="button"
      class="button-secondary"
      :disabled="Boolean(openingTarget)"
      @click="openDestyHelperWindow"
    >
      {{
        openingTarget === "destyHelper"
          ? "Membuka..."
          : "Buka PLDMP"
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
  | "comparison"
  | "recommendation"
  | "destyHelper"
  | "kesehatanInventori"
  | null;

const openingTarget = ref<OpeningTarget>(null);
const errorMessage = ref("");

async function openComparisonWindow() {
  openingTarget.value = "comparison";
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
    openingTarget.value = null;
  }
}

async function openRecommendationWindow() {
  openingTarget.value = "recommendation";
  errorMessage.value = "";

  try {
    const url = new URL(
      "./rekomendasi-belanja.html",
      browser.runtime.getURL("/popup.html"),
    ).toString();
    await browser.windows.create({
      url,
      type: "popup",
      width: 1320,
      height: 860,
    });

    window.close();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Gagal membuka jendela rekomendasi.";
  } finally {
    openingTarget.value = null;
  }
}

async function openDestyHelperWindow() {
  openingTarget.value = "destyHelper";
  errorMessage.value = "";

  try {
    const url = new URL(
      "./desty-helper.html",
      browser.runtime.getURL("/popup.html"),
    ).toString();
    await browser.windows.create({
      url,
      type: "popup",
      width: 1320,
      height: 860,
    });

    window.close();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Gagal membuka jendela PLDMP.";
  } finally {
    openingTarget.value = null;
  }
}

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
</script>
