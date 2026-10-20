import { describe, expect, it } from "vitest";
import { compareStockLevels } from "@/utils/compareStockLevels";

describe("compareStockLevels", () => {
  it("matches stock 1:1 when SKU matches Desty SKU directly", () => {
    const soldItems = [
      {
        medicineId: "med-1",
        itemName: "Paracetamol 500mg",
        qtySold: 5,
        source: "assist" as const,
        sku: "PCT-500",
      },
    ];

    const rows = compareStockLevels({
      soldItems,
      assistStockByMedicineId: { "med-1": 100 },
      kodeObatByMedicineId: { "med-1": "PCT-500" },
      destyStockBySku: { "PCT-500": 100 },
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.sku).toBe("PCT-500");
    expect(row.assistStock).toBe(100);
    expect(row.destyStock).toBe(100);
    expect(row.destyEquivalentStock).toBe(100);
    expect(row.kesesuaian).toBe("Sesuai");
    expect(row.attentionLabel).toBeNull();
  });

  it("handles case-insensitive SKU matching", () => {
    const soldItems = [
      {
        medicineId: "med-1",
        itemName: "Amoxicillin",
        qtySold: 2,
        source: "assist" as const,
        sku: "amx-500",
      },
    ];

    const rows = compareStockLevels({
      soldItems,
      assistStockByMedicineId: { "med-1": 50 },
      kodeObatByMedicineId: { "med-1": "AMX-500" },
      destyStockBySku: { "AMX-500": 50 },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].assistStock).toBe(50);
    expect(rows[0].destyStock).toBe(50);
    expect(rows[0].kesesuaian).toBe("Sesuai");
  });

  it("correctly applies conversion factor to compute destyEquivalentStock without altering raw assistStock", () => {
    const soldItems = [
      {
        medicineId: "med-box",
        itemName: "Vitamin C Box",
        qtySold: 1,
        source: "assist" as const,
        sku: "VITC-BOX",
      },
    ];

    // Assist has 100 Strip in stock, conversion factor is 10 (1 Box = 10 Strip)
    // So 100 Strip in Assist corresponds to 10 Box in Desty.
    const rows = compareStockLevels({
      soldItems,
      assistStockByMedicineId: { "med-box": 100 },
      kodeObatByMedicineId: { "med-box": "VITC-STRIP" },
      destyStockBySku: { "VITC-BOX": 10 },
      conversionFactorBySku: { "VITC-BOX": 10 },
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.assistStock).toBe(100); // Raw Assist stock stays 100
    expect(row.destyEquivalentStock).toBe(10); // 100 / 10 = 10 Box
    expect(row.destyStock).toBe(10); // Desty physical/available is 10 Box
    expect(row.kesesuaian).toBe("Sesuai"); // Matches!
  });

  it("detects discrepancy when Desty stock does not match destyEquivalentStock", () => {
    const soldItems = [
      {
        medicineId: "med-box",
        itemName: "Vitamin C Box",
        qtySold: 1,
        source: "assist" as const,
        sku: "VITC-BOX",
      },
    ];

    // Assist has 100 Strip (= 10 Box), but Desty has 8 Box
    const rows = compareStockLevels({
      soldItems,
      assistStockByMedicineId: { "med-box": 100 },
      kodeObatByMedicineId: { "med-box": "VITC-STRIP" },
      destyStockBySku: { "VITC-BOX": 8 },
      conversionFactorBySku: { "VITC-BOX": 10 },
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.assistStock).toBe(100);
    expect(row.destyEquivalentStock).toBe(10);
    expect(row.destyStock).toBe(8);
    expect(row.kesesuaian).toBe("Tidak Sesuai");
    expect(row.attentionLabel).toBe("Segera isi Desty");
  });
});
