import {
  DEFAULT_SHOPPING_ANALYTICS_THRESHOLDS,
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
  pendingOrderQuantities?: Record<string, number>;
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
  const now = new Date();
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
    const stockTotal = Number(catalogItem?.stockTotal ?? 0);
    const pendingOrderQty = normalizeNonNegativeNumber(
      input.pendingOrderQuantities?.[itemId],
      0,
    );
    const effectiveStockTotal = stockTotal + pendingOrderQty;
    const observedUnits = Array.from(
      new Set((salesAggregate?.observedUnits ?? []).filter(Boolean)),
    );
    const needsManualReview = observedUnits.length > 1;
    const manualReviewReason = needsManualReview
      ? `Terjual dalam lebih dari satu unit: ${observedUnits.join(", ")}.`
      : "";
    const isDormant = qtySold30Days <= 0;
    const activeDays = resolveActiveDays({
      firstSoldAt: salesAggregate?.firstSoldAt ?? null,
      lookbackDays: input.lookbackDays,
      now,
    });
    const averageDailySales =
      input.lookbackDays > 0 ? qtySold30Days / input.lookbackDays : 0;
    const activeDailySales = activeDays > 0 ? qtySold30Days / activeDays : 0;
    const isCheap =
      typeof catalogItem?.buyFee === "number" &&
      catalogItem.buyFee <= settings.cheapProductMaxPrice;
    const isFastMoving = averageDailySales >= settings.fastMovingMinDailySales;
    const leadTimeLimit =
      isCheap && isFastMoving
        ? settings.cheapFastMovingLeadTime
        : settings.defaultLeadTime;
    const estimatedOutOfStockDays = calculateEstimatedOutOfStockDays({
      stockTotal,
      qtySold30Days,
      lookbackDays: input.lookbackDays,
      leadTimeLimit,
      lastSoldAt: salesAggregate?.lastSoldAt ?? null,
      lastKnownStockAfter: salesAggregate?.lastKnownStockAfter ?? null,
      now,
    });
    const activeEstimatedDaysRemaining = calculateEstimatedDaysRemaining(
      stockTotal,
      activeDailySales,
    );
    const trueVelocity =
      qtySold30Days > 0
        ? qtySold30Days /
          Math.max(
            1,
            activeDays -
              calculateEstimatedDemandConstraintDays({
                estimatedOutOfStockDays,
                stockTotal,
                averageDailySales: activeDailySales,
                estimatedDaysRemaining: activeEstimatedDaysRemaining,
                lookbackDays: input.lookbackDays,
                leadTimeLimit,
                lastSoldAt: salesAggregate?.lastSoldAt ?? null,
                lastKnownStockAfter:
                  salesAggregate?.lastKnownStockAfter ?? null,
                now,
              }),
          )
        : 0;
    const estimatedDaysRemaining = calculateEstimatedDaysRemaining(
      stockTotal,
      averageDailySales,
    );
    const estimatedDemandConstraintDays =
      calculateEstimatedDemandConstraintDays({
        estimatedOutOfStockDays,
        stockTotal,
        averageDailySales: activeDailySales,
        estimatedDaysRemaining: activeEstimatedDaysRemaining,
        lookbackDays: input.lookbackDays,
        leadTimeLimit,
        lastSoldAt: salesAggregate?.lastSoldAt ?? null,
        lastKnownStockAfter: salesAggregate?.lastKnownStockAfter ?? null,
        now,
      });
    const adjustedTrueVelocity =
      qtySold30Days > 0
        ? qtySold30Days /
          Math.max(1, activeDays - estimatedDemandConstraintDays)
        : 0;
    const effectiveDaysRemaining = calculateEstimatedDaysRemaining(
      effectiveStockTotal,
      averageDailySales,
    );
    const targetStock = Math.ceil(averageDailySales * settings.targetStockDays);
    const replenishSuggestedQty = needsManualReview
      ? 0
      : Math.max(0, targetStock - effectiveStockTotal);
    const potentialSalesGrowthPercent =
      averageDailySales > 0
        ? ((adjustedTrueVelocity - averageDailySales) / averageDailySales) * 100
        : 0;
    const growthSuggestedQty = needsManualReview
      ? 0
      : calculateGrowthSuggestedQty({
          averageDailySales,
          trueVelocity: adjustedTrueVelocity,
          estimatedDaysRemaining,
          leadTimeLimit,
          targetStock,
          replenishSuggestedQty,
          potentialSalesGrowthPercent,
          stockTotal,
          isDormant,
        });
    const calculatedSuggestedQty = replenishSuggestedQty + growthSuggestedQty;
    const potentialIncomeLoss =
      stockTotal <= 0 && typeof catalogItem?.sellNormalFee === "number"
        ? adjustedTrueVelocity * leadTimeLimit * catalogItem.sellNormalFee
        : 0;
    const unitProfit =
      typeof catalogItem?.sellNormalFee === "number"
        ? catalogItem.sellNormalFee -
          (catalogItem.avgHpp ?? catalogItem.buyFee ?? 0)
        : 0;
    const profitContribution30Days = qtySold30Days * Math.max(0, unitProfit);
    const isCappedDemand =
      estimatedDemandConstraintDays >=
        DEFAULT_SHOPPING_ANALYTICS_THRESHOLDS.cappedDemandMinOutOfStockDays &&
      potentialSalesGrowthPercent >=
        DEFAULT_SHOPPING_ANALYTICS_THRESHOLDS.cappedDemandMinGrowthPercent;
    const isGoldenProduct =
      profitContribution30Days >=
        DEFAULT_SHOPPING_ANALYTICS_THRESHOLDS.goldenProductMinProfitContribution &&
      averageDailySales >= settings.fastMovingMinDailySales;
    const isDeadStock =
      stockTotal > 0 &&
      estimatedDaysRemaining >=
        DEFAULT_SHOPPING_ANALYTICS_THRESHOLDS.deadStockMinDaysRemaining &&
      averageDailySales <=
        DEFAULT_SHOPPING_ANALYTICS_THRESHOLDS.deadStockMaxDailySales;

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
    if (pendingOrderQty > 0) {
      notes.push(`${pendingOrderQty} unit sedang dipesan.`);
    }
    if (estimatedDemandConstraintDays > 0) {
      notes.push(
        `Permintaan terhambat sekitar ${formatCompactNumber(estimatedDemandConstraintDays)} hari dari stock-out atau coverage yang terlalu tipis.`,
      );
    }
    if (potentialIncomeLoss > 0) {
      notes.push(
        `Potensi rugi omzet ${formatCompactNumber(potentialIncomeLoss)} selama lead time.`,
      );
    }
    if (isCappedDemand) {
      notes.push("Permintaan kemungkinan terhambat oleh stock-out.");
    }
    if (isGoldenProduct) {
      notes.push("Produk emas: kontribusi profit 30 hari tinggi.");
    }
    if (isDeadStock) {
      notes.push("Stok mati: perputaran lambat dengan coverage panjang.");
    }
    const growthRecommendationNote = buildGrowthRecommendationNote({
      growthSuggestedQty,
      replenishSuggestedQty,
      potentialSalesGrowthPercent,
      estimatedDaysRemaining,
      leadTimeLimit,
      isDeadStock,
      isDormant,
    });
    if (growthRecommendationNote) {
      notes.push(growthRecommendationNote);
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
      pendingOrderQty,
      effectiveStockTotal,
      buyFee: catalogItem?.buyFee ?? null,
      avgHpp: catalogItem?.avgHpp ?? null,
      sellNormalFee: catalogItem?.sellNormalFee ?? null,
      qtySold30Days,
      activeDays,
      averageDailySales,
      trueVelocity: adjustedTrueVelocity,
      estimatedOutOfStockDays,
      estimatedDemandConstraintDays,
      estimatedDaysRemaining,
      effectiveDaysRemaining,
      leadTimeLimit,
      targetStock,
      replenishSuggestedQty,
      growthSuggestedQty,
      calculatedSuggestedQty,
      potentialIncomeLoss,
      potentialSalesGrowthPercent,
      growthRecommendationNote,
      statusColor: resolveStatusColor({
        estimatedDaysRemaining: effectiveDaysRemaining,
        leadTimeLimit,
        targetStockDays: settings.targetStockDays,
      }),
      isDormant,
      needsManualReview,
      isCappedDemand,
      isGoldenProduct,
      isDeadStock,
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
    Number(right.potentialIncomeLoss > 0) -
      Number(left.potentialIncomeLoss > 0) ||
    Number(right.isCappedDemand) - Number(left.isCappedDemand) ||
    Number(right.isGoldenProduct) - Number(left.isGoldenProduct) ||
    statusRank(left.statusColor) - statusRank(right.statusColor) ||
    right.potentialIncomeLoss - left.potentialIncomeLoss ||
    right.growthSuggestedQty - left.growthSuggestedQty ||
    right.calculatedSuggestedQty - left.calculatedSuggestedQty ||
    right.qtySold30Days - left.qtySold30Days ||
    left.itemName.localeCompare(right.itemName)
  );
}

function calculateEstimatedDemandConstraintDays(input: {
  estimatedOutOfStockDays: number;
  stockTotal: number;
  averageDailySales: number;
  estimatedDaysRemaining: number;
  lookbackDays: number;
  leadTimeLimit: number;
  lastSoldAt: string | null;
  lastKnownStockAfter: number | null;
  now: Date;
}): number {
  if (input.estimatedOutOfStockDays > 0) {
    return input.estimatedOutOfStockDays;
  }

  if (input.stockTotal <= 0 || input.averageDailySales <= 0) {
    return 0;
  }

  const thinCoverageWindow = Math.min(2, Math.max(1, input.leadTimeLimit / 2));
  const coverageShortfall = Math.max(
    0,
    thinCoverageWindow - input.estimatedDaysRemaining,
  );
  if (coverageShortfall <= 0) {
    return 0;
  }

  const lastSoldTimestamp = input.lastSoldAt
    ? Date.parse(input.lastSoldAt)
    : NaN;
  const daysSinceLastSale = Number.isNaN(lastSoldTimestamp)
    ? input.leadTimeLimit
    : Math.max(
        0,
        Math.floor((input.now.getTime() - lastSoldTimestamp) / 86_400_000),
      );
  const lowStockSignal =
    input.lastKnownStockAfter !== null &&
    input.lastKnownStockAfter <= Math.max(1, input.averageDailySales)
      ? 0.5
      : 0;
  const recencySignal =
    daysSinceLastSale <= Math.max(1, Math.ceil(input.leadTimeLimit / 2))
      ? 0.5
      : 0;

  return Math.min(
    input.lookbackDays,
    Math.max(0.5, coverageShortfall + lowStockSignal + recencySignal),
  );
}

function calculateGrowthSuggestedQty(input: {
  averageDailySales: number;
  trueVelocity: number;
  estimatedDaysRemaining: number;
  leadTimeLimit: number;
  targetStock: number;
  replenishSuggestedQty: number;
  potentialSalesGrowthPercent: number;
  stockTotal: number;
  isDormant: boolean;
}): number {
  if (input.isDormant || input.averageDailySales <= 0) {
    return 0;
  }

  const velocityGap = Math.max(0, input.trueVelocity - input.averageDailySales);
  if (velocityGap <= 0 || input.potentialSalesGrowthPercent < 10) {
    return 0;
  }

  const lowCoverage =
    input.stockTotal <= 0 ||
    input.estimatedDaysRemaining <= input.leadTimeLimit;
  if (!lowCoverage) {
    return 0;
  }

  const growthCoverageDays = Math.min(
    3,
    Math.max(1, Math.ceil(input.leadTimeLimit / 2)),
  );
  const incrementalDailyGrowth = Math.min(
    velocityGap,
    Math.max(0.2, input.averageDailySales * 0.25),
  );
  const severity =
    input.stockTotal <= 0
      ? 1
      : clamp01(
          (input.leadTimeLimit - Math.max(0, input.estimatedDaysRemaining)) /
            Math.max(1, input.leadTimeLimit),
        );
  const proposedGrowthQty = Math.ceil(
    incrementalDailyGrowth * growthCoverageDays * Math.max(0.35, severity),
  );
  const capByReplenish = Math.max(
    1,
    Math.ceil(input.replenishSuggestedQty * 0.5),
  );
  const capByTarget = Math.max(1, Math.ceil(input.targetStock * 0.25));

  return Math.max(0, Math.min(proposedGrowthQty, capByReplenish, capByTarget));
}

function buildGrowthRecommendationNote(input: {
  growthSuggestedQty: number;
  replenishSuggestedQty: number;
  potentialSalesGrowthPercent: number;
  estimatedDaysRemaining: number;
  leadTimeLimit: number;
  isDeadStock: boolean;
  isDormant: boolean;
}): string {
  if (input.isDormant || input.isDeadStock) {
    return "Growth suggestion dimatikan untuk mencegah dead stock pada item lambat.";
  }

  if (input.growthSuggestedQty <= 0) {
    return "Growth suggestion belum ditambahkan; fokus isi ulang permintaan dasar terlebih dahulu.";
  }

  return `Growth suggestion ${input.growthSuggestedQty} unit dibuat bertahap di atas replenish ${input.replenishSuggestedQty} unit karena coverage ${formatCompactNumber(input.estimatedDaysRemaining)} hari dan potensi growth ${formatCompactNumber(input.potentialSalesGrowthPercent)}%.`;
}

function resolveActiveDays(input: {
  firstSoldAt: string | null;
  lookbackDays: number;
  now: Date;
}): number {
  if (!input.firstSoldAt) {
    return Math.max(1, input.lookbackDays);
  }

  const timestamp = Date.parse(input.firstSoldAt);
  if (Number.isNaN(timestamp)) {
    return Math.max(1, input.lookbackDays);
  }

  const days = Math.floor((input.now.getTime() - timestamp) / 86_400_000) + 1;
  return Math.max(1, Math.min(input.lookbackDays, days));
}

function calculateEstimatedOutOfStockDays(input: {
  stockTotal: number;
  qtySold30Days: number;
  lookbackDays: number;
  leadTimeLimit: number;
  lastSoldAt: string | null;
  lastKnownStockAfter: number | null;
  now: Date;
}): number {
  if (input.stockTotal > 0) {
    return 0;
  }

  if (input.qtySold30Days <= 0) {
    return Math.min(input.lookbackDays, input.leadTimeLimit);
  }

  const lastSoldTimestamp = input.lastSoldAt
    ? Date.parse(input.lastSoldAt)
    : NaN;
  const daysSinceLastSale = Number.isNaN(lastSoldTimestamp)
    ? input.leadTimeLimit
    : Math.max(
        0,
        Math.floor((input.now.getTime() - lastSoldTimestamp) / 86_400_000),
      );
  const gapEstimate = Math.max(0, input.leadTimeLimit - daysSinceLastSale);
  const stockHint = input.lastKnownStockAfter === 0 ? daysSinceLastSale : 0;

  return Math.min(input.lookbackDays, Math.max(1, gapEstimate, stockHint));
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

function formatCompactNumber(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
