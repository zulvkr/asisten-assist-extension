import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistHttpClient, AssistApiError } from "@/services/clients/assistHttpClient";
import { decryptWrappedPayload } from "@/utils/cryptoUtils";

beforeEach(() => {
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("browser", { storage: { local: { get: vi.fn(async () => ({})) } } });
});

describe("AssistHttpClient", () => {
  it("sends get request with Assist headers", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify([{ id: "item-1" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = new AssistHttpClient({
      token: "assist-jwt-token",
      baseUrl: "https://api-clinica.assist.id/api",
      fetchImpl,
    });

    const result = await client.get<Array<{ id: string }>>("/KMedicines");

    expect(fetchImpl).toHaveBeenCalledWith("https://api-clinica.assist.id/api/KMedicines", expect.anything());
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("assist-jwt-token");
    expect(result).toEqual([{ id: "item-1" }]);
  });

  it("encrypts body when using putEncrypted", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = String(init?.body);
      return new Response(JSON.stringify({ data: { id: "tx-123" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = new AssistHttpClient({
      token: "assist-jwt-token",
      baseUrl: "https://api-clinica.assist.id/api",
      fetchImpl,
    });

    const result = await client.putEncrypted<{ data: { id: string } }>("/KTxes/payment", {
      testField: "secretValue",
    });

    expect(result.data.id).toBe("tx-123");
    const wrapped = JSON.parse(capturedBody);
    const decrypted = JSON.parse(await decryptWrappedPayload(wrapped));
    expect(decrypted.testField).toBe("secretValue");
  });

  it("throws AssistApiError on HTTP error status", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("Internal Server Error", { status: 500 }),
    );

    const client = new AssistHttpClient({
      token: "assist-jwt-token",
      baseUrl: "https://api-clinica.assist.id/api",
      fetchImpl,
    });

    await expect(client.get("/faulty")).rejects.toThrow(AssistApiError);
  });
});
