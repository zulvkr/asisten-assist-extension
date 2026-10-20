export type PriceSessionMode = "faktur" | "sold" | "all";

export interface PriceRangeTier {
  id: string;
  minPrice: number;
  maxPrice: number | null;
  marginPercent: number;
  minBuyQty: number;
}

export interface MarketplacePricingConfig {
  adminPercent: number;
  adminFixedPerTx: number;
  basePriceSource: "buyPrice" | "sellPrice";
  rounding: number;
  tiers: PriceRangeTier[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface DestyPriceWarehousePrice {
  externalWarehouseId: string;
  externalWarehouseName: string;
  isDefault: boolean;
  price: number;
}

export interface DestyPriceBindItem {
  publishSkuId: string;
  externalSkuId: string;
  productName: string;
  platformName: string;
  shopName: string;
  externalShopId: string;
  shopId: string;
  masterSku: string;
  price?: number | null;
  priceUom?: string | null;
  variantName?: string | null;
  enableEdit?: boolean;
  warehousePrices?: DestyPriceWarehousePrice[];
}

export interface DestyPriceRecord {
  skuId: string;
  spuId: string;
  productName: string;
  masterSku: string;
  variantName?: string | null;
  imageUrl?: string;
  salesPrice: number;
  salesPriceUom?: string | null;
  createTime?: number;
  updateTime?: number;
  spuMainImageUrl?: string;
  isBundleProduct?: boolean;
  barcode?: string | null;
  bindList?: DestyPriceBindItem[];
}

export interface SalesVelocityItemInfo {
  onlineSoldQty: number;
  onlineOrderCount: number;
  totalSoldQty: number;
  totalOrderCount: number;
  lastOnlineOrderDate?: string | null;
  safetyLevel: "safe" | "moderate" | "caution";
  safetyLabel: string;
  safetyReason: string;
}

export interface PriceTableRowItem {
  rowKey: string;
  destySkuId?: string;
  destyMasterSku: string;
  destyProductName?: string;
  destyCurrentPrice: number | null;
  bindList: DestyPriceBindItem[];

  assistItemId?: string;
  assistCode: string;
  assistProductName?: string;
  assistUnitName?: string;
  conversionFactor: number;
  isMapped: boolean;
  mappingSource?: "override" | "direct_sku" | "unmapped";

  // Assist Base info (harga beli terakhir & jual offline)
  assistBuyPrice: number; // Harga beli terakhir (HPP)
  assistSellPrice: number;
  fakturUnitPrice?: number | null;
  baseCost: number;

  // Formula applied
  appliedTier?: PriceRangeTier | null;
  appliedMarginPercent: number;
  appliedMinBuyQty: number;
  calculatedPrice: number;

  // Offline Assist Comparison (adjusted for unit conversion)
  assistOfflinePrice: number;
  assistOfflineMarginPercent: number;
  convertedCost: number; // baseCost * conversionFactor

  // Margin Analysis
  destyCurrentMarginNominal?: number | null;
  destyCurrentMarginPercent?: number | null;
  targetMarginNominal: number;
  targetMarginPercent: number;

  // Final Target Price
  targetPrice: number;
  isCustomPrice: boolean;
  priceDifference: number;
  percentDifference: number;

  // Sales History & Price Increase Safety
  salesVelocity?: SalesVelocityItemInfo;
  soldQtyOnDate?: number;

  checked: boolean;
  status: "idle" | "ready" | "pending" | "success" | "error" | "unmapped";
  statusMessage?: string;
  successChannelsCount?: number;
}

export interface FetchDestyPriceListOptions {
  token: string;
  tenantId?: string;
  searchParam?: string;
  current?: number;
  size?: number;
  fetchAll?: boolean;
}

export interface FetchDestyPriceListResult {
  records: DestyPriceRecord[];
  total: number;
  pages: number;
}

export interface UpdateDestyMasterPriceParams {
  token: string;
  tenantId?: string;
  skuId: string;
  price: number | string;
}

export interface UpdateDestyMasterPriceResult {
  successCount: number;
  errorCount: number;
  errorMessages: string[];
}
