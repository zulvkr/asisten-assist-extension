export function parseRupiah(str: string): number | null {
  if (!str) return null;
  // Remove Rp, dots, spaces, replace comma with dot in one regex
  const cleaned = str.replace(/Rp\s?|\.|\s+/gi, "").replace(/,/g, ".");
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

const formatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value)) {
    return formatter.format(0);
  }
  return formatter.format(Math.round(value));
}
