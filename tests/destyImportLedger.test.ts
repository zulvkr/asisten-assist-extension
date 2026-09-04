import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDestyImportLedger,
  reconcileDestyImportLedger,
  recordDestyImport,
} from "@/services/destySync/importLedgerStorage";

let storage: Record<string, unknown> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal("browser", {
    storage: { local: {
      get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
      set: vi.fn(async (value: Record<string, unknown>) => Object.assign(storage, value)),
    } },
  });
});

describe("Desty import ledger reconciliation", () => {
  it("marks a stale local success as voided when Assist no longer returns it", async () => {
    await recordDestyImport({ marketplaceOrderSn: "ORDER-VOID", status: "success" });
    await reconcileDestyImportLedger([], ["ORDER-VOID"]);
    expect((await getDestyImportLedger())[0].status).toBe("voided");
  });

  it("keeps an active server transaction as success", async () => {
    await recordDestyImport({ marketplaceOrderSn: "ORDER-ACTIVE", status: "success" });
    await reconcileDestyImportLedger(["ORDER-ACTIVE"], ["ORDER-ACTIVE"]);
    expect((await getDestyImportLedger())[0].status).toBe("success");
  });
});
