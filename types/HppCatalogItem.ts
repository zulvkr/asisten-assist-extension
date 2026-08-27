/**
 * Cost data returned by Assist's medicine and BHP stock endpoints.
 * `avgHPP` is Assist's weighted average HPP, including PPN.
 */
export interface HppCatalogItem {
  id: string;
  code: string;
  name: string;
  type: "prescription" | "akhp";
  avgHPP: number | null;
  buyFee: number | null;
}
