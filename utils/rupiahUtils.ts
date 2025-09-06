export function parseRupiah(str: string): number | null {
  if (!str) return null;
  // Remove Rp, dots, spaces, replace comma with dot in one regex
  const cleaned = str.replace(/Rp\s?|\.|\s+/gi, "").replace(/,/g, ".");
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}
