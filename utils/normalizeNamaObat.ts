export function normalizeNamaObat(str: string): string {
  return str.replace(/[\s()]+/g, "").toUpperCase();
}
