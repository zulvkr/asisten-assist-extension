import type { PemasukanData } from "@/types/PemasukanData";
import type { SoldItemAggregate } from "@/utils/compareStockLevels";
import type {
  ShoppingItemType,
  ShoppingSalesAggregate,
} from "@/types/ShoppingRecommendation";
import { normalizeObservedUnit } from "@/utils/shoppingRecommendations";

export interface GetAssistSoldItemsOptions {
  includeOnlyPaidOff?: boolean;
}

export interface GetSoldItemsByDateResult {
  soldItems: SoldItemAggregate[];
  skippedByType: number;
  missingItemId: number;
}

export interface GetShoppingSalesByDateResult {
  salesAggregates: ShoppingSalesAggregate[];
  skippedByType: number;
  missingItemId: number;
}

const ALLOWED_ASSIST_ITEM_TYPES = new Set([
  "prescription",
  "akhp",
  "scourPrescription",
]);

export function getAssistSoldItemsByDate(
  transactions: PemasukanData[],
  options: GetAssistSoldItemsOptions = {},
): GetSoldItemsByDateResult {
  const includeOnlyPaidOff = options.includeOnlyPaidOff ?? true;
  const grouped = new Map<string, SoldItemAggregate>();

  let skippedByType = 0;
  let missingItemId = 0;

  for (const transaction of transactions) {
    if (includeOnlyPaidOff && transaction.status !== "paid off") {
      continue;
    }

    for (const item of transaction.Items) {
      if (!ALLOWED_ASSIST_ITEM_TYPES.has(item.type)) {
        skippedByType += 1;
        continue;
      }

      const assistItemId =
        item.type === "akhp"
          ? (item.akhpId?.trim() ?? "")
          : (item.medicineId?.trim() ?? "");
      if (!assistItemId) {
        missingItemId += 1;
      }
      // Items without an Assist item id are grouped under "" — they won't find stock data
      // but we never skip them, so they appear in the output as "unknown" status.
      const key = assistItemId || `__noId__::${item.name}`;

      const existing = grouped.get(key);
      if (existing) {
        existing.qtySold += item.quantity;
        continue;
      }

      grouped.set(key, {
        medicineId: assistItemId,
        itemName: item.name,
        qtySold: item.quantity,
        source: "assist",
      });
    }
  }

  return {
    soldItems: Array.from(grouped.values()).sort(
      (a, b) => b.qtySold - a.qtySold || a.itemName.localeCompare(b.itemName),
    ),
    skippedByType,
    missingItemId,
  };
}

export function getAssistShoppingSalesByDate(
  transactions: PemasukanData[],
  options: GetAssistSoldItemsOptions = {},
): GetShoppingSalesByDateResult {
  const includeOnlyPaidOff = options.includeOnlyPaidOff ?? true;
  const grouped = new Map<
    string,
    {
      itemId: string;
      itemType: ShoppingItemType;
      itemName: string;
      qtySold: number;
      observedUnits: Set<string>;
      firstSoldAt: string | null;
      lastSoldAt: string | null;
      lastKnownStockBefore: number | null;
      lastKnownStockAfter: number | null;
      lastObservedStockAt: string | null;
    }
  >();

  let skippedByType = 0;
  let missingItemId = 0;

  for (const transaction of transactions) {
    if (includeOnlyPaidOff && transaction.status !== "paid off") {
      continue;
    }

    for (const item of transaction.Items) {
      if (!ALLOWED_ASSIST_ITEM_TYPES.has(item.type)) {
        skippedByType += 1;
        continue;
      }

      const itemType: ShoppingItemType =
        item.type === "akhp" ? "akhp" : "prescription";
      const assistItemId =
        itemType === "akhp"
          ? (item.akhpId?.trim() ?? "")
          : (item.medicineId?.trim() ?? "");
      const key = assistItemId || `__noId__::${itemType}::${item.name}`;
      const observedAt = normalizeObservedAt(
        item.createdAt,
        transaction.createdAt,
      );

      if (!assistItemId) {
        missingItemId += 1;
      }

      const normalizedUnit = normalizeObservedUnit(item.unit);
      const existing = grouped.get(key);
      if (existing) {
        existing.qtySold += item.quantity;
        if (normalizedUnit) {
          existing.observedUnits.add(normalizedUnit);
        }
        existing.firstSoldAt = minIsoDate(existing.firstSoldAt, observedAt);
        existing.lastSoldAt = maxIsoDate(existing.lastSoldAt, observedAt);
        const lastObservedStockAt = maxIsoDate(
          existing.lastObservedStockAt,
          observedAt,
        );
        if (lastObservedStockAt === observedAt) {
          existing.lastObservedStockAt = observedAt;
          existing.lastKnownStockBefore = toNullableNumber(item.stockBefore);
          existing.lastKnownStockAfter = toNullableNumber(item.stockAfter);
        }
        continue;
      }

      grouped.set(key, {
        itemId: key,
        itemType,
        itemName: item.name,
        qtySold: item.quantity,
        observedUnits: new Set(normalizedUnit ? [normalizedUnit] : []),
        firstSoldAt: observedAt,
        lastSoldAt: observedAt,
        lastKnownStockBefore: toNullableNumber(item.stockBefore),
        lastKnownStockAfter: toNullableNumber(item.stockAfter),
        lastObservedStockAt: observedAt,
      });
    }
  }

  return {
    salesAggregates: Array.from(grouped.values())
      .map((aggregate) => ({
        itemId: aggregate.itemId,
        itemType: aggregate.itemType,
        itemName: aggregate.itemName,
        qtySold: aggregate.qtySold,
        observedUnits: Array.from(aggregate.observedUnits).sort(),
        firstSoldAt: aggregate.firstSoldAt,
        lastSoldAt: aggregate.lastSoldAt,
        lastKnownStockBefore: aggregate.lastKnownStockBefore,
        lastKnownStockAfter: aggregate.lastKnownStockAfter,
        lastObservedStockAt: aggregate.lastObservedStockAt,
      }))
      .sort(
        (a, b) => b.qtySold - a.qtySold || a.itemName.localeCompare(b.itemName),
      ),
    skippedByType,
    missingItemId,
  };
}

function normalizeObservedAt(
  itemCreatedAt: string | undefined,
  transactionCreatedAt: string | undefined,
): string | null {
  const candidate = itemCreatedAt ?? transactionCreatedAt ?? "";
  const timestamp = Date.parse(candidate);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function minIsoDate(left: string | null, right: string | null): string | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return left <= right ? left : right;
}

function maxIsoDate(left: string | null, right: string | null): string | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return left >= right ? left : right;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
