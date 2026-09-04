import type { DestyImportLedgerEntry } from "@/types/destySync";

export const DESTY_IMPORT_LEDGER_STORAGE_KEY = "destySync:importLedger";

function normalize(value: string | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function validEntry(value: unknown): value is DestyImportLedgerEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DestyImportLedgerEntry>;
  return Boolean(normalize(entry.marketplaceOrderSn)) &&
    ["success", "failed", "duplicate", "dry-run", "voided"].includes(String(entry.status));
}

export async function getDestyImportLedger(): Promise<DestyImportLedgerEntry[]> {
  const stored = await browser.storage.local.get(DESTY_IMPORT_LEDGER_STORAGE_KEY);
  const value = stored?.[DESTY_IMPORT_LEDGER_STORAGE_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(validEntry) as DestyImportLedgerEntry[];
}

export async function saveDestyImportLedger(
  entries: DestyImportLedgerEntry[],
): Promise<DestyImportLedgerEntry[]> {
  await browser.storage.local.set({
    [DESTY_IMPORT_LEDGER_STORAGE_KEY]: entries,
  });
  return entries;
}

export function getDestyOrderIdentifiers(entry: {
  marketplaceOrderSn?: string;
  bookingSn?: string;
  trackingNumber?: string;
}): string[] {
  return [entry.marketplaceOrderSn, entry.bookingSn, entry.trackingNumber]
    .map(normalize)
    .filter(Boolean);
}

export function buildDestyDuplicateIndex(
  entries: DestyImportLedgerEntry[],
): Set<string> {
  const index = new Set<string>();
  for (const entry of entries) {
    if (entry.status !== "success") continue;
    getDestyOrderIdentifiers(entry).forEach((identifier) => index.add(identifier));
  }
  return index;
}

export async function hasImportedDestyOrder(
  identifiers: Parameters<typeof getDestyOrderIdentifiers>[0],
): Promise<boolean> {
  const ledger = await getDestyImportLedger();
  const index = buildDestyDuplicateIndex(ledger);
  return getDestyOrderIdentifiers(identifiers).some((identifier) => index.has(identifier));
}

export async function reconcileDestyImportLedger(
  authoritativeIdentifiers: Iterable<string>,
  checkedIdentifiers: Iterable<string>,
): Promise<DestyImportLedgerEntry[]> {
  const authoritative = new Set(
    Array.from(authoritativeIdentifiers, (value) => normalize(String(value))),
  );
  const checked = new Set(
    Array.from(checkedIdentifiers, (value) => normalize(String(value))),
  );
  const ledger = await getDestyImportLedger();
  const now = new Date().toISOString();
  let changed = false;
  for (const entry of ledger) {
    if (entry.status !== "success") continue;
    const identifiers = getDestyOrderIdentifiers(entry);
    const isInCheckedScope = identifiers.some((identifier) => checked.has(identifier));
    if (isInCheckedScope && !identifiers.some((identifier) => authoritative.has(identifier))) {
      entry.status = "voided";
      entry.error = "Tidak ditemukan sebagai transaksi aktif di Assist; kemungkinan sudah di-void.";
      entry.updatedAt = now;
      changed = true;
    }
  }
  if (changed) await saveDestyImportLedger(ledger);
  return ledger;
}

export async function recordDestyImport(
  entry: Omit<DestyImportLedgerEntry, "importedAt" | "updatedAt">,
): Promise<DestyImportLedgerEntry> {
  const now = new Date().toISOString();
  const next: DestyImportLedgerEntry = { ...entry, importedAt: now, updatedAt: now };
  const ledger = await getDestyImportLedger();
  const identifiers = new Set(getDestyOrderIdentifiers(next));
  const existingIndex = ledger.findIndex((item) =>
    getDestyOrderIdentifiers(item).some((identifier) => identifiers.has(identifier)),
  );

  if (existingIndex === -1) ledger.push(next);
  else ledger[existingIndex] = { ...ledger[existingIndex], ...next, updatedAt: now };
  await saveDestyImportLedger(ledger);
  return next;
}
