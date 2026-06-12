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

    const leadTimeLimit = item.leadTimeLimit ?? 3;
    const expiresDate = new Date(
      new Date(now).getTime() + (leadTimeLimit + 1) * 24 * 60 * 60 * 1000
    );

    nextOrders[item.itemId] = {
      itemId: item.itemId,
      itemName: item.itemName,
      itemType: item.itemType,
      code: item.code,
      unit: item.unit,
      quantity,
      buyFee: item.buyFee,
      orderedAt: now,
      updatedAt: now,
      lastReconciledAt: null,
      leadTimeLimit,
      expiresAt: expiresDate.toISOString(),
    };
  }

  if (storageLocal) {
    await storageLocal.set({
      [OUTSTANDING_ORDERS_STORAGE_KEY]: nextOrders,
    });
  }

  return nextOrders;
}

export async function removeOutstandingOrder(
  itemId: string,
): Promise<Record<string, StoredOutstandingOrder>> {
  const storageLocal = browser?.storage?.local;
  const nextOrders = { ...(await loadOutstandingOrders()) };
  
  if (nextOrders[itemId]) {
    delete nextOrders[itemId];
    if (storageLocal) {
      await storageLocal.set({
        [OUTSTANDING_ORDERS_STORAGE_KEY]: nextOrders,
      });
    }
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
  const now = new Date();
  const nowIso = now.toISOString();
  let reconciledItemCount = 0;

  // 1. Remove expired orders (past expiresAt)
  for (const [itemId, order] of Object.entries(nextOrders)) {
    if (order.expiresAt) {
      const expiresDate = new Date(order.expiresAt);
      if (now > expiresDate) {
        delete nextOrders[itemId];
        reconciledItemCount++;
      }
    }
  }

  // 2. Keep track of stock snapshots but do NOT reconcile outstanding order quantities based on stock increase.
  for (const item of catalogItems) {
    nextSnapshots[item.itemId] = {
      itemId: item.itemId,
      stockTotal: Math.max(0, Number(item.stockTotal ?? 0)),
      recordedAt: nowIso,
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
      .map(([itemId, order]): [string, StoredOutstandingOrder] | null => {
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
            leadTimeLimit: typeof order.leadTimeLimit === "number" ? order.leadTimeLimit : undefined,
            expiresAt: order.expiresAt ? normalizeIsoDate(order.expiresAt) : undefined,
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
