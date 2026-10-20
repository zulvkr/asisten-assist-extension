import type {
  AssistCatalogItem,
  AssistCatalogType,
  DestySkuMapping,
} from "@/types/destySync";
import type { MarginMappingItem, MarginTableRow } from "@/services/marginStorage";

/**
 * Clean domain entity representing a product from Clinica Assist
 * after being processed and enriched by the Anti-Corruption Layer (ACL).
 *
 * Assist itself never stores marketplace/e-commerce SKUs or margin targets.
 * The ACL enriches raw Assist records with our domain metadata persisted in Firebase.
 */
export interface CleanAssistProduct {
  id: string;
  code: string;
  name: string;
  type: AssistCatalogType;
  unit: string;
  stock: number;
  buyFee?: number;
  sellNormalFee?: number;
  avgHPP?: number;
  depotId?: string;

  // Enriched metadata from Firebase (margin_mappings / desty_sku_mappings)
  sku: string;
  skus: string[];
  destyMappings: DestySkuMapping[];
  hasCustomSku: boolean;
  margin: string;
  batasWarningStok?: string;
  matikanWarningStok?: boolean;

  // Mapping & conversion configuration
  conversionFactor: number;
  isMapped: boolean;
  destyUnit?: string;
}

export interface CleanProductLookup {
  bySku: Map<string, CleanAssistProduct>;
  byCode: Map<string, CleanAssistProduct>;
  byId: Map<string, CleanAssistProduct>;
  byName: Map<string, CleanAssistProduct>;
  stockBySku: Map<string, number>;
  stockByCode: Map<string, number>;
  stockById: Map<string, number>;
}

export interface AssistProductAclContext {
  marginMappings?: (MarginMappingItem | MarginTableRow | any[])[];
  destyMappings?: DestySkuMapping[];
}

function normalizeKey(val: unknown): string {
  if (typeof val !== "string") return "";
  return val.trim().toUpperCase();
}

/**
 * Normalizes a margin record from either MarginMappingItem object or legacy 2D row array:
 * [0] kodeAssist, [1] nama, [2] margin, [3] batasWarningStok, [4] matikanWarningStok, [5] sku
 */
function extractMarginMetadata(
  item: MarginMappingItem | MarginTableRow | any[],
): {
  code: string;
  margin: string;
  sku: string;
  batasWarningStok?: string;
  matikanWarningStok?: boolean;
} {
  if (Array.isArray(item)) {
    const code = String(item[0] ?? "").trim();
    const margin = String(item[2] ?? "").trim();
    const batas = item[3] !== undefined && item[3] !== null ? String(item[3]).trim() : undefined;
    const matikanRaw = item[4];
    const matikan = matikanRaw === true || matikanRaw === "true";
    const sku = String(item[5] ?? "").trim();
    return { code, margin, sku, batasWarningStok: batas, matikanWarningStok: matikan };
  }

  const obj = item as MarginMappingItem;
  const code = String(obj.kodeAssist ?? "").trim();
  const margin = String(obj.margin ?? "").trim();
  const sku = String(obj.sku ?? "").trim();
  const matikan = obj.matikanWarningStok === true || obj.matikanWarningStok === "true";
  return {
    code,
    margin,
    sku,
    batasWarningStok: obj.batasWarningStok !== undefined ? String(obj.batasWarningStok).trim() : undefined,
    matikanWarningStok: matikan,
  };
}

/**
 * Anti-Corruption Layer (ACL) Cleanser:
 * Transforms raw Assist catalog records into clean, validated domain products
 * enriched with Firebase metadata (SKU from margin_mappings / desty_sku_mappings, margins, warnings).
 */
export function cleanseAssistCatalog(
  rawCatalog: (AssistCatalogItem | Record<string, any>)[],
  context: AssistProductAclContext = {},
): CleanAssistProduct[] {
  const { marginMappings = [], destyMappings = [] } = context;

  // 1. Index Firebase margin_mappings by Assist code
  const marginByCode = new Map<
    string,
    { margin: string; sku: string; batasWarningStok?: string; matikanWarningStok?: boolean }
  >();
  for (const m of marginMappings) {
    if (!m) continue;
    const extracted = extractMarginMetadata(m);
    if (extracted.code) {
      marginByCode.set(normalizeKey(extracted.code), extracted);
    }
  }

  // 2. Index Firebase desty_sku_mappings by Assist code & Assist ID (supports 1 Assist -> Many Desty)
  const destyByCode = new Map<string, DestySkuMapping[]>();
  const destyById = new Map<string, DestySkuMapping[]>();
  for (const dm of destyMappings) {
    if (!dm || dm.active === false) continue;
    if (dm.assistCode) {
      const codeKey = normalizeKey(dm.assistCode);
      const list = destyByCode.get(codeKey) || [];
      list.push(dm);
      destyByCode.set(codeKey, list);
    }
    if (dm.assistId) {
      const idKey = dm.assistId.trim();
      const list = destyById.get(idKey) || [];
      list.push(dm);
      destyById.set(idKey, list);
    }
  }

  // 3. Clean and enrich each catalog item
  const cleanedProducts: CleanAssistProduct[] = [];

  for (const raw of rawCatalog) {
    if (!raw) continue;

    const id = String(raw.id || raw.medicineId || raw.akhpId || "").trim();
    const code = String(raw.code || raw.itemCode || raw.kodeObat || raw.kode || "").trim();
    const name = String(raw.name || raw.medName || raw.itemName || "").trim();
    if (!id && !code && !name) continue;

    const codeKey = normalizeKey(code);
    const idKey = id;

    // Collect ALL matching Desty mappings for this Assist product (1:N support)
    const matchingDestyMaps = [
      ...(idKey ? destyById.get(idKey) || [] : []),
      ...(codeKey ? destyByCode.get(codeKey) || [] : []),
    ];
    const uniqueDestyMaps = new Map<string, DestySkuMapping>();
    for (const m of matchingDestyMaps) {
      if (m.destySku) {
        uniqueDestyMaps.set(m.destySku.trim().toUpperCase(), m);
      }
    }
    const allDestyMaps = Array.from(uniqueDestyMaps.values());

    // Check Firebase margin mapping
    const marginMeta = codeKey ? marginByCode.get(codeKey) : undefined;

    // Collect ALL associated SKUs (from desty_sku_mappings, margin_mappings, and raw item)
    const skusSet = new Set<string>();
    for (const m of allDestyMaps) {
      if (m.destySku && m.destySku.trim()) skusSet.add(m.destySku.trim());
    }
    if (marginMeta?.sku && marginMeta.sku.trim()) {
      skusSet.add(marginMeta.sku.trim());
    }
    if (raw.sku && String(raw.sku).trim()) {
      skusSet.add(String(raw.sku).trim());
    }
    if (Array.isArray(raw.skus)) {
      for (const s of raw.skus) {
        if (s && String(s).trim()) skusSet.add(String(s).trim());
      }
    }

    const allSkus = Array.from(skusSet);
    const primarySku = allSkus[0] || "";
    const primaryMapping = allDestyMaps[0];
    const hasCustomSku = allSkus.length > 0;

    const conversionFactor = primaryMapping && Number(primaryMapping.conversionFactor) > 0
      ? Number(primaryMapping.conversionFactor)
      : 1;

    const isMapped = Boolean(allDestyMaps.length > 0 || hasCustomSku);

    const stock = typeof raw.stock === "number"
      ? raw.stock
      : typeof raw.stockTotal === "number"
        ? raw.stockTotal
        : 0;

    const unit = String(raw.unit || raw.medUnit || "Pcs").trim() || "Pcs";
    const type: AssistCatalogType = raw.type === "akhp" || raw.akhpId ? "akhp" : "prescription";

    cleanedProducts.push({
      id: id || code || name,
      code,
      name: name || code || id,
      type,
      unit,
      stock,
      buyFee: typeof raw.buyFee === "number" ? raw.buyFee : undefined,
      sellNormalFee: typeof raw.sellNormalFee === "number" ? raw.sellNormalFee : undefined,
      avgHPP: typeof raw.avgHPP === "number" ? raw.avgHPP : undefined,
      depotId: raw.depotId ? String(raw.depotId).trim() : undefined,

      sku: primarySku,
      skus: allSkus,
      destyMappings: allDestyMaps,
      hasCustomSku,
      margin: marginMeta?.margin || raw.margin || "",
      batasWarningStok: marginMeta?.batasWarningStok ?? raw.batasWarningStok,
      matikanWarningStok: marginMeta?.matikanWarningStok ?? raw.matikanWarningStok,

      conversionFactor,
      isMapped,
      destyUnit: primaryMapping?.destyUnit || undefined,
    });
  }

  return cleanedProducts;
}

/**
 * Builds fast O(1) multi-index lookup table for cleaned Assist products.
 */
export function buildCleanProductLookup(
  products: (CleanAssistProduct | AssistCatalogItem)[],
): CleanProductLookup {
  const bySku = new Map<string, CleanAssistProduct>();
  const byCode = new Map<string, CleanAssistProduct>();
  const byId = new Map<string, CleanAssistProduct>();
  const byName = new Map<string, CleanAssistProduct>();
  const stockBySku = new Map<string, number>();
  const stockByCode = new Map<string, number>();
  const stockById = new Map<string, number>();

  for (const p of products) {
    const item = p as CleanAssistProduct;
    const stock = typeof item.stock === "number" ? item.stock : 0;

    // Index by Assist ID
    if (item.id) {
      const idTrim = item.id.trim();
      byId.set(idTrim, item);
      byId.set(idTrim.toUpperCase(), item);
      stockById.set(idTrim, stock);
      stockById.set(idTrim.toUpperCase(), stock);
    }

    // Index by Assist Code (e.g. MS001238)
    if (item.code) {
      const codeKey = normalizeKey(item.code);
      byCode.set(codeKey, item);
      stockByCode.set(codeKey, stock);
    }

    // Index by ALL associated SKUs (supports 1 Assist Product -> Many Desty SKUs)
    const skusToIndex = item.skus && item.skus.length > 0 ? item.skus : (item.sku ? [item.sku] : []);
    for (const s of skusToIndex) {
      if (s && s.trim().length > 0) {
        const skuKey = normalizeKey(s);
        bySku.set(skuKey, item);
        stockBySku.set(skuKey, stock);
      }
    }

    // Index by Name
    if (item.name) {
      const nameKey = normalizeKey(item.name);
      byName.set(nameKey, item);
    }
  }

  return {
    bySku,
    byCode,
    byId,
    byName,
    stockBySku,
    stockByCode,
    stockById,
  };
}
