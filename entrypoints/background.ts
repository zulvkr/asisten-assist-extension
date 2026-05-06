import type { PemasukanData } from "@/types/PemasukanData";
import {
  buildDestyStockBySku,
  fetchDestyOmniStock,
} from "@/composables/destyOmniStockApi";
import {
  compareStockLevels,
  type StockComparisonRow,
} from "@/utils/compareStockLevels";
import { getAssistSoldItemsByDate } from "@/utils/getSoldItemsByDate";
import { buildPemasukanRequest } from "@/utils/pemasukanApi";

const ASSIST_API_BASE = "https://api-clinica.assist.id/api";
const HOSPITAL_ID = "6874f9569abc98f9c645b330";
const SHEET_API_KEY = "AIzaSyBs2KxfVTHAA8ccLG7cc4lQVqwWOzsMOTE";
const SHEET_SPREADSHEET_ID = "1e1Dx9ssIJYDQYnMCygwMS2RfX3WxXF7aN9nvV9995wA";
const SHEET_RANGE = "TabelMargin";

interface FetchStockComparisonPayload {
  startDate?: string;
  endDate?: string;
  source?: "assist" | "desty" | "both";
  assistToken?: string;
  destyToken?: string;
  destyTenantId?: string;
  destyMasterWarehouseId?: string;
}

interface MarginSkuRow {
  kodeObat: string;
  namaObat: string;
  sku: string;
}

interface AssistStockItem {
  id?: string;
  code?: string;
  stockTotal?: number;
}

async function fetchAssistPemasukan(
  startDate: string,
  endDate: string,
  token: string,
): Promise<PemasukanData[]> {
  const { url } = buildPemasukanRequest({
    tanggalMin: startDate,
    tanggalMax: endDate,
    limit: 1000,
    skip: 0,
  });

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Authorization: token,
      Priority: "u=1, i",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const errorMessage = errorBody?.trim()
      ? errorBody.slice(0, 200)
      : `Gagal mengambil data pemasukan: ${response.status}`;
    throw new Error(errorMessage);
  }

  const payload = (await response.json()) as { result?: PemasukanData[] };
  return payload?.result ?? [];
}

async function fetchMarginSkuRows(): Promise<MarginSkuRow[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_SPREADSHEET_ID}/values/${encodeURIComponent(
    SHEET_RANGE,
  )}?key=${SHEET_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengambil data SKU margin: ${response.status}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  const rows = data.values ?? [];

  return rows.map((row) => ({
    kodeObat: String(row[0] ?? "").trim(),
    namaObat: String(row[1] ?? "").trim(),
    sku: String(row[5] ?? "").trim(),
  }));
}

async function fetchAssistStockItems(
  token: string,
): Promise<AssistStockItem[]> {
  const url = new URL(`${ASSIST_API_BASE}/KMedicineStocks/getList`);
  url.searchParams.append("hospitalId", HOSPITAL_ID);
  url.searchParams.append("fieldName", "medName");
  url.searchParams.append("skip", "0");
  url.searchParams.append("limit", "5000");

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Authorization: token,
      Priority: "u=1, i",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
    },
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil stok Assist: ${response.status}`);
  }

  const payload = (await response.json()) as { data?: AssistStockItem[] };
  return payload.data ?? [];
}

function buildAssistStockByMedicineId(
  stockItems: AssistStockItem[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of stockItems) {
    const id = String(item.id ?? "").trim();
    if (id) {
      result[id] = Number(item.stockTotal ?? 0);
    }
  }
  return result;
}

function buildKodeObatByMedicineId(
  stockItems: AssistStockItem[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of stockItems) {
    const id = String(item.id ?? "").trim();
    const code = String(item.code ?? "").trim();
    if (id && code) {
      result[id] = code;
    }
  }
  return result;
}

async function handleFetchStockComparison(
  payload: FetchStockComparisonPayload,
): Promise<
  | { ok: true; data: StockComparisonRow[]; warnings: string[] }
  | { ok: false; error: string }
> {
  const startDate =
    typeof payload.startDate === "string" ? payload.startDate : "";
  const endDate = typeof payload.endDate === "string" ? payload.endDate : "";
  const source = payload.source ?? "assist";
  const assistToken = payload.assistToken?.trim() ?? "";
  const destyToken = payload.destyToken?.trim() ?? "";
  const destyTenantId = payload.destyTenantId?.trim() ?? "";
  const destyMasterWarehouseId = payload.destyMasterWarehouseId?.trim() ?? "";

  if (!startDate || !endDate) {
    return {
      ok: false,
      error: "Rentang tanggal wajib diisi.",
    };
  }

  if (!assistToken) {
    return {
      ok: false,
      error:
        "Token Assist tidak tersedia. Pastikan tab clinica.assist.id sedang aktif.",
    };
  }

  try {
    const [pemasukanData, marginRows, stockItems] = await Promise.all([
      fetchAssistPemasukan(startDate, endDate, assistToken),
      fetchMarginSkuRows(),
      fetchAssistStockItems(assistToken),
    ]);

    const soldResult = getAssistSoldItemsByDate(pemasukanData, {
      includeOnlyPaidOff: true,
    });

    const assistStockByMedicineId = buildAssistStockByMedicineId(stockItems);
    const kodeObatByMedicineId = buildKodeObatByMedicineId(stockItems);

    // Kode Obat is Assist metadata and is used only as a bridge key to read SKU from marginData.
    const normalizeCode = (value: string): string => value.trim().toUpperCase();
    const skuByKodeObat = new Map<string, string>();
    for (const row of marginRows) {
      if (row.kodeObat && row.sku) {
        skuByKodeObat.set(normalizeCode(row.kodeObat), row.sku.trim());
      }
    }

    let missingSkuMappingCount = 0;
    let missingKodeObatCount = 0;
    for (const item of soldResult.soldItems) {
      const kodeObat = kodeObatByMedicineId[item.medicineId] ?? "";
      if (!kodeObat) {
        missingKodeObatCount += 1;
        continue;
      }

      const sku = skuByKodeObat.get(normalizeCode(kodeObat));
      if (sku) {
        item.sku = sku;
      } else {
        missingSkuMappingCount += 1;
      }
    }

    let destyStockBySku: Record<string, number | null> | undefined;
    const warnings: string[] = [];

    const shouldUseDesty = source === "desty" || source === "both";
    if (shouldUseDesty) {
      const skus = Array.from(
        new Set(
          soldResult.soldItems
            .map((item) => item.sku?.trim() ?? "")
            .filter((sku) => Boolean(sku)),
        ),
      );

      if (!destyToken) {
        warnings.push(
          "Token Desty tidak tersedia. Hasil tetap ditampilkan dari Assist.",
        );
      } else if (skus.length === 0) {
        warnings.push(
          "Tidak ada SKU yang bisa dipakai untuk sinkronisasi Desty pada rentang ini.",
        );
      } else {
        try {
          const destyItems = await fetchDestyOmniStock({
            token: destyToken,
            skus,
            tenantId: destyTenantId,
            masterWarehouseId: destyMasterWarehouseId,
          });
          destyStockBySku = buildDestyStockBySku(destyItems);
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `Gagal mengambil stok Desty: ${error.message}`
              : "Gagal mengambil stok Desty. Hasil tetap ditampilkan dari Assist.",
          );
        }
      }
    }

    const rows = compareStockLevels({
      soldItems: soldResult.soldItems,
      assistStockByMedicineId,
      kodeObatByMedicineId,
      destyStockBySku,
    });

    if (soldResult.skippedByType > 0) {
      warnings.push(
        `${soldResult.skippedByType} item dilewati karena tipe transaksi tidak termasuk perhitungan stok.`,
      );
    }
    if (soldResult.missingMedicineId > 0) {
      warnings.push(
        `${soldResult.missingMedicineId} item tanpa medicineId tidak bisa dicocokkan ke stok Assist dan ditandai unknown.`,
      );
    }
    if (missingKodeObatCount > 0) {
      warnings.push(
        `${missingKodeObatCount} item tidak punya kodeObat dari Assist, sehingga SKU margin tidak bisa dicari.`,
      );
    }
    if (missingSkuMappingCount > 0) {
      warnings.push(
        `${missingSkuMappingCount} item tidak menemukan pasangan SKU di marginData berdasarkan kodeObat Assist.`,
      );
    }

    return {
      ok: true,
      data: rows,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menyiapkan data perbandingan stok.",
    };
  }
}

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) {
      return;
    }

    if (message.type === "FETCH_STOCK_COMPARISON") {
      (async () => {
        const result = await handleFetchStockComparison(
          (message.payload ?? {}) as FetchStockComparisonPayload,
        );
        sendResponse(result);
      })();

      return true;
    }

    if (message.type !== "FETCH_PEMASUKAN_DATA") {
      return;
    }

    const url = message.payload?.url;
    const token = message.payload?.token ?? "";

    if (typeof url !== "string") {
      sendResponse({
        ok: false,
        error: "Permintaan pemasukan tidak valid.",
      });
      return false;
    }

    (async () => {
      try {
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            Authorization: token,
            Priority: "u=1, i",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
          },
        });

        if (!response.ok) {
          const errorBody = await response.text();
          const errorMessage = errorBody?.trim()
            ? errorBody.slice(0, 200)
            : `Gagal mengambil data pemasukan: ${response.status}`;
          sendResponse({
            ok: false,
            status: response.status,
            error: errorMessage,
          });
          return;
        }

        const payload = (await response.json()) as {
          result?: PemasukanData[];
        };

        sendResponse({
          ok: true,
          status: response.status,
          data: payload?.result ?? [],
        });
      } catch (error) {
        console.error("Gagal melakukan fetch pemasukan di worker", error);
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Terjadi kesalahan tidak diketahui.",
        });
      }
    })();

    return true;
  });
});
