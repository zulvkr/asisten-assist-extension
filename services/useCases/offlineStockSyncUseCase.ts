import type { PemasukanData } from "@/types/PemasukanData";
import type { DestySkuMapping, AssistCatalogItem } from "@/types/destySync";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";
import type {
  OfflineSoldItem,
  OfflineSaleReductionItem,
  OfflineStockSyncLog,
} from "@/types/offlineStockSync";
import { DestyHttpClient } from "@/services/clients/destyHttpClient";
import { toDestyOnHandEditPayload } from "@/adapters/desty/destyStockAdapter";
import { DEFAULT_DESTY_MASTER_WAREHOUSE_ID } from "@/config/destyConfig";

const ALLOWED_ITEM_TYPES = new Set(["prescription", "akhp", "scourPrescription"]);
const MARKETPLACE_KEYWORDS = [
  "shopee",
  "tiktok",
  "tokopedia",
  "tokped",
  "blibli",
  "goapotik",
  "marketplace",
];

/** Pure Domain Logic: Checks if an Assist transaction is an online/marketplace sale */
export function isOnlineTransaction(tx: PemasukanData): boolean {
  if (!tx) return false;

  const paidName = (tx.paidName || "").trim().toLowerCase();
  if (
    paidName.startsWith("desty|") ||
    paidName.startsWith("desty ") ||
    paidName.includes("platform=") ||
    paidName.includes("order=") ||
    paidName.includes("booking=")
  ) {
    return true;
  }

  const payments = Array.isArray(tx.Payments) ? tx.Payments : [];
  for (const p of payments) {
    const raw = `${p.type ?? ""} ${p.name ?? ""} ${p.intent ?? ""} ${p.reason ?? ""}`.toLowerCase();
    if (MARKETPLACE_KEYWORDS.some((kw) => raw.includes(kw))) {
      return true;
    }
  }

  const patientName = (tx.Patient?.name || tx.Patient?.nama || "").toLowerCase();
  if (MARKETPLACE_KEYWORDS.some((kw) => patientName.includes(kw))) {
    return true;
  }

  return false;
}

/** Pure Domain Logic: Aggregates offline sold items from Assist transactions */
export function aggregateOfflineSoldItems(
  transactions: PemasukanData[],
  options: { includeOnlyPaidOff?: boolean; excludeOnline?: boolean } = {},
): { soldItems: OfflineSoldItem[]; skippedOnlineCount: number } {
  const includeOnlyPaidOff = options.includeOnlyPaidOff ?? true;
  const excludeOnline = options.excludeOnline ?? true;

  const grouped = new Map<string, OfflineSoldItem>();
  let skippedOnlineCount = 0;

  for (const tx of transactions) {
    if (includeOnlyPaidOff && tx.status !== "paid off") continue;
    if (excludeOnline && isOnlineTransaction(tx)) {
      skippedOnlineCount++;
      continue;
    }

    const items = Array.isArray(tx.Items) ? tx.Items : [];
    for (const item of items) {
      if (!ALLOWED_ITEM_TYPES.has(item.type)) continue;

      const itemType: "prescription" | "akhp" = item.type === "akhp" ? "akhp" : "prescription";
      const assistItemId = (itemType === "akhp" ? item.akhpId : item.medicineId)?.trim() || "";
      const assistItemName = (item.name || "").trim() || "Item Tanpa Nama";
      const assistCode = (item.code || "").trim();
      const assistUnit = (item.unit || "Pcs").trim();
      const quantity = Number(item.quantity) || 0;

      if (quantity <= 0) continue;

      const groupKey = assistItemId || `__name__::${assistItemName}`;
      const existing = grouped.get(groupKey);

      if (existing) {
        existing.offlineQty += quantity;
      } else {
        grouped.set(groupKey, {
          assistItemId,
          assistItemType: itemType,
          assistCode,
          assistItemName,
          assistUnit,
          offlineQty: quantity,
        });
      }
    }
  }

  return {
    soldItems: Array.from(grouped.values()).sort(
      (a, b) => b.offlineQty - a.offlineQty || a.assistItemName.localeCompare(b.assistItemName),
    ),
    skippedOnlineCount,
  };
}

export interface ExecuteReductionOptions {
  items: OfflineSaleReductionItem[];
  destyToken: string;
  destyTenantId?: string;
  defaultWarehouseId?: string;
  destyClient?: DestyHttpClient;
  onProgress?: (progress: {
    current: number;
    total: number;
    success: number;
    failed: number;
    log: OfflineStockSyncLog;
  }) => void;
}

/**
 * Single Responsibility Use Case: Dispatches stock reductions to Desty via DestyHttpClient.
 */
export async function executeStockReductionsUseCase(
  options: ExecuteReductionOptions,
): Promise<{
  successCount: number;
  failedCount: number;
  results: Record<string, { status: "success" | "error"; message?: string }>;
}> {
  const {
    items,
    destyToken,
    destyTenantId,
    defaultWarehouseId = DEFAULT_DESTY_MASTER_WAREHOUSE_ID,
    onProgress,
  } = options;

  const client =
    options.destyClient ??
    new DestyHttpClient({
      token: destyToken,
      tenantId: destyTenantId,
    });

  const results: Record<string, { status: "success" | "error"; message?: string }> = {};
  let successCount = 0;
  let failedCount = 0;

  const emitLog = (current: number, text: string, type: OfflineStockSyncLog["type"] = "info") => {
    onProgress?.({
      current,
      total: items.length,
      success: successCount,
      failed: failedCount,
      log: {
        text,
        type,
        time: new Date().toLocaleTimeString("id-ID", { hour12: false }),
      },
    });
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const currentIndex = i + 1;

    if (!item.destySkuId) {
      failedCount++;
      results[item.rowKey] = { status: "error", message: "skuId Desty tidak ditemukan" };
      emitLog(currentIndex, `[GAGAL] ${item.destySku}: skuId Desty tidak ditemukan.`, "error");
      continue;
    }

    const amount = -Math.abs(item.reductionQty);
    emitLog(
      currentIndex,
      `[SYNC] Mengurangi ${item.destySku} (${item.assistItemName}) sebesar ${amount} ${item.destyUnit}...`,
      "info",
    );

    try {
      const payload = toDestyOnHandEditPayload({
        sku: item.destySku,
        skuId: item.destySkuId,
        warehouseId: item.destyWarehouseId || defaultWarehouseId,
        deltaQuantity: item.reductionQty,
      });

      await client.editOnHand(payload);

      successCount++;
      results[item.rowKey] = { status: "success" };
      emitLog(
        currentIndex,
        `[BERHASIL] ${item.destySku} berhasil dikurangi ${amount} ${item.destyUnit}.`,
        "success",
      );
    } catch (err: any) {
      failedCount++;
      const errMsg = err?.message || "Gagal mengubah stok fisik";
      results[item.rowKey] = { status: "error", message: errMsg };
      emitLog(currentIndex, `[GAGAL] ${item.destySku}: ${errMsg}`, "error");
    }
  }

  return { successCount, failedCount, results };
}
