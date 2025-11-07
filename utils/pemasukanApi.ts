const API_ENDPOINT =
  "https://api-clinica.assist.id/api/superapps/getEmrTransactionsByHospitalId";
const HOSPITAL_ID = "6874f9569abc98f9c645b330";

export interface FetchPemasukanParams {
  tanggalMin?: string;
  tanggalMax?: string;
  limit?: number;
  skip?: number;
}

interface ResolvedFetchPemasukanParams {
  tanggalMin: string;
  tanggalMax: string;
  limit: number;
  skip: number;
}

function formatDateForQuery(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveFetchParams(
  params: FetchPemasukanParams = {}
): ResolvedFetchPemasukanParams {
  const today = new Date();
  const tanggalMin = params.tanggalMin ?? formatDateForQuery(today);
  const tanggalMax = params.tanggalMax ?? tanggalMin;
  const skip = params.skip ?? 0;
  const limit = params.limit ?? 1000;

  return { tanggalMin, tanggalMax, skip, limit };
}

export function buildPemasukanRequest(
  params: FetchPemasukanParams = {}
): { url: string } & ResolvedFetchPemasukanParams {
  const resolved = resolveFetchParams(params);
  const url = new URL(API_ENDPOINT);

  url.searchParams.append("hospitalId", HOSPITAL_ID);
  url.searchParams.append("noInvoice", "");
  url.searchParams.append("nama", "");
  url.searchParams.append("skip", String(resolved.skip));
  url.searchParams.append("limit", String(resolved.limit));
  url.searchParams.append("tanggalMin", `${resolved.tanggalMin} 00:00:00`);
  url.searchParams.append("tanggalMax", `${resolved.tanggalMax} 23:59:59`);
  url.searchParams.append("status[]", "Lunas");
  url.searchParams.append("status[]", "Belum Dibayar");
  url.searchParams.append("status[]", "Terbayar Sebagian");
  url.searchParams.append("metodePembayaran[]", "Langsung");
  url.searchParams.append("metodePembayaran[]", "bpjs");
  url.searchParams.append("metodePembayaran[]", "Asuransi");
  url.searchParams.append("metodePembayaran[]", "Perusahaan");
  url.searchParams.append("metodePembayaran[]", "Kartu Debit");
  url.searchParams.append("metodePembayaran[]", "Kartu Kredit");
  url.searchParams.append("metodePembayaran[]", "Admin Booking");
  url.searchParams.append("metodePembayaran[]", "Lainnya");
  url.searchParams.append("metodePembayaran[]", "Tidak Ada");

  return { url: url.toString(), ...resolved };
}
