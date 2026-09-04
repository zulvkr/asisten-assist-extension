import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleSheetSkuFallback,
  buildMappingsFromGoogleSheet,
  DEFAULT_ASSIST_DEPOT_ID,
  getDestySkuMappings,
  importDestySkuMappings,
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
});
