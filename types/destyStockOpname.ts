import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";

export type SoSessionMode = "shift" | "faktur" | "all";
export type AdjustMode = "Add" | "Min" | "Set";

export type InferredShiftType = "pagi" | "siang" | "semua";

export interface InferredShiftOption {
  label: string;
  value: InferredShiftType;
  startHour?: number;
  endHour?: number;
  description?: string;
}

export interface AssistRestockInvoiceItem {
  name: string;
  quantity: number;
  unit?: string;
  code?: string;
  medicineId?: string;
  akhpId?: string;
  buyFee?: number;
}

export interface AssistRestockInvoice {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  receivedDate: string;
  itemCount: number;
  totalFee: number;
  items: AssistRestockInvoiceItem[];
}

export interface SoTableRowItem {
  rowKey: string;
  assistItemId: string;
  assistItemType: "prescription" | "akhp";
  assistCode: string;
  assistItemName: string;
  assistUnit: string;
  assistStock: number | null;

  destySku: string;
  destyUnit: string;
  conversionFactor: number;
  isMapped: boolean;

  // Specific quantities
  offlineQty: number;
  onlineQty: number;
  receivedQty: number;

  // Desty live stock
  destyStockFound: boolean;
  destySkuId?: string;
  destyWarehouseId?: string;
  destyProductName?: string;
  destyFisik: number | null;
  destyReserved: number;
  destyTersedia: number | null;

  // Adjustment calculation
  adjustMode: AdjustMode;
  adjustQty: number;
  calculatedFisikBaru: number | null;
  calculatedTersediaBaru: number | null;

  checked: boolean;

  // Status
  status: "ready" | "warning" | "unmapped" | "synced" | "error";
  statusMessage: string;
  badgeColor: string;
}

export interface QuickMappingFormData {
  destySku: string;
  destyUnit: string;
  assistCode: string;
  assistId: string;
  assistName: string;
  assistType: "prescription" | "akhp";
  assistUnit: string;
  conversionFactor: number;
}
