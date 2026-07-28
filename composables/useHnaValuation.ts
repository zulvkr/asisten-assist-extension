import { ref, computed } from "vue";
import { useAssistStore } from "@/components/assistApp/stores/assistStore";
import { buildPemasukanRequest } from "@/utils/pemasukanApi";
import type { PemasukanData } from "@/types/PemasukanData";
import {
  calculateUnitHna,
  calculateProfitMetrics,
  backtrackStockSnapshot,
  type CatalogStockItem,
  type SalesHnaItem,
  type HnaSalesSummary,
  type HistoricalStockSnapshot
} from "@/utils/hnaUtils";
import * as XLSX from "xlsx";

function getTodayIsoString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function useHnaValuation() {
  const store = useAssistStore();

  const loading = ref(false);
  const progressText = ref("");
  const errorMessage = ref("");

  // Filters
  const startDate = ref(getTodayIsoString());
  const endDate = ref(getTodayIsoString());
  const targetHistoricalDate = ref(getTodayIsoString());

  // Data Stores
  const currentCatalog = ref<CatalogStockItem[]>([]);
  const rawTransactions = ref<PemasukanData[]>([]);

  // Computed Summaries
  const salesItems = ref<SalesHnaItem[]>([]);
  const historicalSnapshots = ref<HistoricalStockSnapshot[]>([]);

  // Overall Catalog Valuation
  const currentStockTotalHnaValue = computed(() => {
    return currentCatalog.value.reduce((acc, item) => {
      const hna = calculateUnitHna(item);
      return acc + Math.round(item.stockTotal * hna);
    }, 0);
  });

  const totalCatalogItemsCount = computed(() => currentCatalog.value.length);

  // Sales Summary Aggregates
  const salesSummary = computed<HnaSalesSummary>(() => {
    let totalItemsSold = 0;
    let totalRevenue = 0;
    let totalHna = 0;
    let totalProfit = 0;

    for (const item of salesItems.value) {
      totalItemsSold += item.quantity;
      totalRevenue += item.totalRevenue;
      totalHna += item.totalHna;
      totalProfit += item.profit;
    }

    const overallMarginPct =
      totalRevenue > 0 ? Number(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0;

    return {
      totalItemsSold,
      totalRevenue,
      totalHna,
      totalProfit,
      overallMarginPct,
      items: salesItems.value
    };
  });

  // Historical Valuation Summary
  const historicalTotalHnaValue = computed(() => {
    return historicalSnapshots.value.reduce((acc, item) => acc + item.historicalHnaValue, 0);
  });

  /**
   * Fetch current inventory catalog (Obat + BHP) from Assist APIs
   */
  async function fetchCurrentCatalog() {
    if (!store.assistToken) {
      throw new Error("Token Assist belum terdeteksi. Silakan login ke clinica.assist.id.");
    }

    const catalog: CatalogStockItem[] = [];

    // 1. Fetch Medications
    progressText.value = "Memuat data katalog Obat...";
    let obatSkip = 0;
    const limit = 1000;
    let obatTotal = Number.POSITIVE_INFINITY;

    while (obatSkip < obatTotal) {
      const url = `${store.apiBaseUrl}/KMedicineStocks/getItemsWithExpiredDate?hospitalId=${store.hospitalId}&skip=${obatSkip}&limit=${limit}`;
      const res = await fetch(url, { method: "GET", headers: store.getHeaders() });
      if (!res.ok) {
        throw new Error(`Gagal memuat katalog Obat (HTTP ${res.status})`);
      }
      const payload = await res.json();
      const data = payload.data || [];
      for (const row of data) {
        catalog.push({
          id: row.id || row._id,
          code: row.code || "-",
          name: row.medName || row.name || "-",
          category: row.category || "Obat",
          unit: row.unit || "PCS",
          stockTotal: Number(row.stockTotal || 0),
          buyFee: Number(row.buyFee || 0),
          avgHPP: Number(row.avgHPP || 0)
        });
      }
      const totalCount = Number(payload.total ?? data.length);
      obatTotal = Number.isFinite(totalCount) ? totalCount : data.length;
      if (data.length < limit) break;
      obatSkip += limit;
    }

    // 2. Fetch BHP / AKHP
    progressText.value = "Memuat data katalog BHP...";
    let bhpSkip = 0;
    let bhpTotal = Number.POSITIVE_INFINITY;

    while (bhpSkip < bhpTotal) {
      const url = `${store.apiBaseUrl}/KAKHPStocks/getList?hospitalId=${store.hospitalId}&fieldName=itemName&sort=1&skip=${bhpSkip}&limit=${limit}`;
      const res = await fetch(url, { method: "GET", headers: store.getHeaders() });
      if (!res.ok) {
        throw new Error(`Gagal memuat katalog BHP (HTTP ${res.status})`);
      }
      const payload = await res.json();
      const data = payload.data || [];
      for (const row of data) {
        catalog.push({
          id: row.id || row._id,
          code: row.code || "-",
          name: row.itemName || row.name || "-",
          category: "BHP",
          unit: row.unit || "PCS",
          stockTotal: Number(row.stockTotal || 0),
          buyFee: Number(row.buyFee || 0),
          avgHPP: Number(row.avgHPP || 0)
        });
      }
      const totalCount = Number(payload.total ?? data.length);
      bhpTotal = Number.isFinite(totalCount) ? totalCount : data.length;
      if (data.length < limit) break;
      bhpSkip += limit;
    }

    currentCatalog.value = catalog;
  }

  /**
   * Main loader for HNA Report (Sales HPP & Historical Valuation)
   */
  async function loadHnaReport() {
    loading.value = true;
    errorMessage.value = "";
    progressText.value = "Menyiapkan data...";

    try {
      // Step 1: Ensure current inventory catalog is loaded
      await fetchCurrentCatalog();

      // Create quick lookup maps for catalog items by ID, Code, and Name
      const catalogMap = new Map<string, CatalogStockItem>();
      const catalogNameMap = new Map<string, CatalogStockItem>();
      for (const item of currentCatalog.value) {
        if (item.id) catalogMap.set(item.id, item);
        if (item.code) catalogMap.set(item.code, item);
        if (item.name) catalogNameMap.set(item.name.trim().toLowerCase(), item);
      }

      // Step 2: Fetch Sales Transactions for selected date range
      progressText.value = `Memuat transaksi penjualan ${startDate.value} s.d ${endDate.value}...`;
      
      let skip = 0;
      const limit = 1000;
      let hasMore = true;
      const fetchedTransactions: PemasukanData[] = [];

      while (hasMore) {
        const req = buildPemasukanRequest({
          tanggalMin: startDate.value,
          tanggalMax: endDate.value,
          skip,
          limit
        });

        const res = await fetch(req.url, { method: "GET", headers: store.getHeaders() });
        if (!res.ok) {
          throw new Error(`Gagal memuat transaksi penjualan (HTTP ${res.status})`);
        }
        const payload = await res.json();
        // EMR API returns transactions array in payload.result
        const data: PemasukanData[] = payload.result || payload.data || [];
        fetchedTransactions.push(...data);

        if (data.length < limit) {
          hasMore = false;
        } else {
          skip += limit;
        }
      }

      rawTransactions.value = fetchedTransactions;

      // Step 3: Process items sold for HPP calculation
      progressText.value = "Menghitung HPP & laba kotor item terjual...";
      const processedSales: SalesHnaItem[] = [];

      for (const tx of fetchedTransactions) {
        // Accept paid off transactions or all non-cancelled transactions
        if (tx.status && tx.status !== "paid off") {
          // If transaction is not paid off, skip if strictly enforcing paid off
          continue;
        }

        const items = tx.Items || [];
        for (const item of items) {
          if (!["prescription", "akhp", "scourPrescription"].includes(item.type)) {
            continue;
          }

          const rawItem = item as any;
          const itemId = item.type === "akhp" ? item.akhpId : (item.medicineId || rawItem.kprescriptionId);
          const itemCode = rawItem.code || "";
          const itemNameKey = item.name ? item.name.trim().toLowerCase() : "";

          const matchedCatalog =
            (itemId ? catalogMap.get(itemId) : null) ||
            (itemCode ? catalogMap.get(itemCode) : null) ||
            (itemNameKey ? catalogNameMap.get(itemNameKey) : null);

          // Unit HNA: prefer item's avgHPP or catalog's avgHPP / buyFee
          const unitHna = calculateUnitHna({
            avgHPP: rawItem.avgHPP || matchedCatalog?.avgHPP,
            buyFee: rawItem.buyFee || matchedCatalog?.buyFee
          });

          const rawPrice = Array.isArray(item.sellingPrice)
            ? (item.sellingPrice[0]?.harga || item.baseFee)
            : (typeof rawItem.sellingPrice === "number" ? rawItem.sellingPrice : item.baseFee);
          const sellingPrice = Number(rawPrice || 0);
          const quantity = Number(item.quantity || 0);

          const metrics = calculateProfitMetrics(quantity, sellingPrice, unitHna);

          processedSales.push({
            transactionId: tx._id || "",
            transactionCode: tx.code || "-",
            createdAt: tx.createdAt || "",
            code: itemCode || matchedCatalog?.code || "-",
            name: item.name || matchedCatalog?.name || "-",
            unit: item.unit || matchedCatalog?.unit || "PCS",
            quantity,
            sellingPrice,
            totalRevenue: metrics.totalRevenue,
            unitHna,
            totalHna: metrics.totalHna,
            profit: metrics.profit,
            profitMarginPct: metrics.profitMarginPct,
            itemType: item.type
          });
        }
      }

      salesItems.value = processedSales;

      // Step 4: Reconstruct historical stock at targetHistoricalDate
      if (targetHistoricalDate.value) {
        progressText.value = `Menghitung rekonstruksi stok tanggal ${targetHistoricalDate.value}...`;

        const salesEvents = fetchedTransactions.flatMap(tx =>
          (tx.Items || []).map(itm => {
            const rawItm = itm as any;
            return {
              medicineId: itm.medicineId,
              akhpId: itm.akhpId,
              itemCode: rawItm.code || "",
              quantity: Number(itm.quantity || 0),
              date: tx.createdAt || ""
            };
          })
        );

        historicalSnapshots.value = backtrackStockSnapshot(
          currentCatalog.value,
          salesEvents,
          [], // Inbound restock events can be merged here when restock log filter is active
          targetHistoricalDate.value
        );
      }
    } catch (err: any) {
      console.error("Gagal memuat Laporan HNA:", err);
      errorMessage.value = err?.message || "Terjadi kesalahan saat memuat data HNA.";
    } finally {
      loading.value = false;
      progressText.value = "";
    }
  }

  /**
   * Export all HNA data into a structured Excel workbook
   */
  function exportHnaToExcel() {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Sales HPP Report
      const salesHeaders = [
        "No Transaksi",
        "Tanggal",
        "Kode Item",
        "Nama Item",
        "Tipe",
        "Satuan",
        "Qty Terjual",
        "Harga Jual (Rp)",
        "HNA Unit (Rp)",
        "Total HPP (Rp)",
        "Total Omset (Rp)",
        "Profit (Rp)",
        "Margin (%)"
      ];
      const salesRows = salesItems.value.map(s => [
        s.transactionCode,
        s.createdAt,
        s.code,
        s.name,
        s.itemType,
        s.unit,
        s.quantity,
        s.sellingPrice,
        s.unitHna,
        s.totalHna,
        s.totalRevenue,
        s.profit,
        s.profitMarginPct
      ]);
      const salesWS = XLSX.utils.aoa_to_sheet([salesHeaders, ...salesRows]);
      XLSX.utils.book_append_sheet(wb, salesWS, "HPP Penjualan");

      // Sheet 2: Current Inventory HNA Valuation
      const catalogHeaders = [
        "Kode Item",
        "Nama Item",
        "Kategori",
        "Satuan",
        "Stok Saat Ini",
        "HNA Unit (Rp)",
        "Total Nilai HNA (Rp)"
      ];
      const catalogRows = currentCatalog.value.map(c => {
        const hna = calculateUnitHna(c);
        return [
          c.code,
          c.name,
          c.category || "Umum",
          c.unit || "PCS",
          c.stockTotal,
          hna,
          Math.round(c.stockTotal * hna)
        ];
      });
      const catalogWS = XLSX.utils.aoa_to_sheet([catalogHeaders, ...catalogRows]);
      XLSX.utils.book_append_sheet(wb, catalogWS, "Valuasi Stok Saat Ini");

      // Sheet 3: Historical Inventory Valuation (Date T)
      if (historicalSnapshots.value.length) {
        const histHeaders = [
          "Kode Item",
          "Nama Item",
          "Kategori",
          "Satuan",
          "Stok Saat Ini",
          "Delta Terjual",
          "Delta Restock",
          `Stok (${targetHistoricalDate.value})`,
          "HNA Unit (Rp)",
          "Nilai Stok Historical (Rp)"
        ];
        const histRows = historicalSnapshots.value.map(h => [
          h.code,
          h.name,
          h.category,
          h.unit,
          h.currentStock,
          h.deltaOutbound,
          h.deltaInbound,
          h.reconstructedStock,
          h.unitHna,
          h.historicalHnaValue
        ]);
        const histWS = XLSX.utils.aoa_to_sheet([histHeaders, ...histRows]);
        XLSX.utils.book_append_sheet(wb, histWS, `Stok Tanggal ${targetHistoricalDate.value}`);
      }

      XLSX.writeFile(wb, `Laporan_HNA_HPP_${startDate.value}_sd_${endDate.value}.xlsx`);
    } catch (err) {
      console.error("Gagal mengekspor Excel HNA:", err);
    }
  }

  return {
    loading,
    progressText,
    errorMessage,
    startDate,
    endDate,
    targetHistoricalDate,
    currentCatalog,
    salesItems,
    salesSummary,
    historicalSnapshots,
    currentStockTotalHnaValue,
    totalCatalogItemsCount,
    historicalTotalHnaValue,
    loadHnaReport,
    exportHnaToExcel
  };
}
