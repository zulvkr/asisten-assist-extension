import { describe, it, expect } from "vitest";
import {
  DEFAULT_DESTY_MASTER_WAREHOUSE_ID,
  DESTY_MASTER_WAREHOUSES,
} from "@/config/destyConfig";

describe("Desty Warehouse Configuration", () => {
  it("defaults to Apotek Aldila with ID 2025866980121741952", () => {
    expect(DEFAULT_DESTY_MASTER_WAREHOUSE_ID).toBe("2025866980121741952");
  });

  it("contains Apotek Aldila marked as default main warehouse", () => {
    const aldila = DESTY_MASTER_WAREHOUSES.find(
      (wh) => wh.id === "2025866980121741952",
    );
    expect(aldila).toBeDefined();
    expect(aldila?.name).toBe("Apotek Aldila");
    expect(aldila?.isDefault).toBe(true);
    expect(aldila?.tag).toBe("Main");
  });

  it("contains Apotek Isa Pd Betung marked as non-default warehouse", () => {
    const isa = DESTY_MASTER_WAREHOUSES.find(
      (wh) => wh.id === "2042620805094077644",
    );
    expect(isa).toBeDefined();
    expect(isa?.name).toBe("Apotek Isa Pd Betung");
    expect(isa?.isDefault).toBe(false);
  });
});
