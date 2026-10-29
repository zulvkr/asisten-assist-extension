import { describe, it, expect } from "vitest";
import {
  filterMasterItemsByScope,
  mergeMasterWithCounts,
  calculateOpnameSummary,
  buildAssistRepairPayload,
} from "@/services/stockOpname/stockOpnameService";
import type { StockOpnameItemRow, StockOpnameCountsMap } from "@/types/stockOpname";

describe("stockOpnameService", () => {
  const sampleMaster: StockOpnameItemRow[] = [
    {
      id: "med_1",
      depotStockId: "depot_1",
      depotName: "Apotek",
      code: "MS001",
      name: "Paracetamol",
      unit: "Strip",
      itemValue: "medicine",
      systemQuantity: 10,
      countedQuantity: null,
      variance: null,
      reason: "",
      isCounted: false,
    },
    {
      id: "med_2",
      depotStockId: "depot_2",
      depotName: "Apotek",
      code: "MS002",
      name: "Amoxicillin",
      unit: "Strip",
      itemValue: "medicine",
      systemQuantity: 20,
      countedQuantity: null,
      variance: null,
      reason: "",
      isCounted: false,
    },
    {
      id: "bhp_1",
      depotStockId: "depot_3",
      depotName: "Apotek",
      code: "BHP001",
      name: "Kasa Steril",
      unit: "Pcs",
      itemValue: "akhp",
      systemQuantity: 5,
      countedQuantity: null,
      variance: null,
      reason: "",
      isCounted: false,
    },
  ];

  it("merges master rows with counts map and calculates variance", () => {
    const counts: StockOpnameCountsMap = {
      med_1: {
        countedQuantity: 8, // variance = -2 (deficit)
        reason: "Barang Rusak/Bocor",
        updatedAt: "2026-10-29T00:00:00Z",
        updatedBy: "kasir@test.com",
      },
      med_2: {
        countedQuantity: 25, // variance = +5 (surplus)
        reason: "",
        updatedAt: "2026-10-29T00:00:00Z",
        updatedBy: "kasir@test.com",
      },
      // bhp_1 not counted yet
    };

    const merged = mergeMasterWithCounts(sampleMaster, counts);

    expect(merged[0].isCounted).toBe(true);
    expect(merged[0].countedQuantity).toBe(8);
    expect(merged[0].variance).toBe(-2);
    expect(merged[0].reason).toBe("Barang Rusak/Bocor");

    expect(merged[1].isCounted).toBe(true);
    expect(merged[1].countedQuantity).toBe(25);
    expect(merged[1].variance).toBe(5);

    expect(merged[2].isCounted).toBe(false);
    expect(merged[2].countedQuantity).toBeNull();
    expect(merged[2].variance).toBeNull();
  });

  it("calculates opname summary accurately", () => {
    const items: StockOpnameItemRow[] = [
      {
        ...sampleMaster[0],
        countedQuantity: 8,
        variance: -2,
        isCounted: true,
      },
      {
        ...sampleMaster[1],
        countedQuantity: 25,
        variance: 5,
        isCounted: true,
      },
      {
        ...sampleMaster[2], // uncounted
        countedQuantity: null,
        variance: null,
        isCounted: false,
      },
    ];

    const summary = calculateOpnameSummary(items);
    expect(summary.totalItems).toBe(3);
    expect(summary.countedItems).toBe(2);
    expect(summary.uncountedItems).toBe(1);
    expect(summary.discrepancyCount).toBe(2);
    expect(summary.totalVariance).toBe(3); // 5 - 2 = 3
    expect(summary.deficitCount).toBe(1);
    expect(summary.deficitSum).toBe(2);
    expect(summary.surplusCount).toBe(1);
    expect(summary.surplusSum).toBe(5);
  });

  it("builds Assist repair payload ignoring uncounted items and zero variances", () => {
    const items: StockOpnameItemRow[] = [
      {
        ...sampleMaster[0],
        countedQuantity: 8, // -2
        reason: "Pecah",
        isCounted: true,
      },
      {
        ...sampleMaster[1],
        countedQuantity: 20, // 0 (sesuai, selisih 0)
        isCounted: true,
      },
      {
        ...sampleMaster[2], // uncounted
        isCounted: false,
      },
    ];

    const payload = buildAssistRepairPayload({
      items,
      hospitalId: "hosp_123",
    });

    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual({
      type: "auditMinus",
      itemType: "prescription",
      itemValue: "medicine",
      hospitalId: "hosp_123",
      depotId: "depot_1",
      depotName: "Apotek",
      medOrAkhpId: "med_1",
      medOrAkhpName: "Paracetamol",
      itemName: "Paracetamol",
      itemCode: "MS001",
      quantity: -2,
      difference: 2,
      qtyBefore: 10,
      qtyAfter: 8,
      itemNotes: "Pecah",
    });
  });

  it("re-evaluates qtyBefore against live stock if provided to prevent cashier race condition", () => {
    const items: StockOpnameItemRow[] = [
      {
        ...sampleMaster[0],
        systemQuantity: 10, // saat sesi dimulai
        countedQuantity: 8, // fisik dihitung
        isCounted: true,
      },
    ];

    // Misal saat F5 ditekan, kasir sempat menjual 1 item (stok live jadi 9)
    const liveStockByItemId = {
      med_1: 9,
    };

    const payload = buildAssistRepairPayload({
      items,
      hospitalId: "hosp_123",
      liveStockByItemId,
    });

    expect(payload).toHaveLength(1);
    // Selisih fisik (8) vs live stok (9) adalah -1 (bukan -2!)
    expect(payload[0].qtyBefore).toBe(9);
    expect(payload[0].qtyAfter).toBe(8);
    expect(payload[0].quantity).toBe(-1);
    expect(payload[0].difference).toBe(1);
  });

  describe("filterMasterItemsByScope", () => {
    it("returns all items when scope is Full", () => {
      const filtered = filterMasterItemsByScope(sampleMaster, "Full");
      expect(filtered).toHaveLength(3);
    });

    it("filters by itemIdsFilter (matching by id or code) when scope is PerShift", () => {
      // med_1 matches by ID, BHP001 matches by code
      const filtered = filterMasterItemsByScope(sampleMaster, "PerShift", ["med_1", "BHP001"]);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((i) => i.id)).toEqual(["med_1", "bhp_1"]);
    });
  });
});
