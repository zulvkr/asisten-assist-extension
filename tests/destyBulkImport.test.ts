import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkImportDestyOrders } from "@/services/destySync/bulkImport";
import type { DestySkuMapping } from "@/types/destySync";

const mapping: DestySkuMapping = {
  destySku: "SKU", assistCode: "CODE", assistType: "akhp", assistId: "akhp-1", assistName: "BHP",
  depotId: "depot-1", conversionFactor: 1, active: true, updatedAt: "now",
};

let storage: Record<string, unknown> = {};
beforeEach(() => {
  storage = {};
  vi.stubGlobal("browser", {
    storage: { local: {
      get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
      set: vi.fn(async (value: Record<string, unknown>) => Object.assign(storage, value)),
    } },
  });
  vi.stubGlobal("window", globalThis);
});

describe("bulkImportDestyOrders", () => {
  it("does not send invalid orders and limits processing to valid ones", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { id: "tx-1" } }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    const results = await bulkImportDestyOrders({
      orders: [
        { displayedOrderSn: "GOOD", totalSales: 100, items: [{ masterSku: "SKU", quantity: 1 }] },
        { displayedOrderSn: "BAD", totalSales: 100, items: [{ masterSku: "UNKNOWN", quantity: 1 }] },
      ],
      mappings: [mapping],
      config: { token: "token", apiBaseUrl: "https://assist.test/api", accountTxId: "account", hospitalId: "hospital-1", fetchImpl },
    });
    expect(results.map((item) => item.status)).toEqual(expect.arrayContaining(["success", "invalid"]));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
