import type {
  MarkOutstandingOrderItem,
  ShoppingCatalogItem,
  StoredOutstandingOrder,
  StoredStockSnapshot,
} from "@/types/ShoppingRecommendation";

const OUTSTANDING_ORDERS_STORAGE_KEY =
  "shoppingRecommendation:outstandingOrders";
const STOCK_SNAPSHOTS_STORAGE_KEY = "shoppingRecommendation:stockSnapshots";

export interface ReconcileOutstandingOrdersResult {
  outstandingOrders: Record<string, StoredOutstandingOrder>;
  stockSnapshots: Record<string, StoredStockSnapshot>;
  reconciledItemCount: number;
}

export async function loadOutstandingOrders(): Promise<
  Record<string, StoredOutstandingOrder>
> {
  const storageLocal = browser?.storage?.local;
  if (!storageLocal) {
    return {};
  }

  try {
    const stored = await storageLocal.get(OUTSTANDING_ORDERS_STORAGE_KEY);
    return normalizeOutstandingOrders(
      stored[OUTSTANDING_ORDERS_STORAGE_KEY] as Record<
        string,
        StoredOutstandingOrder
      >,
    );
  } catch {
    return {};
  }
}

export async function loadStockSnapshots(): Promise<
  Record<string, StoredStockSnapshot>
> {
  const storageLocal = browser?.storage?.local;
  if (!storageLocal) {
    return {};
  }

  try {
    const stored = await storageLocal.get(STOCK_SNAPSHOTS_STORAGE_KEY);
    return normalizeStockSnapshots(
      stored[STOCK_SNAPSHOTS_STORAGE_KEY] as Record<
        string,
        StoredStockSnapshot
      >,
    );
  } catch {
    return {};
  }
}

export async function markItemsAsOrdered(
  items: MarkOutstandingOrderItem[],
): Promise<Record<string, StoredOutstandingOrder>> {
  const storageLocal = browser?.storage?.local;
  const nextOrders = { ...(await loadOutstandingOrders()) };
  const now = new Date().toISOString();

  for (const item of items) {
    const quantity = sanitizeQuantity(item.quantity);
    if (!item.itemId || quantity <= 0) {
      continue;
    }

    const existing = nextOrders[item.itemId];
    nextOrders[item.itemId] = {
      itemId: item.itemId,
      itemName: item.itemName,
      itemType: item.itemType,
      code: item.code,
      unit: item.unit,
      quantity: quantity + (existing?.quantity ?? 0),
      buyFee: item.buyFee,
      orderedAt: existing?.orderedAt ?? now,
      updatedAt: now,
      lastReconciledAt: existing?.lastReconciledAt ?? null,
    };
  }

  if (storageLocal) {
    await storageLocal.set({
      [OUTSTANDING_ORDERS_STORAGE_KEY]: nextOrders,
    });
  }

  return nextOrders;
}

export async function reconcileOutstandingOrdersWithCatalog(
  catalogItems: ShoppingCatalogItem[],
): Promise<ReconcileOutstandingOrdersResult> {
  const storageLocal = browser?.storage?.local;
  const previousSnapshots = await loadStockSnapshots();
  const nextOrders = { ...(await loadOutstandingOrders()) };
  const nextSnapshots: Record<string, StoredStockSnapshot> = {};
  const now = new Date().toISOString();
  let reconciledItemCount = 0;

  for (const item of catalogItems) {
    nextSnapshots[item.itemId] = {
      itemId: item.itemId,
      stockTotal: Math.max(0, Number(item.stockTotal ?? 0)),
      recordedAt: now,
    };

    const previousStock = previousSnapshots[item.itemId]?.stockTotal;
    const outstandingOrder = nextOrders[item.itemId];
    if (
      typeof previousStock !== "number" ||
      !outstandingOrder ||
      outstandingOrder.quantity <= 0
    ) {
      continue;
    }

    const stockIncrease = Math.max(0, item.stockTotal - previousStock);
    if (stockIncrease <= 0) {
      continue;
    }

    const nextQuantity = Math.max(0, outstandingOrder.quantity - stockIncrease);
    reconciledItemCount += Number(nextQuantity !== outstandingOrder.quantity);

    if (nextQuantity <= 0) {
      delete nextOrders[item.itemId];
      continue;
    }

    nextOrders[item.itemId] = {
      ...outstandingOrder,
      quantity: nextQuantity,
      updatedAt: now,
      lastReconciledAt: now,
    };
  }

  if (storageLocal) {
    await storageLocal.set({
      [OUTSTANDING_ORDERS_STORAGE_KEY]: nextOrders,
      [STOCK_SNAPSHOTS_STORAGE_KEY]: nextSnapshots,
    });
  }

  return {
    outstandingOrders: nextOrders,
    stockSnapshots: nextSnapshots,
    reconciledItemCount,
  };
}

export function buildPendingOrderQuantityMap(
  orders: Record<string, StoredOutstandingOrder>,
): Record<string, number> {
  const entries: Array<[string, number]> = [];

  for (const [itemId, order] of Object.entries(orders)) {
    const quantity = sanitizeQuantity(order.quantity);
    if (quantity > 0) {
      entries.push([itemId, quantity]);
    }
  }

  return Object.fromEntries(entries);
}

function normalizeOutstandingOrders(
  value: Record<string, StoredOutstandingOrder> | undefined,
): Record<string, StoredOutstandingOrder> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([itemId, order]) => {
        if (!order || typeof order !== "object") {
          return null;
        }

        const quantity = sanitizeQuantity(order.quantity);
        if (!itemId || quantity <= 0) {
          return null;
        }

        return [
          itemId,
          {
            itemId,
            itemName: String(order.itemName ?? "Unknown"),
            itemType: order.itemType === "akhp" ? "akhp" : "prescription",
            code: String(order.code ?? ""),
            unit: String(order.unit ?? ""),
            quantity,
            buyFee: toNullableNumber(order.buyFee),
            orderedAt: normalizeIsoDate(order.orderedAt),
            updatedAt: normalizeIsoDate(order.updatedAt),
            lastReconciledAt: order.lastReconciledAt
              ? normalizeIsoDate(order.lastReconciledAt)
              : null,
          } satisfies StoredOutstandingOrder,
        ];
      })
      .filter((entry): entry is [string, StoredOutstandingOrder] =>
        Boolean(entry),
      ),
  );
}

function normalizeStockSnapshots(
  value: Record<string, StoredStockSnapshot> | undefined,
): Record<string, StoredStockSnapshot> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([itemId, snapshot]) => {
        if (!snapshot || typeof snapshot !== "object" || !itemId) {
          return null;
        }

        return [
          itemId,
          {
            itemId,
            stockTotal: Math.max(0, Number(snapshot.stockTotal ?? 0)),
            recordedAt: normalizeIsoDate(snapshot.recordedAt),
          } satisfies StoredStockSnapshot,
        ];
      })
      .filter((entry): entry is [string, StoredStockSnapshot] =>
        Boolean(entry),
      ),
  );
}

function sanitizeQuantity(value: number | undefined): number {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return Math.ceil(numericValue);
}

function normalizeIsoDate(value: string | undefined): string {
  const timestamp = Date.parse(String(value ?? ""));
  if (Number.isNaN(timestamp)) {
    return new Date().toISOString();
  }

  return new Date(timestamp).toISOString();
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
