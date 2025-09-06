export function normalizeNamaObat(str: string): string {
  return str
    .replace(/\s{2,}/g, " ")
    .trim()
    .toUpperCase();
}
