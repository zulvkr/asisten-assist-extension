export type CatalogItemType = "prescription" | "akhp";

export interface CanonicalOrderItem {
  sku: string;
  destySku?: string;
  productName: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
}

export interface CanonicalOrder {
  orderId: string;
  externalOrderSn: string;
  marketplaceOrderSn?: string;
  bookingSn?: string;
  trackingNumber?: string;
  platformName: string;
  totalSales: number;
  netSettlement?: number;
  createdAt?: string;
  deliveryDeadline?: string;
  items: CanonicalOrderItem[];
  raw?: unknown;
}

export interface CanonicalCatalogItem {
  id: string;
  code: string;
  name: string;
  type: CatalogItemType;
  unit?: string;
  depotId?: string;
  stock?: number;
  sellNormalFee?: number;
  buyFee?: number;
  avgHPP?: number;
}

export interface CanonicalStockBalance {
  sku: string;
  skuId?: string;
  warehouseId?: string;
  physicalStock: number | null;
  availableStock: number | null;
  reservedStock: number | null;
  productName?: string;
  raw?: unknown;
}

export interface StockDeductionCommand {
  sku: string;
  skuId: string;
  warehouseId: string;
  deltaQuantity: number;
  reason?: string;
}

export interface SkuMappingEntity {
  destySku: string;
  assistCode: string;
  assistType: CatalogItemType;
  assistId: string;
  assistName: string;
  destyUnit?: string;
  assistUnit?: string;
  depotId?: string;
  conversionFactor: number;
  active: boolean;
  updatedAt?: string;
}

export interface CanonicalSaleItemCommand {
  assistItemId: string;
  assistCode: string;
  assistName: string;
  type: CatalogItemType;
  quantity: number;
  unit?: string;
  depotId: string;
  hospitalId: string;
  baseFee: number;
  totalFee: number;
}

export interface CanonicalSaleCommand {
  orderId: string;
  externalOrderSn: string;
  platformName: string;
  hospitalId: string;
  accountTxId: string;
  transactionAccountTxId?: string;
  patientName: string;
  paidFee: number;
  totalFee: number;
  dryRun?: boolean;
  items: CanonicalSaleItemCommand[];
  rawOrder?: CanonicalOrder;
}
