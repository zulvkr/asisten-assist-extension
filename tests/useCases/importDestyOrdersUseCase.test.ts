import { beforeEach, describe, expect, it, vi } from "vitest";
import { importDestyOrdersUseCase } from "@/services/useCases/importDestyOrdersUseCase";
import type { SkuMappingEntity } from "@/domain/integration/models";

const mapping: SkuMappingEntity = {
  destySku: "SKU-TEST",
  assistCode: "MED-001",
  assistType: "prescription",
  assistId: "med-id-1",
  assistName: "Paracetamol Drops",
  depotId: "depot-test",
  conversionFactor: 1,
  active: true,
};

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
  vi.stubGlobal("window", globalThis);
});

describe("importDestyOrdersUseCase", () => {
  it("imports valid orders, ignores invalid ones, and saves to ledger", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { id: "tx-auto-1", code: "INV-AUTO-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const results = await importDestyOrdersUseCase({
      orders: [
        {
          displayedOrderSn: "ORD-VALID-1",
          totalSales: 20000,
          items: [{ masterSku: "SKU-TEST", quantity: 1 }],
        },
        {
          displayedOrderSn: "ORD-INVALID-1",
          totalSales: 15000,
          items: [{ masterSku: "UNMAPPED-SKU", quantity: 1 }],
        },
      ],
      mappings: [mapping],
      config: {
        token: "test-token",
        apiBaseUrl: "https://assist.test/api",
        accountTxId: "kas-account-1",
        hospitalId: "hosp-1",
        defaultDepotId: "depot-test",
        fetchImpl,
      },
    });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("success");
    expect(results[0].txId).toBe("tx-auto-1");
    expect(results[0].invoice).toBe("INV-AUTO-1");

    expect(results[1].status).toBe("invalid");
    expect(results[1].error).toContain("belum dipetakan");

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const ledger = storage["destySync:importLedger"] as any[];
    expect(ledger).toBeDefined();
    expect(ledger).toHaveLength(2);
    expect(ledger.find((e) => e.marketplaceOrderSn === "ORD-VALID-1")?.status).toBe("success");
    expect(ledger.find((e) => e.marketplaceOrderSn === "ORD-INVALID-1")?.status).toBe("failed");
  });

  it("automatically matches 1:1 Desty SKU with Assist catalog code when no explicit mapping exists", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { id: "tx-auto-2", code: "INV-AUTO-2" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const results = await importDestyOrdersUseCase({
      orders: [
        {
          displayedOrderSn: "ORD-1TO1-1",
          totalSales: 25000,
          items: [{ masterSku: "DIRECT-CODE-1", quantity: 2 }],
        },
      ],
      mappings: [], // No explicit mappings saved
      config: {
        token: "test-token",
        apiBaseUrl: "https://assist.test/api",
        accountTxId: "kas-account-1",
        hospitalId: "hosp-1",
        defaultDepotId: "depot-test",
        catalog: [
          {
            id: "cat-1",
            code: "DIRECT-CODE-1",
            name: "Direct Code Medicine",
            type: "prescription",
            unit: "Pcs",
            stock: 50,
          },
        ],
        fetchImpl,
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("success");
    expect(results[0].txId).toBe("tx-auto-2");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
