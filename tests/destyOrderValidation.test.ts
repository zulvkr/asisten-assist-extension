import { describe, expect, it } from "vitest";
import { normalizeDestyOrder } from "@/services/destySync/orderNormalizer";
import { validateDestyOrder } from "@/utils/destyOrderValidation";
import type { DestySkuMapping } from "@/types/destySync";

const mapping: DestySkuMapping = {
  destySku: "BOX-OBAT",
  assistCode: "OBAT-1",
  assistType: "prescription",
  assistId: "medicine-1",
  assistName: "Obat",
  assistUnit: "Strip",
  depotId: "depot-1",
  conversionFactor: 10,
  active: true,
  updatedAt: new Date().toISOString(),
};

function order(quantity = 1) {
  return normalizeDestyOrder({
    displayedOrderSn: "ORDER-1",
    bookingSn: "BOOK-1",
    shipmentNo: "RESI-1",
    totalSales: 10000,
    items: [{ masterSku: "BOX-OBAT", productName: "Obat", quantity }],
  });
}

describe("validateDestyOrder", () => {
  it("converts Box quantity and accepts a mapped item", () => {
    const result = validateDestyOrder(order(), {
      mappings: [mapping],
      assistCatalog: [{ id: "medicine-1", code: "OBAT-1", name: "Obat", type: "prescription", depotId: "depot-1", stock: 20 }],
      stockByAssistId: { "medicine-1": 20 },
      duplicateOrderNumbers: [],
    });
    expect(result.valid).toBe(true);
    expect(result.mappedItems[0].assistQuantity).toBe(10);
  });

  it("rejects insufficient stock, duplicate order and price mismatch", () => {
    const result = validateDestyOrder(order(2), {
      mappings: [mapping],
      assistCatalog: [{ id: "medicine-1", code: "OBAT-1", name: "Obat", type: "prescription", depotId: "depot-1", stock: 10, sellNormalFee: 100 }],
      stockByAssistId: { "medicine-1": 10 },
      duplicateOrderNumbers: ["ORDER-1"],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "duplicate-order", "insufficient-stock", "price-mismatch",
    ]));
  });

  it("rejects zero quantity and unknown SKU", () => {
    const result = validateDestyOrder(
      normalizeDestyOrder({ displayedOrderSn: "ORDER-2", items: [{ masterSku: "UNKNOWN", quantity: 0 }] }),
      { mappings: [] },
    );
    expect(result.issues.map((issue) => issue.code)).toContain("invalid-quantity");

    const unknown = validateDestyOrder(
      normalizeDestyOrder({ displayedOrderSn: "ORDER-3", items: [{ masterSku: "UNKNOWN", quantity: 1 }] }),
      { mappings: [] },
    );
    expect(unknown.issues.map((issue) => issue.code)).toContain("unmapped-sku");
  });

  it("automatically falls back to 1:1 match when SKU matches Assist catalog code", () => {
    const directOrder = normalizeDestyOrder({
      displayedOrderSn: "ORDER-DIRECT",
      bookingSn: "BOOK-DIRECT",
      totalSales: 5000,
      items: [{ masterSku: "PCT-500", productName: "Paracetamol 500", quantity: 3 }],
    });

    const result = validateDestyOrder(directOrder, {
      mappings: [], // No explicit mappings
      assistCatalog: [
        {
          id: "med-pct",
          code: "PCT-500",
          name: "Paracetamol 500mg Tab",
          type: "prescription",
          unit: "Tab",
          depotId: "depot-default",
          stock: 50,
        },
      ],
      stockByAssistId: { "med-pct": 50 },
    });

    expect(result.valid).toBe(true);
    expect(result.mappedItems).toHaveLength(1);
    expect(result.mappedItems[0].mapping.assistCode).toBe("PCT-500");
    expect(result.mappedItems[0].mapping.assistName).toBe("Paracetamol 500mg Tab");
    expect(result.mappedItems[0].mapping.conversionFactor).toBe(1);
    expect(result.mappedItems[0].assistQuantity).toBe(3);
  });
});
