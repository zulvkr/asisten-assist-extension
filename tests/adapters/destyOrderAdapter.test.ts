import { describe, expect, it } from "vitest";
import { toCanonicalOrder } from "@/adapters/desty/destyOrderAdapter";

describe("destyOrderAdapter", () => {
  it("translates raw Desty package JSON into CanonicalOrder", () => {
    const rawOrder = {
      packageId: "PKG-100",
      displayedOrderSn: "SHOPEE-ORD-100",
      bookingSn: "BOOK-100",
      shipmentNo: "JP12345678",
      platform: "Shopee",
      payAmount: 45000,
      netAmount: 42000,
      orderCreateTime: 1715000000,
      deliveryDeadline: 1715100000,
      goodsList: [
        {
          masterSku: "PARACETAMOL-500",
          goodsName: "Paracetamol 500mg Strip",
          qty: "3",
          sellingPrice: 15000,
          subtotal: 45000,
        },
      ],
    };

    const canonical = toCanonicalOrder(rawOrder);

    expect(canonical.orderId).toBe("PKG-100");
    expect(canonical.externalOrderSn).toBe("SHOPEE-ORD-100");
    expect(canonical.bookingSn).toBe("BOOK-100");
    expect(canonical.trackingNumber).toBe("JP12345678");
    expect(canonical.platformName).toBe("Shopee");
    expect(canonical.totalSales).toBe(45000);
    expect(canonical.netSettlement).toBe(42000);
    expect(canonical.createdAt).toBe(new Date(1715000000 * 1000).toISOString());
    expect(canonical.items).toHaveLength(1);
    expect(canonical.items[0]).toEqual({
      sku: "PARACETAMOL-500",
      destySku: "PARACETAMOL-500",
      productName: "Paracetamol 500mg Strip",
      quantity: 3,
      unit: undefined,
      unitPrice: 15000,
      totalPrice: 45000,
    });
  });

  it("handles missing identifiers gracefully and falls back to orderId", () => {
    const canonical = toCanonicalOrder({
      id: "ONLY-ID-99",
      items: [],
    });

    expect(canonical.orderId).toBe("ONLY-ID-99");
    expect(canonical.externalOrderSn).toBe("");
    expect(canonical.platformName).toBe("Marketplace");
    expect(canonical.totalSales).toBe(0);
  });
});
