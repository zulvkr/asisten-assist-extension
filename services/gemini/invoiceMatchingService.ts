import type {
  ExtractedInvoiceItem,
  ExtractInvoiceResult,
  RawGeminiInvoiceExtraction,
} from "@/types/fakturScan";
import type { MarginMappingItem } from "@/services/marginStorage";

export interface CatalogCandidate {
  id: string; // depotId or medicineId/akhpId
  code: string;
  name: string;
  type: "prescription" | "akhp";
  isBHP: boolean;
  unit: string;
  buyFee: number;
  sellNormalFee: number;
  avgHPP: number;
  depotId: string;
  medicineId?: string;
  akhpId?: string;
  rawItem?: any;
}

export interface DistributorCandidate {
  id: string;
  supplierName: string;
  picSupplierName?: string;
  phoneNumberSupplier?: string;
  email?: string;
  address?: string;
}

const NOISE_TOKENS = new Set([
  "pt", "cv", "tbk", "pbf", "distributor", "apotek", "farmasi", "indonesia",
  "lestari", "utama", "persada", "abadi", "sejahtera", "makmur", "jaya", "anugrah", "anugerah"
]);

/**
 * Normalizes string for tokenization and comparisons.
 */
export function normalizeString(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts significant tokens from normalized string.
 */
export function getTokens(normalizedText: string): string[] {
  if (!normalizedText) return [];
  return normalizedText
    .split(" ")
    .filter((token) => token.length > 1 && !NOISE_TOKENS.has(token));
}

/**
 * Levenshtein distance for typo tolerance in product matching.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const prevRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
  const curRow = new Array<number>(s2.length + 1);

  for (let i = 0; i < s1.length; i++) {
    curRow[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      curRow[j + 1] = Math.min(
        curRow[j] + 1,
        prevRow[j + 1] + 1,
        prevRow[j] + cost
      );
    }
    for (let j = 0; j <= s2.length; j++) {
      prevRow[j] = curRow[j];
    }
  }

  return curRow[s2.length];
}

/**
 * Determines whether two individual tokens are similar (handles typos).
 */
export function areTokensSimilar(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  if (t1.length < 3 || t2.length < 3) return false;
  if (t1.startsWith(t2) || t2.startsWith(t1)) return true;

  const maxLen = Math.max(t1.length, t2.length);
  const allowedDist = maxLen >= 6 ? 2 : 1;
  return levenshteinDistance(t1, t2) <= allowedDist;
}

/**
 * Extracts variant indicators (dosage, strength, sizes, form) to avoid false positive matching.
 */
export function extractVariants(text: string): Set<string> {
  const variants = new Set<string>();
  if (!text) return variants;

  const lower = text.toLowerCase();

  // 1. Sizes (S, M, L, XL, XXL, XXXL, M10, L8, XL8, S10, L10, etc.)
  const sizeMatches = lower.match(/\b(?:size\s*)?([smlx]{1,4}(?:\s*\d+)?)\b/g);
  if (sizeMatches) {
    for (const match of sizeMatches) {
      const val = match.replace(/\s+/g, "").replace(/^size/, "");
      if (
        ["s", "m", "l", "xl", "xxl", "xxxl"].includes(val) ||
        /^[smlx]{1,4}\d+$/.test(val)
      ) {
        variants.add(`size:${val}`);
      }
    }
  }

  // 2. Strengths / Dosages (500mg, 1000mg, 250mg, 10mg, 20mg, 40mg, 5ml, 60ml, 1%, 2%)
  const strengthMatches = lower.match(/\b(\d+(?:[.,]\d+)?\s*(?:mg|mcg|iu|ml|g|%))\b/g);
  if (strengthMatches) {
    for (const match of strengthMatches) {
      const val = match.replace(/\s+/g, "").replace(",", ".");
      variants.add(`strength:${val}`);
    }
  }

  // 3. Distinctive Forms (Forte, Plus, Sirup, Drop, Injeksi, Cream, Salep)
  const formMatches = lower.match(/\b(forte|plus|\+|sirup|syrup|drop|tetes|injeksi|inj|krim|cream|salep|gel)\b/g);
  if (formMatches) {
    for (const match of formMatches) {
      let val = match.trim();
      if (val === "syrup" || val === "sirup") val = "sirup";
      if (val === "drop" || val === "tetes") val = "drop";
      if (val === "krim" || val === "cream") val = "krim";
      if (val === "injeksi" || val === "inj") val = "injeksi";
      if (val === "+") val = "plus";
      variants.add(`form:${val}`);
    }
  }

  return variants;
}

/**
 * Checks if two items have conflicting variants (e.g. 500mg vs 1000mg, Size L vs Size M).
 */
export function hasConflictingVariants(
  variants1: Set<string>,
  variants2: Set<string>
): boolean {
  for (const prefix of ["size:", "strength:", "form:"]) {
    const list1 = Array.from(variants1).filter((v) => v.startsWith(prefix));
    const list2 = Array.from(variants2).filter((v) => v.startsWith(prefix));

    if (list1.length > 0 && list2.length > 0) {
      const hasOverlap = list1.some((v) => list2.includes(v));
      if (!hasOverlap) {
        return true; // Conflict detected
      }
    }
  }
  return false;
}

/**
 * Matches raw supplier name against registered Assist distributors.
 */
export function matchSupplier(
  rawSupplierName: string | undefined,
  distributors: DistributorCandidate[]
): { id?: string; name?: string; confidence: number } {
  if (!rawSupplierName || !rawSupplierName.trim() || !distributors.length) {
    return { confidence: 0 };
  }

  const cleanRaw = normalizeString(rawSupplierName);
  const rawTokens = getTokens(cleanRaw);

  // 1. Exact match
  for (const d of distributors) {
    const cleanDb = normalizeString(d.supplierName);
    if (cleanRaw === cleanDb) {
      return { id: d.id, name: d.supplierName, confidence: 1.0 };
    }
    if (cleanRaw.includes(cleanDb) || cleanDb.includes(cleanRaw)) {
      return { id: d.id, name: d.supplierName, confidence: 0.9 };
    }
  }

  // 2. Token overlap Dice coefficient
  let bestDistributor: DistributorCandidate | null = null;
  let bestScore = 0;

  for (const d of distributors) {
    const cleanDb = normalizeString(d.supplierName);
    const dbTokens = getTokens(cleanDb);

    let intersection = 0;
    const matchedDb = new Set<number>();

    for (let i = 0; i < rawTokens.length; i++) {
      for (let j = 0; j < dbTokens.length; j++) {
        if (!matchedDb.has(j) && areTokensSimilar(rawTokens[i], dbTokens[j])) {
          intersection++;
          matchedDb.add(j);
          break;
        }
      }
    }

    if (intersection > 0) {
      const score = (2.0 * intersection) / (rawTokens.length + dbTokens.length);
      if (score > bestScore) {
        bestScore = score;
        bestDistributor = d;
      }
    }
  }

  if (bestDistributor && bestScore >= 0.4) {
    return {
      id: bestDistributor.id,
      name: bestDistributor.supplierName,
      confidence: Number(bestScore.toFixed(2)),
    };
  }

  return { confidence: 0 };
}

/**
 * Finds the best matching catalog product from Assist depot items.
 */
export function findBestProductMatch(
  rawName: string,
  products: CatalogCandidate[]
): { product: CatalogCandidate | null; confidence: number } {
  if (!rawName || !rawName.trim() || !products.length) {
    return { product: null, confidence: 0 };
  }

  const cleanRaw = normalizeString(rawName);
  const rawTokens = getTokens(cleanRaw);
  const rawVariants = extractVariants(rawName);

  let bestMatch: CatalogCandidate | null = null;
  let bestScore = 0;

  for (const p of products) {
    const cleanName = normalizeString(p.name);

    // Exact match
    if (cleanRaw === cleanName) {
      return { product: p, confidence: 1.0 };
    }

    const dbVariants = extractVariants(p.name);

    // Reject conflicting variants (e.g. 500mg vs 1000mg)
    if (hasConflictingVariants(rawVariants, dbVariants)) {
      continue;
    }

    const nameTokens = getTokens(cleanName);
    let intersection = 0;
    const matchedDb = new Set<number>();

    for (let i = 0; i < rawTokens.length; i++) {
      for (let j = 0; j < nameTokens.length; j++) {
        if (!matchedDb.has(j) && areTokensSimilar(rawTokens[i], nameTokens[j])) {
          intersection++;
          matchedDb.add(j);
          break;
        }
      }
    }

    let bonus = 0;
    // Extra weight if brand / first token matches
    if (
      rawTokens.length > 0 &&
      nameTokens.length > 0 &&
      areTokensSimilar(rawTokens[0], nameTokens[0])
    ) {
      bonus += 0.15;
    }

    // Variant agreement bonus
    if (
      rawVariants.size > 0 &&
      dbVariants.size > 0 &&
      Array.from(rawVariants).every((v) => dbVariants.has(v))
    ) {
      bonus += 0.2;
    }

    if (intersection > 0) {
      const dice =
        (2.0 * intersection) / (rawTokens.length + nameTokens.length) + bonus;
      if (dice > bestScore) {
        bestScore = dice;
        bestMatch = p;
      }
    }
  }

  // Require at least 0.60 confidence for auto-match
  if (bestMatch && bestScore >= 0.6) {
    return {
      product: bestMatch,
      confidence: Number(Math.min(1.0, bestScore).toFixed(2)),
    };
  }

  return { product: null, confidence: 0 };
}

/**
 * Detects unit conversion multiplier (e.g. 1 Box = 10 Strip / 100 Tab).
 */
export function detectConversionFactor(
  rawProductName: string,
  rawUnit?: string,
  baseUnitName?: string,
  aiFactor?: number,
  aiPackInfo?: string
): { factor: number; packInfo?: string } {
  if (aiFactor && aiFactor > 1) {
    return { factor: aiFactor, packInfo: aiPackInfo };
  }

  if (!rawUnit || !baseUnitName) {
    return { factor: 1, packInfo: aiPackInfo };
  }

  const cleanUnit = rawUnit.trim().toUpperCase();
  const cleanBase = baseUnitName.trim().toUpperCase();

  if (cleanUnit === cleanBase) {
    return { factor: 1, packInfo: aiPackInfo };
  }

  if (["BOX", "DUS", "KARTON", "PACK", "PAK", "DOS"].includes(cleanUnit)) {
    // 1. Check for 10x10 pattern
    const matchNxN = rawProductName.match(/(\d+)\s*[xX]\s*(\d+)/i);
    if (matchNxN) {
      const n1 = parseInt(matchNxN[1], 10);
      const n2 = parseInt(matchNxN[2], 10);
      if (n1 > 0 && n2 > 0) {
        if (["STRIP", "BLISTER"].includes(cleanBase)) {
          return { factor: n1, packInfo: `${n1} strip x ${n2} tab` };
        }
        if (["TAB", "TABLET", "KAPLET", "KAPSUL", "KAP"].includes(cleanBase)) {
          return { factor: n1 * n2, packInfo: `${n1}x${n2} (${n1 * n2} tablet)` };
        }
        return { factor: n1, packInfo: `${n1}x${n2}` };
      }
    }

    // 2. Check for "ISI 100"
    const matchIsi = rawProductName.match(/isi\s*(\d+)\s*([a-zA-Z]*)/i);
    if (matchIsi) {
      const isiVal = parseInt(matchIsi[1], 10);
      if (isiVal > 1) {
        return { factor: isiVal, packInfo: `isi ${isiVal} ${matchIsi[2] || ""}`.trim() };
      }
    }

    // 3. Check for "10 STRIP" or "100 TAB"
    const matchUnitQty = rawProductName.match(
      /(\d+)\s*(strip|blister|tab|tablet|kaplet|kapsul|sachet|ampul|vial|botol|btl)/i
    );
    if (matchUnitQty) {
      const uQty = parseInt(matchUnitQty[1], 10);
      if (uQty > 1) {
        return { factor: uQty, packInfo: `${uQty} ${matchUnitQty[2]}` };
      }
    }

    // 4. Default 10 if base is Strip
    if (["STRIP", "BLISTER"].includes(cleanBase)) {
      return { factor: 10, packInfo: "Est. 10 strip/box" };
    }
  }

  return { factor: 1, packInfo: aiPackInfo };
}

/**
 * Calculates suggested selling price with pharmacy rounding rules.
 */
export function calculateSaranHargaJual(
  hargaBeli: number,
  marginPercent: number
): number {
  if (hargaBeli <= 0) return 0;
  const marginMultiplier = 1 + marginPercent / 100;
  const basePrice = Math.round(hargaBeli * marginMultiplier);
  const multipliedBy10 = basePrice * 10;

  if (multipliedBy10 <= 10000) {
    const remainder = multipliedBy10 % 1000;
    if (remainder !== 0) {
      const adjustment = (1000 - remainder) / 10;
      return basePrice + adjustment;
    }
  } else if (multipliedBy10 > 10000 && multipliedBy10 <= 50000) {
    const remainder = basePrice % 200;
    if (remainder !== 0) {
      if (remainder >= 100) {
        return basePrice + (200 - remainder);
      } else {
        return basePrice - remainder;
      }
    }
  } else {
    const remainder = basePrice % 1000;
    if (remainder !== 0) {
      return basePrice - remainder;
    }
  }
  return basePrice;
}

function parseIsoDate(dateStr: string | undefined): string {
  if (!dateStr || !dateStr.trim()) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  const trimmed = dateStr.trim();
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // If DD/MM/YYYY or DD-MM-YYYY
  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Matches and enriches raw Gemini extraction with Assist catalog, margin table & HPP analysis.
 */
export function matchAndAnalyzeInvoice(
  raw: RawGeminiInvoiceExtraction,
  distributors: DistributorCandidate[],
  products: CatalogCandidate[],
  marginMappings: MarginMappingItem[],
  attachmentFileName?: string,
  attachmentUrl?: string
): ExtractInvoiceResult {
  const today = parseIsoDate(undefined);
  const invoiceDate = parseIsoDate(raw.invoiceDate);
  const dueDate = raw.dueDate ? parseIsoDate(raw.dueDate) : undefined;
  const receivedDate = today;

  // Smart PPN Detection
  let ppnType: "Include" | "Exclude" = "Include";
  if (raw.ppnType === "Exclude") {
    ppnType = "Exclude";
  } else if (raw.totalPpn && raw.totalPpn > 0) {
    if (raw.grandTotal && raw.subTotal && raw.grandTotal > raw.subTotal) {
      ppnType = "Exclude";
    } else if (!raw.grandTotal || !raw.subTotal) {
      ppnType = "Exclude";
    }
  }

  const purchaseType = raw.purchaseType || (dueDate && dueDate > invoiceDate ? "Tempo" : "Cod");

  // 1. Match Supplier
  const matchedDist = matchSupplier(raw.supplierName, distributors);

  // 2. Margin Map Index
  const marginByCode = new Map<string, number>();
  const marginByName = new Map<string, number>();
  for (const m of marginMappings) {
    const rawMargin = parseFloat(String(m.margin || "").replace("%", ""));
    const val = Number.isFinite(rawMargin) && rawMargin > 0 ? rawMargin : 15;
    if (m.kodeAssist) marginByCode.set(m.kodeAssist.trim().toLowerCase(), val);
    if (m.nama) marginByName.set(normalizeString(m.nama), val);
  }

  const matchedItems: ExtractedInvoiceItem[] = [];
  let matchedProductsCount = 0;
  let priceIncreaseCount = 0;

  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  for (const rawItem of rawItems) {
    const { product: bestProduct, confidence } = findBestProductMatch(
      rawItem.rawProductName,
      products
    );

    if (bestProduct) {
      matchedProductsCount++;
    }

    const expiryDate = parseIsoDate(rawItem.expiryDate);
    const expTime = new Date(expiryDate).getTime();
    const sixMonthsLater = Date.now() + 180 * 24 * 60 * 60 * 1000;
    const isNearExpiry = expTime <= sixMonthsLater;

    const baseUnitName = bestProduct?.unit || rawItem.unitName || "PCS";
    const { factor: conversionFactor, packInfo } = detectConversionFactor(
      rawItem.rawProductName,
      rawItem.unitName,
      baseUnitName,
      rawItem.conversionFactor,
      rawItem.packInfo
    );

    const rawQuantity = Math.max(1, Number(rawItem.quantity) || 1);
    let rawUnitPrice = Number(rawItem.unitPrice) || 0;
    if (rawUnitPrice === 0 && rawItem.totalLinePrice && rawItem.totalLinePrice > 0) {
      rawUnitPrice = Math.round(rawItem.totalLinePrice / rawQuantity);
    }

    const disc1 = Math.min(100, Math.max(0, Number(rawItem.discountPercent1) || 0));
    const disc2 = Math.min(100, Math.max(0, Number(rawItem.discountPercent2) || 0));

    // Converted Base Values
    const convertedQuantity = rawQuantity * conversionFactor;
    const convertedUnitPrice =
      conversionFactor > 1
        ? Number((rawUnitPrice / conversionFactor).toFixed(2))
        : rawUnitPrice;

    const netPricePerUnit = Number(
      (convertedUnitPrice * (1 - disc1 / 100) * (1 - disc2 / 100)).toFixed(2)
    );
    const discountAmount = Number(
      (convertedUnitPrice * convertedQuantity - netPricePerUnit * convertedQuantity).toFixed(2)
    );
    const subtotal = Number(
      (rawItem.totalLinePrice && rawItem.totalLinePrice > 0
        ? rawItem.totalLinePrice
        : netPricePerUnit * convertedQuantity
      ).toFixed(2)
    );

    // Margin & HPP Analysis
    let previousBuyPrice: number | undefined;
    let currentSellPrice: number | undefined;
    let currentMarginPercent: number | undefined;
    let targetMarginPercent: number | undefined;
    let suggestedSellPrice: number | undefined;
    let newSellPrice: number | undefined;
    let isPriceIncreased = false;
    let hppChangePercent: number | undefined;

    if (bestProduct) {
      previousBuyPrice = bestProduct.buyFee || bestProduct.avgHPP || undefined;
      currentSellPrice = bestProduct.sellNormalFee || undefined;

      // Target margin lookup from Firestore mappings
      const targetByCode = bestProduct.code ? marginByCode.get(bestProduct.code.toLowerCase()) : undefined;
      const targetByName = marginByName.get(normalizeString(bestProduct.name));
      targetMarginPercent = targetByCode ?? targetByName ?? 15;

      // Cost basis with PPN
      const costWithPpn = ppnType === "Include" ? netPricePerUnit : netPricePerUnit * 1.11;

      if (previousBuyPrice && previousBuyPrice > 0) {
        if (costWithPpn > previousBuyPrice) {
          isPriceIncreased = true;
          priceIncreaseCount++;
          hppChangePercent = Number(
            (((costWithPpn - previousBuyPrice) / previousBuyPrice) * 100).toFixed(1)
          );
        }
      }

      if (currentSellPrice && currentSellPrice > 0 && costWithPpn > 0) {
        currentMarginPercent = Number(
          (((currentSellPrice - costWithPpn) / currentSellPrice) * 100).toFixed(1)
        );
      }

      suggestedSellPrice = calculateSaranHargaJual(costWithPpn, targetMarginPercent);
      newSellPrice = suggestedSellPrice || currentSellPrice || 0;
    }

    matchedItems.push({
      rawProductName: rawItem.rawProductName,
      matchedProductId: bestProduct?.id,
      matchedProductName: bestProduct?.name,
      matchedCode: bestProduct?.code,
      matchedType: bestProduct?.type,
      isBHP: bestProduct?.isBHP,
      depotId: bestProduct?.depotId,
      medicineId: bestProduct?.medicineId,
      akhpId: bestProduct?.akhpId,
      productMatchConfidence: confidence,
      batchNumber: (rawItem.batchNumber || "").trim().toUpperCase(),
      expiryDate,
      isNearExpiry,
      quantity: convertedQuantity,
      rawQuantity,
      conversionFactor,
      packInfo,
      extractedUnitName: rawItem.unitName,
      matchedUnitName: baseUnitName,
      unitPrice: convertedUnitPrice,
      rawUnitPrice,
      discountPercent1: disc1,
      discountPercent2: disc2,
      discountAmount,
      subtotal,
      netPricePerUnit,
      previousBuyPrice,
      currentSellPrice,
      currentMarginPercent,
      targetMarginPercent,
      suggestedSellPrice,
      newSellPrice,
      isPriceIncreased,
      hppChangePercent,
      originalCatalog: bestProduct?.rawItem,
    });
  }

  // Financial Totals
  const totalBeforeDiscount =
    raw.subTotal ??
    matchedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const totalDiscount =
    raw.totalDiscount ??
    matchedItems.reduce((sum, i) => sum + i.discountAmount, 0);
  let grandTotal =
    raw.grandTotal ?? (totalBeforeDiscount - totalDiscount);
  const totalPpn =
    raw.totalPpn ?? (ppnType === "Exclude" ? grandTotal * 0.11 : 0);
  if (ppnType === "Exclude" && !raw.grandTotal) {
    grandTotal += totalPpn;
  }

  return {
    attachmentFileName,
    attachmentUrl,
    extractedSupplierName: raw.supplierName,
    matchedSupplierId: matchedDist.id,
    matchedSupplierName: matchedDist.name,
    supplierMatchConfidence: matchedDist.confidence,
    invoiceNumber: (raw.invoiceNumber || "").trim(),
    invoiceDate,
    receivedDate,
    dueDate,
    purchaseType,
    ppnType,
    totalBeforeDiscount: Math.round(totalBeforeDiscount),
    totalDiscount: Math.round(totalDiscount),
    totalPpn: Math.round(totalPpn),
    grandTotal: Math.round(grandTotal),
    items: matchedItems,
    totalItemsCount: matchedItems.length,
    matchedProductsCount,
    priceIncreaseCount,
    tokenUsage: raw.tokenUsage,
  };
}
