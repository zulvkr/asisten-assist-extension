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

  it("does not fallback to avgHPP when buyFee is missing (strictly uses buyFee / harga beli)", () => {
    const mockData: PemasukanData[] = [
      {
        _id: "tx-no-buyfee",
        status: "paid off",
        totalFee: 25000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T09:00:00+07:00",
        code: "INV002",
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
            _id: "item-avg-only",
            name: "Amoxicillin",
            type: "prescription",
            medicineId: "med-avg-only",
            hospitalId: "h1",
            transactionId: "tx-no-buyfee",
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
            avgHPP: 5000, // item only has avgHPP
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
            transactionId: "tx-no-buyfee",
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
        id: "med-avg-only",
        code: "MED003",
        name: "Amoxicillin",
        type: "prescription" as const,
        avgHPP: 6000, // catalog also only has avgHPP, no buyFee
        buyFee: null,
      },
    ];

    const summaries = calculateShiftSummaries(mockData, hppCatalog);
    expect(summaries).toHaveLength(1);
    // Should NOT fallback to avgHPP (5000 or 6000), must be 0
    expect(summaries[0].hpp).toBe(0);
    expect(summaries[0].details[0].items[0].unitHpp).toBe(0);
    expect(summaries[0].details[0].items[0].totalHpp).toBe(0);
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

  it("calculates gross profit and margin exclusively for apotek, excluding klinik", () => {
    const mockData: PemasukanData[] = [
      {
        _id: "tx-mixed",
        status: "paid off",
        totalFee: 250000,
        creditFee: 0,
        isOnlyPOS: false,
        createdAt: "2025-09-17T09:30:00+07:00",
        code: "INV-MIXED-01",
        debtFee: 0,
        isOutcome: false,
        paidFee: 250000,
        sumFee: 0,
        roundedValue: 0,
        Appointment: {},
        Diagnoses: [],
        OtherNotes: [],
        Practices: {},
        Items: [
          {
            _id: "item-obat",
            name: "Amoxicillin",
            type: "prescription",
            hospitalId: "h1",
            transactionId: "tx-mixed",
            quantity: 1,
            baseFee: 100000,
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
            createdName: "Kasir",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
            buyFee: 60000,
          },
          {
            _id: "item-tindakan-klinik",
            name: "Konsultasi Dokter Umum",
            type: "procedure",
            hospitalId: "h1",
            transactionId: "tx-mixed",
            quantity: 1,
            baseFee: 150000,
            discount: 0,
            totalFee: 150000,
            isPriceLock: true,
            paidFee: 150000,
            payableFee: 0,
            transactionType: "selling",
            categoryId: "c2",
            isPaidOff: true,
            createdAt: "2025-09-17T09:30:00+07:00",
            updatedAt: "2025-09-17T09:30:00+07:00",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Kasir",
            incomeType: "klinik",
            isPendingStock: false,
            isSlotTransacted: true,
          },
        ],
        Payments: [
          {
            _id: "pay-mixed",
            totalFee: 250000,
            percentageTotal: 100,
            status: "paid",
            type: "Langsung",
            name: "Tunai",
            transactionId: "tx-mixed",
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
            paidName: "-",
            change: 0,
            createdName: "Kasir",
            trueCreatedAt: "2025-09-17T09:30:00+07:00",
          },
        ],
      },
    ];

    const summaries = calculateShiftSummaries(mockData);
    expect(summaries).toHaveLength(1);
    const shift = summaries[0];

    // Total omset includes both apotek and klinik
    expect(shift.apotek.total).toBe(100000);
    expect(shift.klinik.total).toBe(150000);
    expect(shift.totalOmset).toBe(250000);
    expect(shift.hpp).toBe(60000);

    // Gross profit must be APOTEK ONLY: 100,000 - 60,000 = 40,000 (NOT 250,000 - 60,000 = 190,000)
    expect(shift.grossProfit).toBe(40000);
    // Margin percent must be APOTEK ONLY: (40,000 / 100,000) * 100 = 40% (NOT (190,000 / 250,000) * 100 = 76%)
    expect(shift.marginPercent).toBe(40);

    const tx = shift.details[0];
    expect(tx.incomeType).toBe("campuran");
    expect(tx.totalFee).toBe(250000);
    expect(tx.hpp).toBe(60000);
    expect(tx.grossProfit).toBe(40000);
    expect(tx.marginPercent).toBe(40);

    // Apotek item has profit metrics
    expect(tx.items[0].grossProfit).toBe(40000);
    expect(tx.items[0].marginPercent).toBe(40);

    // Klinik item does not have apotek profit metrics
    expect(tx.items[1].grossProfit).toBe(0);
    expect(tx.items[1].marginPercent).toBe(0);
  });

  it("accurately breaks down offline vs online apotek omset, HPP, and margin", () => {
    const mockData: PemasukanData[] = [
      // 1. Offline Kasir Transaction: Omset 100,000, HPP 70,000 => Profit 30,000 (Margin 30%)
      {
        _id: "tx-offline",
        status: "paid off",
        totalFee: 100000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T09:00:00+07:00",
        code: "INV-OFFLINE",
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
            _id: "it-offline",
            name: "Obat Offline",
            type: "prescription",
            hospitalId: "h1",
            transactionId: "tx-offline",
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
            createdAt: "2025-09-17T09:00:00+07:00",
            updatedAt: "2025-09-17T09:00:00+07:00",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Kasir",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
            buyFee: 35000,
          },
        ],
        Payments: [
          {
            _id: "pay-offline",
            totalFee: 100000,
            percentageTotal: 100,
            status: "paid",
            type: "Langsung",
            name: "Tunai",
            transactionId: "tx-offline",
            transactionDate: "2025-09-17T09:00:00+07:00",
            accountTxId: "acc1",
            hospitalId: "h1",
            reason: "-",
            isCovered: false,
            isNeedClaim: false,
            isOutcome: false,
            intent: "-",
            createdAt: "2025-09-17T09:00:00+07:00",
            createdId: "u1",
            paidName: "-",
            change: 0,
            createdName: "Kasir",
            trueCreatedAt: "2025-09-17T09:00:00+07:00",
          },
        ],
      },
      // 2. Online Shopee Transaction: Omset 200,000, HPP 160,000 => Profit 40,000 (Margin 20%)
      {
        _id: "tx-online",
        status: "paid off",
        totalFee: 200000,
        creditFee: 0,
        isOnlyPOS: true,
        createdAt: "2025-09-17T10:00:00+07:00",
        code: "INV-ONLINE",
        debtFee: 0,
        isOutcome: false,
        paidFee: 200000,
        sumFee: 0,
        roundedValue: 0,
        Appointment: {},
        Diagnoses: [],
        OtherNotes: [],
        Practices: {},
        Items: [
          {
            _id: "it-online",
            name: "Obat Online",
            type: "prescription",
            hospitalId: "h1",
            transactionId: "tx-online",
            quantity: 4,
            baseFee: 50000,
            discount: 0,
            totalFee: 200000,
            isPriceLock: true,
            paidFee: 200000,
            payableFee: 0,
            transactionType: "selling",
            categoryId: "c1",
            isPaidOff: true,
            createdAt: "2025-09-17T10:00:00+07:00",
            updatedAt: "2025-09-17T10:00:00+07:00",
            createdId: "u1",
            medicalHelperIds: [],
            createdName: "Kasir",
            incomeType: "apotek",
            isPendingStock: false,
            isSlotTransacted: true,
            buyFee: 40000,
          },
        ],
        Payments: [
          {
            _id: "pay-online",
            totalFee: 200000,
            percentageTotal: 100,
            status: "paid",
            type: "Kartu Debit",
            name: "Shopee",
            transactionId: "tx-online",
            transactionDate: "2025-09-17T10:00:00+07:00",
            accountTxId: "acc1",
            hospitalId: "h1",
            reason: "-",
            isCovered: false,
            isNeedClaim: false,
            isOutcome: false,
            intent: "-",
            createdAt: "2025-09-17T10:00:00+07:00",
            createdId: "u1",
            paidName: "DESTY|platform=Shopee|order=ORD123|resi=SPX123",
            change: 0,
            createdName: "Kasir",
            trueCreatedAt: "2025-09-17T10:00:00+07:00",
          },
        ],
      },
    ];

    const summaries = calculateShiftSummaries(mockData);
    expect(summaries).toHaveLength(1);
    const shift = summaries[0];

    // Combined Apotek totals: Omset 300,000, HPP 230,000, Profit 70,000
    expect(shift.apotek.total).toBe(300000);
    expect(shift.hpp).toBe(230000);
    expect(shift.grossProfit).toBe(70000);

    // Offline breakdown:
    expect(shift.offlineOmset).toBe(100000);
    expect(shift.hppOffline).toBe(70000);
    expect(shift.grossProfitOffline).toBe(30000);
    expect(shift.marginPercentOffline).toBe(30);

    // Online breakdown:
    expect(shift.onlineOmset).toBe(200000);
    expect(shift.hppOnline).toBe(160000);
    expect(shift.grossProfitOnline).toBe(40000);
    expect(shift.marginPercentOnline).toBe(20);
  });
});
