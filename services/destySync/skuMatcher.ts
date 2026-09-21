import type {
  AssistCatalogItem,
  DestySkuMappingInput,
} from "@/types/destySync";

export interface SkuMatchCandidate {
  catalogItem: AssistCatalogItem;
  score: number; // 0 to 1
  confidence: "high" | "medium" | "low";
  matchReasons: string[];
  suggestedConversionFactor: number;
}

export interface SkuRecommendation {
  destySku: string;
  productName?: string;
  bestMatch?: SkuMatchCandidate;
  candidates: SkuMatchCandidate[];
}

const DOSAGE_REGEX =
  /(?:(?:\b\d+(?:[.,]\d+)?\s*(?:mg|g|gr|ml|mcg|iu|l|kg|ug|iu\/ml|mg\/ml)\b)|(?:\b\d+(?:[.,]\d+)?\s*%))/gi;

const FORM_NORMALIZATION_MAP: Record<string, string> = {
  tab: "TABLET",
  tablet: "TABLET",
  kap: "KAPLET",
  kaplet: "KAPLET",
  cap: "KAPSUL",
  capsule: "KAPSUL",
  kapsul: "KAPSUL",
  btl: "BOTOL",
  botol: "BOTOL",
  fls: "BOTOL",
  flacon: "BOTOL",
  syr: "SIRUP",
  syrup: "SIRUP",
  sirup: "SIRUP",
  strip: "STRIP",
  box: "BOX",
  dus: "BOX",
  kotak: "BOX",
  tube: "TUBE",
  tub: "TUBE",
  crm: "KRIM",
  cream: "KRIM",
  krim: "KRIM",
  salep: "SALEP",
  ointment: "SALEP",
  gel: "GEL",
  tetes: "DROP",
  drop: "DROP",
  drops: "DROP",
  sach: "SACHET",
  sachet: "SACHET",
  amp: "AMPUL",
  ampul: "AMPUL",
  vial: "VIAL",
  supp: "SUPP",
  suppositoria: "SUPP",
  infus: "INFUS",
  inj: "INJEKSI",
  injeksi: "INJEKSI",
};

// Distinct dosage forms that cannot cross-match (e.g. tablet vs syrup)
const PHARMA_FORMS = new Set([
  "TABLET",
  "KAPLET",
  "KAPSUL",
  "SIRUP",
  "KRIM",
  "SALEP",
  "GEL",
  "DROP",
  "SUPP",
  "INJEKSI",
  "INFUS",
]);

const FORM_REGEX =
  /\b(strip|box|dus|kotak|btl|botol|tab|tablet|kap|kaplet|cap|capsule|kapsul|tube|tub|fls|flac|flacon|amp|ampul|vial|sach|sachet|supp|suppositoria|roll|pcs|pot|syrup|sirup|drop|tetes|salep|cream|krim|gel|infus|inj|injeksi|lotion|serum)\b/gi;

const PACK_QTY_REGEX =
  /(?:isi\s*|box\s*|strip\s*|@\s*|x\s*)(\d+)\s*(?:strip|tab|tablet|kaplet|sachet|ampul|pcs|biji|kapsul|fls|botol)?/i;

const COMMON_NOISE_WORDS = new Set([
  "OBAT",
  "GENERIK",
  "GENERIC",
  "APOTEK",
  "ASLI",
  "ORIGINAL",
  "OFFICIAL",
  "STORE",
  "BPOM",
  "RESMI",
  "ISI",
  "PCS",
  "PER",
  "DAN",
  "ATAU",
  "UNTUK",
  "KESEHATAN",
  "PRODUK",
]);

const ABBREVIATION_MAP: Record<string, string> = {
  PCT: "PARACETAMOL",
  PARA: "PARACETAMOL",
  AMX: "AMOXICILLIN",
  AMOX: "AMOXICILLIN",
  CTM: "CHLORPHENIRAMINE",
  GG: "GLYCERYL",
  OBH: "BATUK",
  IBU: "IBUPROFEN",
  MSK: "MASKER",
  ALCO: "ALCOHOL",
};

export function cleanCode(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function extractDosages(text: string): string[] {
  const matches = text.match(DOSAGE_REGEX) || [];
  return matches.map((d) =>
    d
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(",", "."),
  );
}

export function extractForms(text: string): string[] {
  const matches = text.match(FORM_REGEX) || [];
  return Array.from(
    new Set(
      matches
        .map((f) => f.toLowerCase())
        .map((f) => FORM_NORMALIZATION_MAP[f] || f.toUpperCase()),
    ),
  );
}

export function extractPackQuantity(text: string): number | null {
  const match = text.match(PACK_QTY_REGEX);
  if (match && match[1]) {
    const qty = parseInt(match[1], 10);
    if (Number.isFinite(qty) && qty > 0 && qty <= 1000) {
      return qty;
    }
  }
  return null;
}

export function tokenizeText(text: string): string[] {
  return String(text || "")
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !COMMON_NOISE_WORDS.has(w))
    .map((w) => ABBREVIATION_MAP[w] || w);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? row[j - 1]
          : Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function tokenSimilarity(t1: string, t2: string): number {
  if (t1 === t2) return 1;
  const maxLen = Math.max(t1.length, t2.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(t1, t2);
  return 1 - dist / maxLen;
}

export function calculateTokensMatchScore(
  targetTokens: string[],
  catalogTokens: string[],
): { score: number; matchedWords: string[] } {
  if (!targetTokens.length || !catalogTokens.length) {
    return { score: 0, matchedWords: [] };
  }

  // Deduplicate tokens
  const uniqueTarget = Array.from(new Set(targetTokens));
  const uniqueCatalog = Array.from(new Set(catalogTokens));

  let matchedScoreSum = 0;
  const matchedWords: string[] = [];

  for (const tToken of uniqueTarget) {
    let bestTokenScore = 0;
    let bestMatchedToken = "";

    for (const cToken of uniqueCatalog) {
      const sim = tokenSimilarity(tToken, cToken);
      if (sim > bestTokenScore) {
        bestTokenScore = sim;
        bestMatchedToken = cToken;
      }
    }

    if (bestTokenScore >= 0.8) {
      matchedScoreSum += bestTokenScore;
      matchedWords.push(bestMatchedToken);
    }
  }

  // Weighted score focusing on coverage of target terms while maintaining balance
  const targetCoverage = uniqueTarget.length > 0 ? matchedScoreSum / uniqueTarget.length : 0;
  const dice = (2 * matchedScoreSum) / (uniqueTarget.length + uniqueCatalog.length);
  const blendedScore = targetCoverage * 0.7 + dice * 0.3;

  return {
    score: Math.min(1, Math.max(0, blendedScore)),
    matchedWords,
  };
}

/**
 * Evaluates how well an AssistCatalogItem matches a given Desty SKU and Product Name.
 */
export function matchCatalogItem(
  destySku: string,
  productName: string | undefined,
  catalogItem: AssistCatalogItem,
): SkuMatchCandidate | null {
  const sku = (destySku || "").trim();
  const name = (productName || "").trim();
  const cCode = (catalogItem.code || "").trim();
  const cName = (catalogItem.name || "").trim();

  if (!cCode && !cName) return null;

  const reasons: string[] = [];
  let score = 0;
  let codeMatched = false;

  const cleanTargetSku = cleanCode(sku);
  const cleanTargetCode = cleanCode(cCode);

  // 1. Exact Code Match
  if (cleanTargetSku && cleanTargetCode && cleanTargetSku === cleanTargetCode) {
    score = 1.0;
    codeMatched = true;
    reasons.push(`Kode SKU persis cocok (${cCode})`);
  } else {
    // 2. Code Prefix/Suffix stripping match
    // e.g. SKU "OBT-001-BOX" vs code "OBT-001" or "OBT001"
    const strippedTargetSku = cleanCode(
      sku.replace(/-(?:box|strip|btl|botol|tab|pcs|tube|dus|fls|\d+tab|\d+str|\d+s|\d+pcs)$/i, ""),
    );
    const strippedCatalogCode = cleanCode(
      cCode.replace(/-(?:box|strip|btl|botol|tab|pcs|tube|dus|fls|\d+tab|\d+str|\d+s|\d+pcs)$/i, ""),
    );

    if (
      strippedTargetSku &&
      strippedCatalogCode &&
      strippedTargetSku === strippedCatalogCode
    ) {
      score = 0.94;
      codeMatched = true;
      reasons.push(`Kode dasar produk cocok (${cCode})`);
    } else if (
      cleanTargetSku &&
      cleanTargetCode &&
      (cleanTargetSku.startsWith(cleanTargetCode) ||
        cleanTargetCode.startsWith(cleanTargetSku)) &&
      Math.min(cleanTargetSku.length, cleanTargetCode.length) >= 4
    ) {
      score = 0.88;
      codeMatched = true;
      reasons.push(`Awalan kode produk cocok (${cCode})`);
    }
  }

  // 3. Name & Text Token Analysis
  const fullTargetText = `${sku} ${name}`.trim();
  const targetTokens = tokenizeText(fullTargetText);
  const catalogTokens = tokenizeText(`${cCode} ${cName}`);

  const tokenMatch = calculateTokensMatchScore(targetTokens, catalogTokens);

  if (!codeMatched) {
    score = tokenMatch.score * 0.85;
    if (tokenMatch.matchedWords.length > 0) {
      reasons.push(`Kata kunci cocok: ${tokenMatch.matchedWords.slice(0, 4).join(", ")}`);
    }
  } else if (tokenMatch.score > 0.4) {
    score = Math.min(1.0, score + 0.05);
  }

  // 4. Dosage Extraction & Verification
  const targetDosages = extractDosages(fullTargetText);
  const catalogDosages = extractDosages(`${cCode} ${cName}`);

  if (targetDosages.length > 0 && catalogDosages.length > 0) {
    const hasCommonDosage = targetDosages.some((td) => catalogDosages.includes(td));
    if (hasCommonDosage) {
      score = Math.min(1.0, score + 0.15);
      reasons.push(`Dosis cocok (${targetDosages.filter((td) => catalogDosages.includes(td)).join(", ")})`);
    } else {
      // Severe penalty for conflicting dosages! (e.g. 500mg vs 250mg)
      score = Math.max(0, score - 0.45);
      reasons.push(`Perhatian: Dosis berbeda (${targetDosages.join("/")} vs ${catalogDosages.join("/")})`);
    }
  }

  // 5. Form / Packaging Verification
  const targetForms = extractForms(fullTargetText);
  const catalogForms = extractForms(`${cCode} ${cName} ${catalogItem.unit || ""}`);

  const targetPharma = targetForms.filter((f) => PHARMA_FORMS.has(f));
  const catalogPharma = catalogForms.filter((f) => PHARMA_FORMS.has(f));

  if (targetPharma.length > 0 && catalogPharma.length > 0) {
    const hasCommonPharma = targetPharma.some((tf) => catalogPharma.includes(tf));
    if (hasCommonPharma) {
      score = Math.min(1.0, score + 0.10);
      reasons.push(`Bentuk sediaan cocok (${targetPharma.filter((tf) => catalogPharma.includes(tf)).join(", ")})`);
    } else {
      // Conflicting pharmaceutical formulation (e.g. Tablet vs Syrup)
      score = Math.max(0, score - 0.35);
      reasons.push(`Perhatian: Bentuk sediaan berbeda (${targetPharma.join("/")} vs ${catalogPharma.join("/")})`);
    }
  } else if (targetForms.length > 0 && catalogForms.length > 0) {
    const hasCommonForm = targetForms.some((tf) => catalogForms.includes(tf));
    if (hasCommonForm) {
      score = Math.min(1.0, score + 0.05);
      reasons.push(`Kemasan cocok (${targetForms.filter((tf) => catalogForms.includes(tf)).join(", ")})`);
    }
  }

  // Determine conversion factor
  let suggestedConversionFactor = 1;
  const targetPackQty = extractPackQuantity(fullTargetText);
  const catalogUnitLower = (catalogItem.unit || "").toLowerCase();

  if (targetPackQty && targetPackQty > 1) {
    if (
      catalogUnitLower === "tablet" ||
      catalogUnitLower === "tab" ||
      catalogUnitLower === "kaplet" ||
      catalogUnitLower === "strip" ||
      catalogUnitLower === "sachet" ||
      catalogUnitLower === "pcs"
    ) {
      suggestedConversionFactor = targetPackQty;
      reasons.push(`Faktor konversi terdeteksi: 1 pack = ${targetPackQty} ${catalogItem.unit}`);
    }
  }

  if (score < 0.35) {
    return null;
  }

  const confidence: "high" | "medium" | "low" =
    score >= 0.70 ? "high" : score >= 0.45 ? "medium" : "low";

  return {
    catalogItem,
    score: Math.round(score * 100) / 100,
    confidence,
    matchReasons: reasons,
    suggestedConversionFactor,
  };
}

/**
 * Finds the best Assist Catalog matches for an unmapped Desty SKU.
 */
export function recommendMatchesForSku(
  destySku: string,
  productName: string | undefined,
  catalog: AssistCatalogItem[],
  maxCandidates: number = 5,
): SkuRecommendation {
  const candidates: SkuMatchCandidate[] = [];

  for (const item of catalog) {
    const match = matchCatalogItem(destySku, productName, item);
    if (match) {
      candidates.push(match);
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.catalogItem.name.localeCompare(b.catalogItem.name));
  const topCandidates = candidates.slice(0, maxCandidates);

  return {
    destySku,
    productName,
    bestMatch: topCandidates[0] || undefined,
    candidates: topCandidates,
  };
}

/**
 * Builds a ready-to-save DestySkuMappingInput from a recommended match.
 */
export function createMappingFromRecommendation(
  destySku: string,
  candidate: SkuMatchCandidate,
  defaultDepotId: string = "68b7af1e072af0c71ed65d3a",
): DestySkuMappingInput & { depotId?: string } {
  return {
    destySku: destySku.trim(),
    assistCode: candidate.catalogItem.code.trim(),
    assistType: candidate.catalogItem.type,
    assistId: candidate.catalogItem.id.trim(),
    assistName: candidate.catalogItem.name.trim(),
    assistUnit: candidate.catalogItem.unit || "Pcs",
    destyUnit: candidate.catalogItem.unit || "Pcs",
    depotId: candidate.catalogItem.depotId || defaultDepotId,
    conversionFactor: candidate.suggestedConversionFactor || 1,
    active: true,
  };
}
