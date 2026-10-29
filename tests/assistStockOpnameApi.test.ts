import { describe, it, expect, vi } from "vitest";
import {
  fetchAssistStockOpnameMaster,
  submitAssistStockOpnameRepair,
} from "@/services/integration/assistStockOpnameApi";
import type { AssistRepairStockOpnameItem } from "@/types/stockOpname";

describe("assistStockOpnameApi", () => {
  it("fetches both medicine and akhp from KStockDepots/getAllData and maps rows cleanly", async () => {
    const mockFetch = vi.fn().mockImplementation((urlStr: string) => {
      const url = new URL(urlStr);
      const type = url.searchParams.get("type");

      if (type === "medicine") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: "depot_1",
                name: "Apotek",
                stock: 3,
                unit: "Tablet",
                KMedicineStocks: {
                  id: "med_1",
                  code: "MS000001",
                  medOrAkhpName: "PARATUSIN TAB 10",
                  unit: "Strip",
                },
              },
            ]),
        });
      }

      if (type === "akhp") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: "depot_2",
                name: "Apotek",
                stock: 5,
                unit: "Pieces",
                KMedicineStocks: {
                  id: "bhp_1",
                  code: "BHP00000309",
                  medOrAkhpName: "BD MICRO-FINE 5 MM",
                  unit: "Pieces",
                },
              },
            ]),
        });
      }

      return Promise.reject(new Error("Unknown URL"));
    });

    const rows = await fetchAssistStockOpnameMaster({
      apiBaseUrl: "https://api-clinica.assist.id/api",
      token: "test-token",
      hospitalId: "hosp_123",
      fetchImpl: mockFetch as any,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: "med_1",
      depotStockId: "depot_1",
      depotName: "Apotek",
      code: "MS000001",
      name: "PARATUSIN TAB 10",
      unit: "Tablet",
      itemValue: "medicine",
      systemQuantity: 3,
      countedQuantity: null,
      variance: null,
      reason: "",
      isCounted: false,
    });
    expect(rows[1]).toEqual({
      id: "bhp_1",
      depotStockId: "depot_2",
      depotName: "Apotek",
      code: "BHP00000309",
      name: "BD MICRO-FINE 5 MM",
      unit: "Pieces",
      itemValue: "akhp",
      systemQuantity: 5,
      countedQuantity: null,
      variance: null,
      reason: "",
      isCounted: false,
    });
  });

  it("submits repair payload with PUT /KTxes/repairStockOpname and handles batching", async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((urlStr: string, options: any) => {
      if (urlStr.includes("/KTxes/repairStockOpname") && options.method === "PUT") {
        capturedBody = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: "success",
              listErrors: {},
              listItemIds: ["item_audit_1"],
            }),
        });
      }
      return Promise.reject(new Error("Unexpected request"));
    });

    const items: AssistRepairStockOpnameItem[] = [
      {
        type: "auditMinus",
        itemType: "prescription",
        medOrAkhpId: "med_1",
        hospitalId: "hosp_123",
        quantity: -1,
        depotId: "depot_1",
        depotName: "Apotek",
        itemNotes: "Selisih Fisik Opname",
        medOrAkhpName: "PARATUSIN TAB 10",
        itemValue: "medicine",
        itemName: "PARATUSIN TAB 10",
        itemCode: "MS000001",
        difference: 1,
        qtyAfter: 2,
        qtyBefore: 3,
      },
    ];

    const result = await submitAssistStockOpnameRepair({
      apiBaseUrl: "https://api-clinica.assist.id/api",
      token: "test-token",
      items,
      fetchImpl: mockFetch as any,
    });

    expect(result.successCount).toBe(1);
    expect(result.listItemIds).toContain("item_audit_1");
    expect(capturedBody).toEqual(items);
  });
});
