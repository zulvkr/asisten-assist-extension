import {
  DEFAULT_SHOPPING_RECOMMENDATION_SETTINGS,
  type RecommendationStatusColor,
  type ShoppingCatalogItem,
  type ShoppingRecommendationRow,
  type ShoppingRecommendationSettings,
  type ShoppingRecommendationSettingsValidation,
  type ShoppingSalesAggregate,
} from "@/types/ShoppingRecommendation";

interface BuildShoppingRecommendationRowsInput {
  catalogItems: ShoppingCatalogItem[];
  salesAggregates: ShoppingSalesAggregate[];
  settings?: Partial<ShoppingRecommendationSettings>;
  lookbackDays: number;
}

export function resolveShoppingRecommendationSettings(
  overrides: Partial<ShoppingRecommendationSettings> = {},
): ShoppingRecommendationSettings {
  return {
    defaultLeadTime: normalizePositiveNumber(
      overrides.defaultLeadTime,
      DEFAULT_SHOPPING_RECOMMENDATION_SETTINGS.defaultLeadTime,
    ),
    cheapProductMaxPrice: normalizeNonNegativeNumber(
      overrides.cheapProductMaxPrice,
      DEFAULT_SHOPPING_RECOMMENDATION_SETTINGS.cheapProductMaxPrice,
    ),
    fastMovingMinDailySales: normalizeNonNegativeNumber(
      overrides.fastMovingMinDailySales,
      DEFAULT_SHOPPING_RECOMMENDATION_SETTINGS.fastMovingMinDailySales,
    ),
    cheapFastMovingLeadTime: normalizePositiveNumber(
      overrides.cheapFastMovingLeadTime,
      DEFAULT_SHOPPING_RECOMMENDATION_SETTINGS.cheapFastMovingLeadTime,
    ),
    targetStockDays: normalizePositiveNumber(
      overrides.targetStockDays,
      DEFAULT_SHOPPING_RECOMMENDATION_SETTINGS.targetStockDays,
    ),
  };
}

export function validateShoppingRecommendationSettings(
  settings: ShoppingRecommendationSettings,
): ShoppingRecommendationSettingsValidation {
  if (settings.defaultLeadTime <= 0) {
    return {
      valid: false,
      reason: "Default lead time harus lebih dari 0.",
    };
  }

  if (settings.cheapFastMovingLeadTime <= 0) {
    return {
      valid: false,
      reason: "Lead time murah & cepat laku harus lebih dari 0.",
    };
  }

  if (settings.targetStockDays <= settings.defaultLeadTime) {
    return {
      valid: false,
      reason: "Target stok hari harus lebih besar dari default lead time.",
    };
  }

  if (settings.targetStockDays <= settings.cheapFastMovingLeadTime) {
    return {
      valid: false,
      reason:
        "Target stok hari harus lebih besar dari lead time murah & cepat laku.",
    };
  }

  return {
    valid: true,
    reason: "OK",
  };
}

export function normalizeObservedUnit(unit: string | undefined): string {
  return String(unit ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function buildShoppingRecommendationRows(
  input: BuildShoppingRecommendationRowsInput,
): ShoppingRecommendationRow[] {
  const settings = resolveShoppingRecommendationSettings(input.settings);
  const salesByItemId = new Map(
    input.salesAggregates.map((aggregate) => [aggregate.itemId, aggregate]),
  );
  const catalogByItemId = new Map(
    input.catalogItems.map((item) => [item.itemId, item]),
  );
  const itemIds = new Set<string>();

  for (const item of input.catalogItems) {
    if (item.stockTotal > 0) {
      itemIds.add(item.itemId);
    }
  }

  for (const aggregate of input.salesAggregates) {
    if (aggregate.qtySold > 0) {
      itemIds.add(aggregate.itemId);
    }
  }

  const rows: ShoppingRecommendationRow[] = [];

  for (const itemId of itemIds) {
    const catalogItem = catalogByItemId.get(itemId);
    const salesAggregate = salesByItemId.get(itemId);

    const qtySold30Days = Number(salesAggregate?.qtySold ?? 0);
    const averageDailySales =
      input.lookbackDays > 0 ? qtySold30Days / input.lookbackDays : 0;
    const stockTotal = Number(catalogItem?.stockTotal ?? 0);
    const observedUnits = Array.from(
      new Set((salesAggregate?.observedUnits ?? []).filter(Boolean)),
    );
    const needsManualReview = observedUnits.length > 1;
    const manualReviewReason = needsManualReview
      ? `Terjual dalam lebih dari satu unit: ${observedUnits.join(", ")}.`
      : "";
    const isDormant = qtySold30Days <= 0;
    const isCheap =
      typeof catalogItem?.buyFee === "number" &&
      catalogItem.buyFee <= settings.cheapProductMaxPrice;
    const isFastMoving = averageDailySales >= settings.fastMovingMinDailySales;
    const leadTimeLimit =
      isCheap && isFastMoving
        ? settings.cheapFastMovingLeadTime
        : settings.defaultLeadTime;
    const estimatedDaysRemaining = calculateEstimatedDaysRemaining(
      stockTotal,
      averageDailySales,
    );
    const targetStock = Math.ceil(averageDailySales * settings.targetStockDays);
    const calculatedSuggestedQty = needsManualReview
      ? 0
      : Math.max(0, targetStock - stockTotal);

    const notes: string[] = [];
    if (manualReviewReason) {
      notes.push(manualReviewReason);
    }
    if (isDormant) {
      notes.push("Tidak ada penjualan dalam 30 hari terakhir.");
    }
    if (!catalogItem?.code) {
      notes.push("Kode produk tidak tersedia dari Assist.");
    }
    if (catalogItem?.buyFee === null || catalogItem?.buyFee === undefined) {
      notes.push("Buy fee tidak tersedia dari payload stok Assist.");
    }

    rows.push({
      itemId,
      itemType:
        salesAggregate?.itemType ?? catalogItem?.itemType ?? "prescription",
      code: catalogItem?.code ?? "",
      itemName: catalogItem?.itemName ?? salesAggregate?.itemName ?? "Unknown",
      brandName: catalogItem?.brandName ?? "",
      unit: catalogItem?.unit ?? observedUnits[0] ?? "",
      stockTotal,
      buyFee: catalogItem?.buyFee ?? null,
      avgHpp: catalogItem?.avgHpp ?? null,
      sellNormalFee: catalogItem?.sellNormalFee ?? null,
      qtySold30Days,
      averageDailySales,
      estimatedDaysRemaining,
      leadTimeLimit,
      targetStock,
      calculatedSuggestedQty,
      statusColor: resolveStatusColor({
        estimatedDaysRemaining,
        leadTimeLimit,
        targetStockDays: settings.targetStockDays,
      }),
      isDormant,
      needsManualReview,
      manualReviewReason,
      observedTransactionUnits: observedUnits,
      notes,
    });
  }

  return rows.sort(compareShoppingRecommendationRows);
}

export function compareShoppingRecommendationRows(
  left: ShoppingRecommendationRow,
  right: ShoppingRecommendationRow,
): number {
  return (
    statusRank(left.statusColor) - statusRank(right.statusColor) ||
    right.calculatedSuggestedQty - left.calculatedSuggestedQty ||
    right.qtySold30Days - left.qtySold30Days ||
    left.itemName.localeCompare(right.itemName)
  );
}

function calculateEstimatedDaysRemaining(
  stockTotal: number,
  averageDailySales: number,
): number {
  if (averageDailySales <= 0) {
    return 9999;
  }

  if (stockTotal <= 0) {
    return 0;
  }

  return stockTotal / averageDailySales;
}

function resolveStatusColor(input: {
  estimatedDaysRemaining: number;
  leadTimeLimit: number;
  targetStockDays: number;
}): RecommendationStatusColor {
  if (input.estimatedDaysRemaining <= input.leadTimeLimit) {
    return "red";
  }

  const yellowUpperBound =
    input.leadTimeLimit >= input.targetStockDays
      ? input.leadTimeLimit + 3
      : input.targetStockDays;

  if (input.estimatedDaysRemaining <= yellowUpperBound) {
    return "yellow";
  }

  return "green";
}

function statusRank(statusColor: RecommendationStatusColor): number {
  switch (statusColor) {
    case "red":
      return 1;
    case "yellow":
      return 2;
    case "green":
      return 3;
    default:
      return 99;
  }
}

function normalizePositiveNumber(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function normalizeNonNegativeNumber(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return fallback;
  }

  return value;
}
