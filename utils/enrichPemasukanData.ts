import { PemasukanDataArray } from "../types/PemasukanData";

export function enrichPemasukanData(
  data: PemasukanDataArray
): PemasukanDataArray {
  return data
    .filter((item) => item.status === "paid off")
    .map((item) => ({
      ...item,
      Items: item.Items.map((it) => ({
        ...it,
        incomeType:
          it.type === "prescription" || it.type === "akhp"
            ? "apotek"
            : "klinik",
      })),
    }));
}
