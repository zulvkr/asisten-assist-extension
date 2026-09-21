import { describe, it, expect } from "vitest";
import {
  parseMarginCsv,
  marginItemToRow,
  rowToMarginItem,
  type MarginMappingItem,
} from "../services/marginStorage";

describe("Margin Firestore Storage & Utilities", () => {
  const sampleCsv = `Kode Assist,Nama,MARGIN,Batas Warning Stok,Matikan Warning Stok,sku,Column 7,Column 8
BHP00000122,HANSAPLAST PLASTER ROLL KAIN,20%,,,ALK-BEIE-HNSPLST,,
BHP00000357,PLESTER HANSAPLAST AQUA PROTEC 6,23%,0,FALSE,,,,
OBA00000001,PARACETAMOL 500MG,15%,5,TRUE,MED-PCM-500,,
`;

  it("correctly parses CSV text into MarginMappingItems", () => {
    const items = parseMarginCsv(sampleCsv, "test@example.com");
    expect(items.length).toBe(3);

    expect(items[0]).toEqual(
      expect.objectContaining({
        kodeAssist: "BHP00000122",
        nama: "HANSAPLAST PLASTER ROLL KAIN",
        margin: "20%",
        batasWarningStok: "",
        matikanWarningStok: "",
        sku: "ALK-BEIE-HNSPLST",
        updatedBy: "test@example.com",
      }),
    );

    expect(items[1]).toEqual(
      expect.objectContaining({
        kodeAssist: "BHP00000357",
        nama: "PLESTER HANSAPLAST AQUA PROTEC 6",
        margin: "23%",
        batasWarningStok: "0",
        matikanWarningStok: "FALSE",
        sku: "",
      }),
    );

    expect(items[2]).toEqual(
      expect.objectContaining({
        kodeAssist: "OBA00000001",
        nama: "PARACETAMOL 500MG",
        margin: "15%",
        batasWarningStok: "5",
        matikanWarningStok: "TRUE",
        sku: "MED-PCM-500",
      }),
    );
  });

  it("handles commas inside quoted strings in CSV", () => {
    const csvWithQuotes = `Kode Assist,Nama,MARGIN,Batas Warning Stok,Matikan Warning Stok,sku
BHP999,"ALAT KESEHATAN, STERIL",25%,,,ALK-STERIL
`;
    const items = parseMarginCsv(csvWithQuotes);
    expect(items.length).toBe(1);
    expect(items[0].nama).toBe("ALAT KESEHATAN, STERIL");
    expect(items[0].margin).toBe("25%");
    expect(items[0].sku).toBe("ALK-STERIL");
  });

  it("converts item to legacy 6-column tuple and vice versa", () => {
    const item: MarginMappingItem = {
      kodeAssist: "BHP00000122",
      nama: "HANSAPLAST PLASTER ROLL KAIN",
      margin: "20%",
      batasWarningStok: "0",
      matikanWarningStok: "FALSE",
      sku: "ALK-BEIE-HNSPLST",
    };

    const row = marginItemToRow(item);
    expect(row).toEqual([
      "BHP00000122",
      "HANSAPLAST PLASTER ROLL KAIN",
      "20%",
      "0",
      "FALSE",
      "ALK-BEIE-HNSPLST",
    ]);

    const convertedItem = rowToMarginItem(row);
    expect(convertedItem?.kodeAssist).toBe("BHP00000122");
    expect(convertedItem?.sku).toBe("ALK-BEIE-HNSPLST");
  });
});
