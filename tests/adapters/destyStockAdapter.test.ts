import { describe, expect, it } from "vitest";
import {
  toCanonicalStockBalance,
  toDestyOnHandEditPayload,
} from "@/adapters/desty/destyStockAdapter";

describe("destyStockAdapter", () => {
  it("translates raw Desty stock breakdown to CanonicalStockBalance", () => {
    const rawStock = {
      sku: "AMOX-500",
      skuId: "sku-12345",
      warehouseId: "wh-001",
      productName: "Amoxicillin 500mg",
      breakdown: {
        fisik: 50,
        tersedia: 45,
        pesanan: 5,
      },
    };

    const canonical = toCanonicalStockBalance(rawStock);

    expect(canonical.sku).toBe("AMOX-500");
    expect(canonical.skuId).toBe("sku-12345");
    expect(canonical.warehouseId).toBe("wh-001");
    expect(canonical.physicalStock).toBe(50);
    expect(canonical.availableStock).toBe(45);
    expect(canonical.reservedStock).toBe(5);
    expect(canonical.productName).toBe("Amoxicillin 500mg");
  });

  it("converts StockDeductionCommand to Desty editOnHand payload with negative amount", () => {
    const payload = toDestyOnHandEditPayload({
      sku: "AMOX-500",
      skuId: "sku-12345",
      warehouseId: "wh-001",
      deltaQuantity: 3,
    });

    expect(payload).toEqual({
      skuId: "sku-12345",
      warehouseId: "wh-001",
      amount: -3,
      editType: "Add",
    });
  });
});
