import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isOnlineAssistTransaction,
  getAssistOfflineSoldItems,
  buildOfflineStockReductionItems,
  executeOfflineStockReduction,
} from "@/services/destySync/offlineStockSync";
import type { PemasukanData } from "@/types/PemasukanData";
import type { DestySkuMapping } from "@/types/destySync";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";

describe("offlineStockSync", () => {
  describe("isOnlineAssistTransaction", () => {
    it("identifies Desty imported metadata as online", () => {
      const tx: PemasukanData = {
        _id: "tx1",
        status: "paid off",
        paidName: "DESTY|platform=Shopee|order=240901ABCDE|booking=B123|resi=SPX123",
        Items: [],
        Payments: [],
      } as any;

      expect(isOnlineAssistTransaction(tx)).toBe(true);
    });

    it("identifies transactions with marketplace payment types as online", () => {
      const tx: PemasukanData = {
        _id: "tx2",
        status: "paid off",
        paidName: "Pelanggan Biasa",
        Items: [],
        Payments: [
          { type: "Marketplace", name: "Shopee Pay", intent: "", reason: "" } as any,
        ],
      } as any;

      expect(isOnlineAssistTransaction(tx)).toBe(true);
    });

    it("identifies regular cash / QRIS POS transactions as offline", () => {
      const tx: PemasukanData = {
        _id: "tx3",
        status: "paid off",
        paidName: "Budi Santoso",
        Items: [],
        Payments: [
          { type: "Cash", name: "Tunai", intent: "", reason: "" } as any,
        ],
      } as any;

      expect(isOnlineAssistTransaction(tx)).toBe(false);
    });
  });

  describe("getAssistOfflineSoldItems", () => {
    it("aggregates quantities from offline sales and skips online sales", () => {
      const transactions: PemasukanData[] = [
        {
          _id: "tx1",
          status: "paid off",
          paidName: "Budi",
          Items: [
            { medicineId: "med1", name: "Paracetamol 500mg", type: "prescription", quantity: 10, unit: "Tablet", code: "PCT500" } as any,
            { akhpId: "akhp1", name: "Masker Medis", type: "akhp", quantity: 2, unit: "Box", code: "MSK01" } as any,
          ],
          Payments: [{ type: "Cash", name: "Tunai" } as any],
        } as any,
        {
          _id: "tx2",
          status: "paid off",
          paidName: "Siti",
          Items: [
            { medicineId: "med1", name: "Paracetamol 500mg", type: "prescription", quantity: 5, unit: "Tablet", code: "PCT500" } as any,
          ],
          Payments: [{ type: "QRIS", name: "QRIS" } as any],
        } as any,
        {
          // Online transaction - should be excluded
          _id: "tx3",
          status: "paid off",
          paidName: "DESTY|platform=Shopee|order=ORD123",
          Items: [
            { medicineId: "med1", name: "Paracetamol 500mg", type: "prescription", quantity: 20, unit: "Tablet" } as any,
          ],
          Payments: [{ type: "Marketplace", name: "Shopee" } as any],
        } as any,
      ];

      const result = getAssistOfflineSoldItems(transactions, { excludeOnline: true });
      expect(result.skippedOnlineCount).toBe(1);
      expect(result.soldItems.length).toBe(2);

      const pct = result.soldItems.find((i) => i.assistItemId === "med1");
      expect(pct?.offlineQty).toBe(15); // 10 + 5 (excluding 20 from online)

      const msk = result.soldItems.find((i) => i.assistItemId === "akhp1");
      expect(msk?.offlineQty).toBe(2);
    });
  });

  describe("buildOfflineStockReductionItems", () => {
    const mappings: DestySkuMapping[] = [
      {
        destySku: "DESTY-PCT-BOX",
        assistCode: "PCT500",
        assistId: "med1",
        assistType: "prescription",
        assistName: "Paracetamol 500mg",
        destyUnit: "Box",
        assistUnit: "Tablet",
        conversionFactor: 10, // 1 Box Desty = 10 Tablet Assist
        active: true,
        updatedAt: new Date().toISOString(),
      },
    ];

    const destyStockMap: Record<string, DestyOmniStockItem> = {
      "DESTY-PCT-BOX": {
        sku: "DESTY-PCT-BOX",
        skuId: "sku_12345",
        warehouseId: "wh_001",
        productName: "Paracetamol Box Desty",
        stock: 50,
        breakdown: { fisik: 50, pesanan: 5, tersedia: 45 },
        fisik: 50,
        pesanan: 5,
        tersedia: 45,
      },
    };

    it("correctly computes reduction quantity using conversion factor and valid status", () => {
      const soldItems = [
        {
          assistItemId: "med1",
          assistItemType: "prescription" as const,
          assistCode: "PCT500",
          assistItemName: "Paracetamol 500mg",
          assistUnit: "Tablet",
          offlineQty: 20, // 20 Tablets sold -> 2 Boxes in Desty
        },
      ];

      const items = buildOfflineStockReductionItems({
        soldItems,
        mappings,
        destyStockMap,
      });

      expect(items.length).toBe(1);
      const row = items[0];
      expect(row.destySku).toBe("DESTY-PCT-BOX");
      expect(row.conversionFactor).toBe(10);
      expect(row.qtyDesty).toBe(2); // 20 / 10 = 2
      expect(row.reductionQty).toBe(2);
      expect(row.destyFisik).toBe(50);
      expect(row.destyReserved).toBe(5);
      expect(row.calculatedFisikBaru).toBe(48); // 50 - 2 = 48
      expect(row.calculatedTersediaBaru).toBe(43); // 48 - 5 = 43
      expect(row.status).toBe("ready");
      expect(row.checked).toBe(true);
    });

    it("marks status as warning if reduction quantity exceeds physical stock", () => {
      const lowStockDestyMap: Record<string, DestyOmniStockItem> = {
        "DESTY-PCT-BOX": {
          sku: "DESTY-PCT-BOX",
          skuId: "sku_12345",
          warehouseId: "wh_001",
          stock: 1,
          breakdown: { fisik: 1, pesanan: 0, tersedia: 1 },
          fisik: 1,
          pesanan: 0,
          tersedia: 1,
        },
      };

      const soldItems = [
        {
          assistItemId: "med1",
          assistItemType: "prescription" as const,
          assistCode: "PCT500",
          assistItemName: "Paracetamol 500mg",
          assistUnit: "Tablet",
          offlineQty: 20, // 2 Boxes required, only 1 physically available
        },
      ];

      const items = buildOfflineStockReductionItems({
        soldItems,
        mappings,
        destyStockMap: lowStockDestyMap,
      });

      expect(items[0].status).toBe("warning");
      expect(items[0].statusMessage).toContain("Stok fisik Desty (1) < Pengurangan (2 Box)");
    });

    it("marks status as unmapped if SKU is missing or not found in Desty", () => {
      const soldItems = [
        {
          assistItemId: "unknown_med",
          assistItemType: "prescription" as const,
          assistCode: "UNKNOWN",
          assistItemName: "Obat Baru",
          assistUnit: "Pcs",
          offlineQty: 5,
        },
      ];

      const items = buildOfflineStockReductionItems({
        soldItems,
        mappings: [],
        destyStockMap: {},
      });

      expect(items[0].status).toBe("unmapped");
      expect(items[0].destyStockFound).toBe(false);
      expect(items[0].checked).toBe(false);
    });

    it("supports manual overrides for reductionQty and checked", () => {
      const soldItems = [
        {
          assistItemId: "med1",
          assistItemType: "prescription" as const,
          assistCode: "PCT500",
          assistItemName: "Paracetamol 500mg",
          assistUnit: "Tablet",
          offlineQty: 20,
        },
      ];

      const rowKey = "med1__DESTY-PCT-BOX";
      const items = buildOfflineStockReductionItems({
        soldItems,
        mappings,
        destyStockMap,
        manualOverrides: {
          [rowKey]: {
            reductionQty: 3, // Manual override to 3
            checked: false,
          },
        },
      });

      expect(items[0].reductionQty).toBe(3);
      expect(items[0].calculatedFisikBaru).toBe(47); // 50 - 3
      expect(items[0].checked).toBe(false);
    });

    it("correctly attaches assistStock from assistCatalog or assistStockMap", () => {
      const soldItems = [
        {
          assistItemId: "med1",
          assistItemType: "prescription" as const,
          assistCode: "PCT500",
          assistItemName: "Paracetamol 500mg",
          assistUnit: "Tablet",
          offlineQty: 10,
        },
        {
          assistItemId: "med2",
          assistItemType: "prescription" as const,
          assistCode: "AMX500",
          assistItemName: "Amoxicillin 500mg",
          assistUnit: "Kapsul",
          offlineQty: 5,
        },
      ];

      const itemsWithCatalog = buildOfflineStockReductionItems({
        soldItems,
        mappings,
        destyStockMap,
        assistCatalog: [
          {
            id: "med1",
            code: "PCT500",
            name: "Paracetamol 500mg",
            type: "prescription",
            stock: 120,
          },
        ],
      });

      expect(itemsWithCatalog[0].assistStock).toBe(120);
      expect(itemsWithCatalog[1].assistStock).toBeNull();

      const itemsWithMap = buildOfflineStockReductionItems({
        soldItems,
        mappings,
        destyStockMap,
        assistStockMap: {
          med1: 85,
          med2: 30,
        },
      });

      expect(itemsWithMap[0].assistStock).toBe(85);
      expect(itemsWithMap[1].assistStock).toBe(30);
    });
  });

  describe("executeOfflineStockReduction", () => {
    beforeEach(() => {
      (globalThis as any).browser = {
        runtime: {
          sendMessage: vi.fn(),
        },
      };
    });

    it("calls UPDATE_DESTY_ON_HAND with negative amount and records success", async () => {
      const sendMessageMock = vi.fn().mockResolvedValue({ ok: true, data: { success: true } });
      (globalThis as any).browser.runtime.sendMessage = sendMessageMock;

      const items: any[] = [
        {
          rowKey: "k1",
          destySku: "SKU-001",
          assistItemName: "Produk 1",
          destySkuId: "desty_sku_1",
          destyWarehouseId: "wh_001",
          reductionQty: 2,
          destyUnit: "Pcs",
        },
      ];

      const logs: any[] = [];
      const result = await executeOfflineStockReduction({
        items,
        destyToken: "token123",
        destyTenantId: "tenant123",
        onProgress: (p) => logs.push(p.log),
      });

      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.results["k1"]?.status).toBe("success");

      expect(sendMessageMock).toHaveBeenCalledWith({
        type: "UPDATE_DESTY_ON_HAND",
        payload: {
          token: "token123",
          tenantId: "tenant123",
          skuId: "desty_sku_1",
          warehouseId: "wh_001",
          amount: -2,
          editType: "Add",
        },
      });
      expect(logs.some((l) => l.type === "success")).toBe(true);
    });
  });
});
