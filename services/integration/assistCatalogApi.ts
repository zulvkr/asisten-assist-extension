import { buildAssistHeaders } from "@/services/integration/assistRequest";
import {
  DEFAULT_ASSIST_DEPOT_ID,
} from "@/services/destySync/mappingStorage";
import type {
  AssistCatalogItem,
  AssistCatalogType,
} from "@/types/destySync";

interface FetchAssistCatalogParams {
  token: string;
  apiBaseUrl: string;
  hospitalId: string;
  fetchImpl?: typeof fetch;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstRecord(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? recordOf(value[0]) : recordOf(value);
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

function mapCatalogItem(
  value: unknown,
  type: AssistCatalogType,
): AssistCatalogItem | undefined {
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
  };
}

async function fetchCatalogPath(
  params: FetchAssistCatalogParams,
  path: string,
  type: AssistCatalogType,
  fieldName: string,
): Promise<AssistCatalogItem[]> {
  const items: AssistCatalogItem[] = [];
  const pageSize = 1000;
  let skip = 0;

  while (true) {
    const url = new URL(`${params.apiBaseUrl.trim().replace(/\/+$/, "")}/${path}`);
    url.searchParams.set("hospitalId", params.hospitalId.trim());
    url.searchParams.set("skip", String(skip));
    url.searchParams.set("limit", String(pageSize));
    if (fieldName) url.searchParams.set("fieldName", fieldName);
    if (type === "akhp") url.searchParams.set("sort", "1");

    const response = await (params.fetchImpl ?? fetch)(url.toString(), {
      method: "GET",
      credentials: "include",
      headers: buildAssistHeaders(params.token.trim()),
    });
    if (!response.ok) {
      throw new Error(`Gagal mengambil katalog Assist (${type}): HTTP ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    const rawData = recordOf(payload).data;
    const data: unknown[] = Array.isArray(rawData) ? rawData : [];
    items.push(
      ...data
        .map((item) => mapCatalogItem(item, type))
        .filter((item): item is AssistCatalogItem => Boolean(item)),
    );

    const total = numberValue(recordOf(payload).total);
    if (data.length < pageSize || (total !== undefined && items.length >= total)) break;
    skip += pageSize;
  }

  return items;
}

interface AssistDepotRecord {
  assistId: string;
  code: string;
  type: AssistCatalogType;
  depotId: string;
  stock?: number;
}

async function fetchAssistDepotRecords(
  params: FetchAssistCatalogParams,
): Promise<AssistDepotRecord[]> {
  const records: AssistDepotRecord[] = [];
  const pageSize = 1000;
  let skip = 0;
  while (true) {
    const filter = {
      where: { hospitalId: params.hospitalId.trim(), name: "Apotek" },
      include: ["KMedicineStocks", "KAKHPStocks"],
      limit: pageSize,
      skip,
    };
    const url = new URL(`${params.apiBaseUrl.trim().replace(/\/+$/, "")}/KStockDepots`);
    url.searchParams.set("filter", JSON.stringify(filter));
    const response = await (params.fetchImpl ?? fetch)(url.toString(), {
      method: "GET",
      credentials: "include",
      headers: buildAssistHeaders(params.token.trim()),
    });
    if (!response.ok) throw new Error(`Gagal mengambil depot stok Assist: HTTP ${response.status}.`);

    let payload: unknown;
    try { payload = await response.json(); } catch { payload = []; }
    const rows: unknown[] = Array.isArray(payload)
      ? payload
      : Array.isArray(recordOf(payload).data) ? recordOf(payload).data as unknown[] : [];
    for (const value of rows) {
      const row = recordOf(value);
      const isBhp = Boolean(row.KAKHPStocks || row.akhpId);
      const catalog = firstRecord(row.KAKHPStocks ?? row.KMedicineStocks);
      const assistId = text(
        catalog.akhpId,
        catalog.medicineId,
        catalog.id,
        row.akhpId,
        row.medicineId,
        row.medicineStockId,
        row.akhpStockId,
      );
      const depotId = text(row.id, row._id, row.depotId, row.stockDepotId);
      if (!assistId || !depotId) continue;
      records.push({
        assistId,
        code: text(catalog.code, row.code),
        type: isBhp ? "akhp" : "prescription",
        depotId,
        stock: numberValue(row.stockAvailable, row.stockTotal, row.stock),
      });
    }
    if (rows.length < pageSize) break;
    skip += pageSize;
  }
  return records;
}

function mergeCatalogAndDepots(
  catalog: AssistCatalogItem[],
  depots: AssistDepotRecord[],
): AssistCatalogItem[] {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  for (const depot of depots) {
    let item = byId.get(depot.assistId);
    if (!item) {
      item = {
        id: depot.assistId,
        code: depot.code,
        name: depot.assistId,
        type: depot.type,
      };
      byId.set(depot.assistId, item);
    }
    const currentIsDefault = item.depotId === DEFAULT_ASSIST_DEPOT_ID;
    const depotHasStock = typeof depot.stock === "number" && depot.stock > 0;
    const currentHasStock = typeof item.stock === "number" && item.stock > 0;
    if (!item.depotId || currentIsDefault || (!currentHasStock && depotHasStock)) {
      item.depotId = depot.depotId;
      if (depot.stock !== undefined) item.stock = depot.stock;
    }
  }
  return [...byId.values()];
}

export async function fetchAssistCatalog(
  params: FetchAssistCatalogParams,
): Promise<AssistCatalogItem[]> {
  const token = params.token.trim();
  if (!token) throw new Error("Token Assist kosong.");
  if (!params.hospitalId.trim()) throw new Error("hospitalId Assist kosong.");

  const [medicines, akhps, depots] = await Promise.all([
    fetchCatalogPath(params, "KMedicineStocks/getItemsWithExpiredDate", "prescription", "medName"),
    fetchCatalogPath(params, "KAKHPStocks/getList", "akhp", "itemName"),
    fetchAssistDepotRecords(params),
  ]);
  return mergeCatalogAndDepots([...medicines, ...akhps], depots);
}

export function buildAssistStockIndex(
  catalog: AssistCatalogItem[],
): Record<string, number | undefined> {
  return Object.fromEntries(
    catalog.map((item) => [item.id, item.stock]),
  );
}

export function buildAssistDepotIndex(
  catalog: AssistCatalogItem[],
): Record<string, string | undefined> {
  return Object.fromEntries(
    catalog.map((item) => [item.id, item.depotId]),
  );
}
