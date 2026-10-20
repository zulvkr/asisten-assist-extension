import type { CanonicalStockBalance, StockDeductionCommand } from "@/domain/integration/models";

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Inbound ACL Adapter: translates raw Desty stock item into CanonicalStockBalance.
 */
export function toCanonicalStockBalance(input: unknown): CanonicalStockBalance {
  const row = recordOf(input);
  const sku = String(row.sku ?? row.skuCode ?? row.masterSku ?? "").trim();
  const skuId = row.skuId ? String(row.skuId) : undefined;
  const warehouseId = row.warehouseId ? String(row.warehouseId) : undefined;
  const productName = row.productName || row.name ? String(row.productName || row.name) : undefined;

  const breakdown = recordOf(row.breakdown);
  const physicalStock = toNullableNumber(row.fisik ?? breakdown.fisik ?? row.onHand ?? row.stock);
  const availableStock = toNullableNumber(row.tersedia ?? breakdown.tersedia ?? row.available);
  const reservedStock = toNullableNumber(row.pesanan ?? breakdown.pesanan ?? row.allocated);

  return {
    sku,
    skuId,
    warehouseId,
    physicalStock,
    availableStock,
    reservedStock,
    productName,
    raw: input,
  };
}

/**
 * Outbound ACL Adapter: translates StockDeductionCommand to Desty editOnHand payload.
 */
export function toDestyOnHandEditPayload(command: StockDeductionCommand): {
  skuId: string;
  warehouseId: string;
  amount: number;
  editType: "Add";
} {
  return {
    skuId: command.skuId,
    warehouseId: command.warehouseId,
    amount: -Math.abs(command.deltaQuantity),
    editType: "Add",
  };
}
