import { describe, expect, it } from "vitest";
import { normalizeDestyOrder } from "@/services/destySync/orderNormalizer";
import { buildAssistSalePayload } from "@/services/destySync/salePayloadBuilder";

describe("buildAssistSalePayload", () => {
  it("builds medicine payload without batch fields", () => {
    const order = normalizeDestyOrder({ displayedOrderSn: "ORDER-1", bookingSn: "BOOK-1", shipmentNo: "RESI-1", platformName: "Shopee", totalSales: 8000 });
    const payload = buildAssistSalePayload(order, [{
      orderItem: { destySku: "SKU", productName: "Obat", quantity: 1 },
      mapping: {
        destySku: "SKU", assistCode: "CODE", assistType: "prescription", assistId: "med-1", assistName: "Obat", assistUnit: "Botol", conversionFactor: 1, active: true, updatedAt: "now",
      },
      assistQuantity: 1,
    }], { accountTxId: "account-1", hospitalId: "hospital-1", depotIdByAssistId: { "med-1": "depot-1" } });

    expect(payload).toMatchObject({
      isOutcome: false,
      status: "paid off",
      anonymousPatient: true,
      patientName: "Pasien Apotek",
      isOnlyPOS: true,
    });
    expect(payload.item[0]).toMatchObject({
      name: "Obat", code: "CODE", type: "prescription", medicineId: "med-1",
      depotId: "depot-1", quantity: 1, hospitalId: "hospital-1", unit: "Botol",
      isPriceLock: true, baseFee: 8000, totalFee: 8000, transactionType: "selling",
    });
    expect(payload.item[0]).not.toHaveProperty("batchNo");
    expect(payload.payment[0]).toMatchObject({ isOutcome: false, type: "Kartu Debit", name: "Shopee", accountTxId: "account-1", paidName: "DESTY|platform=Shopee|order=ORDER-1|booking=BOOK-1|resi=RESI-1" });
  });

  it("builds BHP payload with akhpId", () => {
    const order = normalizeDestyOrder({ displayedOrderSn: "ORDER-2", platformName: "TikTok", totalSales: 5000 });
    const payload = buildAssistSalePayload(order, [{
      orderItem: { destySku: "BHP", productName: "Masker", quantity: 2 },
      mapping: {
        destySku: "BHP", assistCode: "BHP-1", assistType: "akhp", assistId: "akhp-1", assistName: "Masker", conversionFactor: 1, active: true, updatedAt: "now",
      },
      assistQuantity: 2,
    }], { accountTxId: "account-1", hospitalId: "hospital-1", depotIdByAssistId: { "akhp-1": "depot-1" } });
    expect(payload.item[0]).toMatchObject({
      name: "Masker", code: "BHP-1", type: "akhp", akhpId: "akhp-1",
      depotId: "depot-1", quantity: 2, hospitalId: "hospital-1",
      baseFee: 2500, totalFee: 5000, transactionType: "selling",
    });
  });
});
