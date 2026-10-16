import { describe, expect, it } from "vitest";
import { calculateShiftSummaries } from "@/utils/hitunganHarianCalculations";
import type { PemasukanData } from "@/types/PemasukanData";

describe("hitunganHarianCalculations", () => {
  it("splits apotek debit into mandiri and qris correctly", () => {
    const mockData: PemasukanData[] = [
      {
        _id: "tx1",
        status: "paid off",
        totalFee: 50000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T09:00:00+07:00", // Pagi shift
        code: "INV001",
        debtFee: 0,
        isOutcome: false,
        paidFee: 50000,
        sumFee: 0,
        roundedValue: 0,
        Appointment: {},
        Diagnoses: [],
        OtherNotes: [],
        Practices: {},
        Items: [
          {
            _id: "item1",
            name: "Paracetamol",
            type: "prescription",
            hospitalId: "h1",
            transactionId: "tx1",
            quantity: 1,
            baseFee: 50000,
            discount: 0,
            totalFee: 50000,
            isPriceLock: true,
            paidFee: 50000,
            payableFee: 0,
            transactionType: "selling",
            categoryId: "c1",
            isPaidOff: true,
            createdAt: "2025-09-17T08:00:00.000Z",
            updatedAt: "2025-09-17T08:00:00.000Z",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Cashier",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
          },
        ],
        Payments: [
          {
            _id: "p1",
            totalFee: 50000,
            percentageTotal: 100,
            status: "paid",
            type: "Kartu Debit",
            name: "QRIS",
            transactionId: "tx1",
            transactionDate: "2025-09-17T08:00:00.000Z",
            accountTxId: "acc1",
            hospitalId: "h1",
            reason: "Konsultasi",
            isCovered: false,
            isNeedClaim: false,
            isOutcome: false,
            intent: "-",
            createdAt: "2025-09-17T08:00:00.000Z",
            createdId: "u1",
            paidName: "-",
            change: 0,
            createdName: "Cashier",
            trueCreatedAt: "2025-09-17T08:00:00.000Z",
          },
        ],
      },
      {
        _id: "tx2",
        status: "paid off",
        totalFee: 75000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T10:00:00+07:00", // Pagi shift
        code: "INV002",
        debtFee: 0,
        isOutcome: false,
        paidFee: 75000,
        sumFee: 0,
        roundedValue: 0,
        Appointment: {},
        Diagnoses: [],
        OtherNotes: [],
        Practices: {},
        Items: [
          {
            _id: "item2",
            name: "Amoxicillin",
            type: "prescription",
            hospitalId: "h1",
            transactionId: "tx2",
            quantity: 1,
            baseFee: 75000,
            discount: 0,
            totalFee: 75000,
            isPriceLock: true,
            paidFee: 75000,
            payableFee: 0,
            transactionType: "selling",
            categoryId: "c1",
            isPaidOff: true,
            createdAt: "2025-09-17T10:00:00+07:00",
            updatedAt: "2025-09-17T10:00:00+07:00",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Cashier",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
          },
        ],
        Payments: [
          {
            _id: "p2",
            totalFee: 75000,
            percentageTotal: 100,
            status: "paid",
            type: "Kartu Debit",
            name: "Bank Mandiri",
            transactionId: "tx2",
            transactionDate: "2025-09-17T10:00:00+07:00",
            accountTxId: "acc1",
            hospitalId: "h1",
            reason: "Konsultasi",
            isCovered: false,
            isNeedClaim: false,
            isOutcome: false,
            intent: "-",
            createdAt: "2025-09-17T10:00:00+07:00",
            createdId: "u1",
            paidName: "-",
            change: 0,
            createdName: "Cashier",
            trueCreatedAt: "2025-09-17T10:00:00+07:00",
          },
        ],
      },
      {
        _id: "tx3",
        status: "paid off",
        totalFee: 20000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T11:00:00+07:00", // Pagi shift
        code: "INV003",
        debtFee: 0,
        isOutcome: false,
        paidFee: 20000,
        sumFee: 0,
        roundedValue: 0,
        Appointment: {},
        Diagnoses: [],
        OtherNotes: [],
        Practices: {},
        Items: [
          {
            _id: "item3",
            name: "Sanmol",
            type: "prescription",
            hospitalId: "h1",
            transactionId: "tx3",
            quantity: 1,
            baseFee: 20000,
            discount: 0,
            totalFee: 20000,
            isPriceLock: true,
            paidFee: 20000,
            payableFee: 0,
            transactionType: "selling",
            categoryId: "c1",
            isPaidOff: true,
            createdAt: "2025-09-17T11:00:00+07:00",
            updatedAt: "2025-09-17T11:00:00+07:00",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Cashier",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
          },
        ],
        Payments: [
          {
            _id: "p3",
            totalFee: 20000,
            percentageTotal: 100,
            status: "paid",
            type: "Langsung",
            name: "Tunai",
            transactionId: "tx3",
            transactionDate: "2025-09-17T11:00:00+07:00",
            accountTxId: "acc1",
            hospitalId: "h1",
            reason: "-",
            isCovered: false,
            isNeedClaim: false,
            isOutcome: false,
            intent: "-",
            createdAt: "2025-09-17T11:00:00+07:00",
            createdId: "u1",
            paidName: "-",
            change: 0,
            createdName: "Cashier",
            trueCreatedAt: "2025-09-17T11:00:00+07:00",
          },
        ],
      },
    ];

    const summaries = calculateShiftSummaries(mockData);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    expect(summary.shift).toBe("Pagi");
    expect(summary.apotek.cash).toBe(20000);
    expect(summary.apotek.mandiri).toBe(75000);
    expect(summary.apotek.qris).toBe(50000);
    expect(summary.apotek.total).toBe(145000);
  });

  it("calculates HPP using latest buy price (buyFee) instead of avgHPP", () => {
    const mockData: PemasukanData[] = [
      {
        _id: "tx1",
        status: "paid off",
        totalFee: 30000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T09:00:00+07:00",
        code: "INV001",
        debtFee: 0,
        isOutcome: false,
        paidFee: 30000,
        sumFee: 0,
        roundedValue: 0,
        Appointment: {},
        Diagnoses: [],
        OtherNotes: [],
        Practices: {},
        Items: [
          {
            _id: "item1",
            name: "Paracetamol",
            type: "prescription",
            medicineId: "med1",
            hospitalId: "h1",
            transactionId: "tx1",
            quantity: 2,
            baseFee: 15000,
            discount: 0,
            totalFee: 30000,
            isPriceLock: true,
            paidFee: 30000,
            payableFee: 0,
            transactionType: "selling",
            categoryId: "c1",
            isPaidOff: true,
            createdAt: "2025-09-17T08:00:00.000Z",
            updatedAt: "2025-09-17T08:00:00.000Z",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Cashier",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
            buyFee: 8000,
            avgHPP: 10000,
          },
        ],
        Payments: [
          {
            _id: "p1",
            totalFee: 30000,
            percentageTotal: 100,
            status: "paid",
            type: "Langsung",
            name: "Tunai",
            transactionId: "tx1",
            transactionDate: "2025-09-17T08:00:00.000Z",
            accountTxId: "acc1",
            hospitalId: "h1",
            reason: "-",
            isCovered: false,
            isNeedClaim: false,
            isOutcome: false,
            intent: "-",
            createdAt: "2025-09-17T08:00:00.000Z",
            createdId: "u1",
            paidName: "-",
            change: 0,
            createdName: "Cashier",
            trueCreatedAt: "2025-09-17T08:00:00.000Z",
          },
        ],
      },
    ];

    const summaries = calculateShiftSummaries(mockData);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    // unitHpp should be buyFee (8000), totalHpp = 2 * 8000 = 16000 (not 2 * 10000 = 20000)
    expect(summary.hpp).toBe(16000);
    expect(summary.details[0].hpp).toBe(16000);
    expect(summary.details[0].items[0].unitHpp).toBe(8000);
    expect(summary.details[0].items[0].totalHpp).toBe(16000);
  });

  it("resolves latest buy price from catalog when item buyFee is missing", () => {
    const mockData: PemasukanData[] = [
      {
        _id: "tx1",
        status: "paid off",
        totalFee: 25000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T09:00:00+07:00",
        code: "INV001",
        debtFee: 0,
        isOutcome: false,
        paidFee: 25000,
        sumFee: 0,
        roundedValue: 0,
        Appointment: {},
        Diagnoses: [],
        OtherNotes: [],
        Practices: {},
        Items: [
          {
            _id: "item1",
            name: "Amoxicillin",
            type: "prescription",
            medicineId: "med2",
            hospitalId: "h1",
            transactionId: "tx1",
            quantity: 3,
            baseFee: 25000,
            discount: 0,
            totalFee: 25000,
            isPriceLock: true,
            paidFee: 25000,
            payableFee: 0,
            transactionType: "selling",
            categoryId: "c1",
            isPaidOff: true,
            createdAt: "2025-09-17T08:00:00.000Z",
            updatedAt: "2025-09-17T08:00:00.000Z",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Cashier",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
          },
        ],
        Payments: [
          {
            _id: "p1",
            totalFee: 25000,
            percentageTotal: 100,
            status: "paid",
            type: "Langsung",
            name: "Tunai",
            transactionId: "tx1",
            transactionDate: "2025-09-17T08:00:00.000Z",
            accountTxId: "acc1",
            hospitalId: "h1",
            reason: "-",
            isCovered: false,
            isNeedClaim: false,
            isOutcome: false,
            intent: "-",
            createdAt: "2025-09-17T08:00:00.000Z",
            createdId: "u1",
            paidName: "-",
            change: 0,
            createdName: "Cashier",
            trueCreatedAt: "2025-09-17T08:00:00.000Z",
          },
        ],
      },
    ];

    const hppCatalog = [
      {
        id: "med2",
        code: "MED002",
        name: "Amoxicillin",
        type: "prescription" as const,
        avgHPP: 6000,
        buyFee: 4500,
      },
    ];

    const summaries = calculateShiftSummaries(mockData, hppCatalog);
    expect(summaries).toHaveLength(1);
    // Should choose catalog buyFee (4500) over catalog avgHPP (6000)
    expect(summaries[0].hpp).toBe(13500); // 3 * 4500
    expect(summaries[0].details[0].items[0].unitHpp).toBe(4500);
    expect(summaries[0].details[0].items[0].totalHpp).toBe(13500);
  });

  it("enriches shift summary and detail row with online order info and profit metrics", () => {
    const mockData: PemasukanData[] = [
      {
        _id: "tx-desty-test",
        status: "paid off",
        totalFee: 100000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T09:30:00+07:00",
        code: "INV-ONLINE-01",
        debtFee: 0,
        isOutcome: false,
        paidFee: 100000,
        sumFee: 0,
        roundedValue: 0,
        Appointment: {},
        Diagnoses: [],
        OtherNotes: [],
        Practices: {},
        Items: [
          {
            _id: "item-shopee",
            name: "Minyak Telon 100ml",
            type: "prescription",
            hospitalId: "h1",
            transactionId: "tx-desty-test",
            quantity: 2,
            baseFee: 50000,
            discount: 0,
            totalFee: 100000,
            isPriceLock: true,
            paidFee: 100000,
            payableFee: 0,
            transactionType: "selling",
            categoryId: "c1",
            isPaidOff: true,
            createdAt: "2025-09-17T09:30:00+07:00",
            updatedAt: "2025-09-17T09:30:00+07:00",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Kasir Online",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
            buyFee: 35000,
          },
        ],
        Payments: [
          {
            _id: "pay-shopee",
            totalFee: 100000,
            percentageTotal: 100,
            status: "paid",
            type: "Kartu Debit",
            name: "Shopee",
            transactionId: "tx-desty-test",
            transactionDate: "2025-09-17T09:30:00+07:00",
            accountTxId: "acc1",
            hospitalId: "h1",
            reason: "-",
            isCovered: false,
            isNeedClaim: false,
            isOutcome: false,
            intent: "-",
            createdAt: "2025-09-17T09:30:00+07:00",
            createdId: "u1",
            paidName: "DESTY|platform=Shopee|order=ORDER-SHP-888|booking=BOOK-77|resi=SPXID999",
            change: 0,
            createdName: "Kasir Online",
            trueCreatedAt: "2025-09-17T09:30:00+07:00",
          },
        ],
      },
    ];

    const summaries = calculateShiftSummaries(mockData);
    expect(summaries).toHaveLength(1);
    const shift = summaries[0];
    expect(shift.transactionCount).toBe(1);
    expect(shift.totalOmset).toBe(100000);
    expect(shift.hpp).toBe(70000); // 2 * 35000
    expect(shift.grossProfit).toBe(30000);
    expect(shift.marginPercent).toBe(30);

    const tx = shift.details[0];
    expect(tx.onlineInfo.isOnline).toBe(true);
    expect(tx.onlineInfo.platform).toBe("Shopee");
    expect(tx.onlineInfo.orderNo).toBe("ORDER-SHP-888");
    expect(tx.onlineInfo.resi).toBe("SPXID999");
    expect(tx.createdName).toBe("Kasir Online");
    expect(tx.grossProfit).toBe(30000);
    expect(tx.marginPercent).toBe(30);
  });
});
