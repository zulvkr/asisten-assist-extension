import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptPayload,
  decryptWrappedPayload,
  encryptPayload,
  wrapEncryptedPayload,
} from "@/utils/cryptoUtils";

beforeEach(() => {
  vi.stubGlobal("browser", {
    storage: { local: { get: vi.fn(async () => ({})) } },
  });
  vi.stubGlobal("window", globalThis);
});

describe("cryptoUtils", () => {
  it("round-trips AES-CBC payload and wrapped payload", async () => {
    const plaintext = JSON.stringify({ isOutcome: false, item: [{ quantity: 1 }] });
    const encrypted = await encryptPayload(plaintext);
    expect(await decryptPayload(encrypted)).toBe(plaintext);
    expect(await decryptWrappedPayload(wrapEncryptedPayload(encrypted))).toBe(plaintext);
  });
});
