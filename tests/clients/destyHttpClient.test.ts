import { describe, expect, it, vi } from "vitest";
import { DestyHttpClient, DestyApiError } from "@/services/clients/destyHttpClient";

describe("DestyHttpClient", () => {
  it("formats headers and parses success responses", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ code: 0, data: { status: "OK" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = new DestyHttpClient({
      token: "desty-secret-token",
      tenantId: "tenant-99",
      fetchImpl,
    });

    const result = await client.post<{ data: { status: string } }>("/api/test-path", { key: "val" });

    expect(fetchImpl).toHaveBeenCalledWith("https://omni.desty.app/api/test-path", expect.anything());
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer desty-secret-token");
    expect(headers.tenantid).toBe("tenant-99");
    expect(result.data.status).toBe("OK");
  });

  it("throws DestyApiError when code is not 0", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 10002, engMsg: "Token expired" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = new DestyHttpClient({
      token: "expired-token",
      fetchImpl,
    });

    await expect(client.get("/api/test")).rejects.toThrow(DestyApiError);
  });
});
