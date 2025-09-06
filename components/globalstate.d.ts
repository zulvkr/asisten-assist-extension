export {};

type kodeObat = string;
type namaObat = string;
type marginObat = string;

declare global {
  interface Window {
    tableObatWasLoadingState: boolean;
    restockReturnObatWasLoadingState: boolean;
    marginData: Array<[kodeObat, namaObat, marginObat]>;
    _prevObatNameValue: string;
    _prevHargaBeliValue?: string;
  }
}
