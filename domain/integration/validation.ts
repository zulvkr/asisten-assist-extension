import type {
  CanonicalCatalogItem,
  CanonicalOrder,
  SkuMappingEntity,
} from "./models";

export type ValidationIssueCode =
  | "unmapped-sku"
  | "missing-assist-item"
  | "missing-depot"
  | "insufficient-stock"
  | "duplicate-order"
  | "price-mismatch"
  | "invalid-quantity"
  | "invalid-conversion-factor"
  | "missing-order-number";

export interface CanonicalValidationIssue {
  code: ValidationIssueCode;
  message: string;
  sku?: string;
  quantity?: number;
}

export interface CanonicalValidationContext {
  mappings: SkuMappingEntity[];
  catalog?: CanonicalCatalogItem[];
  stockByItemId?: Record<string, number | null | undefined>;
  depotByItemId?: Record<string, string | null | undefined>;
  defaultDepotId?: string;
  duplicateOrderNumbers?: Iterable<string>;
  expectedTotal?: number;
  priceMismatchThreshold?: number;
}

export interface MappedOrderItem {
  orderItem: CanonicalOrder["items"][0];
  mapping: SkuMappingEntity;
  assistQuantity: number;
  catalogItem?: CanonicalCatalogItem;
}

export interface CanonicalValidationResult {
  valid: boolean;
  issues: CanonicalValidationIssue[];
  mappedItems: MappedOrderItem[];
}

export class OrderValidationError extends Error {
  readonly validation: CanonicalValidationResult;

  constructor(validation: CanonicalValidationResult) {
    super(validation.issues.map((i) => i.message).join(" "));
    this.name = "OrderValidationError";
    this.validation = validation;
  }
}

function normalized(value: string | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function validateCanonicalOrder(
  order: CanonicalOrder,
  context: CanonicalValidationContext,
): CanonicalValidationResult {
  const issues: CanonicalValidationIssue[] = [];
  const mappedItems: MappedOrderItem[] = [];
  const mappings = new Map(
    context.mappings
      .filter((m) => m.active)
      .map((m) => [normalized(m.destySku), m]),
  );

  const catalogById = new Map((context.catalog ?? []).map((c) => [c.id.trim(), c]));
  const catalogLookup = new Map<string, CanonicalCatalogItem>();
  for (const c of context.catalog ?? []) {
    if (c.code) catalogLookup.set(normalized(c.code), c);
    if (c.sku) catalogLookup.set(normalized(c.sku), c);
    if (Array.isArray(c.skus)) {
      for (const s of c.skus) {
        if (s) catalogLookup.set(normalized(s), c);
      }
    }
    if (c.id) catalogLookup.set(normalized(c.id), c);
  }

  const duplicates = new Set(
    Array.from(context.duplicateOrderNumbers ?? [], (v) => normalized(String(v))),
  );

  const identifiers = [order.externalOrderSn, order.bookingSn, order.trackingNumber]
    .map(normalized)
    .filter(Boolean);

  if (!identifiers.length) {
    issues.push({
      code: "missing-order-number",
      message: "Order tidak memiliki externalOrderSn, bookingSn, atau trackingNumber.",
    });
  }

  if (identifiers.some((id) => duplicates.has(id))) {
    issues.push({
      code: "duplicate-order",
      message: `Order sudah pernah diimpor (${order.externalOrderSn || order.bookingSn || order.trackingNumber}).`,
    });
  }

  for (const item of order.items) {
    const sku = item.sku.trim();
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      issues.push({
        code: "invalid-quantity",
        message: `Quantity harus lebih besar dari nol untuk SKU ${sku || item.productName}.`,
        sku,
        quantity: item.quantity,
      });
      continue;
    }

    let mapping = mappings.get(normalized(sku));
    if (!mapping && context.catalog) {
      const fallback = catalogLookup.get(normalized(sku));
      if (fallback) {
        mapping = {
          destySku: sku,
          assistCode: fallback.code,
          assistType: fallback.type,
          assistId: fallback.id,
          assistName: fallback.name,
          destyUnit: fallback.unit,
          assistUnit: fallback.unit,
          depotId: fallback.depotId || context.defaultDepotId,
          conversionFactor: 1,
          active: true,
        };
      }
    }
    if (!mapping && item.isMapped && item.mappedAssistId) {
      const fallback = catalogById.get(item.mappedAssistId.trim());
      mapping = {
        destySku: sku,
        assistCode: item.mappedAssistCode || fallback?.code || sku,
        assistType: fallback?.type || "prescription",
        assistId: item.mappedAssistId,
        assistName: item.mappedAssistName || fallback?.name || item.productName,
        destyUnit: item.unit || fallback?.unit,
        assistUnit: fallback?.unit || item.unit,
        depotId: fallback?.depotId || context.defaultDepotId,
        conversionFactor: item.conversionFactor || 1,
        active: true,
      };
    }

    if (!mapping) {
      issues.push({
        code: "unmapped-sku",
        message: `SKU '${sku || item.productName}' belum dipetakan ke katalog Assist.`,
        sku,
      });
      continue;
    }

    if (!Number.isFinite(mapping.conversionFactor) || mapping.conversionFactor <= 0) {
      issues.push({
        code: "invalid-conversion-factor",
        message: `Faktor konversi untuk SKU ${sku} tidak valid (${mapping.conversionFactor}).`,
        sku,
      });
      continue;
    }

    const catalogItem = catalogById.get(mapping.assistId.trim()) ?? catalogLookup.get(normalized(mapping.assistCode));
    const depotId =
      mapping.depotId?.trim() ||
      catalogItem?.depotId?.trim() ||
      context.depotByItemId?.[mapping.assistId]?.trim() ||
      context.defaultDepotId?.trim();

    if (!depotId) {
      issues.push({
        code: "missing-depot",
        message: `Depot tidak ditemukan untuk ${mapping.assistCode} (${sku}).`,
        sku,
      });
    }

    const assistQuantity = item.quantity * mapping.conversionFactor;
    mappedItems.push({
      orderItem: item,
      mapping,
      assistQuantity,
      catalogItem,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    mappedItems,
  };
}
