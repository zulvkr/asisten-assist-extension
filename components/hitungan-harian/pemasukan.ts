import type { PemasukanData } from "@/types/PemasukanData";
import type { HppCatalogItem } from "@/types/HppCatalogItem";
import {
  buildPemasukanRequest,
  type FetchPemasukanParams,
} from "@/utils/pemasukanApi";

interface FetchPemasukanWorkerResponse {
  ok: boolean;
  status?: number;
  error?: string;
  data?: PemasukanData[];
}

interface FetchHppCatalogWorkerResponse {
  ok: boolean;
  error?: string;
  data?: HppCatalogItem[];
}

export async function fetchPemasukanData(
  params: FetchPemasukanParams = {}
): Promise<PemasukanData[]> {
  const { url, tanggalMin, tanggalMax } = buildPemasukanRequest(params);
  const token = localStorage.getItem("assist_token") ?? localStorage.getItem("token") ?? "";

  const response = (await browser.runtime.sendMessage({
    type: "FETCH_PEMASUKAN_DATA",
    payload: { url, token },
  })) as FetchPemasukanWorkerResponse | undefined;

  if (!response?.ok || !response.data) {
    const errorMessage =
      response?.error ??
      `Gagal mengambil data pemasukan: ${response?.status ?? "unknown"}`;
    throw new Error(errorMessage);
  }

  console.debug(
    "Fetched pemasukan data",
    response.data.length,
    `range ${tanggalMin} - ${tanggalMax}`
  );
  console.debug(response.data);

  return response.data;
}

export async function fetchHppCatalogData(): Promise<HppCatalogItem[]> {
  const token = localStorage.getItem("assist_token") ?? localStorage.getItem("token") ?? "";
  const response = (await browser.runtime.sendMessage({
    type: "FETCH_ASSIST_HPP_CATALOG",
    payload: { token },
  })) as FetchHppCatalogWorkerResponse | undefined;

  if (!response?.ok || !response.data) {
    throw new Error(response?.error ?? "Gagal mengambil data HPP dari katalog Assist.");
  }

  return response.data;
}
