import type {
  DestyOrderRecord,
  DestyOrderItem,
} from "@/composables/destyOmniOrderApi";
import type {
  AssistCatalogItem,
  DestySkuMapping,
} from "@/types/destySync";
import type {
  MarketplacePricingConfig,
  DestyPriceRecord,
} from "@/types/destyPriceUpdate";
import { resolveDestyPriceItem } from "@/services/destySync/destyPriceUpdateService";
import { parseDestyPaidName } from "@/utils/destyPaidNameParser";

export interface OrderItemRealMargin {
  rowId: string;
  orderId: string;
  displayedOrderSn: string;
  bookingSn?: string;
  shipmentNo?: string;
  courier?: string;
  platformName: string;
  externalShopName?: string;
  orderStatus: string;
  orderCreateTime: number;
  labelPrinted?: boolean;
  cancelReason?: string;
  cancelBy?: string;

  // Desty Item
  masterSkuId?: string;
  masterSku: string;
  skuCode?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  paidPrice: number;
  itemDiscount?: number;
  mainImageUrl?: string;

  // Assist Catalog Match
  assistItemId?: string;
  assistCode?: string;
  assistProductName?: string;
  assistUnit?: string;
  conversionFactor: number;
  latestBuyPrice: number; // HPP per unit (adjusted for conversion factor)
  isMapped: boolean;

  // Financials
  grossSalePerUnit: number;
  netPayoutPerUnit: number;
  totalGrossSale: number;
  totalNetPayout: number;

  realProfitPerUnit: number;
  realMarginPercent: number;
  totalRealProfit: number;

  destyCurrentPrice?: number | null;
  estimatedMarginPercent?: number | null;
  estimatedProfitPerUnit?: number | null;

  // Correlated Assist Cashier
  cashierName?: string;
  assistInvoice?: string;
  assistTxId?: string;
  assistMatched: boolean;

  // Package history
  packageStatusHistory?: Array<{ status: string; statusUpdateTime: number }>;
}

export interface CorrelateCashierTransaction {
  identifiers: Set<string>;
  txId?: string;
  invoice?: string;
  cashierName?: string;
  status?: string;
  createdDate?: string;
}

/**
 * Calculates net payout received by seller per unit after marketplace admin fee & fix fee.
 */
export function calculateNetPayoutPerUnit(params: {
  paidPrice: number;
  quantity: number;
  totalItemsInOrder: number;
  config: MarketplacePricingConfig;
  orderEscrowAmount?: number | null;
  orderTotalPrice?: number | null;
}): number {
  const {
    paidPrice,
    quantity,
    totalItemsInOrder,
    config,
    orderEscrowAmount,
    orderTotalPrice,
  } = params;

  // If order escrow / net payout is provided and valid (greater than 0)
  if (
    orderEscrowAmount !== undefined &&
    orderEscrowAmount !== null &&
    orderEscrowAmount > 0 &&
    orderTotalPrice &&
    orderTotalPrice > 0
  ) {
    const itemTotalGross = paidPrice * Math.max(1, quantity);
    const proportion = itemTotalGross / orderTotalPrice;
    const itemNetPayout = orderEscrowAmount * proportion;
    return Math.round(itemNetPayout / Math.max(1, quantity));
  }

  // Fallback to marketplace pricing formula:
  // Net = paidPrice * (1 - adminPercent/100) - (adminFixedPerTx / totalItemsInOrder)
  const adminPct = Math.max(0, Math.min(99, config.adminPercent || 0)) / 100;
  const adminFix = Math.max(0, config.adminFixedPerTx || 0);
  const adminPerItem = adminFix / Math.max(1, totalItemsInOrder);

  const netReceived = paidPrice * (1 - adminPct) - adminPerItem;
  return Math.round(Math.max(0, netReceived));
}

/**
 * Calculates real profit nominal and margin percent.
 * Margin % is calculated against Net Received (uang bersih yang diterima apotek).
 */
export function calculateRealMarginMetrics(params: {
  netPayoutPerUnit: number;
  latestBuyPrice: number; // HPP
}): { profitPerUnit: number; marginPercent: number } {
  const { netPayoutPerUnit, latestBuyPrice } = params;
  const profitPerUnit = Math.round(netPayoutPerUnit - latestBuyPrice);
  const marginPercent =
    netPayoutPerUnit > 0 ? (profitPerUnit / netPayoutPerUnit) * 100 : 0;

  return { profitPerUnit, marginPercent };
}

/**
 * Enriches and flattens Desty order records into individual items with margin, HPP, and cashier info.
 */
export function processRecentOrderMargins(params: {
  orders: DestyOrderRecord[];
  assistCatalog: AssistCatalogItem[];
  mappings: DestySkuMapping[];
  pricingConfig: MarketplacePricingConfig;
  destyPriceCatalog?: Record<string, DestyPriceRecord>;
  cashierMap?: Map<string, CorrelateCashierTransaction>;
}): OrderItemRealMargin[] {
  const {
    orders,
    assistCatalog,
    mappings,
    pricingConfig,
    destyPriceCatalog = {},
    cashierMap = new Map(),
  } = params;

  // Index catalog by code and SKU
  const catalogByCode = new Map<string, AssistCatalogItem>();
  for (const item of assistCatalog) {
    if (item.code) {
      catalogByCode.set(item.code.trim().toUpperCase(), item);
    }
    if (item.sku) {
      catalogByCode.set(item.sku.trim().toUpperCase(), item);
    }
    if (Array.isArray(item.skus)) {
      for (const s of item.skus) {
        if (s) catalogByCode.set(s.trim().toUpperCase(), item);
      }
    }
  }

  const results: OrderItemRealMargin[] = [];

  for (const order of orders) {
    const rawOrder = order as any;
    const displayedOrderSn = String(
      order.displayedOrderSn || rawOrder.externalPackageId || rawOrder.orderSn || ""
    ).trim();
    const orderId = String(order.orderId || order.id || displayedOrderSn).trim();
    const platformName = String(order.platformName || rawOrder.platform || "Marketplace");
    const externalShopName = String(order.externalShopName || rawOrder.shopName || "");
    const orderStatus = String(order.status || rawOrder.externalStatus || "Unknown");
    const orderCreateTime = Number(order.orderCreateTime || rawOrder.createTime || 0);
    const bookingSn = String(order.bookingSn || rawOrder.bookingNumber || "").trim();
    const shipmentNo = String(order.shipmentNo || rawOrder.trackingNo || "").trim();
    const courier = String(order.courier || rawOrder.shippingCarrier || "");
    const labelPrinted = Boolean(order.labelPrinted || rawOrder.labelPrintedCount > 0);
    const cancelReason = String(order.cancelReason || rawOrder.cancelReason || "");
    const cancelBy = String(order.cancelBy || rawOrder.cancelBy || "");

    const orderEscrowAmount = typeof rawOrder.escrowAmount === "number" ? rawOrder.escrowAmount : null;
    const orderTotalPrice = typeof order.totalPrice === "number" ? order.totalPrice : null;

    // Check Assist Cashier correlation
    let matchedCashier: CorrelateCashierTransaction | undefined;
    const candidates = [displayedOrderSn, bookingSn, shipmentNo]
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    for (const key of candidates) {
      if (cashierMap.has(key)) {
        matchedCashier = cashierMap.get(key);
        break;
      }
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const totalItemsInOrder = items.reduce((acc, it) => acc + Math.max(1, Number(it.quantity) || 1), 0);

    items.forEach((item: DestyOrderItem, index: number) => {
      const rawItem = item as any;
      const masterSku = String(rawItem.masterSku || rawItem.skuCode || item.skuCode || "").trim();
      const skuCode = String(rawItem.skuCode || masterSku).trim();
      const masterSkuId = rawItem.masterSkuId ? String(rawItem.masterSkuId) : undefined;
      const productName = String(item.productName || rawItem.goodsName || "-");
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = Number(rawItem.unitPrice ?? rawItem.price ?? 0);
      const paidPrice = Number(rawItem.paidPrice ?? unitPrice);
      const itemDiscount = Number(rawItem.itemDiscount ?? 0);
      const mainImageUrl = String(rawItem.mainImageUrl || "");

      // Resolve Assist Catalog Item & Conversion Factor
      const resolved = resolveDestyPriceItem(
        skuCode || masterSku,
        mappings,
        destyPriceCatalog,
        [masterSku, skuCode]
      );

      let matchedCatalogItem: AssistCatalogItem | undefined;
      const normalizedCode = (skuCode || masterSku).trim().toUpperCase();
      if (catalogByCode.has(normalizedCode)) {
        matchedCatalogItem = catalogByCode.get(normalizedCode);
      } else {
        // Try mapping
        const mapping = mappings.find(
          (m) => m.destySku.trim().toUpperCase() === normalizedCode
        );
        if (mapping && mapping.assistCode) {
          matchedCatalogItem = catalogByCode.get(mapping.assistCode.trim().toUpperCase());
        }
      }

      const conversionFactor = Number(resolved.conversionFactor) > 0 ? Number(resolved.conversionFactor) : 1;
      const baseBuyPrice = Number(matchedCatalogItem?.buyFee ?? 0);
      const latestBuyPrice = baseBuyPrice * conversionFactor;
      const isMapped = Boolean(matchedCatalogItem);

      // Financials
      const grossSalePerUnit = paidPrice;
      const netPayoutPerUnit = calculateNetPayoutPerUnit({
        paidPrice,
        quantity,
        totalItemsInOrder,
        config: pricingConfig,
        orderEscrowAmount,
        orderTotalPrice,
      });

      const totalGrossSale = grossSalePerUnit * quantity;
      const totalNetPayout = netPayoutPerUnit * quantity;

      const { profitPerUnit: realProfitPerUnit, marginPercent: realMarginPercent } =
        calculateRealMarginMetrics({
          netPayoutPerUnit,
          latestBuyPrice,
        });
      const totalRealProfit = realProfitPerUnit * quantity;

      // Estimated Margin using Current Desty Master Price
      const destyRec = resolved.destyRecord;
      const destyCurrentPrice = destyRec ? Number(destyRec.salesPrice || 0) : null;
      let estimatedMarginPercent: number | null = null;
      let estimatedProfitPerUnit: number | null = null;

      if (destyCurrentPrice && destyCurrentPrice > 0 && latestBuyPrice > 0) {
        const estNet = calculateNetPayoutPerUnit({
          paidPrice: destyCurrentPrice,
          quantity: 1,
          totalItemsInOrder: 1,
          config: pricingConfig,
        });
        const estProfit = Math.round(estNet - latestBuyPrice);
        estimatedProfitPerUnit = estProfit;
        estimatedMarginPercent = estNet > 0 ? (estProfit / estNet) * 100 : 0;
      }

      const rowId = `${orderId}_${masterSkuId || masterSku}_${index}`;

      results.push({
        rowId,
        orderId,
        displayedOrderSn,
        bookingSn,
        shipmentNo,
        courier,
        platformName,
        externalShopName,
        orderStatus,
        orderCreateTime,
        labelPrinted,
        cancelReason,
        cancelBy,

        masterSkuId: masterSkuId || (destyRec ? destyRec.skuId : undefined),
        masterSku,
        skuCode,
        productName,
        quantity,
        unitPrice,
        paidPrice,
        itemDiscount,
        mainImageUrl,

        assistItemId: matchedCatalogItem?.id,
        assistCode: matchedCatalogItem?.code,
        assistProductName: matchedCatalogItem?.name,
        assistUnit: matchedCatalogItem?.unit,
        conversionFactor,
        latestBuyPrice,
        isMapped,

        grossSalePerUnit,
        netPayoutPerUnit,
        totalGrossSale,
        totalNetPayout,

        realProfitPerUnit,
        realMarginPercent,
        totalRealProfit,

        destyCurrentPrice,
        estimatedMarginPercent,
        estimatedProfitPerUnit,

        cashierName: matchedCashier?.cashierName,
        assistInvoice: matchedCashier?.invoice,
        assistTxId: matchedCashier?.txId,
        assistMatched: Boolean(matchedCashier),

        packageStatusHistory: rawOrder.packageStatusHistory || rawOrder.packages?.[0]?.packageStatusHistory,
      });
    });
  }

  return results;
}

/**
 * Builds a lookup map of Assist cashier & invoice details from Assist EMR transactions.
 */
export function buildCashierLookupMap(
  assistTransactions: any[]
): Map<string, CorrelateCashierTransaction> {
  const map = new Map<string, CorrelateCashierTransaction>();

  for (const tx of assistTransactions) {
    if (!tx || typeof tx !== "object") continue;
    const txId = tx._id || tx.id || tx.transactionId;
    const invoice = tx.invoice || tx.code || tx.nomorFaktur;
    const createdDate = tx.createdAt || tx.transactionDate;
    const status = tx.status || "";

    // Extract cashier name: Payment.createdName or Items[0].createdName or tx.createdName
    let cashierName: string | undefined = undefined;
    if (Array.isArray(tx.Payments) && tx.Payments.length > 0) {
      for (const p of tx.Payments) {
        if (p?.createdName) {
          cashierName = String(p.createdName).trim();
          break;
        }
      }
    }
    if (!cashierName && Array.isArray(tx.Items) && tx.Items.length > 0) {
      for (const it of tx.Items) {
        if (it?.createdName) {
          cashierName = String(it.createdName).trim();
          break;
        }
      }
    }
    if (!cashierName && tx.createdName) {
      cashierName = String(tx.createdName).trim();
    }

    // Extract identifiers from paidName or notes
    const identifiers = new Set<string>();

    const checkPaidName = (value: unknown) => {
      if (typeof value === "string" && value.trim()) {
        const parsed = parseDestyPaidName(value);
        if (parsed) {
          [parsed.order, parsed.booking, parsed.resi]
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
            .forEach((id) => identifiers.add(id));
        } else {
          // If plain order sn stored in note or paidName
          identifiers.add(value.trim().toUpperCase());
        }
      }
    };

    if (tx.paidName) checkPaidName(tx.paidName);
    if (Array.isArray(tx.Payments)) {
      for (const p of tx.Payments) {
        if (p?.paidName) checkPaidName(p.paidName);
        if (p?.name) checkPaidName(p.name);
      }
    }

    if (identifiers.size > 0) {
      const entry: CorrelateCashierTransaction = {
        identifiers,
        txId,
        invoice,
        cashierName: cashierName || "Kasir",
        status,
        createdDate,
      };

      for (const id of identifiers) {
        map.set(id, entry);
      }
    }
  }

  return map;
}
