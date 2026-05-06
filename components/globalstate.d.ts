export {};

type kodeObat = string;
type namaObat = string;
type marginObat = string;
type batasWarning = string;
type disableWarning = string;
type sku = string;

declare global {
  interface Window {
    marginData: Array<
      [kodeObat, namaObat, marginObat, batasWarning, disableWarning, sku]
    >;
  }
}
