import { buildAssistHeaders } from "@/services/integration/assistRequest";
import type {
  AssistRepairStockOpnameItem,
  AssistRepairResponse,
  StockOpnameItemRow,
} from "@/types/stockOpname";

export interface FetchStockOpnameMasterParams {
  apiBaseUrl: string;
  token: string;
  hospitalId: string;
  depotName?: string;
  fetchImpl?: typeof fetch;
}

export interface AssistRawStockDepotRow {
  id: string; // depotStockId
  name: string; // depotName (e.g. "Apotek")
  stock: number;
  unit?: string;
  KMedicineStocks?: {
    id?: string;
    code?: string;
    medOrAkhpName?: string;
    unit?: string;
    dosage?: string;
    stockTotal?: number;
  };
}

function normalizeText(val: unknown): string {
  return typeof val === "string" ? val.trim() : typeof val === "number" ? String(val) : "";
}

/**
 * Mengambil master stok obat atau BHP dari endpoint Assist getAllData.
 */
async function fetchDepotStockByType(
  params: FetchStockOpnameMasterParams,
  type: "medicine" | "akhp",
): Promise<StockOpnameItemRow[]> {
  const fetcher = params.fetchImpl ?? fetch;
  const baseUrl = params.apiBaseUrl.trim().replace(/\/+$/, "");
  const depotName = params.depotName || "Apotek";

  const url = new URL(`${baseUrl}/KStockDepots/getAllData`);
  url.searchParams.set("hospitalId", params.hospitalId.trim());
  url.searchParams.set("depotName", depotName);
  url.searchParams.set("medOrAkhpName", "");
  url.searchParams.set("type", type);

  const res = await fetcher(url.toString(), {
    method: "GET",
    headers: buildAssistHeaders(params.token),
    credentials: "include",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Gagal mengambil data stok Assist (${type}): HTTP ${res.status} ${errorText}`.trim());
  }

  const data = (await res.json()) as AssistRawStockDepotRow[];
  if (!Array.isArray(data)) return [];

  const rows: StockOpnameItemRow[] = [];
  for (const item of data) {
    const kmed = item.KMedicineStocks || {};
    const medId = normalizeText(kmed.id);
    const depotStockId = normalizeText(item.id);
    if (!medId || !depotStockId) continue;

    rows.push({
      id: medId,
      depotStockId,
      depotName: normalizeText(item.name) || depotName,
      code: normalizeText(kmed.code),
      name: normalizeText(kmed.medOrAkhpName) || medId,
      unit: normalizeText(item.unit) || normalizeText(kmed.unit) || "-",
      itemValue: type,
      systemQuantity: typeof item.stock === "number" ? item.stock : Number(item.stock) || 0,
      countedQuantity: null,
      variance: null,
      reason: "",
      isCounted: false,
    });
  }

  return rows;
}

/**
 * Mengambil seluruh data katalog obat dan BHP dari Assist untuk persiapan Stock Opname.
 */
export async function fetchAssistStockOpnameMaster(
  params: FetchStockOpnameMasterParams,
): Promise<StockOpnameItemRow[]> {
  if (!params.token.trim()) throw new Error("Token Assist kosong.");
  if (!params.hospitalId.trim()) throw new Error("Hospital ID Assist kosong.");

  const [medicineRows, akhpRows] = await Promise.all([
    fetchDepotStockByType(params, "medicine"),
    fetchDepotStockByType(params, "akhp"),
  ]);

  return [...medicineRows, ...akhpRows];
}

export interface SubmitStockOpnameRepairParams {
  apiBaseUrl: string;
  token: string;
  items: AssistRepairStockOpnameItem[];
  batchSize?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Mengirim penyesuaian stok opname ke Assist melalui endpoint resmi: PUT /KTxes/repairStockOpname
 */
export async function submitAssistStockOpnameRepair(
  params: SubmitStockOpnameRepairParams,
): Promise<{ successCount: number; listItemIds: string[]; errors: string[] }> {
  const fetcher = params.fetchImpl ?? fetch;
  const baseUrl = params.apiBaseUrl.trim().replace(/\/+$/, "");
  const batchSize = params.batchSize || 50;
  const items = params.items;

  if (items.length === 0) {
    return { successCount: 0, listItemIds: [], errors: [] };
  }

  const allItemIds: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    try {
      const res = await fetcher(`${baseUrl}/KTxes/repairStockOpname`, {
        method: "PUT",
        headers: {
          ...buildAssistHeaders(params.token),
          "Content-Type": "application/json;charset=UTF-8",
        },
        credentials: "include",
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Batch ${i / batchSize + 1} gagal (HTTP ${res.status}): ${errText}`.trim());
      }

      const payload = (await res.json()) as AssistRepairResponse;
      if (payload.status === "success" && Array.isArray(payload.listItemIds)) {
        allItemIds.push(...payload.listItemIds);
      } else if (payload.status === "error") {
        errors.push(payload.message || `Error pada batch ${i / batchSize + 1}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
    }
  }

  return {
    successCount: allItemIds.length,
    listItemIds: allItemIds,
    errors,
  };
}
