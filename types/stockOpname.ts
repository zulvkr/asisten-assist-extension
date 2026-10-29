export type StockOpnameStatus = "InProgress" | "Completed" | "Cancelled";

export type StockOpnameScope = "Full" | "PerShift";

export interface StockOpnameScopeDetails {
  shiftDate?: string;
  shiftType?: "pagi" | "siang" | "semua";
  shiftLabel?: string;
  itemCountSold?: number;
}

export interface StockOpnameSession {
  id: string;
  opnameNumber: string;
  status: StockOpnameStatus;
  scope: StockOpnameScope;
  scopeDetails?: StockOpnameScopeDetails;
  itemIdsFilter?: string[]; // Jika di-filter (misal PerShift), simpan daftar ID produk yang masuk sesi
  notes?: string;
  createdAt: string;
  createdBy: string;
  completedAt?: string;
  completedBy?: string;
  totalItems: number;
  countedItems: number;
  discrepancyCount: number;
  totalVariance: number;
}

export interface StockOpnameCountItem {
  countedQuantity: number;
  reason?: string;
  updatedAt: string;
  updatedBy: string;
}

export type StockOpnameCountsMap = Record<string, StockOpnameCountItem>;

export interface StockOpnameItemRow {
  id: string; // medOrAkhpId
  depotStockId: string; // ID baris di KStockDepots
  depotName: string;
  code: string;
  name: string;
  unit: string;
  itemValue: "medicine" | "akhp";
  systemQuantity: number;
  countedQuantity: number | null;
  variance: number | null;
  reason: string;
  isCounted: boolean;
}

export interface AssistRepairStockOpnameItem {
  type: "auditMinus" | "auditPlus";
  itemType: "prescription" | "akhp";
  medOrAkhpId: string;
  hospitalId: string;
  quantity: number; // bertanda: negatif jika minus, positif jika plus
  depotId: string; // depotStockId
  depotName: string;
  itemNotes: string;
  medOrAkhpName: string;
  itemValue: "medicine" | "akhp";
  itemName: string;
  itemCode: string;
  difference: number; // nilai absolut Math.abs(qtyAfter - qtyBefore)
  qtyAfter: number;
  qtyBefore: number;
}

export interface AssistRepairResponse {
  status: "success" | "error";
  listErrors?: Record<string, unknown>;
  listItemIds?: string[];
  message?: string;
}

export const DISCREPANCY_REASON_PRESETS = [
  "Selisih Fisik Opname",
  "Barang Rusak/Bocor",
  "Salah Input Resep/Kasir",
  "Kedaluwarsa/ED",
  "Retur Belum Tercatat",
  "Lainnya",
] as const;

export const DEFAULT_DISCREPANCY_REASON = "Selisih Fisik Opname";
