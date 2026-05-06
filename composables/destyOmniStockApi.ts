// Desty Omni OpenAPI base URL
const DESTY_API_BASE = "https://omni.desty.app";

export interface DestyOmniStockItem {
  sku: string;
  stock: number | null;
  productName?: string;
  raw?: unknown;
}

export interface FetchDestyOmniStockParams {
  token: string;
  tenantId?: string;
  masterWarehouseId?: string;
  /** Optional SKU filter — if provided, uses per-SKU detail endpoint */
  skus?: string[];
  /** Ignored; kept for backward compat. Base URL is always DESTY_API_BASE */
  endpoint?: string;
}

export function buildDestyStockBySku(
  items: DestyOmniStockItem[],
): Record<string, number | null> {
  const output: Record<string, number | null> = {};
  for (const item of items) {
    const sku = item.sku.trim();
    if (!sku) continue;
    output[sku] = item.stock;
  }
  return output;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function sumWarehouseOnHand(
  warehouseStocks: Array<Record<string, unknown>>,
): number | null {
  if (!Array.isArray(warehouseStocks) || warehouseStocks.length === 0) {
    return null;
  }

  let total = 0;
  let hasValue = false;
  for (const entry of warehouseStocks) {
    const qty = toNullableNumber(entry.onHand);
    if (qty !== null) {
      total += qty;
      hasValue = true;
    }
  }

  return hasValue ? total : null;
}

function mapOmniInventoryRecord(
  record: Record<string, unknown>,
): DestyOmniStockItem | null {
  const sku = String(record.masterSku ?? "").trim();
  if (!sku) {
    return null;
  }

  const available = toNullableNumber(record.available);
  const onHand = toNullableNumber(record.onHand);
  const warehouseStocks = Array.isArray(record.warehouseStocks)
    ? sumWarehouseOnHand(
        record.warehouseStocks as Array<Record<string, unknown>>,
      )
    : null;

  const stock = available ?? onHand ?? warehouseStocks;

  return {
    sku,
    stock,
    productName: String(record.productName ?? "").trim() || undefined,
    raw: record,
  };
}

function adaptOmniInventoryListResponse(payload: unknown): {
  items: DestyOmniStockItem[];
  pages: number;
} {
  if (!payload || typeof payload !== "object") {
    return { items: [], pages: 0 };
  }

  const obj = payload as Record<string, unknown>;
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") {
    return { items: [], pages: 0 };
  }

  const records = data.records;
  const pages = Number(data.pages ?? 0);
  if (!Array.isArray(records)) {
    return {
      items: [],
      pages: Number.isFinite(pages) && pages > 0 ? pages : 0,
    };
  }

  const items = records
    .map((record) => {
      if (!record || typeof record !== "object") {
        return null;
      }
      return mapOmniInventoryRecord(record as Record<string, unknown>);
    })
    .filter((item): item is DestyOmniStockItem => item !== null);

  return {
    items,
    pages: Number.isFinite(pages) && pages > 0 ? pages : 0,
  };
}

function authHeader(token: string): string {
  return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
}

function buildDestyHeaders(token: string, tenantId?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    Authorization: authHeader(token),
    Locale: "idn",
    "Accept-Language": "idn;q=0.9",
  };

  const normalizedTenantId = String(tenantId ?? "").trim();
  if (normalizedTenantId) {
    headers.tenantid = normalizedTenantId;
  }

  return headers;
}

function buildInventoryListUrl(params: {
  current: number;
  size: number;
  masterWarehouseId?: string;
  param?: string;
}): string {
  const url = new URL(`${DESTY_API_BASE}/api/inventory-center/master-sku/list`);
  url.searchParams.set("t", String(Date.now()));
  url.searchParams.set("current", String(params.current));
  url.searchParams.set("size", String(params.size));
  url.searchParams.set("querySort", "");
  url.searchParams.set("tag", "");
  url.searchParams.set("param", params.param ?? "");

  const masterWarehouseId = String(params.masterWarehouseId ?? "").trim();
  if (masterWarehouseId) {
    url.searchParams.set("masterWarehouseId", masterWarehouseId);
  }

  return url.toString();
}

async function fetchInventoryPage(params: {
  token: string;
  tenantId?: string;
  masterWarehouseId?: string;
  current: number;
  size: number;
  param?: string;
}): Promise<{ items: DestyOmniStockItem[]; pages: number }> {
  const response = await fetch(
    buildInventoryListUrl({
      current: params.current,
      size: params.size,
      masterWarehouseId: params.masterWarehouseId,
      param: params.param,
    }),
    {
      method: "GET",
      credentials: "include",
      headers: {
        ...buildDestyHeaders(params.token, params.tenantId),
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Gagal mengambil inventory Omni (halaman ${params.current}): ${response.status}`,
    );
  }

  const payload = (await response.json()) as unknown;
  return adaptOmniInventoryListResponse(payload);
}

/** Fetch all product stock via paginated GET /api/inventory-center/master-sku/list */
async function fetchAllProductStock(
  token: string,
  masterWarehouseId?: string,
  tenantId?: string,
): Promise<DestyOmniStockItem[]> {
  const allItems: DestyOmniStockItem[] = [];
  let current = 1;
  const size = 50;

  while (true) {
    const page = await fetchInventoryPage({
      token,
      tenantId,
      masterWarehouseId,
      current,
      size,
    });

    allItems.push(...page.items);

    if (page.items.length === 0 || page.pages === 0 || current >= page.pages) {
      break;
    }
    current += 1;
  }

  return allItems;
}

/** Fetch stock for specific SKUs via GET /api/inventory-center/master-sku/list with param search */
async function fetchStockBySkus(
  token: string,
  skus: string[],
  masterWarehouseId?: string,
  tenantId?: string,
): Promise<DestyOmniStockItem[]> {
  const results: DestyOmniStockItem[] = [];
  for (const sku of skus) {
    const normalizedSku = sku.trim();
    if (!normalizedSku) {
      continue;
    }

    try {
      const page = await fetchInventoryPage({
        token,
        tenantId,
        masterWarehouseId,
        current: 1,
        size: 50,
        param: normalizedSku,
      });

      const found = page.items.find(
        (item) => item.sku.toLowerCase() === normalizedSku.toLowerCase(),
      );
      results.push(found ?? { sku: normalizedSku, stock: null });
    } catch {
      // Non-fatal: record null stock for this SKU
      results.push({ sku: normalizedSku, stock: null });
    }
  }

  return results;
}

export async function fetchDestyOmniStock(
  params: FetchDestyOmniStockParams,
): Promise<DestyOmniStockItem[]> {
  const token = params.token.trim();
  const tenantId = params.tenantId?.trim();
  const masterWarehouseId = params.masterWarehouseId?.trim();
  if (!token) {
    throw new Error("Token Desty kosong. Tidak dapat mengambil stok Desty.");
  }

  if (params.skus?.length) {
    return fetchStockBySkus(token, params.skus, masterWarehouseId, tenantId);
  }

  return fetchAllProductStock(token, masterWarehouseId, tenantId);
}
