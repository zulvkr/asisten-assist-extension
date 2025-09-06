export {};

type kodeObat = string;
type namaObat = string;
type marginObat = string;

declare global {
  interface Window {
    marginData: Array<[kodeObat, namaObat, marginObat]>;
  }
}
