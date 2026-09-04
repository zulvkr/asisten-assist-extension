export type AssistCatalogType = "prescription" | "akhp";

export interface DestySkuMapping {
  destySku: string;
  assistCode: string;
  assistType: AssistCatalogType;
  assistId: string;
  assistName: string;
  destyUnit?: string;
  assistUnit?: string;
  /** Optional local override when the catalog exposes more than one depot. */
  depotId?: string;
  conversionFactor: number;
  active: boolean;
  updatedAt: string;
}

export type DestySkuMappingInput = Omit<DestySkuMapping, "updatedAt"> & {
  updatedAt?: string;
};

export interface DestySheetSkuFallback {
  destySku: string;
  assistCode: string;
  assistName: string;
}

export interface NormalizedDestyOrderItem {
  destySku: string;
  productName: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
}

export interface NormalizedDestyOrder {
  orderId: string;
  marketplaceOrderSn: string;
  bookingSn: string;
  trackingNumber: string;
  platformName: string;
  totalSales: number;
  netSettlement?: number;
  createdAt?: string;
  deliveryDeadline?: string;
  items: NormalizedDestyOrderItem[];
  raw: unknown;
}

export interface AssistCatalogItem {
  id: string;
  code: string;
  name: string;
  type: AssistCatalogType;
  unit?: string;
  depotId?: string;
  stock?: number;
  sellNormalFee?: number;
}

export interface AssistDepot {
  id: string;
  name: string;
  stock?: number;
}

export interface DestyOrderValidationIssue {
  code:
    | "unmapped-sku"
    | "missing-assist-item"
    | "missing-depot"
    | "insufficient-stock"
    | "duplicate-order"
    | "price-mismatch"
    | "invalid-quantity"
    | "invalid-conversion-factor"
    | "missing-order-number";
  message: string;
  sku?: string;
  quantity?: number;
}

export interface DestyOrderValidationContext {
  mappings: DestySkuMapping[];
  assistCatalog?: AssistCatalogItem[];
  stockByAssistId?: Record<string, number | null | undefined>;
  depotByAssistId?: Record<string, string | null | undefined>;
  defaultDepotId?: string;
  duplicateOrderNumbers?: Iterable<string>;
  expectedTotal?: number;
  priceMismatchThreshold?: number;
}

export interface DestyOrderValidationResult {
  valid: boolean;
  issues: DestyOrderValidationIssue[];
  mappedItems: Array<{
    orderItem: NormalizedDestyOrderItem;
    mapping: DestySkuMapping;
    assistQuantity: number;
  }>;
}

export interface DestyImportLedgerEntry {
  marketplaceOrderSn: string;
  bookingSn?: string;
  trackingNumber?: string;
  platformName?: string;
  status: "success" | "failed" | "duplicate" | "dry-run" | "voided";
  txId?: string;
  invoice?: string;
  error?: string;
  importedAt: string;
  updatedAt: string;
}
