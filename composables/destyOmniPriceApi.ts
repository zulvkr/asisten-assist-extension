import type {
  DestyPriceRecord,
  FetchDestyPriceListOptions,
  FetchDestyPriceListResult,
  UpdateDestyMasterPriceParams,
  UpdateDestyMasterPriceResult,
} from "@/types/destyPriceUpdate";

const DESTY_API_BASE = "https://omni.desty.app";
const DESTY_REQUEST_TIMEOUT_MS = 30_000;
const DESTY_MAX_ATTEMPTS = 3;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
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
  };
  const normalizedTenantId = String(tenantId ?? "").trim();
  if (normalizedTenantId) {
    headers.tenantid = normalizedTenantId;
  }
  return headers;
}

async function fetchDestyWithRetry(
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DESTY_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DESTY_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < DESTY_MAX_ATTEMPTS) {
      const delayMs = 1_000 * (2 ** (attempt - 1));
      console.warn(`[DestyPriceApi] ${operation} failed (attempt ${attempt}/${DESTY_MAX_ATTEMPTS}); retrying in ${delayMs}ms.`, lastError);
      await wait(delayMs);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${operation} gagal setelah ${DESTY_MAX_ATTEMPTS} percobaan: ${reason}`);
}

export async function fetchDestyPricePage(params: {
  token: string;
  tenantId?: string;
  searchParam?: string;
  current: number;
  size: number;
}): Promise<{
  records: DestyPriceRecord[];
  pages: number;
  total: number;
  current: number;
  size: number;
}> {
  const url = new URL(`${DESTY_API_BASE}/api/omni/price/manage/list`);
  url.searchParams.set("sort", "");
  url.searchParams.set("searchParam", params.searchParam || "");
  url.searchParams.set("current", String(params.current));
  url.searchParams.set("size", String(params.size));

  const headers = buildDestyHeaders(params.token, params.tenantId);

  const response = await fetchDestyWithRetry(
    url.toString(),
    {
      method: "GET",
      headers,
    },
    `Pengambilan daftar harga Desty (halaman ${params.current})`,
  );

  if (!response.ok) {
    throw new Error(`Gagal mengambil data harga Desty (${response.status})`);
  }

  const payload = (await response.json()) as any;
  const data = payload?.data ?? {};
  return {
    records: (data.records || []) as DestyPriceRecord[],
    pages: Number(data.pages ?? 0),
    total: Number(data.total ?? 0),
    current: Number(data.current ?? params.current),
    size: Number(data.size ?? params.size),
  };
}

export async function fetchDestyPriceList(
  options: FetchDestyPriceListOptions,
): Promise<FetchDestyPriceListResult> {
  const token = options.token.trim();
  if (!token) {
    throw new Error("Token Desty tidak tersedia. Silakan hubungkan ekstensi terlebih dahulu.");
  }

  if (options.fetchAll) {
    const allRecords: DestyPriceRecord[] = [];
    let pageNum = 1;
    let totalPages = 1;
    let totalCount = 0;
    const pageSize = options.size || 50;

    while (true) {
      const res = await fetchDestyPricePage({
        token,
        tenantId: options.tenantId,
        searchParam: options.searchParam,
        current: pageNum,
        size: pageSize,
      });

      allRecords.push(...res.records);
      totalPages = res.pages;
      totalCount = res.total;

      if (res.records.length === 0 || pageNum >= res.pages) {
        break;
      }
      pageNum += 1;
      // Pacing between page requests to avoid rate limit
      await wait(250);
    }

    return { records: allRecords, pages: totalPages, total: totalCount };
  }

  const res = await fetchDestyPricePage({
    token,
    tenantId: options.tenantId,
    searchParam: options.searchParam,
    current: options.current || 1,
    size: options.size || 50,
  });

  return {
    records: res.records,
    pages: res.pages,
    total: res.total,
  };
}

export async function updateDestyMasterPriceSingle(
  params: UpdateDestyMasterPriceParams,
): Promise<UpdateDestyMasterPriceResult> {
  const token = params.token.trim();
  if (!token) {
    throw new Error("Token Desty tidak tersedia. Silakan hubungkan ekstensi terlebih dahulu.");
  }
  if (!params.skuId) {
    throw new Error("skuId Desty diperlukan untuk mengubah harga.");
  }
  if (params.price === undefined || params.price === null || Number.isNaN(Number(params.price))) {
    throw new Error("Harga tidak valid.");
  }

  const url = `${DESTY_API_BASE}/api/omni/price/manage/master/single/update`;
  const body = {
    skuId: String(params.skuId),
    price: String(params.price),
  };

  const headers = buildDestyHeaders(token, params.tenantId);

  const response = await fetchDestyWithRetry(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    `Update harga master Desty (SKU ID ${params.skuId})`,
  );

  if (!response.ok) {
    throw new Error(`Gagal mengubah harga Desty (${response.status})`);
  }

  const payload = (await response.json()) as any;
  if (payload?.code !== 0 || payload?.success === false) {
    const errorMsg = payload?.msg || payload?.engMsg || "Gagal mengubah harga di Desty";
    throw new Error(errorMsg);
  }

  const data = payload?.data ?? {};
  if (data && data.errorCount > 0 && Array.isArray(data.errorMessages) && data.errorMessages.length > 0) {
    throw new Error(data.errorMessages.join(", "));
  }

  return {
    successCount: Number(data.successCount ?? 0),
    errorCount: Number(data.errorCount ?? 0),
    errorMessages: data.errorMessages || [],
  };
}

export async function updateDestyMasterPrice(
  params: UpdateDestyMasterPriceParams,
): Promise<UpdateDestyMasterPriceResult> {
  return updateDestyMasterPriceSingle(params);
}
