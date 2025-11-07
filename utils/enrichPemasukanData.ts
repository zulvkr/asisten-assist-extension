import { PemasukanDataArray } from "../types/PemasukanData";

export function enrichPemasukanData(
  data: PemasukanDataArray
): PemasukanDataArray {
  return data.map((item) => ({
    ...item,
    Items: item.Items.map((it) => ({
      ...it,
      incomeType:
        it.type === "prescription" || it.type === "akhp" ? "apotek" : "klinik",
    })),
  }));
}
