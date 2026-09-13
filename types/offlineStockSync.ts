import type { DestySkuMapping } from "./destySync";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";

export interface OfflineSoldItem {
  assistItemId: string;
  assistItemType: "prescription" | "akhp";
  assistCode: string;
  assistItemName: string;
  assistUnit: string;
  offlineQty: number;
}

export interface OfflineSaleReductionItem {
  rowKey: string;
  assistItemId: string;
  assistItemType: "prescription" | "akhp";
  assistCode: string;
  assistItemName: string;
  assistUnit: string;
  offlineQty: number;

  // Assist live / current stock
  assistStock: number | null;

  destySku: string;
  destyUnit: string;
  conversionFactor: number;
  isMapped: boolean;

  // Desty live stock
  destyStockFound: boolean;
  destySkuId?: string;
  destyWarehouseId?: string;
  destyProductName?: string;
  destyFisik: number | null;
  destyReserved: number;
  destyTersedia: number | null;

  // SO calculation
  qtyDesty: number;
  reductionQty: number;
  calculatedFisikBaru: number | null;
  calculatedTersediaBaru: number | null;

  checked: boolean;

  // Status
  status: "ready" | "warning" | "unmapped" | "synced" | "error";
  statusMessage: string;
  badgeColor: string;
}

export interface OfflineStockSyncLog {
  text: string;
  type: "info" | "success" | "warning" | "error";
  time: string;
}

export interface OfflineStockSyncProgress {
  total: number;
  current: number;
  success: number;
  failed: number;
  logs: OfflineStockSyncLog[];
  isSyncing: boolean;
}
