import { defineStore } from "pinia";
import { ref } from "vue";
import { resolveAssistToken } from "@/composables/assistTokenManager";
import { resolveDestyToken } from "@/composables/destyOmniTokenManager";
import { runtimeConfig } from "@/config/runtimeConfig";
import {
  fetchMarginMappings,
  upsertMarginItem,
  batchUpsertMarginItems,
  type MarginMappingItem,
} from "@/services/marginStorage";

const DEFAULT_ASSIST_ACCOUNT_TX_ID = "68b6f3bea945e5b08b004236";

export const useAssistStore = defineStore("assist", () => {
  const assistToken = ref(localStorage.getItem("assist_token") || "");
  const hospitalId = ref(localStorage.getItem("assist_hospital_id") || runtimeConfig.assistHospitalId);
  const apiBaseUrl = ref(runtimeConfig.assistApiBase);
  const assistAccountTxId = ref(
    localStorage.getItem("assist_account_tx_id") || DEFAULT_ASSIST_ACCOUNT_TX_ID,
  );
  const developerMode = ref(localStorage.getItem("settings:developerMode") === "true");

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

  function saveAssistSalesConfig(accountTxId: string) {
    assistAccountTxId.value = accountTxId.trim();
    localStorage.setItem("assist_account_tx_id", assistAccountTxId.value);
    browser.storage.local.set({ assistAccountTxId: assistAccountTxId.value }).catch(() => undefined);
  }

  function saveDeveloperMode(enabled: boolean) {
    developerMode.value = enabled;
    localStorage.setItem("settings:developerMode", String(enabled));
    browser.storage.local.set({ "settings:developerMode": enabled }).catch(() => undefined);
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
  const googleAppsScriptUrl = ref(localStorage.getItem("google_apps_script_url") || "");
  const googleAppsScriptToken = ref(localStorage.getItem("google_apps_script_token") || "");

  async function fetchMarginData() {
    try {
      const { rows } = await fetchMarginMappings();
      marginData.value = rows;
      // Keep window.marginData synchronized for content script access
      window.marginData = rows;
    } catch (err) {
      console.error("Gagal memuat data margin dari Firestore:", err);
    }
  }

  function saveAppsScriptConfig(urlStr: string, tokenStr: string) {
    googleAppsScriptUrl.value = urlStr.trim();
    googleAppsScriptToken.value = tokenStr.trim();
    localStorage.setItem("google_apps_script_url", googleAppsScriptUrl.value);
    localStorage.setItem("google_apps_script_token", googleAppsScriptToken.value);
  }

  async function upsertMargin(kodeObat: string, namaObat: string, marginObat: string) {
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

    // 2. Perform Firestore call
    try {
      await upsertMarginItem({
        kodeAssist: kodeObat,
        nama: namaObat,
        margin: marginObat,
      });
      return { success: true };
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

    // 2. Perform Firestore call
    try {
      await upsertMarginItem({
        kodeAssist: kodeObat,
        nama: namaObat,
        sku: sku,
      });
      return { success: true };
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
    return syncNamesWithFirestore();
  }

  async function syncNamesWithFirestore() {
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

    // 3. Update existing items in Firestore
    const { items: existingItems } = await fetchMarginMappings();
    const existingMap = new Map(existingItems.map(item => [item.kodeAssist.toUpperCase(), item]));
    
    const itemsToUpdate: MarginMappingItem[] = [];
    for (const assistItem of itemsToSync) {
      const key = assistItem.kodeObat.toUpperCase();
      const existing = existingMap.get(key);
      if (existing) {
        if (existing.nama !== assistItem.namaObat) {
          itemsToUpdate.push({
            ...existing,
            nama: assistItem.namaObat,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        itemsToUpdate.push({
          kodeAssist: assistItem.kodeObat,
          nama: assistItem.namaObat,
          margin: "",
          sku: "",
          updatedAt: new Date().toISOString()
        });
      }
    }

    if (itemsToUpdate.length > 0) {
      await batchUpsertMarginItems(itemsToUpdate);
    }

    // 4. Reload local marginData cache
    await fetchMarginData();

    return {
      success: true,
      message: `Berhasil sinkronisasi ${itemsToUpdate.length} nama barang ke Firestore.`,
      updatedCount: itemsToUpdate.length
    };
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
    assistAccountTxId,
    developerMode,
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
    saveAssistSalesConfig,
    saveDeveloperMode,
    getHeaders,
    fetchMarginData,
    saveAppsScriptConfig,
    upsertMargin,
    upsertSku,
    syncNamesWithGoogleSheets,
    syncNamesWithFirestore,
    saveComparisonSettings
  };
});
