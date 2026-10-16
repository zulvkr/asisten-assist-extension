import { describe, expect, it } from "vitest";
import { extractOnlineOrderMetadata } from "@/utils/onlineOrderExtractor";
import type { PemasukanData } from "@/types/PemasukanData";

describe("extractOnlineOrderMetadata", () => {
  it("extracts structured metadata from DESTY paidName", () => {
    const tx = {
      _id: "tx-desty-1",
      code: "INV001",
      Payments: [
        {
          name: "Shopee",
          type: "Kartu Debit",
          paidName: "DESTY|platform=Shopee|order=241015SP123|booking=BOOK-999|resi=SPXID048123456",
        },
      ],
      OtherNotes: [],
    } as unknown as PemasukanData;

    const meta = extractOnlineOrderMetadata(tx);
    expect(meta.isOnline).toBe(true);
    expect(meta.platform).toBe("Shopee");
    expect(meta.orderNo).toBe("241015SP123");
    expect(meta.bookingNo).toBe("BOOK-999");
    expect(meta.resi).toBe("SPXID048123456");
    expect(meta.source).toBe("desty");
  });

  it("extracts order information from manual marketplace payment and reason/notes", () => {
    const tx = {
      _id: "tx-manual-1",
      code: "INV002",
      Payments: [
        {
          name: "TikTok Shop",
          type: "Kartu Debit",
          paidName: "578912345678901",
          reason: "Pesanan TikTok No: 578912345678901 Resi: JNT123456789",
        },
      ],
      OtherNotes: [],
    } as unknown as PemasukanData;

    const meta = extractOnlineOrderMetadata(tx);
    expect(meta.isOnline).toBe(true);
    expect(meta.platform).toBe("TikTok");
    expect(meta.orderNo).toBe("578912345678901");
    expect(meta.resi).toBe("JNT123456789");
  });

  it("extracts order number from OtherNotes when notes contain reference", () => {
    const tx = {
      _id: "tx-manual-2",
      code: "INV003",
      Payments: [
        {
          name: "QRIS",
          type: "Kartu Debit",
          paidName: "-",
        },
      ],
      OtherNotes: [{ notes: "Order ID Blibli: BLI-2025-998811" }],
    } as unknown as PemasukanData;

    const meta = extractOnlineOrderMetadata(tx);
    expect(meta.isOnline).toBe(true);
    expect(meta.platform).toBe("Blibli");
    expect(meta.orderNo).toBe("BLI-2025-998811");
  });

  it("extracts order number directly from paidName when platform is Shopee without extra labels", () => {
    const tx = {
      _id: "tx-manual-3",
      code: "INV005",
      Payments: [
        {
          name: "Shopee",
          type: "Kartu Debit",
          paidName: "241015ABCD1234",
          reason: "Kunjungan konsultasi dari -",
        },
      ],
      OtherNotes: [],
    } as unknown as PemasukanData;

    const meta = extractOnlineOrderMetadata(tx);
    expect(meta.isOnline).toBe(true);
    expect(meta.platform).toBe("Shopee");
    expect(meta.orderNo).toBe("241015ABCD1234");
  });

  it("recognizes standard offline POS cash transaction as offline", () => {
    const tx = {
      _id: "tx-offline-1",
      code: "INV004",
      Payments: [
        {
          name: "Tunai",
          type: "Langsung",
          paidName: "-",
          reason: "Kunjungan konsultasi dari -",
        },
      ],
      OtherNotes: [],
      Patients: { nama: "Budi Santoso" },
    } as unknown as PemasukanData;

    const meta = extractOnlineOrderMetadata(tx);
    expect(meta.isOnline).toBe(false);
    expect(meta.source).toBe("offline");
    expect(meta.orderNo).toBe("");
  });
});
