import type {
  AssistCatalogItem,
  DestySheetSkuFallback,
  DestySkuMapping,
  DestySkuMappingInput,
} from "@/types/destySync";

/** Only explicit user overrides are persisted. Effective Sheet/catalog mappings stay in memory. */
export const DESTY_SKU_MAPPINGS_STORAGE_KEY = "destySync:skuOverrides";
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
  return saveDestySkuMappings(mappings);
}

export async function removeDestySkuMapping(destySku: string): Promise<DestySkuMapping[]> {
  const key = destySku.trim().toUpperCase();
  if (!key) throw new Error("destySku wajib diisi.");
  const mappings = await getDestySkuMappings();
  return saveDestySkuMappings(
    mappings.filter((item) => item.destySku.toUpperCase() !== key),
  );
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
  return saveDestySkuMappings(parsed);
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
