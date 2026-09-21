import type {
  AssistCatalogItem,
  DestyOrderValidationContext,
  DestyOrderValidationIssue,
  DestyOrderValidationResult,
  DestySkuMapping,
  NormalizedDestyOrder,
} from "@/types/destySync";

function normalized(value: string | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function mappingBySku(mappings: DestySkuMapping[]): Map<string, DestySkuMapping> {
  return new Map(
    mappings
      .filter((mapping) => mapping.active)
      .map((mapping) => [normalized(mapping.destySku), mapping]),
  );
}

function catalogById(items: AssistCatalogItem[] | undefined): Map<string, AssistCatalogItem> {
  return new Map((items ?? []).map((item) => [item.id.trim(), item]));
}

function catalogByCode(items: AssistCatalogItem[] | undefined): Map<string, AssistCatalogItem> {
  return new Map(
    (items ?? [])
      .filter((item) => Boolean(item.code))
      .map((item) => [normalized(item.code), item]),
  );
}

function addIssue(
  issues: DestyOrderValidationIssue[],
  issue: DestyOrderValidationIssue,
): void {
  issues.push(issue);
}

/** Validates an order without making any network or storage changes. */
export function validateDestyOrder(
  order: NormalizedDestyOrder,
  context: DestyOrderValidationContext,
): DestyOrderValidationResult {
  const issues: DestyOrderValidationIssue[] = [];
  const mappedItems: DestyOrderValidationResult["mappedItems"] = [];
  const mappings = mappingBySku(context.mappings);
  const catalog = catalogById(context.assistCatalog);
  const catalogCodes = catalogByCode(context.assistCatalog);
  const duplicates = new Set(
    Array.from(context.duplicateOrderNumbers ?? [], (value) => normalized(String(value))),
  );
  const orderNumbers = [order.marketplaceOrderSn, order.bookingSn, order.trackingNumber]
    .map(normalized)
    .filter(Boolean);

  if (!orderNumbers.length) {
    addIssue(issues, {
      code: "missing-order-number",
      message: "Order tidak memiliki marketplaceOrderSn, bookingSn, atau trackingNumber.",
    });
  }
  if (orderNumbers.some((number) => duplicates.has(number))) {
    addIssue(issues, {
      code: "duplicate-order",
      message: `Order sudah pernah diimpor (${order.marketplaceOrderSn || order.bookingSn || order.trackingNumber}).`,
    });
  }

  let expectedTotal = 0;
  let hasExpectedPrice = false;
  for (const item of order.items) {
    const sku = item.destySku.trim();
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      addIssue(issues, {
        code: "invalid-quantity",
        message: `Quantity harus lebih besar dari nol untuk SKU ${sku || item.productName}.`,
        sku,
        quantity: item.quantity,
      });
      continue;
    }

    let mapping = mappings.get(normalized(sku));
    // Fallback 1:1 to Assist catalog by SKU code if no explicit mapping exists
    if (!mapping && context.assistCatalog) {
      const fallbackCatalogItem = catalogCodes.get(normalized(sku));
      if (fallbackCatalogItem) {
        mapping = {
          destySku: sku,
          assistCode: fallbackCatalogItem.code,
          assistType: fallbackCatalogItem.type,
          assistId: fallbackCatalogItem.id,
          assistName: fallbackCatalogItem.name,
          destyUnit: fallbackCatalogItem.unit,
          assistUnit: fallbackCatalogItem.unit,
          depotId: fallbackCatalogItem.depotId || context.defaultDepotId,
          conversionFactor: 1,
          active: true,
        };
      }
    }

    if (!mapping) {
      addIssue(issues, {
        code: "unmapped-sku",
        message: `SKU Desty belum dipetakan: ${sku || item.productName}.`,
        sku,
      });
      continue;
    }

    if (!Number.isFinite(mapping.conversionFactor) || mapping.conversionFactor <= 0) {
      addIssue(issues, {
        code: "invalid-conversion-factor",
        message: `Conversion factor tidak valid untuk SKU ${sku}.`,
        sku,
      });
      continue;
    }

    const assistQuantity = item.quantity * mapping.conversionFactor;
    const catalogItem = context.assistCatalog ? catalog.get(mapping.assistId) : undefined;
    if (context.assistCatalog && (!catalogItem || catalogItem.type !== mapping.assistType)) {
      addIssue(issues, {
        code: "missing-assist-item",
        message: `Item Assist tidak ditemukan untuk mapping ${sku} (${mapping.assistId}).`,
        sku,
        quantity: assistQuantity,
      });
      continue;
    }

    const depotId = mapping.assistId
      ? mapping.depotId ?? context.depotByAssistId?.[mapping.assistId] ?? catalogItem?.depotId ?? context.defaultDepotId
      : undefined;
    if (context.assistCatalog && !String(depotId ?? "").trim()) {
      addIssue(issues, {
        code: "missing-depot",
        message: `Depot Assist tidak tersedia untuk SKU ${sku}.`,
        sku,
        quantity: assistQuantity,
      });
    }

    const stock = context.stockByAssistId?.[mapping.assistId];
    if (typeof stock === "number" && Number.isFinite(stock) && stock < assistQuantity) {
      addIssue(issues, {
        code: "insufficient-stock",
        message: `Stok Assist tidak cukup untuk ${sku}: tersedia ${stock}, diperlukan ${assistQuantity}.`,
        sku,
        quantity: assistQuantity,
      });
    }

    const unitPrice = item.unitPrice ?? catalogItem?.sellNormalFee;
    if (unitPrice !== undefined && Number.isFinite(unitPrice)) {
      expectedTotal += unitPrice * assistQuantity;
      hasExpectedPrice = true;
    }

    mappedItems.push({ orderItem: item, mapping, assistQuantity });
  }

  const expected = context.expectedTotal ?? (hasExpectedPrice ? expectedTotal : undefined);
  const threshold = context.priceMismatchThreshold ?? 0.5;
  if (
    expected !== undefined &&
    expected > 0 &&
    order.totalSales > 0 &&
    Number.isFinite(threshold) &&
    Math.abs(order.totalSales - expected) / expected > threshold
  ) {
    addIssue(issues, {
      code: "price-mismatch",
      message: `Total harga Desty (${order.totalSales}) berbeda lebih dari ${threshold * 100}% dari estimasi Assist (${expected}).`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    mappedItems,
  };
}
