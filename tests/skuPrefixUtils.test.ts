import { describe, it, expect } from "vitest";
import { parseExcludedPrefixes, isSkuPrefixExcluded } from "@/utils/skuPrefixUtils";

describe("skuPrefixUtils", () => {
  describe("parseExcludedPrefixes", () => {
    it("handles null, undefined, or empty string", () => {
      expect(parseExcludedPrefixes(null)).toEqual([]);
      expect(parseExcludedPrefixes(undefined)).toEqual([]);
      expect(parseExcludedPrefixes("")).toEqual([]);
      expect(parseExcludedPrefixes("   ")).toEqual([]);
    });

    it("parses single prefix", () => {
      expect(parseExcludedPrefixes("ISA-")).toEqual(["ISA-"]);
      expect(parseExcludedPrefixes(" ISA-  ")).toEqual(["ISA-"]);
    });

    it("parses multiple comma-separated prefixes, trimming and filtering empty entries", () => {
      expect(parseExcludedPrefixes("ISA-, TEST-, , ABC ")).toEqual(["ISA-", "TEST-", "ABC"]);
      expect(parseExcludedPrefixes("ISA-,,,").length).toBe(1);
    });
  });

  describe("isSkuPrefixExcluded", () => {
    it("returns false for invalid inputs", () => {
      expect(isSkuPrefixExcluded("", ["ISA-"])).toBe(false);
      expect(isSkuPrefixExcluded(null, ["ISA-"])).toBe(false);
      expect(isSkuPrefixExcluded(undefined, ["ISA-"])).toBe(false);
      expect(isSkuPrefixExcluded("ISA-001", [])).toBe(false);
      expect(isSkuPrefixExcluded("ISA-001", null)).toBe(false);
      expect(isSkuPrefixExcluded("ISA-001", undefined)).toBe(false);
    });

    it("matches prefix case-insensitively", () => {
      expect(isSkuPrefixExcluded("ISA-001", ["ISA-"])).toBe(true);
      expect(isSkuPrefixExcluded("isa-001", ["ISA-"])).toBe(true);
      expect(isSkuPrefixExcluded("ISA-PARACETAMOL", ["isa-"])).toBe(true);
      expect(isSkuPrefixExcluded("isa-paracetamol", ["ISA-"])).toBe(true);
    });

    it("returns false when SKU does not match prefix", () => {
      expect(isSkuPrefixExcluded("MED-001", ["ISA-"])).toBe(false);
      expect(isSkuPrefixExcluded("NON-ISA-001", ["ISA-"])).toBe(false);
      expect(isSkuPrefixExcluded("AMOXICILLIN", ["ISA-", "TEST-"])).toBe(false);
    });

    it("matches any prefix in the list", () => {
      const prefixes = ["ISA-", "TEST-", "TMP-"];
      expect(isSkuPrefixExcluded("TEST-123", prefixes)).toBe(true);
      expect(isSkuPrefixExcluded("TMP-999", prefixes)).toBe(true);
      expect(isSkuPrefixExcluded("OTHER-123", prefixes)).toBe(false);
    });
  });
});
