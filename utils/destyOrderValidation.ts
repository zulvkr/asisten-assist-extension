import type {
  AssistCatalogItem,
  DestyOrderValidationContext,
  DestyOrderValidationIssue,
  DestyOrderValidationResult,
  DestySkuMapping,
  NormalizedDestyOrder,
} from "@/types/destySync";
import { resolveEffectiveDestySkuMapping } from "@/services/destySync/mappingStorage";

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
  const map = new Map<string, AssistCatalogItem>();
  for (const item of items ?? []) {
    if (item.code) map.set(normalized(item.code), item);
    if (item.sku) map.set(normalized(item.sku), item);
    if (Array.isArray(item.skus)) {
      for (const s of item.skus) {
        if (s) map.set(normalized(s), item);
      }
    }
  }
  return map;
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
    // 1. Try resolveEffectiveDestySkuMapping (checks overrides, item.skus, item.sku, item.code, destyMappings)
    if (!mapping && context.assistCatalog) {
      mapping = resolveEffectiveDestySkuMapping(
        sku,
        context.mappings,
        context.assistCatalog,
        context.defaultDepotId,
      );
    }
    // 2. Fallback via catalogCodes map (code, sku, skus)
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
    // 3. Fallback via ACL item.isMapped metadata if previously resolved
    if (!mapping && item.isMapped && item.mappedAssistId) {
      const fallbackCat = context.assistCatalog ? catalog.get(item.mappedAssistId) : undefined;
      mapping = {
        destySku: sku,
        assistCode: item.mappedAssistCode || fallbackCat?.code || sku,
        assistType: fallbackCat?.type || "prescription",
        assistId: item.mappedAssistId,
        assistName: item.mappedAssistName || fallbackCat?.name || item.productName,
        destyUnit: item.unit || fallbackCat?.unit,
        assistUnit: fallbackCat?.unit || item.unit,
        depotId: fallbackCat?.depotId || context.defaultDepotId,
        conversionFactor: item.conversionFactor || 1,
        active: true,
      };
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
