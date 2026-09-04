export interface DestyPaidNameMetadata {
  platform: string;
  order: string;
  booking: string;
  resi: string;
}

export function parseDestyPaidName(value: string): DestyPaidNameMetadata | null {
  const parts = value.split("|").map((part) => part.trim());
  if (parts.shift()?.toUpperCase() !== "DESTY") return null;

  const fields: Record<string, string> = {};
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    if (!key) continue;
    fields[key] = part.slice(separator + 1).trim();
  }

  return {
    platform: fields.platform ?? "",
    order: fields.order ?? "",
    booking: fields.booking ?? "",
    resi: fields.resi ?? "",
  };
}

export function isDestyPaidName(value: string): boolean {
  return parseDestyPaidName(value) !== null;
}
