export function parsePercentString(str: string): number | null {
  const cleaned = str.replace("%", "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
