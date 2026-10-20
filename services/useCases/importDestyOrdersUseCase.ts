import { toCanonicalOrder } from "@/adapters/desty/destyOrderAdapter";
import {
  toAssistSalePayload,
  DEFAULT_ASSIST_TRANSACTION_ACCOUNT_TX_ID,
} from "@/adapters/assist/assistSaleAdapter";
import {
  validateCanonicalOrder,
  OrderValidationError,
  type CanonicalValidationResult,
} from "@/domain/integration/validation";
import type {
  CanonicalOrder,
  CanonicalSaleCommand,
  CanonicalSaleItemCommand,
  SkuMappingEntity,
} from "@/domain/integration/models";
import { AssistHttpClient } from "@/services/clients/assistHttpClient";
import {
  buildDestyDuplicateIndex,
  getDestyImportLedger,
  recordDestyImport,
} from "@/services/destySync/importLedgerStorage";
import type { DestyImportLedgerEntry } from "@/types/destySync";

export interface ImportOrdersConfig {
  token: string;
  apiBaseUrl: string;
  accountTxId: string;
  transactionAccountTxId?: string;
  hospitalId: string;
  duplicateOrderNumbers?: Iterable<string>;
  defaultDepotId?: string;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
}

export interface ImportItemResult {
  order: CanonicalOrder;
  status: "success" | "failed" | "duplicate" | "invalid";
  txId?: string;
  invoice?: string;
  error?: string;
  validation?: CanonicalValidationResult;
}

export interface ImportOrdersOptions {
  orders: unknown[];
  mappings: SkuMappingEntity[];
  config: ImportOrdersConfig;
  concurrency?: number;
  onProgress?: (completed: number, total: number, item: ImportItemResult) => void;
}

function findFirstString(value: unknown, keys: Set<string>): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key.toLowerCase()) && (typeof item === "string" || typeof item === "number")) {
      const result = String(item).trim();
      if (result) return result;
    }
    const nested = findFirstString(item, keys);
    if (nested) return nested;
  }
  return undefined;
}

function extractAssistIdentifiers(response: unknown): { txId?: string; invoice?: string } {
  return {
    txId: findFirstString(response, new Set(["txid", "transactionid", "_id", "id"])),
    invoice: findFirstString(response, new Set(["invoice", "invoicenumber", "nomorfaktur", "code"])),
  };
}

async function recordImportResult(item: ImportItemResult): Promise<void> {
  const hasIdentifier = Boolean(
    item.order.externalOrderSn ||
    item.order.bookingSn ||
    item.order.trackingNumber ||
    item.order.orderId
  );
  if (!hasIdentifier) return;

  const entry: Omit<DestyImportLedgerEntry, "importedAt" | "updatedAt"> = {
    marketplaceOrderSn:
      item.order.externalOrderSn ||
      item.order.bookingSn ||
      item.order.trackingNumber ||
      item.order.orderId ||
      "",
    bookingSn: item.order.bookingSn,
    trackingNumber: item.order.trackingNumber,
    platformName: item.order.platformName,
    status: item.status === "invalid" ? "failed" : item.status,
    txId: item.txId,
    invoice: item.invoice,
    error: item.error,
  };
  await recordDestyImport(entry);
}

function allocateLineTotals(order: CanonicalOrder, items: Array<{ orderItem: CanonicalOrder["items"][0]; assistQuantity: number }>): number[] {
  if (!items.length) return [];
  const weights = items.map(({ orderItem, assistQuantity }) => {
    if (typeof orderItem.totalPrice === "number" && orderItem.totalPrice > 0) {
      return orderItem.totalPrice;
    }
    if (typeof orderItem.unitPrice === "number" && orderItem.unitPrice > 0) {
      return orderItem.unitPrice * orderItem.quantity;
    }
    return assistQuantity;
  });
  const weightTotal = weights.reduce((sum, v) => sum + v, 0);
  let allocated = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return order.totalSales - allocated;
    const lineTotal = Math.round(order.totalSales * (weight / weightTotal));
    allocated += lineTotal;
    return lineTotal;
  });
}

/**
 * Single Responsibility Use Case: Coordinates importing Desty orders into Assist.
 */
export async function importDestyOrdersUseCase(
  options: ImportOrdersOptions,
): Promise<ImportItemResult[]> {
  const hasAuthoritativeDuplicateIndex = options.config.duplicateOrderNumbers !== undefined;
  const duplicateIndex = hasAuthoritativeDuplicateIndex
    ? new Set<string>()
    : buildDestyDuplicateIndex(await getDestyImportLedger());

  for (const identifier of options.config.duplicateOrderNumbers ?? []) {
    duplicateIndex.add(String(identifier).trim().toUpperCase());
  }

  const client = new AssistHttpClient({
    token: options.config.token,
    baseUrl: options.config.apiBaseUrl,
    fetchImpl: options.config.fetchImpl,
  });

  const canonicalOrders = options.orders.map(toCanonicalOrder);
  const results: ImportItemResult[] = [];
  const batchIdentifiers = new Set<string>();

  for (const order of canonicalOrders) {
    const identifiers = [order.externalOrderSn, order.bookingSn, order.trackingNumber]
      .map((v) => (v ?? "").trim().toUpperCase())
      .filter(Boolean);

    // 1. In-batch duplicate check
    if (identifiers.some((id) => batchIdentifiers.has(id))) {
      const item: ImportItemResult = {
        order,
        status: "duplicate",
        error: "Order duplikat di dalam batch.",
      };
      results.push(item);
      await recordImportResult(item);
      options.onProgress?.(results.length, canonicalOrders.length, item);
      continue;
    }

    // 2. Validate order
    const validation = validateCanonicalOrder(order, {
      mappings: options.mappings,
      duplicateOrderNumbers: duplicateIndex,
      defaultDepotId: options.config.defaultDepotId,
    });

    if (!validation.valid) {
      const isDuplicate = validation.issues.some((i) => i.code === "duplicate-order");
      const item: ImportItemResult = {
        order,
        status: isDuplicate ? "duplicate" : "invalid",
        error: validation.issues.map((i) => i.message).join(" "),
        validation,
      };
      results.push(item);
      await recordImportResult(item);
      options.onProgress?.(results.length, canonicalOrders.length, item);
      continue;
    }

    identifiers.forEach((id) => batchIdentifiers.add(id));

    // 3. Build CanonicalSaleCommand
    const lineTotals = allocateLineTotals(order, validation.mappedItems);
    const saleItems: CanonicalSaleItemCommand[] = validation.mappedItems.map((m, index) => {
      const totalFee = lineTotals[index];
      return {
        assistItemId: m.mapping.assistId,
        assistCode: m.mapping.assistCode,
        assistName: m.mapping.assistName || m.orderItem.productName,
        type: m.mapping.assistType,
        quantity: m.assistQuantity,
        unit: m.mapping.assistUnit || m.orderItem.unit,
        depotId: (m.mapping.depotId || options.config.defaultDepotId)!,
        hospitalId: options.config.hospitalId,
        baseFee: m.assistQuantity > 0 ? totalFee / m.assistQuantity : 0,
        totalFee,
      };
    });

    const command: CanonicalSaleCommand = {
      orderId: order.orderId,
      externalOrderSn: order.externalOrderSn,
      platformName: order.platformName,
      hospitalId: options.config.hospitalId,
      accountTxId: options.config.accountTxId,
      transactionAccountTxId:
        options.config.transactionAccountTxId || DEFAULT_ASSIST_TRANSACTION_ACCOUNT_TX_ID,
      patientName: "Pasien Apotek",
      paidFee: order.totalSales,
      totalFee: order.totalSales,
      dryRun: options.config.dryRun,
      items: saleItems,
      rawOrder: order,
    };

    // 4. Execute (or dry run)
    if (options.config.dryRun) {
      const item: ImportItemResult = {
        order,
        status: "success",
        validation,
      };
      results.push(item);
      options.onProgress?.(results.length, canonicalOrders.length, item);
      continue;
    }

    try {
      const rawPayload = toAssistSalePayload(command);
      const response = await client.putEncrypted("/KTxes/payment", rawPayload);
      const identifiersFound = extractAssistIdentifiers(response);

      const item: ImportItemResult = {
        order,
        status: "success",
        txId: identifiersFound.txId,
        invoice: identifiersFound.invoice,
        validation,
      };
      results.push(item);
      await recordImportResult(item);
      options.onProgress?.(results.length, canonicalOrders.length, item);
    } catch (err) {
      const item: ImportItemResult = {
        order,
        status: "failed",
        error: err instanceof Error ? err.message : "Pengiriman pesanan ke Assist gagal.",
        validation,
      };
      results.push(item);
      await recordImportResult(item);
      options.onProgress?.(results.length, canonicalOrders.length, item);
    }
  }

  return results;
}
