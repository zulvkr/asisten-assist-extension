import { ContentScriptContext } from "wxt/utils/content-script-context";
import PocketBase from "pocketbase";
import { startOfHour } from "date-fns/fp/startOfHour";

interface StockData {
  medName: string;
  brandName: string;
  unit: string;
  category: string;
  type: string;
  dosage: string;
  isSetStock: boolean;
  buyFee: number;
  sellNormalFee: number;
  indication: string[];
  stockTotal: number;
  hospitalId: string;
  isPriceLock: boolean;
  createdAt: string;
  createdId: string;
  createdName: string;
  updatedAt: string;
  code: string;
  DepotStocks: Array<{
    medicineId: string;
    hospitalId: string;
    medName: string;
    name: string;
    type: string;
    stock: number;
    unit: string;
    dosage: string;
    practiceId: string[];
    createdAt: string;
    createdName: string;
    createdId: string;
    countUsage: any[];
    barcode: string;
    id: string;
  }>;
  sellBPJSFee: number;
  updatedId: string;
  updatedName: string;
  id: string;
  oldMedName: string[];
  sellingPrice: any[];
  tax: number;
  taxPercent: number;
  formularium: string;
}

export const stockCheckerCron = (ctx: ContentScriptContext, pb: PocketBase) => {
  const token = localStorage.getItem("token");
  const hospitalId = "6874f9569abc98f9c645b330";
  const baseUrl = "https://api-clinica.assist.id/api";
  const url = new URL(`${baseUrl}/KMedicineStocks/getList`);
  url.searchParams.append("hospitalId", hospitalId);
  url.searchParams.append("fieldName", "medName");
  url.searchParams.append("skip", "0");
  url.searchParams.append("limit", "5000");

  function fetchStockData() {
    return fetch(url.toString(), {
      headers: {
        Authorization: token ?? "",
        Accept: "application/json, text/plain, */*",
        Origin: "https://clinica.assist.id",
        Priority: "u=1, i",
        Referer: "https://clinica.assist.id/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
      },
      method: "GET",
    })
      .then((response) => response.json())
      .then((data: any) => {
        console.log("Stock Data:", data.data as StockData[]);
        return data.data as StockData[];
      })
      .catch((error) => {
        console.error("Error fetching stock data:", error);
      });
  }

  function fetchLastStokDateInPocketbase() {
    return pb
      .collection("stok")
      .getFirstListItem("kode_produk != ''", { sort: "-start_datetime" })
      .then((record) => {
        return new Date(record.start_datetime).toISOString();
      })
      .catch((error) => {
        if (error.status === 404) {
          return null;
        } else {
          console.error(
            "Error fetching last stok date from PocketBase:",
            error
          );
        }
      });
  }

  function fetchAllProdukInPocketbase() {
    return pb
      .collection("produk")
      .getFullList({
        batch: 5000,
      })
      .then((records) => {
        return records;
      });
  }

  async function processProdukData() {
    const allProduk = await fetchAllProdukInPocketbase();
    for (const produk of window.marginData) {
      const kodeObat = produk[0];
      const namaObat = produk[1];
      const marginObat = parseFloat(produk[2]);
      const batasWarning = parseInt(produk[3]) || 0;
      const disableWarning = produk[4] === "TRUE";
      const existing = allProduk.find((p) => p.kode === kodeObat);
      if (existing) {
        const needsUpdate =
          existing.nama_produk !== namaObat ||
          existing.batas_warning_stok !== batasWarning ||
          existing.matikan_warning_stok !== disableWarning;

        if (needsUpdate) {
          await pb.collection("produk").update(existing.id, {
            nama_produk: namaObat,
            margin: marginObat,
            batas_warning: batasWarning,
            disable_warning: disableWarning,
          });
          console.log(`Updated produk ${kodeObat} in PocketBase`);
        } else {
          console.log(`No update needed for produk ${kodeObat}`);
        }
      } else {
        await pb.collection("produk").create({
          kode: kodeObat,
          nama_produk: namaObat,
          margin: marginObat,
          batas_warning_stok: batasWarning,
          matikan_warning_stok: disableWarning,
        });
        console.log(`Created produk ${kodeObat} in PocketBase`);
      }
    }
  }

  async function processStockData() {
    console.log("Processing stock data...");
    const data = await fetchStockData();
    if (!data) return;
    let lastStokDate = (await fetchLastStokDateInPocketbase()) || null;
    const startOfCurrentHour = startOfHour(new Date()).toISOString();
    if (lastStokDate === startOfCurrentHour) {
      console.log(
        "Stock data for the current hour already exists in PocketBase. Skipping upload."
      );
      return;
    }
    const batchLength = 50;
    for (let i = 0; i < data.length; i += batchLength) {
      console.log(`Uploading batch ${i / batchLength + 1} to PocketBase...`);
      const batch = pb.createBatch();
      const stokCollection = batch.collection("stok");
      const batchItems = data.slice(i, i + batchLength);
      for (const item of batchItems) {
        const record = {
          kode_produk: item.code,
          jumlah: item.stockTotal,
          start_datetime: startOfCurrentHour,
        };
        stokCollection.create(record);
      }
      try {
        await batch.send({ requestKey: `stok-batch-${i / batchLength + 1}` });
        console.log("Batch upload to PocketBase completed");
      } catch (error) {
        console.error("Error during batch upload to PocketBase:", error);
      }
    }
  }

  processStockData();
  processProdukData();
  //   ctx.setInterval(fetchStockData, 60 * 1000); // every 1 minute
  console.log("Stock Checker Cron Token:", token);
};
