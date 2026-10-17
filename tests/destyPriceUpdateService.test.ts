import { describe, it, expect } from "vitest";
import {
  calculateTargetPrice,
  computeMarginForPrice,
  determineSafety,
  calculateSalesVelocityFromTransactions,
  resolveDestyPriceItem,
} from "@/services/destySync/destyPriceUpdateService";
import type { MarketplacePricingConfig, DestyPriceRecord } from "@/types/destyPriceUpdate";
import type { DestySkuMapping } from "@/types/destySync";
import type { PemasukanData } from "@/types/PemasukanData";

const mockConfig: MarketplacePricingConfig = {
  adminPercent: 10,
  adminFixedPerTx: 1000,
  basePriceSource: "buyPrice", // harga beli terakhir
  rounding: 100,
  tiers: [
    { id: "tier-1", minPrice: 0, maxPrice: 15000, marginPercent: 25, minBuyQty: 3 },
    { id: "tier-2", minPrice: 15001, maxPrice: 50000, marginPercent: 20, minBuyQty: 2 },
    { id: "tier-3", minPrice: 50001, maxPrice: 150000, marginPercent: 15, minBuyQty: 1 },
    { id: "tier-4", minPrice: 150001, maxPrice: null, marginPercent: 12, minBuyQty: 1 },
  ],
};

describe("destyPriceUpdateService", () => {
  describe("calculateTargetPrice (using harga beli terakhir / HPP)", () => {
    it("calculates target price for Tier 1 with minBuyQty = 3", () => {
      // HPP (harga beli terakhir) = 10,000, factor = 1
      // c = 10,000 (Tier 1: margin 25%, minBuyQty 3)
      // adminPerUnit = 1,000 / 3 = 333.33
      // targetNetReceived = 10,000 / (1 - 0.25) = 13,333.33
      // rawPrice = (13,333.33 + 333.33) / (1 - 0.10) = 13,666.67 / 0.9 = 15,185.19
      // rounded to 100 = 15,200
      const result = calculateTargetPrice(10000, 1, mockConfig);

      expect(result.matchedTier?.id).toBe("tier-1");
      expect(result.convertedCost).toBe(10000);
      expect(result.calculatedPrice).toBe(15200);
      expect(result.netReceived).toBeGreaterThan(10000);
      expect(result.profitNominal).toBeGreaterThan(0);
      expect(result.actualMarginPercent).toBeGreaterThanOrEqual(24);
    });

    it("applies conversion factor to harga beli terakhir (HPP)", () => {
      // Base buy fee (harga beli terakhir per strip) = 5,000
      // Conversion factor (1 box = 10 strip) = 10
      // convertedCost = 5,000 * 10 = 50,000 (Tier 2: maxPrice 50,000, margin 20%, minBuyQty 2)
      const result = calculateTargetPrice(5000, 10, mockConfig);

      expect(result.convertedCost).toBe(50000);
      expect(result.matchedTier?.id).toBe("tier-2");
      expect(result.calculatedPrice).toBeGreaterThan(50000);
      expect(result.actualMarginPercent).toBeGreaterThanOrEqual(19);
    });

    it("calculates for high price item (Tier 4, margin 12%, minBuyQty 1)", () => {
      // c = 200,000
      // adminPerUnit = 1,000 / 1 = 1,000
      // targetNetReceived = 200,000 / 0.88 = 227,272.73
      // rawPrice = (227,272.73 + 1,000) / 0.90 = 253,636.36 -> rounded = 253,700
      const result = calculateTargetPrice(200000, 1, mockConfig);

      expect(result.matchedTier?.id).toBe("tier-4");
      expect(result.convertedCost).toBe(200000);
      expect(result.calculatedPrice).toBe(253700);
    });
  });

  describe("computeMarginForPrice", () => {
    it("computes margin nominal and percentage accurately after marketplace admin fees", () => {
      const margin = computeMarginForPrice(15200, 10000, 3, mockConfig);
      // netReceived = 15,200 * 0.90 - (1,000 / 3) = 13,680 - 333.33 = 13,346.67
      // nominal = 13,347 - 10,000 = 3,347
      // percent = (3,347 / 13,346.67) * 100 ~ 25%
      expect(margin.nominal).toBeCloseTo(3347, -1);
      expect(margin.percent).toBeCloseTo(25, 0);
    });

    it("returns zeroes for empty or zero price", () => {
      const margin = computeMarginForPrice(0, 10000, 1, mockConfig);
      expect(margin.nominal).toBe(0);
      expect(margin.percent).toBe(0);
      expect(margin.netReceived).toBe(0);
    });
  });

  describe("determineSafety", () => {
    it("returns safe when target price is lower than or equal to current price", () => {
      const safety = determineSafety(20, 10, 50, 15000, 14000, -6.7);
      expect(safety.level).toBe("safe");
      expect(safety.label).toContain("Aman (Turun/Sama)");
    });

    it("returns caution when fast-moving online product has >5% price hike", () => {
      const safety = determineSafety(15, 8, 30, 10000, 12000, 20);
      expect(safety.level).toBe("caution");
      expect(safety.label).toContain("Perlu Waspada");
    });

    it("returns moderate when fast-moving online product has small (<=5%) price hike", () => {
      const safety = determineSafety(15, 8, 30, 10000, 10400, 4);
      expect(safety.level).toBe("moderate");
      expect(safety.label).toContain("Cukup Aman");
    });

    it("returns safe for slow-moving online products", () => {
      const safety = determineSafety(0, 0, 1, 10000, 15000, 50);
      expect(safety.level).toBe("safe");
      expect(safety.label).toContain("Sangat Aman");
    });
  });

  describe("calculateSalesVelocityFromTransactions", () => {
    it("aggregates online and offline sales correctly", () => {
      const transactions = [
        {
          id: "tx-1",
          paidName: "DESTY|platform=SHOPEE|order=241016A",
          createdAt: "2026-10-16T10:00:00.000Z",
          Items: [
            { code: "PARACETAMOL", quantity: 2, medicineId: "med-1" },
            { code: "AMOXICILLIN", quantity: 1, medicineId: "med-2" },
          ],
        },
        {
          id: "tx-2",
          paidName: "Cash Walk-In",
          createdAt: "2026-10-16T11:00:00.000Z",
          Items: [
            { code: "PARACETAMOL", quantity: 3, medicineId: "med-1" },
          ],
        },
      ] as unknown as PemasukanData[];

      const velocityMap = calculateSalesVelocityFromTransactions(transactions);

      const paraItem = velocityMap.get("PARACETAMOL");
      expect(paraItem).toBeDefined();
      expect(paraItem?.totalSoldQty).toBe(5);
      expect(paraItem?.totalOrderCount).toBe(2);
      expect(paraItem?.onlineSoldQty).toBe(2);
      expect(paraItem?.onlineOrderCount).toBe(1);
      expect(paraItem?.lastOnlineOrderDate).toBe("2026-10-16");

      const amoxItem = velocityMap.get("AMOXICILLIN");
      expect(amoxItem).toBeDefined();
      expect(amoxItem?.totalSoldQty).toBe(1);
      expect(amoxItem?.onlineSoldQty).toBe(1);
    });
  });

  describe("resolveDestyPriceItem", () => {
    const mockMappings: DestySkuMapping[] = [
      {
        destySku: "DESTY-PCT-BOX",
        assistCode: "PCT500",
        assistId: "med-1",
        assistName: "Paracetamol 500mg",
        assistType: "prescription",
        conversionFactor: 10,
        active: true,
      },
    ];

    const mockDestyCatalog: Record<string, DestyPriceRecord> = {
      "DESTY-PCT-BOX": {
        skuId: "sku-123",
        spuId: "spu-123",
        productName: "Paracetamol 500mg Box",
        masterSku: "DESTY-PCT-BOX",
        salesPrice: 45000,
      },
      "AMOX-STRIP": {
        skuId: "sku-456",
        spuId: "spu-456",
        productName: "Amoxicillin Strip",
        masterSku: "AMOX-STRIP",
        salesPrice: 12000,
      },
    };

    it("resolves mapped SKU with conversion factor", () => {
      const resolved = resolveDestyPriceItem("PCT500", mockMappings, mockDestyCatalog);
      expect(resolved.isMapped).toBe(true);
      expect(resolved.destySku).toBe("DESTY-PCT-BOX");
      expect(resolved.conversionFactor).toBe(10);
      expect(resolved.destyRecord?.salesPrice).toBe(45000);
    });

    it("resolves direct SKU match when identical to masterSku", () => {
      const resolved = resolveDestyPriceItem("AMOX-STRIP", mockMappings, mockDestyCatalog);
      expect(resolved.isMapped).toBe(true);
      expect(resolved.destySku).toBe("AMOX-STRIP");
      expect(resolved.conversionFactor).toBe(1);
      expect(resolved.destyRecord?.salesPrice).toBe(12000);
    });

    it("returns unmapped when SKU is not in mappings or Desty catalog", () => {
      const resolved = resolveDestyPriceItem("UNKNOWN-CODE", mockMappings, mockDestyCatalog);
      expect(resolved.isMapped).toBe(false);
      expect(resolved.destyRecord).toBeUndefined();
    });
  });

  describe("HPP (Harga Beli Terakhir) resolution & pricing formula", () => {
    it("uses buyFee directly as baseCost when present", () => {
      const catalogItem = {
        id: "med-1",
        code: "PCT500",
        name: "Paracetamol 500mg",
        type: "prescription" as const,
        buyFee: 8500,
        avgHPP: 8000,
        sellNormalFee: 12000,
      };

      const baseCost = Number(catalogItem.buyFee) || Number(catalogItem.avgHPP) || 0;
      expect(baseCost).toBe(8500);

      const target = calculateTargetPrice(baseCost, 1, mockConfig);
      expect(target.convertedCost).toBe(8500);
      expect(target.calculatedPrice).toBeGreaterThan(baseCost);
    });

    it("falls back to avgHPP when buyFee is 0 or undefined", () => {
      const catalogItem = {
        id: "med-2",
        code: "AMX500",
        name: "Amoxicillin 500mg",
        type: "prescription" as const,
        buyFee: 0,
        avgHPP: 6500,
      };

      const baseCost = Number(catalogItem.buyFee) || Number(catalogItem.avgHPP) || 0;
      expect(baseCost).toBe(6500);

      const target = calculateTargetPrice(baseCost, 1, mockConfig);
      expect(target.convertedCost).toBe(6500);
    });

    it("scales HPP properly when conversionFactor is applied for marketplace unit", () => {
      const buyFeePerStrip = 7500;
      const conversionFactorBox = 10; // 1 Box = 10 Strip
      const target = calculateTargetPrice(buyFeePerStrip, conversionFactorBox, mockConfig);

      expect(target.convertedCost).toBe(75000);
      expect(target.profitNominal).toBeGreaterThan(0);
    });
  });
});
