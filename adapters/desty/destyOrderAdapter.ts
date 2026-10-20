import type { CanonicalOrder, CanonicalOrderItem } from "@/domain/integration/models";

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const result = String(value).trim();
      if (result) return result;
    }
  }
  return "";
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const normalized = value
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=.*\.)/g, "")
        .replace(",", ".");
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function normalizeDate(value: unknown): string | undefined {
  const numeric = numberValue(value);
  if (numeric !== undefined) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value.trim() : date.toISOString();
  }
  return undefined;
}

function itemList(order: Record<string, unknown>): unknown[] {
  for (const key of ["items", "orderItems", "productList", "goodsList", "products"]) {
    if (Array.isArray(order[key])) return order[key] as unknown[];
  }
  return [];
}

function normalizeItem(value: unknown): CanonicalOrderItem {
  const item = recordOf(value);
  const sku = text(item.destySku, item.skuCode, item.masterSku, item.sku, item.sellerSku, item.productSku);
  return {
    sku,
    destySku: sku,
    productName: text(item.productName, item.name, item.goodsName, item.title) || "-",
    quantity: numberValue(item.quantity, item.qty, item.productQuantity) ?? 0,
    unit: text(item.unit, item.productUnit) || undefined,
    unitPrice: numberValue(item.unitPrice, item.price, item.sellingPrice),
    totalPrice: numberValue(item.totalPrice, item.subtotal, item.itemTotal),
  };
}

/**
 * Inbound ACL Adapter: converts raw Desty order/package structures into a CanonicalOrder.
 */
export function toCanonicalOrder(input: unknown): CanonicalOrder {
  const order = recordOf(input);
  const items = itemList(order).map(normalizeItem);
  const externalOrderSn = text(
    order.marketplaceOrderSn,
    order.displayedOrderSn,
    order.orderSn,
    order.orderNumber,
    order.platformOrderSn,
  );
  const bookingSn = text(order.bookingSn, order.bookingNumber, order.bookingNo) || undefined;
  const trackingNumber =
    text(order.trackingNumber, order.shipmentNo, order.logisticsNo, order.trackingNo) || undefined;

  return {
    orderId: text(order.orderId, order.id, order.packageId, externalOrderSn),
    externalOrderSn,
    marketplaceOrderSn: externalOrderSn,
    bookingSn,
    trackingNumber,
    platformName: text(order.platformName, order.platform, order.channel, order.shopPlatform) || "Marketplace",
    totalSales:
      numberValue(order.totalSales, order.totalPrice, order.payAmount, order.orderAmount, order.totalAmount) ?? 0,
    netSettlement: numberValue(order.netSettlement, order.settlementAmount, order.netAmount),
    createdAt: normalizeDate(order.orderCreateTime ?? order.createdAt ?? order.createTime),
    deliveryDeadline: normalizeDate(order.deliveryDeadline ?? order.shipDeadline ?? order.shipmentDeadline),
    items,
    raw: input,
  };
}
