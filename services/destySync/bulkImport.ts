import {
  createAssistSaleOrder,
  DestyOrderValidationError,
  type AssistSaleOrderResult,
  type AssistSalesConfig,
} from "@/services/integration/assistSalesApi";
import { normalizeDestyOrder } from "@/services/destySync/orderNormalizer";
import {
  buildDestyDuplicateIndex,
  getDestyImportLedger,
  recordDestyImport,
} from "@/services/destySync/importLedgerStorage";
import type { DestyImportLedgerEntry, DestySkuMapping } from "@/types/destySync";

export interface DestyBulkImportItemResult {
  order: ReturnType<typeof normalizeDestyOrder>;
  status: "success" | "failed" | "duplicate" | "invalid";
  result?: AssistSaleOrderResult;
  error?: string;
}

export interface DestyBulkImportOptions {
  orders: unknown[];
  mappings: DestySkuMapping[];
  config: AssistSalesConfig;
  concurrency?: number;
  onProgress?: (completed: number, total: number, item: DestyBulkImportItemResult) => void;
}

function orderLedgerFields(order: ReturnType<typeof normalizeDestyOrder>) {
  return {
    marketplaceOrderSn: order.marketplaceOrderSn,
    bookingSn: order.bookingSn,
    trackingNumber: order.trackingNumber,
    platformName: order.platformName,
  };
}

async function saveResult(item: DestyBulkImportItemResult): Promise<void> {
  if (!item.order.marketplaceOrderSn) return;
  const entry: Omit<DestyImportLedgerEntry, "importedAt" | "updatedAt"> = {
    ...orderLedgerFields(item.order),
    status: item.status === "invalid" ? "failed" : item.status,
    txId: item.result?.txId,
    invoice: item.result?.invoice,
    error: item.error,
  };
  await recordDestyImport(entry);
}

/** Validates every order first, then sends only valid orders with bounded concurrency. */
export async function bulkImportDestyOrders(
  options: DestyBulkImportOptions,
): Promise<DestyBulkImportItemResult[]> {
  const hasAuthoritativeDuplicateIndex = options.config.duplicateOrderNumbers !== undefined;
  const duplicateIndex = hasAuthoritativeDuplicateIndex
    ? new Set<string>()
    : buildDestyDuplicateIndex(await getDestyImportLedger());
  for (const identifier of options.config.duplicateOrderNumbers ?? []) {
    duplicateIndex.add(String(identifier).trim().toUpperCase());
  }
  const normalizedOrders = options.orders.map(normalizeDestyOrder);
  const results: DestyBulkImportItemResult[] = [];
  const validOrders: ReturnType<typeof normalizeDestyOrder>[] = [];
  const batchIdentifiers = new Set<string>();

  for (const order of normalizedOrders) {
    const dryRunConfig: AssistSalesConfig = {
      ...options.config,
      duplicateOrderNumbers: duplicateIndex,
      dryRun: true,
    };
    try {
      await createAssistSaleOrder(order, options.mappings, dryRunConfig);
      const identifiers = [order.marketplaceOrderSn, order.bookingSn, order.trackingNumber]
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
      if (identifiers.some((identifier) => batchIdentifiers.has(identifier))) {
        const item: DestyBulkImportItemResult = { order, status: "duplicate", error: "Order duplikat di dalam batch." };
        results.push(item);
        await saveResult(item);
        options.onProgress?.(results.length, normalizedOrders.length, item);
      } else {
        identifiers.forEach((identifier) => batchIdentifiers.add(identifier));
        validOrders.push(order);
      }
    } catch (error) {
      const item: DestyBulkImportItemResult = {
        order,
        status: error instanceof DestyOrderValidationError ? "invalid" : "failed",
        error: error instanceof Error ? error.message : "Validasi order gagal.",
      };
      results.push(item);
      await saveResult(item);
      options.onProgress?.(results.length, normalizedOrders.length, item);
    }
  }

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < validOrders.length) {
      const order = validOrders[cursor++];
      let item: DestyBulkImportItemResult;
      try {
        const result = await createAssistSaleOrder(order, options.mappings, {
          ...options.config,
          duplicateOrderNumbers: duplicateIndex,
          dryRun: false,
        });
        item = { order, status: "success", result };
      } catch (error) {
        item = {
          order,
          status: error instanceof DestyOrderValidationError ? "duplicate" : "failed",
          error: error instanceof Error ? error.message : "Impor order gagal.",
        };
      }
      results.push(item);
      await saveResult(item);
      options.onProgress?.(results.length, normalizedOrders.length, item);
    }
  };

  const concurrency = Math.max(1, Math.min(10, Math.floor(options.concurrency ?? 2)));
  await Promise.all(Array.from({ length: Math.min(concurrency, validOrders.length) }, worker));
  return results;
}

/** A retry must re-read the duplicate source before sending after an uncertain request. */
export async function retryDestyOrderAfterDuplicateCheck(params: {
  order: unknown;
  mappings: DestySkuMapping[];
  config: AssistSalesConfig;
  readDuplicateIdentifiers: () => Promise<Iterable<string>>;
}): Promise<AssistSaleOrderResult> {
  const order = normalizeDestyOrder(params.order);
  const duplicates = new Set(
    Array.from(await params.readDuplicateIdentifiers(), (value) => String(value).trim().toUpperCase()),
  );
  const identifiers = [order.marketplaceOrderSn, order.bookingSn, order.trackingNumber]
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (identifiers.some((identifier) => duplicates.has(identifier))) {
    throw new Error("Retry dibatalkan: order sudah ditemukan pada duplicate-check terbaru.");
  }
  return createAssistSaleOrder(order, params.mappings, {
    ...params.config,
    duplicateOrderNumbers: duplicates,
    dryRun: false,
  });
}
