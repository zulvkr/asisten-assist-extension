import { buildAssistHeaders } from "@/services/integration/assistRequest";
import { encryptPayload, wrapEncryptedPayload } from "@/utils/cryptoUtils";

export interface AssistClientOptions {
  token: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class AssistApiError extends Error {
  readonly status?: number;
  readonly payload?: unknown;

  constructor(message: string, status?: number, payload?: unknown) {
    super(message);
    this.name = "AssistApiError";
    this.status = status;
    this.payload = payload;
  }
}

export class AssistHttpClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AssistClientOptions) {
    this.token = options.token.trim();
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private resolveUrl(path: string): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  async get<T = unknown>(path: string): Promise<T> {
    const url = this.resolveUrl(path);
    const response = await this.fetchImpl(url, {
      method: "GET",
      credentials: "include",
      headers: buildAssistHeaders(this.token),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new AssistApiError(
        `Assist GET '${path}' gagal: HTTP ${response.status} ${errorText}`.trim(),
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = this.resolveUrl(path);
    const response = await this.fetchImpl(url, {
      method: "POST",
      credentials: "include",
      headers: {
        ...buildAssistHeaders(this.token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new AssistApiError(
        `Assist POST '${path}' gagal: HTTP ${response.status} ${errorText}`.trim(),
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = this.resolveUrl(path);
    const response = await this.fetchImpl(url, {
      method: "PUT",
      credentials: "include",
      headers: {
        ...buildAssistHeaders(this.token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new AssistApiError(
        `Assist PUT '${path}' gagal: HTTP ${response.status} ${errorText}`.trim(),
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  /** Encrypts the payload with AES-CBC before sending via PUT (used by /KTxes/payment). */
  async putEncrypted<T = unknown>(path: string, rawPayload: unknown): Promise<T> {
    const plaintext = JSON.stringify(rawPayload);
    const encrypted = await encryptPayload(plaintext);
    const wrapped = wrapEncryptedPayload(encrypted);
    return this.put<T>(path, wrapped);
  }
}
