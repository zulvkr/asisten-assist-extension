export type ShoppingItemType = "prescription" | "akhp";

export type RecommendationStatusColor = "red" | "yellow" | "green";

export interface ShoppingRecommendationSettings {
  defaultLeadTime: number;
  fastMovingMinDailySales: number;
  fastMovingLeadTime: number;
  fastMovingMinSalesEvents: number;
  targetStockDays: number;
}

export interface ShoppingAnalyticsThresholds {
  cappedDemandMinOutOfStockDays: number;
  cappedDemandMinGrowthPercent: number;
  goldenProductMinProfitContribution: number;
  deadStockMinDaysRemaining: number;
  deadStockMaxDailySales: number;
}

export interface ShoppingCatalogItem {
  itemId: string;
  itemType: ShoppingItemType;
  code: string;
  itemName: string;
  brandName: string;
  unit: string;
  stockTotal: number;
  buyFee: number | null;
  avgHpp: number | null;
  sellNormalFee: number | null;
}

export interface DailySalesRecord {
  date: string;
  qty: number;
  events: number;
}

export interface ShoppingSalesAggregate {
  itemId: string;
  itemType: ShoppingItemType;
  itemName: string;
  qtySold: number;
  salesEvents: number;
  dailySalesMap: Record<string, { qty: number; events: number }>;
  observedUnits: string[];
  firstSoldAt: string | null;
  lastSoldAt: string | null;
  lastKnownStockBefore: number | null;
  lastKnownStockAfter: number | null;
  lastObservedStockAt: string | null;
}

export interface StoredOutstandingOrder {
  itemId: string;
  itemName: string;
  itemType: ShoppingItemType;
  code: string;
  unit: string;
  quantity: number;
  buyFee: number | null;
  orderedAt: string;
  updatedAt: string;
  lastReconciledAt: string | null;
  leadTimeLimit?: number;
  expiresAt?: string;
}

export interface StoredStockSnapshot {
  itemId: string;
  stockTotal: number;
  recordedAt: string;
}

export interface MarkOutstandingOrderItem {
  itemId: string;
  itemName: string;
  itemType: ShoppingItemType;
  code: string;
  unit: string;
  quantity: number;
  buyFee: number | null;
  leadTimeLimit?: number;
}

export type DemandPatternType = "FastMoving" | "BulkSpike" | "DeadStock" | "Regular";

export interface ShoppingRecommendationRow {
  itemId: string;
  itemType: ShoppingItemType;
  code: string;
  itemName: string;
  brandName: string;
  unit: string;
  stockTotal: number;
  pendingOrderQty: number;
  effectiveStockTotal: number;
  buyFee: number | null;
  avgHpp: number | null;
  sellNormalFee: number | null;
  qtySold30Days: number;
  salesEvents: number;
  eventDailyVelocity: number;
  trueEventVelocity: number;
  avgUnitsPerTransaction: number;
  effectiveDailyVelocity: number;
  activeDays: number;
  averageDailySales: number;
  trueVelocity: number;
  estimatedOutOfStockDays: number;
  estimatedDemandConstraintDays: number;
  estimatedDaysRemaining: number;
  effectiveDaysRemaining: number;
  leadTimeLimit: number;
  targetStock: number;
  replenishSuggestedQty: number;
  growthSuggestedQty: number;
  calculatedSuggestedQty: number;
  potentialIncomeLoss: number;
  potentialSalesGrowthPercent: number;
  growthRecommendationNote: string;
  statusColor: RecommendationStatusColor;
  isDormant: boolean;
  isFastMoving: boolean;
  isBulkSpike: boolean;
  demandPattern: DemandPatternType;
  needsManualReview: boolean;
  isCappedDemand: boolean;
  isGoldenProduct: boolean;
  isDeadStock: boolean;
  manualReviewReason: string;
  hasUnitHistoryWarning: boolean;
  unitHistoryWarning: string;
  observedTransactionUnits: string[];
  notes: string[];
  rop: number;
  dailySalesTrend: DailySalesRecord[];
}

export interface ShoppingRecommendationSettingsValidation {
  valid: boolean;
  reason: string;
}

export const DEFAULT_SHOPPING_RECOMMENDATION_SETTINGS: ShoppingRecommendationSettings =
  {
    defaultLeadTime: 3,
    fastMovingMinDailySales: 0.1,
    fastMovingLeadTime: 6,
    fastMovingMinSalesEvents: 3,
    targetStockDays: 30,
  };

export const DEFAULT_SHOPPING_ANALYTICS_THRESHOLDS: ShoppingAnalyticsThresholds =
  {
    cappedDemandMinOutOfStockDays: 3,
    cappedDemandMinGrowthPercent: 10,
    goldenProductMinProfitContribution: 100_000,
    deadStockMinDaysRemaining: 60,
    deadStockMaxDailySales: 0.1,
  };

// Supplier Price Comparison DTOs
export interface SupplierPriceComparisonDto {
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  lowestNetPrice: number;
  latestNetPrice: number;
  averageNetPrice: number;
  lastPurchasedDate: string;
  totalQuantityPurchased: number;
  purchaseCount: number;
  isCheapest: boolean;
  priceDifferencePercent: number;
}

export interface ProductPurchaseRecordDto {
  transactionId: string;
  invoiceNumber: string;
  receivedDate: string;
  supplierId?: string;
  supplierName: string;
  batchNumber?: string;
  expiryDate?: string;
  quantity: number;
  unitName?: string;
  buyPrice: number;
  netUnitPrice: number;
  discountPercent?: number;
  subtotal: number;
}

export interface ProductPurchaseHistoryResponse {
  itemId: string;
  itemName: string;
  code: string;
  unitName: string;
  currentBuyPrice: number | null;
  lowestNetPrice: number | null;
  cheapestSupplierName: string | null;
  latestNetPrice: number | null;
  latestSupplierName: string | null;
  averageNetPrice: number | null;
  totalPurchasedQuantity: number;
  totalTransactions: number;
  supplierComparisons: SupplierPriceComparisonDto[];
  historyRecords: ProductPurchaseRecordDto[];
}
