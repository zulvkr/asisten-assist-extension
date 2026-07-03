import { defineStore } from "pinia";
import { ref } from "vue";
import { resolveAssistToken } from "@/composables/assistTokenManager";
import { runtimeConfig } from "@/config/runtimeConfig";

export const useAssistStore = defineStore("assist", () => {
  const assistToken = ref(localStorage.getItem("assist_token") || "");
  const hospitalId = ref(localStorage.getItem("assist_hospital_id") || runtimeConfig.assistHospitalId);
  const apiBaseUrl = ref(runtimeConfig.assistApiBase);

  async function loadTokenAutomatically() {
    try {
      const result = await resolveAssistToken();
      if (result.token) {
        assistToken.value = result.token;
        localStorage.setItem("assist_token", result.token);
      }
    } catch (err) {
      console.error("Gagal memuat token secara otomatis:", err);
    }
  }

  function saveConfig(token: string, hospId: string) {
    assistToken.value = token.trim();
    hospitalId.value = hospId.trim();
    localStorage.setItem("assist_token", assistToken.value);
    localStorage.setItem("assist_hospital_id", hospitalId.value);
  }

  function getHeaders() {
    return {
      accept: "application/json, text/plain, */*",
      authorization: assistToken.value,
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site"
    };
  }

  return {
    assistToken,
    hospitalId,
    apiBaseUrl,
    loadTokenAutomatically,
    saveConfig,
    getHeaders
  };
});
