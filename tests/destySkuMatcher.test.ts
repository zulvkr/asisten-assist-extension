import { describe, it, expect } from "vitest";
import {
  cleanCode,
  extractDosages,
  extractForms,
  extractPackQuantity,
  matchCatalogItem,
  recommendMatchesForSku,
  createMappingFromRecommendation,
} from "@/services/destySync/skuMatcher";
import type { AssistCatalogItem } from "@/types/destySync";

const mockCatalog: AssistCatalogItem[] = [
  {
    id: "med-1",
    code: "OBT-PCT-500",
    name: "PARACETAMOL 500 MG TABLET",
    type: "prescription",
    unit: "Tablet",
    depotId: "depot-1",
    stock: 100,
    sellNormalFee: 500,
  },
  {
    id: "med-2",
    code: "OBT-PCT-SYR",
    name: "PARACETAMOL SIRUP 120 MG / 5 ML 60 ML",
    type: "prescription",
    unit: "Botol",
    depotId: "depot-1",
    stock: 50,
    sellNormalFee: 15000,
  },
  {
    id: "med-3",
    code: "OBT-AMX-500",
    name: "AMOXICILLIN 500 MG KAPLET",
    type: "prescription",
    unit: "Kaplet",
    depotId: "depot-1",
    stock: 200,
    sellNormalFee: 800,
  },
  {
    id: "med-4",
    code: "BHP-MSK-01",
    name: "MASKER MEDIS 3 PLY EARLOOP SURGICAL ONEMED",
    type: "akhp",
    unit: "Box",
    depotId: "depot-1",
    stock: 30,
    sellNormalFee: 35000,
  },
  {
    id: "med-5",
    code: "OBT-PCT-250",
    name: "PARACETAMOL 250 MG SIRUP",
    type: "prescription",
    unit: "Botol",
    depotId: "depot-1",
    stock: 10,
    sellNormalFee: 12000,
  },
];

describe("destySkuMatcher helper functions", () => {
  it("cleans codes properly", () => {
    expect(cleanCode("OBT-PCT-500")).toBe("OBTPCT500");
    expect(cleanCode("obt_pct_500 ")).toBe("OBTPCT500");
    expect(cleanCode("899-123.45")).toBe("89912345");
  });

  it("extracts dosages correctly", () => {
    expect(extractDosages("Paracetamol 500 mg Box 10 Strip")).toEqual(["500mg"]);
    expect(extractDosages("Amoxicillin 500mg Kaplet 120ml")).toEqual(["500mg", "120ml"]);
    expect(extractDosages("Salep 1% Betadine 30 ml")).toEqual(["1%", "30ml"]);
  });

  it("extracts packaging forms correctly", () => {
    expect(extractForms("Paracetamol Strip Tablet")).toEqual(["STRIP", "TABLET"]);
    expect(extractForms("Sirup Botol 60ml")).toEqual(["SIRUP", "BOTOL"]);
    expect(extractForms("Masker Medis Box Earloop")).toEqual(["BOX"]);
  });

  it("extracts pack quantities correctly", () => {
    expect(extractPackQuantity("Paracetamol Box Isi 10 Strip")).toBe(10);
    expect(extractPackQuantity("Masker Box 50 Pcs")).toBe(50);
    expect(extractPackQuantity("Betadine Botol")).toBeNull();
  });
});

describe("destySkuMatcher matching engine", () => {
  it("matches exact SKU code with highest confidence", () => {
    const match = matchCatalogItem("OBT-PCT-500", "Paracetamol 500mg", mockCatalog[0]);
    expect(match).not.toBeNull();
    expect(match?.score).toBe(1.0);
    expect(match?.confidence).toBe("high");
    expect(match?.matchReasons.some((r) => r.includes("persis cocok"))).toBe(true);
  });

  it("matches stripped prefix/suffix code", () => {
    const match = matchCatalogItem("OBT-PCT-500-BOX", "Paracetamol", mockCatalog[0]);
    expect(match).not.toBeNull();
    expect(match?.score).toBeGreaterThanOrEqual(0.9);
    expect(match?.confidence).toBe("high");
  });

  it("recommends correct item based on name, dosage and form", () => {
    const rec = recommendMatchesForSku("PARACETAMOL-STRIP", "Paracetamol 500 mg Generic Strip", mockCatalog);
    expect(rec.bestMatch).toBeDefined();
    expect(rec.bestMatch?.catalogItem.code).toBe("OBT-PCT-500");
    expect(rec.bestMatch?.confidence).toBe("high");
  });

  it("penalizes conflicting dosages and prefers matching dosage", () => {
    const rec = recommendMatchesForSku("PCT-250-SYR", "Paracetamol Sirup 250 mg Rasa Jeruk", mockCatalog);
    expect(rec.bestMatch).toBeDefined();
    expect(rec.bestMatch?.catalogItem.code).toBe("OBT-PCT-250");
  });

  it("matches non-medicine AKHP/BHP items", () => {
    const rec = recommendMatchesForSku("MSK-EARLOOP-3PLY", "Masker Medis Earloop 3ply Onemed Box", mockCatalog);
    expect(rec.bestMatch).toBeDefined();
    expect(rec.bestMatch?.catalogItem.code).toBe("BHP-MSK-01");
    expect(rec.bestMatch?.catalogItem.type).toBe("akhp");
  });

  it("generates valid DestySkuMappingInput ready for persistence", () => {
    const rec = recommendMatchesForSku("OBT-PCT-500", "Paracetamol", mockCatalog);
    expect(rec.bestMatch).toBeDefined();
    const mappingInput = createMappingFromRecommendation("OBT-PCT-500", rec.bestMatch!, "custom-depot");
    expect(mappingInput).toEqual({
      destySku: "OBT-PCT-500",
      assistCode: "OBT-PCT-500",
      assistType: "prescription",
      assistId: "med-1",
      assistName: "PARACETAMOL 500 MG TABLET",
      assistUnit: "Tablet",
      destyUnit: "Tablet",
      depotId: "depot-1",
      conversionFactor: 1,
      active: true,
    });
  });
});
