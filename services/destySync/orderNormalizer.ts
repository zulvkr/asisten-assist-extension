import { toCanonicalOrder, type CanonicalMappingContext } from "@/adapters/desty/destyOrderAdapter";
import type { NormalizedDestyOrder, NormalizedDestyOrderItem } from "@/types/destySync";

/**
 * Facade: converts the different list/detail shapes returned by Desty into one stable contract.
 * Delegated to inbound ACL adapter toCanonicalOrder.
 */
export function normalizeDestyOrder(
  input: unknown,
  context?: CanonicalMappingContext,
): NormalizedDestyOrder {
  const canonical = toCanonicalOrder(input, context);
  return {
    orderId: canonical.orderId,
    marketplaceOrderSn: canonical.marketplaceOrderSn || canonical.externalOrderSn,
    bookingSn: canonical.bookingSn || "",
    trackingNumber: canonical.trackingNumber || "",
    platformName: canonical.platformName,
    totalSales: canonical.totalSales,
    netSettlement: canonical.netSettlement,
    createdAt: canonical.createdAt,
    deliveryDeadline: canonical.deliveryDeadline,
    items: canonical.items.map((i): NormalizedDestyOrderItem => ({
      destySku: i.destySku || i.sku,
      productName: i.productName,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
      isMapped: i.isMapped,
      mappingSource: i.mappingSource,
      mappedAssistId: i.mappedAssistId,
      mappedAssistCode: i.mappedAssistCode,
      mappedAssistName: i.mappedAssistName,
      conversionFactor: i.conversionFactor,
    })),
    raw: canonical.raw,
  };
}
