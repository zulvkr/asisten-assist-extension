import { buildAssistHeaders } from "@/services/integration/assistRequest";
import {
  encryptPayload,
  wrapEncryptedPayload,
} from "@/utils/cryptoUtils";
import {
  normalizeDestyOrder,
} from "@/services/destySync/orderNormalizer";
import {
  buildAssistSalePayload,
  type AssistSalePayload,
} from "@/services/destySync/salePayloadBuilder";
import {
  validateDestyOrder,
} from "@/utils/destyOrderValidation";
import { parseDestyPaidName } from "@/utils/destyPaidNameParser";
import type {
  AssistCatalogItem,
  DestyOrderValidationResult,
  DestySkuMapping,
  NormalizedDestyOrder,
} from "@/types/destySync";

export interface AssistSalesConfig {
  token: string;
  apiBaseUrl: string;
  accountTxId: string;
  transactionAccountTxId?: string;
  hospitalId: string;
  depotIdByAssistId?: Record<string, string | undefined>;
  defaultDepotId?: string;
  assistCatalog?: AssistCatalogItem[];
  stockByAssistId?: Record<string, number | null | undefined>;
  duplicateOrderNumbers?: Iterable<string>;
  expectedTotal?: number;
  priceMismatchThreshold?: number;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
}

export interface AssistSaleOrderResult {
  ok: true;
  dryRun: boolean;
  order: NormalizedDestyOrder;
  payload: AssistSalePayload;
  validation: DestyOrderValidationResult;
  txId?: string;
  invoice?: string;
  response?: unknown;
}

export class DestyOrderValidationError extends Error {
  readonly validation: DestyOrderValidationResult;

  constructor(validation: DestyOrderValidationResult) {
    super(validation.issues.map((issue) => issue.message).join(" "));
    this.name = "DestyOrderValidationError";
    this.validation = validation;
  }
}

function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

export function extractAssistSaleIdentifiers(response: unknown): {
  txId?: string;
  invoice?: string;
} {
  return {
    txId: findFirstString(response, new Set(["txid", "transactionid", "_id", "id"])),
    invoice: findFirstString(response, new Set(["invoice", "invoicenumber", "nomorfaktur", "code"])),
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return undefined;
  }
}

/** Creates one encrypted Assist POS sale, or returns its exact payload in dry-run mode. */
export async function createAssistSaleOrder(
  inputOrder: unknown,
  mappings: DestySkuMapping[],
  config: AssistSalesConfig,
): Promise<AssistSaleOrderResult> {
  const token = config.token.trim();
  if (!token) throw new Error("Token Assist kosong.");
  if (!trimBaseUrl(config.apiBaseUrl)) throw new Error("URL API Assist kosong.");

  const order = normalizeDestyOrder(inputOrder);
  const validation = validateDestyOrder(order, {
    mappings,
    assistCatalog: config.assistCatalog,
    stockByAssistId: config.stockByAssistId,
    depotByAssistId: config.depotIdByAssistId,
    defaultDepotId: config.defaultDepotId,
    duplicateOrderNumbers: config.duplicateOrderNumbers,
    expectedTotal: config.expectedTotal,
    priceMismatchThreshold: config.priceMismatchThreshold,
  });
  if (!validation.valid) throw new DestyOrderValidationError(validation);

  const payload = buildAssistSalePayload(order, validation.mappedItems, {
    accountTxId: config.accountTxId,
    transactionAccountTxId: config.transactionAccountTxId,
    hospitalId: config.hospitalId,
    depotIdByAssistId: config.depotIdByAssistId,
    defaultDepotId: config.defaultDepotId,
  });

  if (config.dryRun) {
    return { ok: true, dryRun: true, order, payload, validation };
  }

  const encrypted = await encryptPayload(JSON.stringify(payload));
  const requestBody = wrapEncryptedPayload(encrypted);
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(`${trimBaseUrl(config.apiBaseUrl)}/KTxes/payment`, {
    method: "PUT",
    credentials: "include",
    headers: {
      ...buildAssistHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseBody = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Gagal membuat transaksi penjualan Assist: HTTP ${response.status}.`);
  }

  const identifiers = extractAssistSaleIdentifiers(responseBody);
  return {
    ok: true,
    dryRun: false,
    order,
    payload,
    validation,
    ...identifiers,
    response: responseBody,
  };
}

export interface AssistDestyTransactionDetails {
  identifiers: Set<string>;
  txId?: string;
  invoice?: string;
  status: string;
  voided: boolean;
}

export async function fetchAssistDestyTransactionDetails(params: {
  token: string;
  apiBaseUrl: string;
  hospitalId: string;
  startDate: string;
  endDate?: string;
  fetchImpl?: typeof fetch;
}): Promise<AssistDestyTransactionDetails[]> {
  const startDate = params.startDate.trim();
  const endDate = (params.endDate ?? startDate).trim();
  if (!startDate || !endDate) throw new Error("Rentang tanggal duplicate-check Assist tidak valid.");

  const fetchImpl = params.fetchImpl ?? fetch;
  const details: AssistDestyTransactionDetails[] = [];
  const isVoided = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(isVoided);
    const transaction = recordOf(value);
    const status = String(transaction.status ?? transaction.transactionStatus ?? transaction.state ?? "").trim().toLowerCase();
    if (
      transaction.isVoid === true || transaction.voided === true || transaction.isDeleted === true || transaction.deleted === true ||
      transaction.isCancelled === true || transaction.isCanceled === true ||
      Boolean(transaction.voidedAt ?? transaction.deletedAt ?? transaction.cancelledAt ?? transaction.canceledAt) ||
      ["void", "voided", "cancel", "cancelled", "canceled", "batal", "dibatalkan", "deleted"].some((marker) => status.includes(marker))
    ) return true;
    return Object.entries(transaction).some(([key, child]) => {
      const normalizedKey = key.toLowerCase();
      if ((normalizedKey.includes("void") || normalizedKey.includes("cancel") || normalizedKey.includes("delet")) && Boolean(child)) return true;
      return child && typeof child === "object" && isVoided(child);
    });
  };
  const collectIdentifiers = (value: unknown, output: Set<string>): void => {
    if (Array.isArray(value)) return value.forEach((item) => collectIdentifiers(item, output));
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key.toLowerCase() === "paidname" && typeof child === "string") {
        const metadata = parseDestyPaidName(child);
        if (metadata) [metadata.order, metadata.booking, metadata.resi]
          .map((item) => item.trim().toUpperCase()).filter(Boolean)
          .forEach((item) => output.add(item));
      }
      collectIdentifiers(child, output);
    }
  };

  const pageSize = 1000;
  let skip = 0;
  while (true) {
    const url = new URL(`${trimBaseUrl(params.apiBaseUrl)}/superapps/getEmrTransactionsByHospitalId`);
    url.searchParams.set("hospitalId", params.hospitalId.trim());
    url.searchParams.set("skip", String(skip));
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("tanggalMin", `${startDate} 00:00:00`);
    url.searchParams.set("tanggalMax", `${endDate} 23:59:59`);
    url.searchParams.append("status[]", "Lunas");
    url.searchParams.append("metodePembayaran[]", "Kartu Debit");
    const response = await fetchImpl(url.toString(), { method: "GET", credentials: "include", headers: buildAssistHeaders(params.token.trim()) });
    if (!response.ok) throw new Error(`Gagal duplicate-check transaksi Assist: HTTP ${response.status}.`);
    const payload = await parseResponse(response);
    const responseObject = recordOf(payload);
    const rows: unknown[] = Array.isArray(responseObject.result) ? responseObject.result : Array.isArray(responseObject.data) ? responseObject.data : [];
    for (const row of rows) {
      const identifiers = new Set<string>();
      collectIdentifiers(row, identifiers);
      if (identifiers.size) {
        const rowObject = recordOf(row);
        details.push({
          identifiers,
          txId: extractAssistSaleIdentifiers(row).txId,
          invoice: extractAssistSaleIdentifiers(row).invoice,
          status: String(rowObject.status ?? rowObject.transactionStatus ?? rowObject.state ?? ""),
          voided: isVoided(row),
        });
      }
    }
    const responseTotal = Number(responseObject.total);
    if (rows.length < pageSize || (Number.isFinite(responseTotal) && skip + rows.length >= responseTotal)) break;
    skip += pageSize;
  }
  return details;
}

export async function fetchAssistDestyDuplicateIdentifiers(params: Parameters<typeof fetchAssistDestyTransactionDetails>[0]): Promise<Set<string>> {
  const details = await fetchAssistDestyTransactionDetails(params);
  const identifiers = new Set<string>();
  details.filter((detail) => !detail.voided).forEach((detail) => detail.identifiers.forEach((identifier) => identifiers.add(identifier)));
  return identifiers;
}

export function getAssistSaleResponseData(response: unknown): Record<string, unknown> {
  const object = recordOf(response);
  return recordOf(object.data ?? object.result ?? response);
}
