import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAssistSaleOrder,
  fetchAssistDestyDuplicateIdentifiers,
} from "@/services/integration/assistSalesApi";
import { decryptWrappedPayload } from "@/utils/cryptoUtils";
import type { DestySkuMapping } from "@/types/destySync";

const mapping: DestySkuMapping = {
  destySku: "SKU-1", assistCode: "CODE-1", assistType: "prescription", assistId: "med-1", assistName: "Obat",
  depotId: "depot-1", conversionFactor: 1, active: true, updatedAt: "now",
};

beforeEach(() => {
  vi.stubGlobal("browser", { storage: { local: { get: vi.fn(async () => ({})) } } });
  vi.stubGlobal("window", globalThis);
});

describe("assist sales API", () => {
  it("encrypts the sale and sends PUT payment request", async () => {
    let request: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      request = init;
      return new Response(JSON.stringify({ data: { id: "tx-1", code: "INV-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await createAssistSaleOrder({
      displayedOrderSn: "ORDER-1", bookingSn: "BOOK-1", shipmentNo: "RESI-1", platformName: "Shopee", totalSales: 8000,
      items: [{ masterSku: "SKU-1", quantity: 1 }],
    }, [mapping], {
      token: "token",
      apiBaseUrl: "https://assist.test/api",
      accountTxId: "account-1",
      hospitalId: "hospital-1",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://assist.test/api/KTxes/payment", expect.objectContaining({ method: "PUT" }));
    const wrapped = JSON.parse(String(request?.body));
    const plaintext = JSON.parse(await decryptWrappedPayload(wrapped));
    expect(plaintext.isOutcome).toBe(false);
    expect(plaintext.hospitalId).toBe("hospital-1");
    expect(plaintext.accountTxId).toBe("6874f95a091ef4f8f365d800");
    expect(plaintext.item[0].hospitalId).toBe("hospital-1");
    expect(plaintext.item[0]).not.toHaveProperty("batchNo");
    expect(result).toMatchObject({ txId: "tx-1", invoice: "INV-1" });
  });

  it("ignores voided transactions during duplicate checking", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      result: [
        { status: "paid off", audit: { isVoid: true }, Payments: [{ paidName: "DESTY|platform=Shopee|order=VOID-1|booking=|resi=" }] },
        { status: "paid off", Payments: [{ paidName: "DESTY|platform=Shopee|order=ACTIVE-1|booking=|resi=" }] },
      ],
      total: 2,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const identifiers = await fetchAssistDestyDuplicateIdentifiers({
      token: "token", apiBaseUrl: "https://assist.test/api", hospitalId: "hospital-1",
      startDate: "2026-09-03", fetchImpl,
    });
    expect(identifiers.has("VOID-1")).toBe(false);
    expect(identifiers.has("ACTIVE-1")).toBe(true);
  });

  it("does not call the network in dry-run mode", async () => {
    const fetchImpl = vi.fn();
    const result = await createAssistSaleOrder({ displayedOrderSn: "ORDER-1", totalSales: 1, items: [{ masterSku: "SKU-1", quantity: 1 }] }, [mapping], {
      token: "token", apiBaseUrl: "https://assist.test/api", accountTxId: "account-1", hospitalId: "hospital-1", fetchImpl, dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
