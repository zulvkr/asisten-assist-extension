import { describe, it, expect } from "vitest";
import {
  filterTransactionsByInferredShift,
  aggregateSoldItemsFromTransactions,
  buildShiftSoRows,
  buildFakturSoRows,
  buildAllProductsSoRows,
  buildCatalogLookup,
} from "@/services/destySync/destyStockOpnameService";
import type { PemasukanData } from "@/types/PemasukanData";
import type { DestySkuMapping, AssistCatalogItem } from "@/types/destySync";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";
import type { AssistRestockInvoice } from "@/types/destyStockOpname";

describe("destyStockOpnameService", () => {
  describe("filterTransactionsByInferredShift", () => {
    const transactions: PemasukanData[] = [
      {
        _id: "tx_pagi",
        createdAt: "2026-10-12T08:30:00.000Z",
      } as any,
      {
        _id: "tx_siang",
        createdAt: "2026-10-12T16:45:00.000Z",
      } as any,
      {
        _id: "tx_malam",
        createdAt: "2026-10-12T23:15:00.000Z",
      } as any,
    ];

    it("filters pagi and siang shifts based on local hour", () => {
      // In local time, 08:30 is pagi (hour >= 6 && hour < 14) or depends on timezone
      const txPagiDate = new Date(transactions[0].createdAt);
      const hourPagi = txPagiDate.getHours();
      const expectedShift = hourPagi >= 6 && hourPagi < 14 ? "pagi" : hourPagi >= 14 && hourPagi < 22 ? "siang" : "semua";

      const filtered = filterTransactionsByInferredShift(transactions, expectedShift);
      expect(filtered.some((t) => t._id === "tx_pagi")).toBe(true);

      const allFiltered = filterTransactionsByInferredShift(transactions, "semua");
      expect(allFiltered.length).toBe(3);
    });
  });

  describe("aggregateSoldItemsFromTransactions", () => {
    it("differentiates offline and online sales", () => {
      const transactions: PemasukanData[] = [
        {
          _id: "tx1",
          status: "paid off",
          paidName: "Pasien Tunai",
          Items: [
            { medicineId: "m1", name: "Amoxicillin 500mg", type: "prescription", quantity: 10, unit: "Kapsul", code: "AMX500" } as any,
          ],
          Payments: [{ type: "Cash" } as any],
        } as any,
        {
          _id: "tx2",
          status: "paid off",
          paidName: "DESTY|platform=Shopee|order=ORD99",
          Items: [
            { medicineId: "m1", name: "Amoxicillin 500mg", type: "prescription", quantity: 5, unit: "Kapsul", code: "AMX500" } as any,
          ],
          Payments: [{ type: "Marketplace" } as any],
        } as any,
      ];

      const res = aggregateSoldItemsFromTransactions(transactions);
      expect(res.length).toBe(1);
      expect(res[0].assistItemId).toBe("m1");
      expect(res[0].offlineQty).toBe(10);
      expect(res[0].onlineQty).toBe(5);
    });
  });

  describe("buildShiftSoRows", () => {
    it("builds row with conversion factor, default Min adjustMode, and live preview", () => {
      const soldItems = [
        {
          assistItemId: "m1",
          assistItemType: "prescription" as const,
          assistCode: "AMX500",
          assistItemName: "Amoxicillin 500mg",
          assistUnit: "Strip",
          offlineQty: 20,
          onlineQty: 0,
        },
      ];

      const mappings: DestySkuMapping[] = [
        {
          destySku: "AMX-BOX",
          destyUnit: "Box",
          assistCode: "AMX500",
          assistId: "m1",
          assistName: "Amoxicillin 500mg",
          assistType: "prescription",
          assistUnit: "Strip",
          conversionFactor: 10, // 1 Box = 10 Strip
          active: true,
        },
      ];

      const destyStockMap: Record<string, DestyOmniStockItem> = {
        "AMX-BOX": {
          sku: "AMX-BOX",
          skuId: "sku_100",
          stock: 15,
          breakdown: { fisik: 15, tersedia: 14, pesanan: 1 },
          fisik: 15,
          tersedia: 14,
          pesanan: 1,
        },
      };

      const catalog: AssistCatalogItem[] = [
        { id: "m1", code: "AMX500", name: "Amoxicillin 500mg", type: "prescription", stock: 50 },
      ];

      const lookup = buildCatalogLookup(catalog);
      const rows = buildShiftSoRows({
        soldItems,
        mappings,
        destyStockMap,
        catalogLookup: lookup,
      });

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.destySku).toBe("AMX-BOX");
      expect(row.conversionFactor).toBe(10);
      // 20 Strip / 10 = 2 Box
      expect(row.adjustQty).toBe(2);
      expect(row.adjustMode).toBe("Min");
      expect(row.destyFisik).toBe(15);
      // calculatedFisikBaru = 15 - 2 = 13
      expect(row.calculatedFisikBaru).toBe(13);
      // calculatedTersediaBaru = 13 - 1 = 12
      expect(row.calculatedTersediaBaru).toBe(12);
      expect(row.status).toBe("ready");
    });
  });

  describe("buildFakturSoRows", () => {
    it("builds row with default Add adjustMode and receivedQty", () => {
      const invoice: AssistRestockInvoice = {
        id: "inv_1",
        invoiceNumber: "FAK-001",
        supplierName: "PBF Kimia Farma",
        receivedDate: "2026-10-12",
        itemCount: 1,
        totalFee: 150000,
        items: [
          {
            medicineId: "m1",
            code: "AMX500",
            name: "Amoxicillin 500mg",
            quantity: 5,
            unit: "Box",
          },
        ],
      };

      const mappings: DestySkuMapping[] = [];
      const destyStockMap: Record<string, DestyOmniStockItem> = {
        AMX500: {
          sku: "AMX500",
          skuId: "sku_200",
          stock: 10,
          breakdown: { fisik: 10, tersedia: 10, pesanan: 0 },
          fisik: 10,
          tersedia: 10,
          pesanan: 0,
        },
      };

      const lookup = buildCatalogLookup([]);
      const rows = buildFakturSoRows({
        invoice,
        mappings,
        destyStockMap,
        catalogLookup: lookup,
      });

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.receivedQty).toBe(5);
      expect(row.adjustMode).toBe("Add");
      expect(row.adjustQty).toBe(5);
      // calculatedFisikBaru = 10 + 5 = 15
      expect(row.calculatedFisikBaru).toBe(15);
      expect(row.status).toBe("ready");
    });
  });

  describe("buildAllProductsSoRows", () => {
    it("detects stock discrepancy between Assist catalog and Desty live inventory", () => {
      const catalog: AssistCatalogItem[] = [
        { id: "m1", code: "PARA", name: "Paracetamol", type: "prescription", stock: 25 },
      ];

      const destyStockMap: Record<string, DestyOmniStockItem> = {
        PARA: {
          sku: "PARA",
          skuId: "sku_para",
          stock: 20,
          breakdown: { fisik: 20, tersedia: 20, pesanan: 0 },
          fisik: 20,
          tersedia: 20,
          pesanan: 0,
        },
      };

      const rows = buildAllProductsSoRows({
        destyStockMap,
        assistCatalog: catalog,
        mappings: [],
      });

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.destySku).toBe("PARA");
      expect(row.destyFisik).toBe(20);
      expect(row.assistStock).toBe(25);
      // Since destyFisik (20) < assistStock (25), default mode is Add by 5
      expect(row.adjustMode).toBe("Add");
      expect(row.adjustQty).toBe(5);
      expect(row.calculatedFisikBaru).toBe(25);
      expect(row.status).toBe("ready");
    });

    it("includes matched stock items without skipping them", () => {
      const catalog: AssistCatalogItem[] = [
        { id: "m1", code: "PARA", name: "Paracetamol", type: "prescription", stock: 20 },
      ];

      const destyStockMap: Record<string, DestyOmniStockItem> = {
        PARA: {
          sku: "PARA",
          skuId: "sku_para",
          stock: 20,
          breakdown: { fisik: 20, tersedia: 20, pesanan: 0 },
          fisik: 20,
          tersedia: 20,
          pesanan: 0,
        },
      };

      const rows = buildAllProductsSoRows({
        destyStockMap,
        assistCatalog: catalog,
        mappings: [],
      });

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.destySku).toBe("PARA");
      expect(row.destyFisik).toBe(20);
      expect(row.assistStock).toBe(20);
      expect(row.status).toBe("matched");
      expect(row.statusMessage).toBe("Stok Sesuai (Cocok)");
      expect(row.adjustQty).toBe(0);
      expect(row.checked).toBe(false);
    });

    it("retains Desty SKU and productName when not matched in Assist POS", () => {
      const destyStockMap: Record<string, DestyOmniStockItem> = {
        "DESTY-ONLY-SKU": {
          sku: "DESTY-ONLY-SKU",
          skuId: "sku_desty_only",
          productName: "Produk Khusus Marketplace",
          stock: 12,
          breakdown: { fisik: 12, tersedia: 10, pesanan: 2 },
          fisik: 12,
          tersedia: 10,
          pesanan: 2,
        },
      };

      const rows = buildAllProductsSoRows({
        destyStockMap,
        assistCatalog: [],
        mappings: [],
      });

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.destySku).toBe("DESTY-ONLY-SKU");
      expect(row.destyProductName).toBe("Produk Khusus Marketplace");
      expect(row.assistItemId).toBe("");
      expect(row.assistCode).toBe("");
      expect(row.status).toBe("unmapped");
    });

    it("retains Assist code and name when not present in Desty", () => {
      const catalog: AssistCatalogItem[] = [
        { id: "m_assist_only", code: "POS-ONLY-CODE", name: "Obat Khusus Klinik", type: "prescription", stock: 15 },
      ];

      const rows = buildAllProductsSoRows({
        destyStockMap: {},
        assistCatalog: catalog,
        mappings: [],
      });

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.destySku).toBe("");
      expect(row.assistItemId).toBe("m_assist_only");
      expect(row.assistCode).toBe("POS-ONLY-CODE");
      expect(row.assistItemName).toBe("Obat Khusus Klinik");
      expect(row.assistStock).toBe(15);
      expect(row.status).toBe("unmapped");
    });
  });
});
