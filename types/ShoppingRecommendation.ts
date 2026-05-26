export type ShoppingItemType = "prescription" | "akhp";

export type RecommendationStatusColor = "red" | "yellow" | "green";

export interface ShoppingRecommendationSettings {
  defaultLeadTime: number;
  cheapProductMaxPrice: number;
  fastMovingMinDailySales: number;
  cheapFastMovingLeadTime: number;
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

export interface ShoppingSalesAggregate {
  itemId: string;
  itemType: ShoppingItemType;
  itemName: string;
  qtySold: number;
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
}

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
  needsManualReview: boolean;
  isCappedDemand: boolean;
  isGoldenProduct: boolean;
  isDeadStock: boolean;
  manualReviewReason: string;
  observedTransactionUnits: string[];
  notes: string[];
}

export interface ShoppingRecommendationSettingsValidation {
  valid: boolean;
  reason: string;
}

export const DEFAULT_SHOPPING_RECOMMENDATION_SETTINGS: ShoppingRecommendationSettings =
  {
    defaultLeadTime: 3,
    cheapProductMaxPrice: 5000,
    fastMovingMinDailySales: 1,
    cheapFastMovingLeadTime: 5,
    targetStockDays: 7,
  };

export const DEFAULT_SHOPPING_ANALYTICS_THRESHOLDS: ShoppingAnalyticsThresholds =
  {
    cappedDemandMinOutOfStockDays: 3,
    cappedDemandMinGrowthPercent: 10,
    goldenProductMinProfitContribution: 100_000,
    deadStockMinDaysRemaining: 60,
    deadStockMaxDailySales: 0.1,
  };
