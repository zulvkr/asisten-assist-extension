import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type {
  AssistCatalogItem,
  DestySheetSkuFallback,
  DestySkuMapping,
  DestySkuMappingInput,
} from "@/types/destySync";

/** Only explicit user overrides are persisted. Effective Sheet/catalog mappings stay in memory. */
export const DESTY_SKU_MAPPINGS_STORAGE_KEY = "destySync:skuOverrides";
export const DESTY_MAPPING_COLLECTION = "desty_sku_mappings";
export const DEFAULT_ASSIST_DEPOT_ID = "68b7af1e072af0c71ed65d3a";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isAssistType(value: unknown): value is DestySkuMapping["assistType"] {
  return value === "prescription" || value === "akhp";
}

export function validateDestySkuMapping(
  value: unknown,
): { valid: true; mapping: DestySkuMapping } | { valid: false; errors: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["Mapping harus berupa object."] };
  }

  const candidate = value as Record<string, unknown>;
  const errors: string[] = [];
  const destySku = asTrimmedString(candidate.destySku);
  const assistCode = asTrimmedString(candidate.assistCode);
  const assistId = asTrimmedString(candidate.assistId);
  const assistName = asTrimmedString(candidate.assistName);
  const assistType = candidate.assistType;
  const conversionFactor = Number(candidate.conversionFactor);

  if (!destySku) errors.push("destySku wajib diisi.");
  if (!assistCode) errors.push("assistCode wajib diisi.");
  if (!isAssistType(assistType)) {
    errors.push("assistType harus prescription atau akhp.");
  }
  if (!assistId) errors.push("assistId wajib diisi.");
  if (!assistName) errors.push("assistName wajib diisi.");
  if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
    errors.push("conversionFactor harus berupa angka lebih besar dari nol.");
  }

  if (errors.length) return { valid: false, errors };

  return {
    valid: true,
    mapping: {
      destySku,
      assistCode,
      assistType: assistType as DestySkuMapping["assistType"],
      assistId,
      assistName,
      destyUnit: asTrimmedString(candidate.destyUnit) || undefined,
      assistUnit: asTrimmedString(candidate.assistUnit) || undefined,
      depotId: asTrimmedString(candidate.depotId) || undefined,
      conversionFactor,
      active: candidate.active !== false,
      updatedAt: asTrimmedString(candidate.updatedAt) || new Date().toISOString(),
    },
  };
}

export function validateDestySkuMappings(value: unknown): DestySkuMapping[] {
  const objectValue = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
  const source: unknown[] | null = Array.isArray(value)
    ? value
    : Array.isArray(objectValue?.mappings)
      ? objectValue.mappings
      : null;

  if (!source) {
    throw new Error("Format mapping harus berupa array atau object { mappings: [] }.");
  }

  const mappings: DestySkuMapping[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  source.forEach((item: unknown, index: number) => {
    const result = validateDestySkuMapping(item);
    if (!result.valid) {
      errors.push(`Mapping baris ${index + 1}: ${result.errors.join(" ")}`);
      return;
    }

    const key = result.mapping.destySku.toUpperCase();
    if (seen.has(key)) {
      errors.push(`Mapping baris ${index + 1}: destySku duplikat (${result.mapping.destySku}).`);
      return;
    }
    seen.add(key);
    mappings.push(result.mapping);
  });

  if (errors.length) throw new Error(errors.join("\n"));
  return mappings;
}

export async function getDestySkuMappings(): Promise<DestySkuMapping[]> {
  const stored = await browser.storage.local.get(DESTY_SKU_MAPPINGS_STORAGE_KEY);
  const value = stored?.[DESTY_SKU_MAPPINGS_STORAGE_KEY];
  if (value === undefined) return [];

  try {
    return validateDestySkuMappings(value);
  } catch {
    // Corrupt local data must not prevent the helper from opening.
    return [];
  }
}

export async function saveDestySkuMappings(
  mappings: unknown,
): Promise<DestySkuMapping[]> {
  const validated = validateDestySkuMappings(mappings);
  await browser.storage.local.set({
    [DESTY_SKU_MAPPINGS_STORAGE_KEY]: validated,
  });
  return validated;
}

export async function fetchDestySkuMappingsFromFirestore(): Promise<DestySkuMapping[]> {
  try {
    if (!db) return [];
    const collRef = collection(db, DESTY_MAPPING_COLLECTION);
    const snapshot = await getDocs(collRef);
    const mappings: DestySkuMapping[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const validation = validateDestySkuMapping(data);
      if (validation.valid) {
        mappings.push(validation.mapping);
      }
    });
    return mappings;
  } catch (err) {
    console.warn("Gagal membaca mapping dari Firestore (menggunakan local cache):", err);
    return [];
  }
}

function sanitizeFirestorePayload(mapping: DestySkuMapping): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    destySku: mapping.destySku,
    assistCode: mapping.assistCode,
    assistType: mapping.assistType,
    assistId: mapping.assistId,
    assistName: mapping.assistName,
    conversionFactor: mapping.conversionFactor,
    active: mapping.active,
    updatedAt: mapping.updatedAt || new Date().toISOString(),
  };
  if (mapping.destyUnit) payload.destyUnit = mapping.destyUnit;
  if (mapping.assistUnit) payload.assistUnit = mapping.assistUnit;
  if (mapping.depotId) payload.depotId = mapping.depotId;
  return payload;
}

export async function upsertDestySkuMappingToFirestore(mapping: DestySkuMapping): Promise<void> {
  try {
    if (!db) return;
    const cleanId = mapping.destySku.trim().toUpperCase().replace(/[\/\.#$\[\]]/g, "_");
    const docRef = doc(db, DESTY_MAPPING_COLLECTION, cleanId);
    const payload = sanitizeFirestorePayload(mapping);
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    console.warn("Gagal menyimpan mapping ke Firestore:", err);
  }
}

export async function deleteDestySkuMappingFromFirestore(destySku: string): Promise<void> {
  try {
    if (!db) return;
    const cleanId = destySku.trim().toUpperCase().replace(/[\/\.#$\[\]]/g, "_");
    const docRef = doc(db, DESTY_MAPPING_COLLECTION, cleanId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn("Gagal menghapus mapping dari Firestore:", err);
  }
}

export async function syncDestySkuMappings(): Promise<DestySkuMapping[]> {
  const localMappings = await getDestySkuMappings();
  const remoteMappings = await fetchDestySkuMappingsFromFirestore();
  if (!remoteMappings.length) {
    return localMappings;
  }

  // Merge remote with local (remote has highest precedence for shared cache)
  const mergedMap = new Map<string, DestySkuMapping>();
  for (const m of localMappings) {
    mergedMap.set(m.destySku.trim().toUpperCase(), m);
  }
  for (const rm of remoteMappings) {
    const key = rm.destySku.trim().toUpperCase();
    const local = mergedMap.get(key);
    if (!local || (rm.updatedAt && (!local.updatedAt || rm.updatedAt >= local.updatedAt))) {
      mergedMap.set(key, rm);
    }
  }

  const merged = Array.from(mergedMap.values());
  await saveDestySkuMappings(merged);
  return merged;
}

export async function upsertDestySkuMapping(
  mapping: DestySkuMappingInput,
): Promise<DestySkuMapping[]> {
  const result = validateDestySkuMapping(mapping);
  if (!result.valid) throw new Error(result.errors.join(" "));

  const mappings = await getDestySkuMappings();
  const key = result.mapping.destySku.toUpperCase();
  const index = mappings.findIndex((item) => item.destySku.toUpperCase() === key);
  if (index === -1) mappings.push(result.mapping);
  else mappings[index] = result.mapping;
  
  const saved = await saveDestySkuMappings(mappings);
  void upsertDestySkuMappingToFirestore(result.mapping);
  return saved;
}

export async function updateSkuConversionFactor(
  destySku: string,
  conversionFactor: number,
  fallbackItem?: Partial<DestySkuMappingInput>,
): Promise<DestySkuMapping[]> {
  const factor = Number(conversionFactor);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error("Faktor konversi harus berupa angka lebih besar dari 0");
  }
  const mappings = await getDestySkuMappings();
  const key = destySku.trim().toUpperCase();
  const index = mappings.findIndex((m) => m.destySku.trim().toUpperCase() === key);

  if (index !== -1) {
    mappings[index] = {
      ...mappings[index],
      conversionFactor: factor,
      updatedAt: new Date().toISOString(),
    };
    const saved = await saveDestySkuMappings(mappings);
    void upsertDestySkuMappingToFirestore(mappings[index]);
    return saved;
  } else if (fallbackItem && fallbackItem.assistId && fallbackItem.assistCode) {
    const newMapping: DestySkuMappingInput = {
      destySku: destySku.trim(),
      assistCode: fallbackItem.assistCode,
      assistType: fallbackItem.assistType || "prescription",
      assistId: fallbackItem.assistId,
      assistName: fallbackItem.assistName || destySku,
      assistUnit: fallbackItem.assistUnit,
      destyUnit: fallbackItem.destyUnit,
      depotId: fallbackItem.depotId || DEFAULT_ASSIST_DEPOT_ID,
      conversionFactor: factor,
      active: true,
      updatedAt: new Date().toISOString(),
    };
    return upsertDestySkuMapping(newMapping);
  }
  return mappings;
}

export async function removeDestySkuMapping(destySku: string): Promise<DestySkuMapping[]> {
  const key = destySku.trim().toUpperCase();
  if (!key) throw new Error("destySku wajib diisi.");
  const mappings = await getDestySkuMappings();
  const updated = mappings.filter((item) => item.destySku.toUpperCase() !== key);
  const saved = await saveDestySkuMappings(updated);
  void deleteDestySkuMappingFromFirestore(destySku);
  return saved;
}

export function exportDestySkuMappings(mappings: DestySkuMapping[]): string {
  return JSON.stringify(mappings, null, 2);
}

export async function importDestySkuMappings(
  json: string,
): Promise<DestySkuMapping[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("File mapping bukan JSON yang valid.");
  }
  const saved = await saveDestySkuMappings(parsed);
  for (const m of saved) {
    void upsertDestySkuMappingToFirestore(m);
  }
  return saved;
}

/** Reads the existing Google Sheet convention: code in column A, name in B, SKU in F. */
export function buildGoogleSheetSkuFallback(
  rows: unknown[][],
): DestySheetSkuFallback[] {
  const result: DestySheetSkuFallback[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const assistCode = asTrimmedString(row[0]);
    const assistName = asTrimmedString(row[1]);
    const destySku = asTrimmedString(row[5]);
    const key = destySku.toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ destySku, assistCode, assistName });
  }
  return result;
}

export function buildMappingsFromGoogleSheet(
  rows: unknown[][],
  catalog: AssistCatalogItem[],
  existingMappings: DestySkuMapping[] = [],
  defaultDepotId: string = DEFAULT_ASSIST_DEPOT_ID,
): { mappings: DestySkuMapping[]; unmatchedSkus: string[] } {
  const existingBySku = new Map(existingMappings.map((mapping) => [mapping.destySku.toUpperCase(), mapping]));
  const catalogByCode = new Map(catalog.map((item) => [item.code.trim().toUpperCase(), item]));
  const mappings: DestySkuMapping[] = [];
  const unmatchedSkus: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const destySku = asTrimmedString(row[5]);
    const assistCode = asTrimmedString(row[0]);
    const sheetName = asTrimmedString(row[1]);
    if (!destySku || !assistCode || seen.has(destySku.toUpperCase())) continue;
    seen.add(destySku.toUpperCase());
    const catalogItem = catalogByCode.get(assistCode.toUpperCase());
    if (!catalogItem) {
      unmatchedSkus.push(destySku);
      continue;
    }

    const previous = existingBySku.get(destySku.toUpperCase());
    mappings.push({
      destySku,
      assistCode,
      assistType: catalogItem.type,
      assistId: catalogItem.id,
      assistName: catalogItem.name || sheetName,
      destyUnit: previous?.destyUnit,
      assistUnit: catalogItem.unit || previous?.assistUnit,
      // A fresh depot record is preferred over a stale previous fallback.
      depotId: catalogItem.depotId || previous?.depotId || defaultDepotId.trim(),
      conversionFactor: previous?.conversionFactor ?? 1,
      active: previous?.active ?? true,
      updatedAt: new Date().toISOString(),
    });
  }

  // Keep manually confirmed mappings that are not yet present in the sheet.
  for (const mapping of existingMappings) {
    if (!seen.has(mapping.destySku.toUpperCase())) mappings.push(mapping);
  }
  return { mappings, unmatchedSkus };
}

export function findDestySkuMapping(
  mappings: DestySkuMapping[],
  destySku: string,
): DestySkuMapping | undefined {
  const key = destySku.trim().toUpperCase();
  return mappings.find((mapping) =>
    mapping.active && mapping.destySku.trim().toUpperCase() === key,
  );
}

export function resolveEffectiveDestySkuMapping(
  destySku: string,
  mappings: DestySkuMapping[],
  assistCatalog: AssistCatalogItem[] = [],
  defaultDepotId: string = DEFAULT_ASSIST_DEPOT_ID,
): DestySkuMapping | undefined {
  const explicit = findDestySkuMapping(mappings, destySku);
  if (explicit) return explicit;

  const key = destySku.trim().toUpperCase();
  if (!key || !assistCatalog.length) return undefined;

  const catalogItem = assistCatalog.find(
    (item) => item.code && item.code.trim().toUpperCase() === key,
  );
  if (!catalogItem) return undefined;

  return {
    destySku: destySku.trim(),
    assistCode: catalogItem.code,
    assistType: catalogItem.type,
    assistId: catalogItem.id,
    assistName: catalogItem.name,
    destyUnit: catalogItem.unit,
    assistUnit: catalogItem.unit,
    depotId: catalogItem.depotId || defaultDepotId,
    conversionFactor: 1,
    active: true,
  };
}
