// Desty Omni OpenAPI base URL
const DESTY_API_BASE = "https://omni.desty.app";

export interface DestyStockBreakdown {
  fisik: number | null;
  tersedia: number | null;
  pesanan: number | null;
}

export interface DestyOmniStockItem {
  sku: string;
  skuId?: string;
  warehouseId?: string;
  stock: number | null;
  breakdown: DestyStockBreakdown;
  fisik?: number | null;
  tersedia?: number | null;
  pesanan?: number | null;
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

export interface EditDestyOnHandParams {
  token: string;
  tenantId?: string;
  skuId: string;
  warehouseId?: string;
  amount: number;
  editType?: "Set" | "Add";
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

export function buildDestyStockDetailBySku(
  items: DestyOmniStockItem[],
): Record<string, DestyStockBreakdown> {
  const output: Record<string, DestyStockBreakdown> = {};
  for (const item of items) {
    const sku = item.sku.trim();
    if (!sku) continue;
    output[sku] = item.breakdown;
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
  targetWarehouseId?: string,
): DestyOmniStockItem | null {
  const sku = String(record.masterSku ?? "").trim();
  if (!sku) {
    return null;
  }

  const skuId = record.skuId !== undefined && record.skuId !== null
    ? String(record.skuId)
    : (record.id !== undefined && record.id !== null ? String(record.id) : undefined);

  let specificWh: Record<string, unknown> | undefined;
  if (targetWarehouseId && Array.isArray(record.warehouseStocks)) {
    specificWh = (record.warehouseStocks as Array<Record<string, unknown>>).find(
      (ws) => String(ws.warehouseId || "") === targetWarehouseId,
    );
  }

  const available = specificWh?.available !== undefined && specificWh.available !== null
    ? Number(specificWh.available)
    : (record.available !== undefined ? toNullableNumber(record.available) : null);

  const onHand = specificWh?.onHand !== undefined && specificWh.onHand !== null
    ? Number(specificWh.onHand)
    : (record.onHand !== undefined ? toNullableNumber(record.onHand) : null);

  const reserved = specificWh?.reserved !== undefined && specificWh.reserved !== null
    ? Number(specificWh.reserved)
    : (record.reserved !== undefined ? toNullableNumber(record.reserved) : null);

  const warehouseStocks = Array.isArray(record.warehouseStocks)
    ? sumWarehouseOnHand(
        record.warehouseStocks as Array<Record<string, unknown>>,
      )
    : null;

  let warehouseId = targetWarehouseId || (specificWh?.warehouseId ? String(specificWh.warehouseId) : undefined);
  if (!warehouseId) {
    warehouseId = record.warehouseId !== undefined && record.warehouseId !== null
      ? String(record.warehouseId)
      : undefined;
  }
  if (!warehouseId && Array.isArray(record.warehouseStocks) && record.warehouseStocks.length > 0) {
    const firstWh = record.warehouseStocks[0] as Record<string, unknown>;
    warehouseId = String(firstWh?.warehouseId || "");
  }

  const stock = available ?? onHand ?? warehouseStocks;
  const fisik = onHand ?? warehouseStocks;

  return {
    sku,
    skuId,
    warehouseId: warehouseId ? String(warehouseId) : "2042620805094077644",
    stock,
    breakdown: {
      fisik,
      tersedia: available,
      pesanan: reserved,
    },
    fisik,
    tersedia: available,
    pesanan: reserved,
    productName: String(record.productName ?? "").trim() || undefined,
    raw: record,
  };
}

function adaptOmniInventoryListResponse(payload: unknown, targetWarehouseId?: string): {
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
      return mapOmniInventoryRecord(record as Record<string, unknown>, targetWarehouseId);
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
  return adaptOmniInventoryListResponse(payload, params.masterWarehouseId);
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
      results.push(
        found ?? {
          sku: normalizedSku,
          stock: null,
          breakdown: {
            fisik: null,
            tersedia: null,
            pesanan: null,
          },
          fisik: null,
          tersedia: null,
          pesanan: null,
        },
      );
    } catch {
      // Non-fatal: record null stock for this SKU
      results.push({
        sku: normalizedSku,
        stock: null,
        breakdown: {
          fisik: null,
          tersedia: null,
          pesanan: null,
        },
        fisik: null,
        tersedia: null,
        pesanan: null,
      });
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

/** Update / edit on-hand (physical) stock in Desty Omni */
export async function editDestyOnHand(
  params: EditDestyOnHandParams,
): Promise<any> {
  const token = params.token.trim();
  if (!token) {
    throw new Error("Token Desty kosong. Tidak dapat mengubah stok Desty.");
  }
  if (!params.skuId) {
    throw new Error("skuId Desty diperlukan untuk mengubah stok.");
  }
  if (params.amount === undefined || params.amount === null || Number.isNaN(Number(params.amount))) {
    throw new Error("Jumlah (amount) stok tidak valid.");
  }

  const url = `${DESTY_API_BASE}/api/inventory-center/master-sku/on-hand/edit`;
  const body = {
    amount: params.amount,
    editType: params.editType || "Add",
    skuId: params.skuId,
    warehouseId: params.warehouseId || "2042620805094077644",
  };

  const headers = {
    ...buildDestyHeaders(token, params.tenantId),
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengubah stok fisik Desty (${response.status})`);
  }

  const payload = (await response.json()) as any;
  if (payload?.code !== 0 || payload?.success === false) {
    const errorMsg = payload?.msg || payload?.engMsg || "Gagal mengubah stok fisik di Desty";
    throw new Error(errorMsg);
  }

  const data = payload?.data;
  if (data && data.errorCount > 0 && Array.isArray(data.errorMessages) && data.errorMessages.length > 0) {
    throw new Error(data.errorMessages.join(", "));
  }

  return data;
}
