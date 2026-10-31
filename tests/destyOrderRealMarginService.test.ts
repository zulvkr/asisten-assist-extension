import { describe, expect, it } from "vitest";
import {
  calculateNetPayoutPerUnit,
  calculateRealMarginMetrics,
  processRecentOrderMargins,
  buildCashierLookupMap,
} from "@/services/destySync/destyOrderRealMarginService";
import type { DestyOrderRecord } from "@/composables/destyOmniOrderApi";
import type { MarketplacePricingConfig } from "@/types/destyPriceUpdate";
import type { AssistCatalogItem } from "@/types/destySync";

describe("destyOrderRealMarginService", () => {
  const dummyPricingConfig: MarketplacePricingConfig = {
    adminPercent: 10,
    adminFixedPerTx: 1000,
    basePriceSource: "buyPrice",
    rounding: 100,
    tiers: [],
  };

  it("calculates net payout per unit using formula when escrowAmount is not available", () => {
    // Price = 20,000, 1 item.
    // Net = 20,000 * 0.90 - 1000 = 17,000
    const net = calculateNetPayoutPerUnit({
      paidPrice: 20000,
      quantity: 1,
      totalItemsInOrder: 1,
      config: dummyPricingConfig,
    });
    expect(net).toBe(17000);
  });

  it("calculates net payout per unit proportionally when escrowAmount is provided", () => {
    // Total order price = 50,000. Escrow released = 42,000.
    // Item is 50,000 * 1 = 50,000 (100% of order).
    // Net = 42,000.
    const net = calculateNetPayoutPerUnit({
      paidPrice: 50000,
      quantity: 1,
      totalItemsInOrder: 1,
      config: dummyPricingConfig,
      orderEscrowAmount: 42000,
      orderTotalPrice: 50000,
    });
    expect(net).toBe(42000);
  });

  it("calculates real profit nominal and margin percentage accurately", () => {
    // Net payout = 20,000. HPP = 15,000.
    // Profit = 5,000.
    // Margin % = (5,000 / 20,000) * 100 = 25%
    const res = calculateRealMarginMetrics({
      netPayoutPerUnit: 20000,
      latestBuyPrice: 15000,
    });
    expect(res.profitPerUnit).toBe(5000);
    expect(res.marginPercent).toBe(25);
  });

  it("extracts cashier name and correlates order identifiers with Assist transactions", () => {
    const assistTransactions = [
      {
        _id: "tx-12345",
        invoice: "INV-202610-001",
        paidName: "DESTY | PLATFORM=shopee | ORDER=261025JMR5J88E | BOOKING=BOOK-1 | RESI=SPX123",
        Payments: [
          {
            createdName: "Siti Rahma",
          },
        ],
      },
    ];

    const map = buildCashierLookupMap(assistTransactions);
    expect(map.has("261025JMR5J88E")).toBe(true);
    expect(map.has("BOOK-1")).toBe(true);
    expect(map.has("SPX123")).toBe(true);

    const matched = map.get("261025JMR5J88E");
    expect(matched?.cashierName).toBe("Siti Rahma");
    expect(matched?.invoice).toBe("INV-202610-001");
  });

  it("processes order items into enriched real margin records with masterSkuId and assist matching", () => {
    const orders: DestyOrderRecord[] = [
      {
        orderId: "2114376305560834049",
        displayedOrderSn: "261025JMR5J88E",
        platformName: "shopee",
        totalPrice: 66004,
        orderCreateTime: 1793256411000,
        status: "Delivered",
        items: [
          {
            productName: "NEW ENZYPLEX PERSTRIP ISI 4 TABLET",
            quantity: 4,
            skuCode: "OBT-MDF-ENZYPLEX-TAB-4",
            masterSku: "OBT-MDF-ENZYPLEX-TAB-4",
            // @ts-ignore
            masterSkuId: "2033553770905128962",
            unitPrice: 16001,
            paidPrice: 16001,
          },
        ],
      },
    ];

    const assistCatalog: AssistCatalogItem[] = [
      {
        id: "cat-enz-1",
        code: "OBT-MDF-ENZYPLEX-TAB-4",
        name: "Enzyplex Strip 4 Tab",
        type: "prescription",
        buyFee: 11000,
      },
    ];

    const cashierMap = buildCashierLookupMap([
      {
        _id: "tx-12345",
        invoice: "INV-ENZY",
        paidName: "DESTY | PLATFORM=shopee | ORDER=261025JMR5J88E",
        createdName: "Apoteker Ivan",
      },
    ]);

    const items = processRecentOrderMargins({
      orders,
      assistCatalog,
      mappings: [],
      pricingConfig: dummyPricingConfig,
      cashierMap,
    });

    expect(items).toHaveLength(1);
    const row = items[0];
    expect(row.displayedOrderSn).toBe("261025JMR5J88E");
    expect(row.masterSkuId).toBe("2033553770905128962");
    expect(row.latestBuyPrice).toBe(11000);
    expect(row.cashierName).toBe("Apoteker Ivan");
    expect(row.assistInvoice).toBe("INV-ENZY");
    expect(row.assistMatched).toBe(true);
    expect(row.realProfitPerUnit).toBeGreaterThan(0);
    expect(row.realMarginPercent).toBeGreaterThan(0);
  });
});
