import { describe, expect, it } from "vitest";
import {
  toAssistSalePayload,
  buildPaidNameMetadata,
  DEFAULT_ASSIST_TRANSACTION_ACCOUNT_TX_ID,
} from "@/adapters/assist/assistSaleAdapter";
import type { CanonicalSaleCommand } from "@/domain/integration/models";

describe("assistSaleAdapter", () => {
  it("translates CanonicalSaleCommand to Assist proprietary JSON payload", () => {
    const command: CanonicalSaleCommand = {
      orderId: "ORD-99",
      externalOrderSn: "MP-99",
      platformName: "Tokopedia",
      hospitalId: "hosp-1",
      accountTxId: "kas-debit-account",
      patientName: "Pasien Tokopedia",
      paidFee: 30000,
      totalFee: 30000,
      items: [
        {
          assistItemId: "item-1",
          assistCode: "OBAT-01",
          assistName: "Paracetamol",
          type: "prescription",
          quantity: 2,
          unit: "Strip",
          depotId: "depot-main",
          hospitalId: "hosp-1",
          baseFee: 15000,
          totalFee: 30000,
        },
      ],
      rawOrder: {
        orderId: "ORD-99",
        externalOrderSn: "MP-99",
        bookingSn: "BOOK-99",
        trackingNumber: "TRACK-99",
        platformName: "Tokopedia",
        totalSales: 30000,
        items: [],
      },
    };

    const payload = toAssistSalePayload(command);

    expect(payload.isOutcome).toBe(false);
    expect(payload.status).toBe("paid off");
    expect(payload.hospitalId).toBe("hosp-1");
    expect(payload.accountTxId).toBe(DEFAULT_ASSIST_TRANSACTION_ACCOUNT_TX_ID);
    expect(payload.item).toHaveLength(1);
    expect(payload.item[0]).toMatchObject({
      name: "Paracetamol",
      code: "OBAT-01",
      type: "prescription",
      medicineId: "item-1",
      depotId: "depot-main",
      quantity: 2,
      baseFee: 15000,
      totalFee: 30000,
    });
    expect(payload.payment[0]).toMatchObject({
      isOutcome: false,
      totalFee: 30000,
      type: "Kartu Debit",
      name: "Tokopedia",
      cardOwner: "Desty",
      accountTxId: "kas-debit-account",
      paidName: "DESTY|platform=Tokopedia|order=MP-99|booking=BOOK-99|resi=TRACK-99",
    });
  });

  it("buildPaidNameMetadata properly escapes pipe and newline characters", () => {
    const paidName = buildPaidNameMetadata({
      platform: "Shopee|Mall",
      orderId: "ORD\n123",
      bookingSn: "BOOK|1",
      trackingNumber: "TRK",
    });

    expect(paidName).toBe("DESTY|platform=Shopee%7CMall|order=ORD 123|booking=BOOK%7C1|resi=TRK");
  });
});
