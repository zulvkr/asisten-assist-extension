const DESTY_API_BASE = "https://omni.desty.app";

export interface DestyOrderItem {
  productName: string;
  quantity: number;
  skuCode?: string;
  masterSku?: string;
}

export interface DestyOrderRecord {
  id?: string;
  orderId?: string;
  displayedOrderSn: string;
  platformName: string;
  totalPrice: number;
  totalSales?: number;
  orderCreateTime: number;
  deliveryDeadline: number;
  shipmentNo?: string;
  bookingSn?: string;
  orderSn?: string;
  courier?: string;
  externalShopName?: string;
  status?: string;
  orderProcessTime?: number;
  packageTime?: number;
  cancelTime?: number;
  labelPrinted?: boolean;
  cancelBy?: string;
  cancelReason?: string;
  logisticsStatus?: string;
  requestCancelStatus?: number;
  packageStatusHistory?: Array<{
    status: string;
    statusUpdateTime: number;
  }>;
  items: DestyOrderItem[];
}

export interface DestyOrderDetailResult {
  raw: any;
  orderId: string;
  displayedOrderSn: string;
  cancelReason?: string;
  cancelBy?: string;
  logisticsStatus?: string;
  requestCancelStatus?: number;
  labelPrinted?: boolean;
  processedTime?: number;
  packageStatusHistory?: Array<{
    status: string;
    statusUpdateTime: number;
  }>;
  totalSales?: number;
  shipmentNo?: string;
  bookingSn?: string;
  courier?: string;
}

export async function fetchDestyOrderDetail(params: {
  token: string;
  tenantId?: string;
  orderId: string;
}): Promise<DestyOrderDetailResult> {
  const url = `${DESTY_API_BASE}/api/order-center/order/detail?id=${params.orderId}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: buildDestyHeaders(params.token, params.tenantId),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil detail pesanan Desty (${params.orderId}): ${response.status}`);
  }

  const payload = (await response.json()) as any;
  if (!payload || payload.code !== 0) {
    throw new Error(
      payload?.engMsg ?? payload?.msg ?? `Gagal mengambil detail pesanan Desty (${params.orderId})`
    );
  }

  const data = payload.data || {};
  const firstPkg = Array.isArray(data.packages) && data.packages.length > 0 ? data.packages[0] : {};

  // Find when order was marked "Processed" in package status history
  const history: Array<{ status: string; statusUpdateTime: number }> =
    firstPkg.packageStatusHistory || data.packageStatusHistory || [];

  const processedEntry = history.find((h) => h.status === "Processed");
  const processedTime = processedEntry ? processedEntry.statusUpdateTime : undefined;

  return {
    raw: data,
    orderId: String(data.id || params.orderId),
    displayedOrderSn: String(data.displayedOrderSn || firstPkg.displayedOrderSn || ""),
    cancelReason: firstPkg.cancelReason || data.cancelReason,
    cancelBy: firstPkg.cancelBy || data.cancelBy,
    logisticsStatus: firstPkg.logisticsStatus || data.logisticsStatus,
    requestCancelStatus: firstPkg.requestCancelStatus ?? data.requestCancelStatus,
    labelPrinted: firstPkg.labelPrinted ?? data.labelPrinted,
    processedTime,
    packageStatusHistory: history,
    totalSales: typeof data.totalSales === "number" ? data.totalSales : undefined,
    shipmentNo: firstPkg.shipmentNo || data.shipmentNo,
    bookingSn: firstPkg.bookingSn || data.bookingSn,
    courier: firstPkg.courier || data.courier,
  };
}


export interface FetchDestyOrdersParams {
  token: string;
  tenantId?: string;
  status: string;
  current: number;
  size: number;
  signal?: AbortSignal;
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
    signal: params.signal,
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
  onProgress?: (fetched: number, total: number, phase: "list" | "detail") => void;
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
      params.onProgress(allRecords.length, page.total, "list");
    }

    if (page.records.length === 0 || page.pages === 0 || current >= page.pages) {
      break;
    }
    current += 1;
  }

  // Fetch details in batches of 5 to populate totalSales
  const batchSize = 5;
  let detailProgressCount = 0;
  if (params.onProgress && allRecords.length > 0) {
    params.onProgress(0, allRecords.length, "detail");
  }

  for (let i = 0; i < allRecords.length; i += batchSize) {
    const batch = allRecords.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (record) => {
        const orderId = record.orderId || record.id;
        if (orderId) {
          try {
            const detail = await fetchDestyOrderDetail({
              token: params.token,
              tenantId: params.tenantId,
              orderId,
            });
            if (detail) {
              if (typeof detail.totalSales === "number") {
                record.totalSales = detail.totalSales;
              }
              const detailOrderSn = String(
                detail.displayedOrderSn ?? detail.orderSn ?? detail.platformOrderSn ?? detail.orderNumber ?? ""
              ).trim();
              if (!record.displayedOrderSn && detailOrderSn) {
                record.displayedOrderSn = detailOrderSn;
              }
              const detailShipmentNo = String(
                detail.shipmentNo ?? detail.trackingNumber ?? detail.trackingNo ?? detail.logisticsNo ?? ""
              ).trim();
              if (!record.shipmentNo && detailShipmentNo) {
                record.shipmentNo = detailShipmentNo;
              }
              const detailBookingSn = String(
                detail.bookingSn ?? detail.bookingNumber ?? detail.bookingNo ?? ""
              ).trim();
              if (!record.bookingSn && detailBookingSn) {
                record.bookingSn = detailBookingSn;
              }
              if (!record.courier && (detail.courier || detail.logisticsChannel || detail.shippingCarrier)) {
                record.courier = String(detail.courier || detail.logisticsChannel || detail.shippingCarrier).trim();
              }
              const rawProcessTime = detail.packageTime ?? detail.packTime ?? detail.processTime ?? detail.printTime;
              if (typeof rawProcessTime === "number" && rawProcessTime > 0) {
                record.orderProcessTime = rawProcessTime;
                record.packageTime = rawProcessTime;
              }
              if (typeof detail.cancelTime === "number" && detail.cancelTime > 0) {
                record.cancelTime = detail.cancelTime;
              }
              if (!record.status && (detail.status || detail.orderStatus || detail.packageStatus)) {
                record.status = String(detail.status || detail.orderStatus || detail.packageStatus);
              }
            }
          } catch (err) {
            console.warn(`Gagal mengambil detail untuk orderId ${orderId}:`, err);
          }
        }
        detailProgressCount += 1;
        if (params.onProgress) {
          params.onProgress(detailProgressCount, allRecords.length, "detail");
        }
      })
    );
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
    signal: params.signal,
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

/**
 * Fast paginated fetching for Cancelled and Return orders directly from /api/order-center/package/list.
 * Does not do eager per-record detail requests, returning all orders and items in seconds.
 */
export async function fetchDestyCancelledOrdersFast(params: {
  token: string;
  tenantId?: string;
  status?: "Cancellations" | "Returns" | "ALL";
  maxPages?: number;
  signal?: AbortSignal;
  onProgress?: (
    fetched: number,
    total: number,
    status: string,
    currentPage?: number,
    totalPages?: number,
  ) => void;
}): Promise<DestyOrderRecord[]> {
  const statuses =
    params.status === "Returns"
      ? ["Returns"]
      : params.status === "Cancellations"
        ? ["Cancellations"]
        : ["Cancellations", "Returns"];

  const allRecords: DestyOrderRecord[] = [];
  const maxPages = params.maxPages || 20;

  for (const st of statuses) {
    let current = 1;
    while (current <= maxPages) {
      if (params.signal?.aborted) {
        throw new DOMException(
          "Operasi penarikan dibatalkan oleh pengguna.",
          "AbortError",
        );
      }

      const page = await fetchDestyOrdersPage({
        token: params.token,
        tenantId: params.tenantId,
        status: st,
        current,
        size: 50,
        signal: params.signal,
      });

      if (page.records.length === 0) break;

      page.records.forEach((r) => {
        if (!r.status) r.status = st;
      });

      allRecords.push(...page.records);

      if (params.onProgress) {
        params.onProgress(
          allRecords.length,
          page.total,
          st,
          current,
          Math.min(page.pages || 1, maxPages),
        );
      }

      if (current >= page.pages) break;
      current += 1;
    }
  }

  return allRecords;
}


