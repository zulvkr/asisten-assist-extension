import { Payment, PemasukanData } from "@/types/PemasukanData";
import { parseDestyPaidName } from "./destyPaidNameParser";

export interface OnlineOrderMetadata {
  isOnline: boolean;
  platform: string; // "Shopee" | "TikTok" | "Blibli" | "GoApotik" | "Tokopedia" | "Lazada" | "Online" | ""
  orderNo: string;
  bookingNo: string;
  resi: string;
  source: "desty" | "online" | "offline";
  notes?: string;
  rawReference?: string;
}

const MARKETPLACE_KEYWORDS: Array<{ key: string; label: string }> = [
  { key: "shopee", label: "Shopee" },
  { key: "tiktok", label: "TikTok" },
  { key: "blibli", label: "Blibli" },
  { key: "goapotik", label: "GoApotik" },
  { key: "go apotik", label: "GoApotik" },
  { key: "tokopedia", label: "Tokopedia" },
  { key: "lazada", label: "Lazada" },
];

function cleanValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/**
 * Extracts online order identifiers (Order ID / SN, Booking No, Resi / Tracking AWB, Platform)
 * from transaction data (payments, notes, paidName, etc.).
 */
export function extractOnlineOrderMetadata(tx: PemasukanData): OnlineOrderMetadata {
  const payments = Array.isArray(tx.Payments) ? tx.Payments : [];
  const primaryPayment = payments[0] as Payment | undefined;

  // 1. Check if any payment matches the structured DESTY format
  for (const p of payments) {
    const rawPaidName = cleanValue(p?.paidName);
    if (rawPaidName) {
      const destyMeta = parseDestyPaidName(rawPaidName);
      if (destyMeta) {
        return {
          isOnline: true,
          platform: destyMeta.platform || "Desty",
          orderNo: destyMeta.order || "",
          bookingNo: destyMeta.booking || "",
          resi: destyMeta.resi || "",
          source: "desty",
          rawReference: rawPaidName,
        };
      }
    }
  }

  // 2. Collect textual clues from payments and other notes
  const paymentClues = payments
    .map((p) => [cleanValue(p?.name), cleanValue(p?.type), cleanValue(p?.paidName), cleanValue(p?.reason)].join(" "))
    .join(" ");

  const notesList = Array.isArray(tx.OtherNotes)
    ? tx.OtherNotes.map((n) => {
        if (typeof n === "string") return n;
        if (n && typeof n === "object") {
          return cleanValue((n as any).notes || (n as any).note || (n as any).text || JSON.stringify(n));
        }
        return "";
      }).filter(Boolean)
    : [];
  const notesText = notesList.join(" ");

  const fullText = `${paymentClues} ${notesText}`;
  const fullTextLower = fullText.toLowerCase();

  // 3. Detect Platform
  let detectedPlatform = "";
  for (const mp of MARKETPLACE_KEYWORDS) {
    if (fullTextLower.includes(mp.key)) {
      detectedPlatform = mp.label;
      break;
    }
  }

  // 4. Extract Order SN / Order Number
  let orderNo = "";
  let bookingNo = "";
  let resi = "";

  // Pattern A: Explicit label like "order: 2310...", "pesanan: ...", "no ref: ...", "order sn: ...", "pesanan tiktok no: ..."
  const orderRegex = /(?:order\s*(?:id|sn|no|#)?|pesanan\s*(?:no|#)?|no[.\s]*(?:pesanan|ref(?:erensi)?|order)|ref(?:erensi)?[\s#:]+)(?:\s+(?:shopee|tiktok(?:\s*shop)?|blibli|goapotik|tokopedia|lazada))?(?:[\s:=#-]+(?:id|no|#|sn))?[:\s#-]*([a-zA-Z0-9_-]{5,})/i;
  const orderMatch = fullText.match(orderRegex);
  if (orderMatch && orderMatch[1]) {
    const val = orderMatch[1].trim();
    // Ensure captured value is not just the platform name
    const valLower = val.toLowerCase();
    if (!["shopee", "tiktok", "blibli", "goapotik", "tokopedia", "lazada"].includes(valLower)) {
      orderNo = val;
    }
  }

  // Pattern B: Resi / AWB / Tracking number
  const resiRegex = /(?:resi|no[.\s]*resi|awb|tracking|spx(?:id)?|jnt|jne|sicepat)[:\s#-]*([a-zA-Z0-9_-]{7,})/i;
  const resiMatch = fullText.match(resiRegex);
  if (resiMatch && resiMatch[1]) {
    resi = resiMatch[1].trim();
  }

  // Pattern C: Booking number
  const bookingRegex = /(?:booking\s*(?:sn|no|#)?|no[.\s]*booking)[:\s#-]*([a-zA-Z0-9_-]{5,})/i;
  const bookingMatch = fullText.match(bookingRegex);
  if (bookingMatch && bookingMatch[1]) {
    bookingNo = bookingMatch[1].trim();
  }

  // Pattern D: Check paidName heuristic
  // If no explicit order label, but paidName has an order-like format (e.g. 230915XXXXX or alphanumeric without spaces)
  const paidName = cleanValue(primaryPayment?.paidName);
  const patientName = cleanValue(tx.Patients?.nama || (tx as any).patientName);
  if (
    !orderNo &&
    paidName &&
    paidName !== "-" &&
    paidName.toLowerCase() !== "pasien apotek" &&
    paidName !== patientName
  ) {
    // Alphanumeric code with 6+ chars, optionally with dashes or underscores
    if (/^[A-Za-z0-9_-]{6,32}$/.test(paidName)) {
      orderNo = paidName;
    }
  }

  // Pattern E: Look for platform-specific order patterns in search text (e.g., Shopee order SN typically 14-16 alphanumeric chars starting with 2 digits like 24...)
  if (!orderNo && (detectedPlatform === "Shopee" || detectedPlatform === "TikTok")) {
    const snMatch = fullText.match(/\b([0-9]{2}[0-9A-Z]{12,18})\b/i);
    if (snMatch) {
      orderNo = snMatch[1];
    }
  }

  const isOnline = Boolean(detectedPlatform || orderNo || resi || bookingNo);

  return {
    isOnline,
    platform: detectedPlatform || (isOnline ? "Online" : ""),
    orderNo,
    bookingNo,
    resi,
    source: isOnline ? "online" : "offline",
    notes: notesText || undefined,
    rawReference: orderNo || resi || (isOnline ? paidName : undefined),
  };
}
