import { describe, it, expect } from "vitest";
import { DEFAULT_DESTY_MASTER_WAREHOUSE_ID } from "@/config/destyConfig";

describe("Desty Stock Warehouse Mapping Logic", () => {
  it("verifies DEFAULT_DESTY_MASTER_WAREHOUSE_ID is Apotek Aldila", () => {
    expect(DEFAULT_DESTY_MASTER_WAREHOUSE_ID).toBe("2025866980121741952");
  });
});
