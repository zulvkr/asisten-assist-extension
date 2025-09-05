export {};

type kodeObat = string;
type namaObat = string;
type marginObat = string;

declare global {
  interface Window {
    tableObatWasLoadingState: boolean;
    marginData: Array<[kodeObat, namaObat, marginObat]>;
  }
}
