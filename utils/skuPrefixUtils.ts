/**
 * Utility functions for handling SKU prefix exclusions.
 */

/**
 * Parses a comma-separated prefix string into an array of trimmed, non-empty prefix strings.
 * Example: "ISA-, TEST-, " -> ["ISA-", "TEST-"]
 */
export function parseExcludedPrefixes(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Checks whether an SKU (or code) starts with any of the excluded prefixes (case-insensitive).
 */
export function isSkuPrefixExcluded(
  sku: string | undefined | null,
  prefixes: string[] | undefined | null,
): boolean {
  if (!sku || !prefixes || prefixes.length === 0) return false;
  const s = sku.trim().toLowerCase();
  return prefixes.some((pref) => {
    const p = pref.trim().toLowerCase();
    return p.length > 0 && s.startsWith(p);
  });
}
