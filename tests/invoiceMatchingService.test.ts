import { describe, it, expect } from "vitest";
import {
  normalizeString,
  getTokens,
  areTokensSimilar,
  extractVariants,
  hasConflictingVariants,
  matchSupplier,
  findBestProductMatch,
  detectConversionFactor,
  calculateSaranHargaJual,
  matchAndAnalyzeInvoice,
  type CatalogCandidate,
  type DistributorCandidate,
} from "@/services/gemini/invoiceMatchingService";
import type { RawGeminiInvoiceExtraction } from "@/types/fakturScan";

describe("InvoiceMatchingService", () => {
  describe("Normalization and Tokens", () => {
    it("should normalize strings and strip punctuation", () => {
      expect(normalizeString("PT. TIGATRA ANUGRAH LESTARI (PBF)")).toBe(
        "pt tigatra anugrah lestari pbf"
      );
    });

    it("should extract meaningful tokens and ignore noise words", () => {
      const tokens = getTokens(normalizeString("PT KIMIA FARMA APOTEK"));
      expect(tokens).toContain("kimia");
      expect(tokens).not.toContain("pt");
      expect(tokens).not.toContain("farmasi");
      expect(tokens).not.toContain("apotek");
    });

    it("should match similar tokens with typo tolerance", () => {
      expect(areTokensSimilar("parasetamol", "paracetamol")).toBe(true);
      expect(areTokensSimilar("amoxicilin", "amoxicillin")).toBe(true);
      expect(areTokensSimilar("cefadroxil", "paracetamol")).toBe(false);
    });
  });

  describe("Variant & Conflict Guard", () => {
    it("should extract strengths, sizes, and forms", () => {
      const variants = extractVariants("PARACETAMOL 500MG FORTE TABLET");
      expect(variants.has("strength:500mg")).toBe(true);
      expect(variants.has("form:forte")).toBe(true);
    });

    it("should detect conflict between different dosages", () => {
      const v1 = extractVariants("AMOXICILLIN 500MG");
      const v2 = extractVariants("AMOXICILLIN 1000MG");
      expect(hasConflictingVariants(v1, v2)).toBe(true);
    });

    it("should detect conflict between different sizes", () => {
      const v1 = extractVariants("PAMPERS SIZE L");
      const v2 = extractVariants("PAMPERS SIZE M");
      expect(hasConflictingVariants(v1, v2)).toBe(true);
    });

    it("should not conflict when variants agree or have no conflicts", () => {
      const v1 = extractVariants("CALCIFAR PLUS TAB");
      const v2 = extractVariants("CALCIFAR PLUS TABLET");
      expect(hasConflictingVariants(v1, v2)).toBe(false);
    });
  });

  describe("Supplier Matching", () => {
    const distributors: DistributorCandidate[] = [
      { id: "dist-1", supplierName: "PT. TIGATRA ANUGRAH LESTARI" },
      { id: "dist-2", supplierName: "PT. ANUGERAH PHARMINDO LESTARI" },
      { id: "dist-3", supplierName: "PT. KIMIA FARMA TRADING & DISTRIBUTION" },
    ];

    it("should exact match distributor", () => {
      const res = matchSupplier("PT. TIGATRA ANUGRAH LESTARI", distributors);
      expect(res.id).toBe("dist-1");
      expect(res.confidence).toBe(1.0);
    });

    it("should fuzzy match distributor with partial name", () => {
      const res = matchSupplier("TIGATRA ANUGRAH", distributors);
      expect(res.id).toBe("dist-1");
      expect(res.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("Product Matching", () => {
    const products: CatalogCandidate[] = [
      {
        id: "prod-1",
        code: "MED-001",
        name: "CALCIFAR PLUS TAB",
        type: "prescription",
        isBHP: false,
        unit: "STRIP",
        buyFee: 8500,
        sellNormalFee: 12000,
        avgHPP: 8500,
        depotId: "depot-1",
      },
      {
        id: "prod-2",
        code: "MED-002",
        name: "PARACETAMOL 500 MG TAB",
        type: "prescription",
        isBHP: false,
        unit: "TABLET",
        buyFee: 500,
        sellNormalFee: 1000,
        avgHPP: 500,
        depotId: "depot-2",
      },
      {
        id: "prod-3",
        code: "MED-003",
        name: "PARACETAMOL SYRUP 60 ML",
        type: "prescription",
        isBHP: false,
        unit: "BOTOL",
        buyFee: 12000,
        sellNormalFee: 18000,
        avgHPP: 12000,
        depotId: "depot-3",
      },
    ];

    it("should match product with high confidence", () => {
      const { product, confidence } = findBestProductMatch(
        "CALCIFAR PLUS TAB 10X10",
        products
      );
      expect(product?.id).toBe("prod-1");
      expect(confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("should not falsely match syrup to tablet due to variant conflict", () => {
      const { product } = findBestProductMatch(
        "PARACETAMOL 500MG TABLET",
        [products[2]] // only syrup in list
      );
      expect(product).toBeNull();
    });
  });

  describe("Packaging Conversion", () => {
    it("should detect 10x10 pattern for box to strip", () => {
      const res = detectConversionFactor("CALCIFAR PLUS TAB 10X10", "BOX", "STRIP");
      expect(res.factor).toBe(10);
    });

    it("should detect 10x10 pattern for box to tablet", () => {
      const res = detectConversionFactor("CALCIFAR PLUS TAB 10X10", "BOX", "TABLET");
      expect(res.factor).toBe(100);
    });

    it("should detect ISI 100 pattern", () => {
      const res = detectConversionFactor("PARACETAMOL ISI 100 TABLET", "BOX", "TABLET");
      expect(res.factor).toBe(100);
    });

    it("should default to 1 if units are identical", () => {
      const res = detectConversionFactor("PARACETAMOL SIRUP", "BOTOL", "BOTOL");
      expect(res.factor).toBe(1);
    });
  });

  describe("Saran Harga Jual Calculation", () => {
    it("should calculate retail margin and rounded price", () => {
      const buyPrice = 10000;
      const margin = 20; // 20%
      const suggested = calculateSaranHargaJual(buyPrice, margin);
      expect(suggested).toBeGreaterThanOrEqual(12000);
    });
  });

  describe("End-to-end Invoice Analysis", () => {
    const raw: RawGeminiInvoiceExtraction = {
      supplierName: "PT TIGATRA ANUGRAH LESTARI",
      invoiceNumber: "09260014",
      invoiceDate: "2026-09-01",
      dueDate: "2026-09-15",
      purchaseType: "Tempo",
      ppnType: "Include",
      subTotal: 85000,
      totalDiscount: 0,
      totalPpn: 8423,
      grandTotal: 85000,
      items: [
        {
          rawProductName: "CALCIFAR PLUS TAB 10X10",
          batchNumber: "AX0AB",
          expiryDate: "2028-05-15",
          quantity: 1,
          unitName: "BOX",
          unitPrice: 85000,
          discountPercent1: 0,
          totalLinePrice: 85000,
        },
      ],
    };

    const distributors: DistributorCandidate[] = [
      { id: "dist-1", supplierName: "PT. TIGATRA ANUGRAH LESTARI" },
    ];

    const products: CatalogCandidate[] = [
      {
        id: "prod-1",
        code: "MED-001",
        name: "CALCIFAR PLUS TAB",
        type: "prescription",
        isBHP: false,
        unit: "STRIP",
        buyFee: 8000, // Previous buy price 8,000 / strip
        sellNormalFee: 12000,
        avgHPP: 8000,
        depotId: "depot-1",
      },
    ];

    it("should match invoice, detect conversion (1 Box = 10 Strip), and detect price increase", () => {
      const result = matchAndAnalyzeInvoice(raw, distributors, products, []);
      expect(result.matchedSupplierId).toBe("dist-1");
      expect(result.invoiceNumber).toBe("09260014");
      expect(result.items.length).toBe(1);

      const item = result.items[0];
      expect(item.matchedProductId).toBe("prod-1");
      expect(item.conversionFactor).toBe(10);
      expect(item.quantity).toBe(10); // 1 Box * 10 = 10 Strips
      expect(item.unitPrice).toBe(8500); // 85,000 / 10 = 8,500
      expect(item.isPriceIncreased).toBe(true); // 8,500 > 8,000
      expect(item.hppChangePercent).toBe(6.3); // ((8500-8000)/8000)*100 = 6.25% rounded to 6.3%
    });
  });
});
