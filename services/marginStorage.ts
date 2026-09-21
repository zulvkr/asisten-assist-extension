import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/config/firebase";

export interface MarginMappingItem {
  kodeAssist: string;
  nama: string;
  margin: string;
  batasWarningStok?: string;
  matikanWarningStok?: string | boolean;
  sku?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type MarginTableRow = [string, string, string, string, string, string];

export const MARGIN_COLLECTION = "margin_mappings";

/**
 * Converts a MarginMappingItem to a 2D row array matching the legacy Google Sheets schema:
 * [0] kodeAssist, [1] nama, [2] margin, [3] batasWarningStok, [4] matikanWarningStok, [5] sku
 */
export function marginItemToRow(item: MarginMappingItem): MarginTableRow {
  return [
    item.kodeAssist || "",
    item.nama || "",
    item.margin || "",
    item.batasWarningStok !== undefined && item.batasWarningStok !== null
      ? String(item.batasWarningStok)
      : "",
    item.matikanWarningStok !== undefined && item.matikanWarningStok !== null
      ? String(item.matikanWarningStok)
      : "",
    item.sku || "",
  ];
}

/**
 * Converts a legacy 2D row array to a MarginMappingItem.
 */
export function rowToMarginItem(
  row: unknown[],
  updatedBy?: string,
): MarginMappingItem | null {
  if (!Array.isArray(row)) return null;
  const kodeAssist = String(row[0] ?? "").trim();
  if (!kodeAssist) return null;

  return {
    kodeAssist,
    nama: String(row[1] ?? "").trim(),
    margin: String(row[2] ?? "").trim(),
    batasWarningStok: String(row[3] ?? "").trim(),
    matikanWarningStok: String(row[4] ?? "").trim(),
    sku: String(row[5] ?? "").trim(),
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };
}

/**
 * Fetches all margin mappings from Firestore.
 */
export async function fetchMarginMappings(): Promise<{
  items: MarginMappingItem[];
  rows: MarginTableRow[];
}> {
  const collRef = collection(db, MARGIN_COLLECTION);
  const snapshot = await getDocs(collRef);

  const items: MarginMappingItem[] = [];
  const rows: MarginTableRow[] = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as MarginMappingItem;
    const item: MarginMappingItem = {
      kodeAssist: data.kodeAssist || docSnap.id,
      nama: data.nama || "",
      margin: data.margin || "",
      batasWarningStok: data.batasWarningStok ?? "",
      matikanWarningStok: data.matikanWarningStok ?? "",
      sku: data.sku || "",
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
    };
    items.push(item);
    rows.push(marginItemToRow(item));
  });

  return { items, rows };
}

/**
 * Upserts a single margin item in Firestore.
 */
export async function upsertMarginItem(
  item: Partial<MarginMappingItem> & { kodeAssist: string },
  updatedBy?: string,
): Promise<void> {
  const docRef = doc(db, MARGIN_COLLECTION, item.kodeAssist.trim());
  const payload: Partial<MarginMappingItem> = {
    ...item,
    kodeAssist: item.kodeAssist.trim(),
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };
  await setDoc(docRef, payload, { merge: true });
}

/**
 * Batch uploads/upserts multiple margin mapping items to Firestore.
 * Breaks requests into batches of up to 400 documents (Firestore limit is 500).
 */
export async function batchUpsertMarginItems(
  items: MarginMappingItem[],
  onProgress?: (processed: number, total: number) => void,
): Promise<{ total: number }> {
  const BATCH_SIZE = 400;
  const total = items.length;
  let processed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const docRef = doc(db, MARGIN_COLLECTION, item.kodeAssist.trim());
      batch.set(docRef, {
        ...item,
        updatedAt: item.updatedAt || new Date().toISOString(),
      }, { merge: true });
    }

    await batch.commit();
    processed += chunk.length;
    if (onProgress) {
      onProgress(processed, total);
    }
  }

  return { total };
}

/**
 * Parses raw CSV content of the margin table into MarginMappingItem objects.
 */
export function parseMarginCsv(
  csvText: string,
  updatedBy?: string,
): MarginMappingItem[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const items: MarginMappingItem[] = [];

  function parseLine(line: string): string[] {
    const res: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        res.push(cur);
        cur = "";
      } else {
        cur += char;
      }
    }
    res.push(cur);
    return res;
  }

  // Skip header (index 0)
  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    const kode = (row[0] || "").trim();
    if (!kode) continue;

    items.push({
      kodeAssist: kode,
      nama: (row[1] || "").trim(),
      margin: (row[2] || "").trim(),
      batasWarningStok: (row[3] || "").trim(),
      matikanWarningStok: (row[4] || "").trim(),
      sku: (row[5] || "").trim(),
      updatedAt: new Date().toISOString(),
      ...(updatedBy ? { updatedBy } : {}),
    });
  }

  return items;
}
