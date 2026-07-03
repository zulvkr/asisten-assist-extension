import { defineStore } from "pinia";
import { ref } from "vue";
import { resolveAssistToken } from "@/composables/assistTokenManager";
import { resolveDestyToken } from "@/composables/destyOmniTokenManager";
import { runtimeConfig } from "@/config/runtimeConfig";

export const useAssistStore = defineStore("assist", () => {
  const assistToken = ref(localStorage.getItem("assist_token") || "");
  const hospitalId = ref(localStorage.getItem("assist_hospital_id") || runtimeConfig.assistHospitalId);
  const apiBaseUrl = ref(runtimeConfig.assistApiBase);

  const destyToken = ref(localStorage.getItem("desty_token") || "");
  const destyTenantId = ref(localStorage.getItem("desty_tenant_id") || "");
  const destyMasterWarehouseId = ref(localStorage.getItem("desty_master_warehouse_id") || "");

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

  async function loadDestyTokenAutomatically() {
    try {
      const result = await resolveDestyToken();
      if (result.token) {
        destyToken.value = result.token;
        destyTenantId.value = result.tenantId;
        destyMasterWarehouseId.value = result.masterWarehouseId;
        localStorage.setItem("desty_token", result.token);
        localStorage.setItem("desty_tenant_id", result.tenantId);
        localStorage.setItem("desty_master_warehouse_id", result.masterWarehouseId);
      }
    } catch (err) {
      console.error("Gagal memuat token Desty secara otomatis:", err);
    }
  }

  async function reloadAssistToken() {
    try {
      const result = await resolveAssistToken();
      if (result.token) {
        assistToken.value = result.token;
        localStorage.setItem("assist_token", result.token);
        return { success: true, token: result.token };
      }
      return { success: false, warnings: result.warnings };
    } catch (err) {
      console.error("Gagal reload token Assist:", err);
      return { success: false, error: err };
    }
  }

  async function reloadDestyToken() {
    try {
      const result = await resolveDestyToken();
      if (result.token) {
        destyToken.value = result.token;
        destyTenantId.value = result.tenantId;
        destyMasterWarehouseId.value = result.masterWarehouseId;
        localStorage.setItem("desty_token", result.token);
        localStorage.setItem("desty_tenant_id", result.tenantId);
        localStorage.setItem("desty_master_warehouse_id", result.masterWarehouseId);
        return { success: true, token: result.token };
      }
      return { success: false, warnings: result.warnings };
    } catch (err) {
      console.error("Gagal reload token Desty:", err);
      return { success: false, error: err };
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
    destyToken,
    destyTenantId,
    destyMasterWarehouseId,
    loadTokenAutomatically,
    loadDestyTokenAutomatically,
    reloadAssistToken,
    reloadDestyToken,
    saveConfig,
    getHeaders
  };
});
