import type { PemasukanData } from "@/types/PemasukanData";
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

export async function fetchPemasukanData(
  params: FetchPemasukanParams = {}
): Promise<PemasukanData[]> {
  const { url, tanggalMin, tanggalMax } = buildPemasukanRequest(params);
  const token = localStorage.getItem("token") ?? "";

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

  return response.data;
}
