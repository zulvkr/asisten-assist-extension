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

  const marginData = ref<any[]>([]);
  const googleAppsScriptUrl = ref(localStorage.getItem("google_apps_script_url") || "https://script.google.com/macros/s/AKfycbzIyzsgsQNyGsB_3LrZ96xaFJugoshuNLAnarRBJj0Wk3nAwkGKfvzf17iYSrRa8wY/exec");
  const googleAppsScriptToken = ref(localStorage.getItem("google_apps_script_token") || "");

  async function fetchMarginData() {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${runtimeConfig.sheets.spreadsheetId}/values/${encodeURIComponent(
        runtimeConfig.sheets.range
      )}?key=${runtimeConfig.sheets.apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.values) {
        marginData.value = data.values;
        // Keep window.marginData synchronized for content script access
        window.marginData = data.values;
      }
    } catch (err) {
      console.error("Gagal memuat data margin dari Google Sheet:", err);
    }
  }

  function saveAppsScriptConfig(urlStr: string, tokenStr: string) {
    googleAppsScriptUrl.value = urlStr.trim();
    googleAppsScriptToken.value = tokenStr.trim();
    localStorage.setItem("google_apps_script_url", googleAppsScriptUrl.value);
    localStorage.setItem("google_apps_script_token", googleAppsScriptToken.value);
  }

  async function upsertMargin(kodeObat: string, namaObat: string, marginObat: string) {
    if (!googleAppsScriptUrl.value) {
      throw new Error("URL Google Apps Script belum dikonfigurasi di Pengaturan.");
    }
    if (!googleAppsScriptToken.value) {
      throw new Error("Security Token Google Apps Script belum dikonfigurasi di Pengaturan.");
    }

    // 1. Optimistic Update (Locally save prev value for rollback)
    const existingIndex = marginData.value.findIndex(row => row[0] === kodeObat);
    let prevVal = "";
    let isNew = false;
    if (existingIndex !== -1) {
      prevVal = marginData.value[existingIndex][2];
      marginData.value[existingIndex][2] = marginObat;
    } else {
      isNew = true;
      marginData.value.push([kodeObat, namaObat, marginObat, "", "", ""]);
    }
    window.marginData = [...marginData.value];

    // 2. Perform API call
    try {
      const response = await fetch(googleAppsScriptUrl.value, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          token: googleAppsScriptToken.value,
          action: "upsertMargin",
          kodeObat,
          namaObat,
          marginObat
        })
      });

      if (!response.ok) {
        throw new Error(`Apps Script returned status ${response.status}`);
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.message || "Gagal menyimpan margin.");
      }
      return resData;
    } catch (err) {
      // 3. Rollback on failure
      const rollbackIndex = marginData.value.findIndex(row => row[0] === kodeObat);
      if (rollbackIndex !== -1) {
        if (isNew) {
          marginData.value.splice(rollbackIndex, 1);
        } else {
          marginData.value[rollbackIndex][2] = prevVal;
        }
      }
      window.marginData = [...marginData.value];
      throw err;
    }
  }

  async function upsertSku(kodeObat: string, namaObat: string, sku: string) {
    if (!googleAppsScriptUrl.value) {
      throw new Error("URL Google Apps Script belum dikonfigurasi di Pengaturan.");
    }
    if (!googleAppsScriptToken.value) {
      throw new Error("Security Token Google Apps Script belum dikonfigurasi di Pengaturan.");
    }

    // 1. Optimistic Update
    const existingIndex = marginData.value.findIndex(row => row[0] === kodeObat);
    let prevVal = "";
    let isNew = false;
    if (existingIndex !== -1) {
      prevVal = marginData.value[existingIndex][5];
      marginData.value[existingIndex][5] = sku;
    } else {
      isNew = true;
      marginData.value.push([kodeObat, namaObat, "", "", "", sku]);
    }
    window.marginData = [...marginData.value];

    // 2. Perform API call
    try {
      const response = await fetch(googleAppsScriptUrl.value, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          token: googleAppsScriptToken.value,
          action: "upsertSku",
          kodeObat,
          namaObat,
          sku
        })
      });

      if (!response.ok) {
        throw new Error(`Apps Script returned status ${response.status}`);
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.message || "Gagal menyimpan pemetaan SKU.");
      }
      return resData;
    } catch (err) {
      // 3. Rollback
      const rollbackIndex = marginData.value.findIndex(row => row[0] === kodeObat);
      if (rollbackIndex !== -1) {
        if (isNew) {
          marginData.value.splice(rollbackIndex, 1);
        } else {
          marginData.value[rollbackIndex][5] = prevVal;
        }
      }
      window.marginData = [...marginData.value];
      throw err;
    }
  }

  async function syncNamesWithGoogleSheets() {
    if (!googleAppsScriptUrl.value) {
      throw new Error("URL Google Apps Script belum dikonfigurasi di Pengaturan.");
    }
    if (!googleAppsScriptToken.value) {
      throw new Error("Security Token Google Apps Script belum dikonfigurasi di Pengaturan.");
    }
    if (!assistToken.value) {
      throw new Error("Token Assist belum terdeteksi. Silakan segarkan token di header.");
    }

    const itemsToSync: Array<{ kodeObat: string; namaObat: string }> = [];

    // 1. Fetch Medicines (Obat)
    let obatSkip = 0;
    const obatLimit = 1000;
    let obatTotal = Number.POSITIVE_INFINITY;
    while (obatSkip < obatTotal) {
      const url = `${apiBaseUrl.value}/KMedicineStocks/getItemsWithExpiredDate?hospitalId=${hospitalId.value}&skip=${obatSkip}&limit=${obatLimit}`;
      const res = await fetch(url, {
        method: "GET",
        headers: getHeaders()
      });
      if (!res.ok) {
        throw new Error(`Gagal mengambil data obat dari Assist: HTTP ${res.status}`);
      }
      const payload = await res.json();
      const data = payload.data || [];
      for (const row of data) {
        if (row.code) {
          itemsToSync.push({
            kodeObat: row.code.trim(),
            namaObat: (row.medName || "").trim()
          });
        }
      }
      const resolvedTotal = Number(payload.total ?? data.length);
      obatTotal = Number.isFinite(resolvedTotal) ? resolvedTotal : data.length;
      if (data.length < obatLimit) break;
      obatSkip += obatLimit;
    }

    // 2. Fetch BHP
    let bhpSkip = 0;
    const bhpLimit = 1000;
    let bhpTotal = Number.POSITIVE_INFINITY;
    while (bhpSkip < bhpTotal) {
      const url = `${apiBaseUrl.value}/KAKHPStocks/getList?hospitalId=${hospitalId.value}&fieldName=itemName&sort=1&skip=${bhpSkip}&limit=${bhpLimit}`;
      const res = await fetch(url, {
        method: "GET",
        headers: getHeaders()
      });
      if (!res.ok) {
        throw new Error(`Gagal mengambil data BHP dari Assist: HTTP ${res.status}`);
      }
      const payload = await res.json();
      const data = payload.data || [];
      for (const row of data) {
        if (row.code) {
          itemsToSync.push({
            kodeObat: row.code.trim(),
            namaObat: (row.itemName || "").trim()
          });
        }
      }
      const resolvedTotal = Number(payload.total ?? data.length);
      bhpTotal = Number.isFinite(resolvedTotal) ? resolvedTotal : data.length;
      if (data.length < bhpLimit) break;
      bhpSkip += bhpLimit;
    }

    if (itemsToSync.length === 0) {
      throw new Error("Tidak ada item obat atau BHP yang ditemukan untuk disinkronkan.");
    }

    // 3. Send bulkSyncNames to Google Apps Script
    const response = await fetch(googleAppsScriptUrl.value, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        token: googleAppsScriptToken.value,
        action: "bulkSyncNames",
        items: itemsToSync
      })
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script returned status ${response.status}`);
    }

    const resData = await response.json();
    if (!resData.success) {
      throw new Error(resData.message || "Gagal sinkronisasi nama ke Google Sheet.");
    }

    // 4. Reload local marginData cache
    await fetchMarginData();

    return resData;
  }

  const excludedDestySkuPrefixes = ref(localStorage.getItem("settings:excludedDestySkuPrefixes") || "ISA-");

  function saveComparisonSettings(prefixes: string) {
    excludedDestySkuPrefixes.value = prefixes.trim();
    localStorage.setItem("settings:excludedDestySkuPrefixes", excludedDestySkuPrefixes.value);
    browser.storage.local.set({ "settings:excludedDestySkuPrefixes": excludedDestySkuPrefixes.value }).catch(err => {
      console.error("Gagal menyimpan ke browser storage:", err);
    });
  }

  return {
    assistToken,
    hospitalId,
    apiBaseUrl,
    destyToken,
    destyTenantId,
    destyMasterWarehouseId,
    marginData,
    googleAppsScriptUrl,
    googleAppsScriptToken,
    excludedDestySkuPrefixes,
    loadTokenAutomatically,
    loadDestyTokenAutomatically,
    reloadAssistToken,
    reloadDestyToken,
    saveConfig,
    getHeaders,
    fetchMarginData,
    saveAppsScriptConfig,
    upsertMargin,
    upsertSku,
    syncNamesWithGoogleSheets,
    saveComparisonSettings
  };
});
