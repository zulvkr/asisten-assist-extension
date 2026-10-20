import { describe, expect, it } from "vitest";
import {
  cleanseAssistCatalog,
  buildCleanProductLookup,
  type CleanAssistProduct,
} from "@/services/integration/assistProductAcl";
import { buildAllProductsSoRows } from "@/services/destySync/destyStockOpnameService";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";
import type { DestySkuMapping } from "@/types/destySync";

describe("Anti-Corruption Layer (assistProductAcl)", () => {
  it("enriches raw Assist items with SKU and margin from Firebase margin_mappings", () => {
    const rawCatalog = [
      {
        id: "med-1238",
        code: "MS001238",
        name: "[ANAK] NELLCO SPESIAL OBH PE JERUK",
        type: "prescription" as const,
        unit: "BOTOL",
        stock: 1,
      },
      {
        id: "med-0653",
        code: "MS000653",
        name: "[DEWASA] OBH NELLCO PE SPECIAL 100 ML",
        type: "prescription" as const,
        unit: "Botol",
        stock: 5,
      },
    ];

    // Firebase margin_mappings (legacy row format or objects)
    const marginMappings = [
      // [kodeAssist, nama, margin, batasWarningStok, matikanWarningStok, sku]
      ["MS001238", "[ANAK] NELLCO SPESIAL OBH PE JERUK", "25%", "2", "false", "OBT-NLC-NELLCO-SYR-ANK-JRK-55"],
      ["MS000653", "[DEWASA] OBH NELLCO PE SPECIAL 100 ML", "20%", "3", "false", "OBT-PNI-OBHNLCPC-SYR-100"],
    ];

    const cleaned = cleanseAssistCatalog(rawCatalog, { marginMappings });

    expect(cleaned).toHaveLength(2);

    const nellcoAnak = cleaned.find((p) => p.code === "MS001238");
    expect(nellcoAnak).toBeDefined();
    expect(nellcoAnak?.sku).toBe("OBT-NLC-NELLCO-SYR-ANK-JRK-55");
    expect(nellcoAnak?.hasCustomSku).toBe(true);
    expect(nellcoAnak?.margin).toBe("25%");
    expect(nellcoAnak?.batasWarningStok).toBe("2");
    expect(nellcoAnak?.stock).toBe(1);

    const nellcoDewasa = cleaned.find((p) => p.code === "MS000653");
    expect(nellcoDewasa).toBeDefined();
    expect(nellcoDewasa?.sku).toBe("OBT-PNI-OBHNLCPC-SYR-100");
    expect(nellcoDewasa?.margin).toBe("20%");
  });

  it("prioritizes desty_sku_mappings overrides over margin_mappings", () => {
    const rawCatalog = [
      {
        id: "med-999",
        code: "MS000999",
        name: "Paracetamol 500mg Strip",
        type: "prescription" as const,
        unit: "Strip",
        stock: 10,
      },
    ];

    const marginMappings = [
      ["MS000999", "Paracetamol 500mg", "15%", "", "", "PCT-STRIP-DEFAULT"],
    ];

    const destyMappings: DestySkuMapping[] = [
      {
        destySku: "PCT-BOX-OVERRIDE",
        assistCode: "MS000999",
        assistId: "med-999",
        assistName: "Paracetamol 500mg Strip",
        assistType: "prescription",
        conversionFactor: 10,
        active: true,
      },
    ];

    const cleaned = cleanseAssistCatalog(rawCatalog, { marginMappings, destyMappings });

    expect(cleaned[0].sku).toBe("PCT-BOX-OVERRIDE");
    expect(cleaned[0].conversionFactor).toBe(10);
    expect(cleaned[0].margin).toBe("15%");
  });

  it("builds multi-index lookups indexing by SKU, code, id, and name", () => {
    const products: CleanAssistProduct[] = [
      {
        id: "med-1",
        code: "MS001238",
        name: "Nellco Anak Jeruk",
        type: "prescription",
        unit: "BOTOL",
        stock: 1,
        sku: "OBT-NLC-NELLCO-SYR-ANK-JRK-55",
        hasCustomSku: true,
        margin: "25%",
        conversionFactor: 1,
        isMapped: true,
      },
    ];

    const lookup = buildCleanProductLookup(products);

    // Look up by SKU from Firebase
    expect(lookup.bySku.get("OBT-NLC-NELLCO-SYR-ANK-JRK-55")?.code).toBe("MS001238");
    expect(lookup.stockBySku.get("OBT-NLC-NELLCO-SYR-ANK-JRK-55")).toBe(1);

    // Look up by internal Assist code
    expect(lookup.byCode.get("MS001238")?.sku).toBe("OBT-NLC-NELLCO-SYR-ANK-JRK-55");
    expect(lookup.stockByCode.get("MS001238")).toBe(1);
  });

  it("correctly matches Desty SKU with Assist product having Firebase SKU in Mode 3 (All Products SO)", () => {
    // Assist product in POS has code MS001238, but Firebase has SKU OBT-NLC-NELLCO-SYR-ANK-JRK-55
    const cleanedCatalog = cleanseAssistCatalog(
      [
        {
          id: "med-1238",
          code: "MS001238",
          name: "[ANAK] NELLCO SPESIAL OBH PE JERUK",
          type: "prescription",
          unit: "BOTOL",
          stock: 1,
        },
      ],
      {
        marginMappings: [
          ["MS001238", "[ANAK] NELLCO SPESIAL OBH PE JERUK", "25%", "", "", "OBT-NLC-NELLCO-SYR-ANK-JRK-55"],
        ],
      },
    );

    const destyStockMap: Record<string, DestyOmniStockItem> = {
      "OBT-NLC-NELLCO-SYR-ANK-JRK-55": {
        sku: "OBT-NLC-NELLCO-SYR-ANK-JRK-55",
        skuId: "sku-desty-123",
        productName: "OBH NELLCO SPESIAL PE ANAK-ANAK RASA JERUK 55 ML",
        fisik: 1,
        tersedia: 1,
        pesanan: 0,
      },
    };

    const rows = buildAllProductsSoRows({
      destyStockMap,
      assistCatalog: cleanedCatalog,
      mappings: [],
    });

    // Should result in exactly 1 matched row, NOT 2 separate unmapped rows!
    expect(rows).toHaveLength(1);
    expect(rows[0].destySku).toBe("OBT-NLC-NELLCO-SYR-ANK-JRK-55");
    expect(rows[0].assistCode).toBe("MS001238");
    expect(rows[0].assistItemName).toBe("[ANAK] NELLCO SPESIAL OBH PE JERUK");
    expect(rows[0].assistSku).toBe("OBT-NLC-NELLCO-SYR-ANK-JRK-55");
    expect(rows[0].assistMargin).toBe("25%");
    expect(rows[0].status).toBe("matched");
    expect(rows[0].statusMessage).toBe("Stok Sesuai (Cocok)");
  });

  it("supports 1 Assist product mapped to multiple Desty SKUs with different units and conversions (1:N)", () => {
    // 1 Assist Product: Paracetamol Strip in POS (100 strips in stock)
    const rawCatalog = [
      {
        id: "med-pct",
        code: "MS000100",
        name: "Paracetamol 500 mg",
        type: "prescription" as const,
        unit: "Strip",
        stock: 100,
      },
    ];

    // Desty has 2 products for this 1 Assist item: Box (isi 10 Strip) and Strip (ecer)
    const destyMappings: DestySkuMapping[] = [
      {
        destySku: "PCT-BOX-10S",
        assistCode: "MS000100",
        assistId: "med-pct",
        assistName: "Paracetamol 500 mg",
        assistType: "prescription",
        destyUnit: "Box",
        assistUnit: "Strip",
        conversionFactor: 10,
        active: true,
      },
      {
        destySku: "PCT-STRIP-1S",
        assistCode: "MS000100",
        assistId: "med-pct",
        assistName: "Paracetamol 500 mg",
        assistType: "prescription",
        destyUnit: "Strip",
        assistUnit: "Strip",
        conversionFactor: 1,
        active: true,
      },
    ];

    const cleaned = cleanseAssistCatalog(rawCatalog, { destyMappings });
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].skus).toEqual(["PCT-BOX-10S", "PCT-STRIP-1S"]);
    expect(cleaned[0].destyMappings).toHaveLength(2);

    const lookup = buildCleanProductLookup(cleaned);

    // Both SKUs point to the SAME Assist product
    expect(lookup.bySku.get("PCT-BOX-10S")?.code).toBe("MS000100");
    expect(lookup.bySku.get("PCT-STRIP-1S")?.code).toBe("MS000100");

    // Mode 3: Both Desty SKUs in destyStockMap should match the same Assist product
    const destyStockMap: Record<string, DestyOmniStockItem> = {
      "PCT-BOX-10S": {
        sku: "PCT-BOX-10S",
        skuId: "sku-box",
        productName: "Paracetamol 500mg (Box isi 10 Strip)",
        fisik: 10, // 100 strips / 10 = 10 boxes
        tersedia: 10,
        pesanan: 0,
      },
      "PCT-STRIP-1S": {
        sku: "PCT-STRIP-1S",
        skuId: "sku-strip",
        productName: "Paracetamol 500mg (1 Strip)",
        fisik: 100, // 100 strips / 1 = 100 strips
        tersedia: 100,
        pesanan: 0,
      },
    };

    const rows = buildAllProductsSoRows({
      destyStockMap,
      assistCatalog: cleaned,
      mappings: destyMappings,
    });

    expect(rows).toHaveLength(2);

    const boxRow = rows.find((r) => r.destySku === "PCT-BOX-10S");
    expect(boxRow).toBeDefined();
    expect(boxRow?.assistCode).toBe("MS000100");
    expect(boxRow?.assistStock).toBe(100);
    expect(boxRow?.conversionFactor).toBe(10);
    expect(boxRow?.destyEquivalentStock).toBe(10); // 100 / 10 = 10 Box
    expect(boxRow?.destyUnit).toBe("Box");
    expect(boxRow?.status).toBe("matched");

    const stripRow = rows.find((r) => r.destySku === "PCT-STRIP-1S");
    expect(stripRow).toBeDefined();
    expect(stripRow?.assistCode).toBe("MS000100");
    expect(stripRow?.assistStock).toBe(100);
    expect(stripRow?.conversionFactor).toBe(1);
    expect(stripRow?.destyEquivalentStock).toBe(100); // 100 / 1 = 100 Strip
    expect(stripRow?.destyUnit).toBe("Strip");
    expect(stripRow?.status).toBe("matched");
  });
});
