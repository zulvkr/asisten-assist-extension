export type ShoppingItemType = "prescription" | "akhp";

export type RecommendationStatusColor = "red" | "yellow" | "green";

export interface ShoppingRecommendationSettings {
  defaultLeadTime: number;
  cheapProductMaxPrice: number;
  fastMovingMinDailySales: number;
  cheapFastMovingLeadTime: number;
  targetStockDays: number;
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
}

export interface ShoppingRecommendationRow {
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
  qtySold30Days: number;
  averageDailySales: number;
  estimatedDaysRemaining: number;
  leadTimeLimit: number;
  targetStock: number;
  calculatedSuggestedQty: number;
  statusColor: RecommendationStatusColor;
  isDormant: boolean;
  needsManualReview: boolean;
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
