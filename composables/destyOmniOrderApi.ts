const DESTY_API_BASE = "https://omni.desty.app";

export interface DestyOrderItem {
  productName: string;
  quantity: number;
  skuCode?: string;
  masterSku?: string;
}

export interface DestyOrderRecord {
  displayedOrderSn: string;
  platformName: string;
  totalPrice: number;
  orderCreateTime: number;
  deliveryDeadline: number;
  shipmentNo?: string;
  courier?: string;
  externalShopName?: string;
  items: DestyOrderItem[];
}

export interface FetchDestyOrdersParams {
  token: string;
  tenantId?: string;
  status: string;
  current: number;
  size: number;
}

export interface FetchDestyOrdersResponse {
  records: DestyOrderRecord[];
  pages: number;
  total: number;
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
    "Content-Type": "application/json",
    ispending: "true",
  };

  const normalizedTenantId = String(tenantId ?? "").trim();
  if (normalizedTenantId) {
    headers.tenantid = normalizedTenantId;
  }

  return headers;
}

export async function fetchDestyOrdersPage(
  params: FetchDestyOrdersParams,
): Promise<FetchDestyOrdersResponse> {
  const url = `${DESTY_API_BASE}/api/order-center/package/list`;
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: buildDestyHeaders(params.token, params.tenantId),
    body: JSON.stringify({
      current: params.current,
      size: params.size,
      status: params.status,
      t: Date.now(),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Gagal mengambil data pesanan Desty (halaman ${params.current}): ${response.status}`,
    );
  }

  const payload = (await response.json()) as any;
  if (!payload || typeof payload !== "object") {
    return { records: [], pages: 0, total: 0 };
  }

  const data = payload.data;
  if (!data || typeof data !== "object") {
    return { records: [], pages: 0, total: 0 };
  }

  const records = (data.records || []) as DestyOrderRecord[];
  const pages = Number(data.pages ?? 0);
  const total = Number(data.total ?? 0);

  return {
    records,
    pages: Number.isFinite(pages) && pages > 0 ? pages : 0,
    total: Number.isFinite(total) && total > 0 ? total : 0,
  };
}

export async function fetchAllDestyOrders(params: {
  token: string;
  tenantId?: string;
  status: string;
  onProgress?: (fetched: number, total: number) => void;
}): Promise<DestyOrderRecord[]> {
  const allRecords: DestyOrderRecord[] = [];
  let current = 1;
  const size = 50;

  while (true) {
    const page = await fetchDestyOrdersPage({
      token: params.token,
      tenantId: params.tenantId,
      status: params.status,
      current,
      size,
    });

    allRecords.push(...page.records);

    if (params.onProgress) {
      params.onProgress(allRecords.length, page.total);
    }

    if (page.records.length === 0 || page.pages === 0 || current >= page.pages) {
      break;
    }
    current += 1;
  }

  return allRecords;
}

export async function fetchDestyOrderStatusCount(params: {
  token: string;
  tenantId?: string;
  status: string;
}): Promise<Record<string, string>> {
  const url = `${DESTY_API_BASE}/api/order-center/package/status/count`;
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: buildDestyHeaders(params.token, params.tenantId),
    body: JSON.stringify({
      current: 1,
      size: 50,
      status: params.status,
      t: Date.now(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil data status count Desty: ${response.status}`);
  }

  const payload = (await response.json()) as any;
  if (!payload || !payload.success) {
    throw new Error(payload?.engMsg ?? payload?.msg ?? "Gagal mengambil data status count Desty");
  }

  return payload.data || {};
}

