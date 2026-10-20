import type { CanonicalCatalogItem, CatalogItemType } from "@/domain/integration/models";

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const result = String(value).trim();
      if (result) return result;
    }
  }
  return "";
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string" || !value.trim()) continue;
    const parsed = Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function findDepotId(row: Record<string, unknown>): string | undefined {
  const direct = text(row.depotId, row.defaultDepotId, row.warehouseId);
  if (direct) return direct;
  const depot = recordOf(row.depot);
  const nested = text(depot.id, depot._id);
  if (nested) return nested;

  for (const key of ["depotStocks", "depotStock", "depots", "warehouses"]) {
    const value = row[key];
    if (Array.isArray(value) && value.length === 1) {
      const candidate = recordOf(value[0]);
      const id = text(candidate.depotId, candidate.warehouseId, candidate.id, candidate._id);
      if (id) return id;
    }
  }
  return undefined;
}

function parseCatalogBuyFee(row: Record<string, unknown>): number | undefined {
  const buyFee = numberValue(row.buyFee, row.lastBuyFee, row.buyPrice, row.purchasePrice);
  if (buyFee !== undefined && buyFee > 0) return buyFee;

  const avgHpp = numberValue(row.avgHPP, row.avgHpp, row.baseFee);
  if (avgHpp !== undefined && avgHpp > 0) return avgHpp;

  return buyFee !== undefined ? buyFee : avgHpp;
}

/**
 * Inbound ACL Adapter: translates a raw item from Assist KMedicineStocks / KAKHPStocks into CanonicalCatalogItem.
 */
export function toCanonicalCatalogItem(
  value: unknown,
  type: CatalogItemType,
): CanonicalCatalogItem | undefined {
  const row = recordOf(value);
  const id = text(row.medicineId, row.akhpId, row.id, row._id);
  if (!id) return undefined;

  return {
    id,
    code: text(row.code, row.itemCode),
    name: text(row.medName, row.itemName, row.name) || id,
    type,
    unit: text(row.unit, row.medUnit) || undefined,
    depotId: findDepotId(row),
    stock: numberValue(row.stockTotal ?? row.stock ?? row.available),
    sellNormalFee: numberValue(row.sellNormalFee, row.sellingPrice, row.baseFee),
    buyFee: parseCatalogBuyFee(row),
    avgHPP: numberValue(row.avgHPP, row.avgHpp),
    sku: text(row.sku, row.skuCode),
  };
}
