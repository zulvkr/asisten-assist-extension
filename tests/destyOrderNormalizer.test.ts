import { describe, expect, it } from "vitest";
import { normalizeDestyOrder } from "@/services/destySync/orderNormalizer";

describe("normalizeDestyOrder", () => {
  it("normalizes marketplace identifiers, price and item SKU", () => {
    const order = normalizeDestyOrder({
      id: "internal-1",
      displayedOrderSn: "SP-001",
      bookingSn: "BOOK-1",
      shipmentNo: "RESI-1",
      platformName: "Shopee",
      totalSales: 8000,
      orderCreateTime: 1710000000,
      items: [{ masterSku: "SKU-1", productName: "Obat", quantity: "2", unit: "Box" }],
    });

    expect(order.orderId).toBe("internal-1");
    expect(order.marketplaceOrderSn).toBe("SP-001");
    expect(order.bookingSn).toBe("BOOK-1");
    expect(order.trackingNumber).toBe("RESI-1");
    expect(order.items[0]).toMatchObject({ destySku: "SKU-1", quantity: 2, unit: "Box" });
    expect(order.createdAt).toBe(new Date(1710000000 * 1000).toISOString());
  });
});
