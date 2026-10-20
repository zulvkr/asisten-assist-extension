export interface DestyClientOptions {
  token: string;
  tenantId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class DestyApiError extends Error {
  readonly code?: number;
  readonly status?: number;
  readonly payload?: unknown;

  constructor(message: string, code?: number, status?: number, payload?: unknown) {
    super(message);
    this.name = "DestyApiError";
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

export class DestyHttpClient {
  private readonly token: string;
  private readonly tenantId?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DestyClientOptions) {
    this.token = options.token.trim();
    this.tenantId = options.tenantId?.trim();
    this.baseUrl = (options.baseUrl || "https://omni.desty.app").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private buildHeaders(): HeadersInit {
    const authHeader = this.token.toLowerCase().startsWith("bearer ")
      ? this.token
      : `Bearer ${this.token}`;

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      Authorization: authHeader,
      Locale: "idn",
      "Accept-Language": "idn;q=0.9",
      "Content-Type": "application/json",
      ispending: "true",
    };

    if (this.tenantId) {
      headers.tenantid = this.tenantId;
    }

    return headers;
  }

  async get<T = unknown>(path: string): Promise<T> {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;
    const response = await this.fetchImpl(url, {
      method: "GET",
      credentials: "include",
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new DestyApiError(
        `Desty GET '${path}' gagal: HTTP ${response.status} ${errorText}`.trim(),
        undefined,
        response.status,
      );
    }

    const payload = (await response.json()) as any;
    if (payload && typeof payload.code === "number" && payload.code !== 0) {
      throw new DestyApiError(
        payload.engMsg || payload.msg || `Desty API error code ${payload.code}`,
        payload.code,
        response.status,
        payload,
      );
    }

    return payload as T;
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      credentials: "include",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new DestyApiError(
        `Desty POST '${path}' gagal: HTTP ${response.status} ${errorText}`.trim(),
        undefined,
        response.status,
      );
    }

    const payload = (await response.json()) as any;
    if (payload && typeof payload.code === "number" && payload.code !== 0) {
      throw new DestyApiError(
        payload.engMsg || payload.msg || `Desty API error code ${payload.code}`,
        payload.code,
        response.status,
        payload,
      );
    }

    return payload as T;
  }

  /** Edit stock on hand (editType: 'Set' | 'Add') */
  async editOnHand(params: {
    skuId: string;
    warehouseId: string;
    amount: number;
    editType?: "Set" | "Add";
  }): Promise<unknown> {
    return this.post("/api/omni-item/warehouse-inventory/edit-on-hand", {
      skuId: params.skuId,
      warehouseId: params.warehouseId,
      amount: params.amount,
      editType: params.editType ?? "Add",
    });
  }

  /** Update master product price */
  async updateMasterPrice(params: {
    skuId: string;
    price: number;
  }): Promise<unknown> {
    return this.post("/api/omni-item/master-product/v1/update-price", {
      skuId: params.skuId,
      price: params.price,
    });
  }
}
