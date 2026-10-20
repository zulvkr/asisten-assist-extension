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

  it("enriches canonical items with mapping info when context is provided", () => {
    const rawOrder = {
      orderId: "ORD-ACL-1",
      items: [
        {
          sku: "DIRECT-SKU",
          productName: "Direct Match Product",
          qty: 2,
        },
        {
          sku: "OVERRIDE-SKU",
          productName: "Override Product",
          qty: 1,
        },
        {
          sku: "UNKNOWN-SKU",
          productName: "Unknown Product",
          qty: 5,
        },
      ],
    };

    const context = {
      mappings: [
        {
          destySku: "OVERRIDE-SKU",
          assistCode: "AST-OVR-01",
          assistType: "prescription" as const,
          assistId: "id-ovr",
          assistName: "Assist Override Item",
          conversionFactor: 10,
          active: true,
        },
      ],
      catalog: [
        {
          id: "id-direct",
          code: "DIRECT-SKU",
          name: "Direct Catalog Item",
          type: "prescription" as const,
        },
      ],
    };

    const canonical = toCanonicalOrder(rawOrder, context);

    expect(canonical.items).toHaveLength(3);

    // Direct SKU match (automatic 1:1)
    expect(canonical.items[0].isMapped).toBe(true);
    expect(canonical.items[0].mappingSource).toBe("direct_sku");
    expect(canonical.items[0].mappedAssistCode).toBe("DIRECT-SKU");
    expect(canonical.items[0].mappedAssistName).toBe("Direct Catalog Item");
    expect(canonical.items[0].conversionFactor).toBe(1);

    // Override mapping match
    expect(canonical.items[1].isMapped).toBe(true);
    expect(canonical.items[1].mappingSource).toBe("override");
    expect(canonical.items[1].mappedAssistCode).toBe("AST-OVR-01");
    expect(canonical.items[1].mappedAssistName).toBe("Assist Override Item");
    expect(canonical.items[1].conversionFactor).toBe(10);

    // Unmapped item
    expect(canonical.items[2].isMapped).toBe(false);
    expect(canonical.items[2].mappingSource).toBe("unmapped");
    expect(canonical.items[2].conversionFactor).toBe(1);
  });
});
