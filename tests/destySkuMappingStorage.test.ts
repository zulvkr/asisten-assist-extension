import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleSheetSkuFallback,
  buildMappingsFromGoogleSheet,
  DEFAULT_ASSIST_DEPOT_ID,
  getDestySkuMappings,
  importDestySkuMappings,
  resolveEffectiveDestySkuMapping,
  upsertDestySkuMapping,
} from "@/services/destySync/mappingStorage";

let storage: Record<string, unknown> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
        set: vi.fn(async (value: Record<string, unknown>) => Object.assign(storage, value)),
      },
    },
  });
});

describe("Desty SKU mapping storage", () => {
  it("saves, replaces and reads mappings from browser storage", async () => {
    await upsertDestySkuMapping({ destySku: "BOX", assistCode: "A-1", assistType: "prescription", assistId: "med-1", assistName: "Obat", conversionFactor: 10, active: true });
    await upsertDestySkuMapping({ destySku: "box", assistCode: "A-1", assistType: "prescription", assistId: "med-1", assistName: "Obat Baru", conversionFactor: 5, active: true });
    const mappings = await getDestySkuMappings();
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toMatchObject({ destySku: "box", assistName: "Obat Baru", conversionFactor: 5 });
  });

  it("builds mappings automatically from Google Sheet code and Assist catalog", () => {
    const result = buildMappingsFromGoogleSheet(
      [["CODE", "Nama dari Sheet", "", "", "", "SKU"]],
      [{ id: "med-1", code: "CODE", name: "Nama Assist", type: "prescription", unit: "Strip" }],
    );
    expect(result.unmatchedSkus).toEqual([]);
    expect(result.mappings[0]).toMatchObject({
      destySku: "SKU", assistId: "med-1", assistType: "prescription", depotId: DEFAULT_ASSIST_DEPOT_ID, conversionFactor: 1,
    });
  });

  it("validates imported JSON and reads Google Sheet fallback", async () => {
    await importDestySkuMappings(JSON.stringify([{ destySku: "SKU", assistCode: "CODE", assistType: "akhp", assistId: "akhp-1", assistName: "BHP", conversionFactor: 1, active: true }]));
    expect(await getDestySkuMappings()).toHaveLength(1);
    expect(buildGoogleSheetSkuFallback([["CODE", "BHP", "", "", "", "SKU"]])).toEqual([{ destySku: "SKU", assistCode: "CODE", assistName: "BHP" }]);
  });

  it("resolves explicit mapping over fallback, and falls back to 1:1 catalog match", () => {
    const catalog = [
      { id: "med-1", code: "PARACETAMOL", name: "Paracetamol 500mg", type: "prescription" as const, unit: "Tab" },
      { id: "med-2", code: "AMOX", name: "Amoxicillin 500mg", type: "prescription" as const, unit: "Kaplet" },
    ];
    const explicitMappings = [
      {
        destySku: "PARACETAMOL",
        assistCode: "PARACETAMOL",
        assistType: "prescription" as const,
        assistId: "med-1",
        assistName: "Paracetamol 500mg Box",
        conversionFactor: 10,
        active: true,
      },
    ];

    // Explicit mapping takes precedence
    const explicitResult = resolveEffectiveDestySkuMapping("PARACETAMOL", explicitMappings, catalog);
    expect(explicitResult).toBeDefined();
    expect(explicitResult?.conversionFactor).toBe(10);

    // Fallback 1:1 when not in explicit mappings
    const fallbackResult = resolveEffectiveDestySkuMapping("AMOX", explicitMappings, catalog);
    expect(fallbackResult).toBeDefined();
    expect(fallbackResult?.assistCode).toBe("AMOX");
    expect(fallbackResult?.assistName).toBe("Amoxicillin 500mg");
    expect(fallbackResult?.conversionFactor).toBe(1);

    // Returns undefined if not matching
    const unmappedResult = resolveEffectiveDestySkuMapping("NON-EXISTENT", explicitMappings, catalog);
    expect(unmappedResult).toBeUndefined();
  });
});
