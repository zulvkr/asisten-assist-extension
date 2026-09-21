import { fetchMarginMappings, type MarginTableRow } from "@/services/marginStorage";

export async function fetchMarginTable(): Promise<MarginTableRow[]> {
  try {
    const { rows } = await fetchMarginMappings();
    (window as any).marginData = rows;
    console.log("Fetched margin data from Firestore:", rows.length, "items");
    return rows;
  } catch (err) {
    console.error("Gagal mengambil data margin dari Firestore:", err);
    return [];
  }
}
