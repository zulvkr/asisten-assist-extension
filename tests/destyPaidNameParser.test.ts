import { describe, expect, it } from "vitest";
import { parseDestyPaidName } from "@/utils/destyPaidNameParser";

describe("parseDestyPaidName", () => {
  it("parses marketplace metadata", () => {
    expect(parseDestyPaidName("DESTY|platform=Shopee|order=ORDER-1|booking=BOOK-1|resi=RESI-1")).toEqual({
      platform: "Shopee", order: "ORDER-1", booking: "BOOK-1", resi: "RESI-1",
    });
  });

  it("rejects unrelated paidName values", () => {
    expect(parseDestyPaidName("Cashier|order=ORDER-1")).toBeNull();
  });
});
