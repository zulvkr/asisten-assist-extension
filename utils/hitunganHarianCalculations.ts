import { Payment, PemasukanData } from "@/types/PemasukanData";
import type { HppCatalogItem } from "@/types/HppCatalogItem";
import {
  extractOnlineOrderMetadata,
  type OnlineOrderMetadata,
} from "./onlineOrderExtractor";

const SHIFT_CONFIG = [
  { label: "Pagi" as const, startHour: 6, endHour: 14 },
  { label: "Siang" as const, startHour: 14, endHour: 22 },
];

const SHIFT_ORDER = SHIFT_CONFIG.map((config) => config.label);

type ShiftLabel = (typeof SHIFT_CONFIG)[number]["label"];

type PaymentCategory = "cash" | "mandiri" | "qris";
type MarketplaceCategory = "shopee" | "tiktok" | "blibli" | "goApotik";

interface SectionTotals {
  cash: number;
  mandiri: number;
  qris: number;
  debit: number;
  total: number;
  shopee: number;
  tiktok: number;
  blibli: number;
  goApotik: number;
}

interface ShiftDetailItem {
  id: string;
  name: string;
  type: string;
  incomeType?: string;
  category?: string;
  unit?: string;
  baseFee?: number;
  quantity: number;
  totalFee: number;
  unitHpp: number;
  totalHpp: number;
  grossProfit?: number;
  marginPercent?: number;
}

interface ShiftDetailPayment {
  id: string;
  label: string;
  amount: number;
}

interface TransactionPaymentInfo {
  id: string;
  name: string;
  type: string;
  totalFee: number;
  paidName: string;
  reason?: string;
  createdName?: string;
}

interface ShiftDetailRow {
  transactionId: string;
  code: string;
  createdAt: string;
  dateStr: string;
  time: string;
  shift: ShiftLabel;
  patientName: string;
  createdName: string;
  doctorName?: string;
  channel: string;
  paymentMethod: string;
  onlineInfo: OnlineOrderMetadata;
  incomeType: "apotek" | "klinik" | "campuran";
  totalFee: number;
  paidFee: number;
  apotek: SectionTotals;
  klinik: SectionTotals;
  hpp: number;
  grossProfit: number;
  marginPercent: number;
  payments: TransactionPaymentInfo[];
  items: ShiftDetailItem[];
  otherNotes: string[];
}

interface ShiftSummaryRow {
  key: string;
  dateKey: string;
  displayDate: string;
  shift: ShiftLabel;
  transactionCount: number;
  totalOmset: number;
  grossProfit: number;
  marginPercent: number;
  apotek: SectionTotals;
  klinik: SectionTotals;
  hpp: number;
  offlineOmset: number;
  hppOffline: number;
  grossProfitOffline: number;
  marginPercentOffline: number;
  onlineOmset: number;
  hppOnline: number;
  grossProfitOnline: number;
  marginPercentOnline: number;
  details: ShiftDetailRow[];
}

export type {
  ShiftLabel,
  PaymentCategory,
  MarketplaceCategory,
  SectionTotals,
  ShiftDetailItem,
  ShiftDetailPayment,
  TransactionPaymentInfo,
  ShiftDetailRow,
  ShiftSummaryRow,
};

function getShiftLabel(date: Date): ShiftLabel | null {
  const hour = date.getHours();
  for (const config of SHIFT_CONFIG) {
    if (hour >= config.startHour && hour < config.endHour) {
      return config.label;
    }
  }
  return null;
}

function createEmptyTotals(): SectionTotals {
  return {
    cash: 0,
    mandiri: 0,
    qris: 0,
    debit: 0,
    total: 0,
    shopee: 0,
    tiktok: 0,
    blibli: 0,
    goApotik: 0,
  };
}

function normalisePaymentCategory(
  payment: Payment | undefined,
): PaymentCategory {
  if (!payment) {
    return "cash";
  }
  const raw = `${payment.type ?? ""} ${payment.name ?? ""} ${
    payment.intent ?? ""
  } ${payment.reason ?? ""}`;
  const normalised = raw.toLowerCase();

  if (normalised.includes("qris")) {
    return "qris";
  }

  if (
    normalised.includes("mandiri") ||
    normalised.includes("debit") ||
    normalised.includes("transfer") ||
    normalised.includes("kartu") ||
    normalised.includes("card") ||
    normalised.includes("bpjs") ||
    normalised.includes("asuransi") ||
    normalised.includes("perusahaan") ||
    normalised.includes("bank") ||
    normalised.includes("kredit") ||
    normalised.includes("edc")
  ) {
    return "mandiri";
  }

  return "cash";
}

function getMarketplaceCategory(
  payment: Payment | undefined,
): MarketplaceCategory | null {
  if (!payment) {
    return null;
  }

  const raw = [payment.type, payment.name, payment.intent, payment.reason, payment.paidName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const compact = raw.replace(/[^a-z0-9]/g, "");

  if (compact.includes("shopee")) {
    return "shopee";
  }
  if (compact.includes("tiktok") || compact.includes("tiktokshop")) {
    return "tiktok";
  }
  if (compact.includes("blibli")) {
    return "blibli";
  }
  if (compact.includes("goapotik")) {
    return "goApotik";
  }

  return null;
}

function addSectionTotals(target: SectionTotals, addition: SectionTotals) {
  target.cash += addition.cash;
  target.mandiri += addition.mandiri;
  target.qris += addition.qris;
  target.debit += addition.debit;
  target.total += addition.total;
  target.shopee += addition.shopee;
  target.tiktok += addition.tiktok;
  target.blibli += addition.blibli;
  target.goApotik += addition.goApotik;
}

function createShiftSummaryRow(
  summaryKey: string,
  dateKey: string,
  displayDate: string,
  shift: ShiftLabel,
): ShiftSummaryRow {
  return {
    key: summaryKey,
    dateKey,
    displayDate,
    shift,
    transactionCount: 0,
    totalOmset: 0,
    grossProfit: 0,
    marginPercent: 0,
    apotek: createEmptyTotals(),
    klinik: createEmptyTotals(),
    hpp: 0,
    offlineOmset: 0,
    hppOffline: 0,
    grossProfitOffline: 0,
    marginPercentOffline: 0,
    onlineOmset: 0,
    hppOnline: 0,
    grossProfitOnline: 0,
    marginPercentOnline: 0,
    details: [],
  };
}

function getFinitePositiveNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function getCatalogLookupKey(type: "prescription" | "akhp", value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized ? `${type}:${normalized}` : "";
}

function createHppCatalogLookup(catalog: HppCatalogItem[]): Map<string, HppCatalogItem> {
  const lookup = new Map<string, HppCatalogItem>();
  for (const item of catalog) {
    for (const value of [item.id, item.code, item.name]) {
      const key = getCatalogLookupKey(item.type, value);
      if (key) {
        lookup.set(key, item);
      }
    }
  }
  return lookup;
}

function resolveUnitHpp(
  item: PemasukanData["Items"][number],
  catalogLookup: Map<string, HppCatalogItem>,
): number {
  const catalogType = item.type === "akhp" ? "akhp" : "prescription";
  const itemId = catalogType === "akhp" ? item.akhpId : item.medicineId;
  const catalogItem =
    (itemId ? catalogLookup.get(getCatalogLookupKey(catalogType, itemId)) : undefined) ||
    (item.code ? catalogLookup.get(getCatalogLookupKey(catalogType, item.code)) : undefined) ||
    (item.name ? catalogLookup.get(getCatalogLookupKey(catalogType, item.name)) : undefined);

  // Only use buy price / harga beli (buyFee).
  // Do NOT use or fallback to avgHPP because unit conversions can distort average HPP.
  return (
    getFinitePositiveNumber(item.buyFee) ??
    getFinitePositiveNumber(catalogItem?.buyFee) ??
    0
  );
}

function calculateTransactionTotals(
  tx: PemasukanData,
  catalogLookup: Map<string, HppCatalogItem>,
): {
  apotek: SectionTotals;
  klinik: SectionTotals;
  hpp: number;
  items: ShiftDetailItem[];
} {
  const detailTotals = {
    apotek: createEmptyTotals(),
    klinik: createEmptyTotals(),
  };
  const primaryPayment = tx.Payments[0];
  const paymentCategory = normalisePaymentCategory(primaryPayment);
  const marketplaceCategory = getMarketplaceCategory(primaryPayment);

  const detailItems: ShiftDetailItem[] = (tx.Items ?? []).map((item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitHpp = resolveUnitHpp(item, catalogLookup);
    const totalFee = item.type === "scourPrescription" ? 0 : (item.totalFee ?? 0);
    const totalHpp = Math.round(quantity * unitHpp);
    const isApotek = item.incomeType === "apotek";
    const grossProfit = isApotek ? totalFee - totalHpp : 0;
    const marginPercent = isApotek && totalFee > 0 ? (grossProfit / totalFee) * 100 : 0;
    return {
      id: item._id,
      name: item.name ?? "-",
      type: item.type ?? "",
      incomeType: item.incomeType,
      category: item.category,
      unit: item.unit,
      baseFee: item.baseFee,
      quantity,
      totalFee,
      unitHpp,
      totalHpp,
      grossProfit,
      marginPercent,
    };
  });

  for (const item of tx.Items ?? []) {
    const incomeType = item.incomeType;
    const amount = item.type === "scourPrescription" ? 0 : (item.totalFee ?? 0);
    if (incomeType === "apotek") {
      if (marketplaceCategory) {
        detailTotals.apotek[marketplaceCategory] += amount;
      } else if (paymentCategory === "cash") {
        detailTotals.apotek.cash += amount;
      } else if (paymentCategory === "qris") {
        detailTotals.apotek.qris += amount;
        detailTotals.apotek.debit += amount;
      } else {
        detailTotals.apotek.mandiri += amount;
        detailTotals.apotek.debit += amount;
      }
    } else if (incomeType === "klinik") {
      if (paymentCategory === "cash") {
        detailTotals.klinik.cash += amount;
      } else {
        detailTotals.klinik.debit += amount;
        if (paymentCategory === "qris") {
          detailTotals.klinik.qris += amount;
        } else {
          detailTotals.klinik.mandiri += amount;
        }
      }
    }
  }

  detailTotals.apotek.total =
    detailTotals.apotek.cash +
    detailTotals.apotek.mandiri +
    detailTotals.apotek.qris +
    detailTotals.apotek.shopee +
    detailTotals.apotek.tiktok +
    detailTotals.apotek.blibli +
    detailTotals.apotek.goApotik;
  detailTotals.klinik.total =
    detailTotals.klinik.cash + detailTotals.klinik.debit;

  const hpp = detailItems.reduce((total, item) => total + item.totalHpp, 0);

  return {
    apotek: detailTotals.apotek,
    klinik: detailTotals.klinik,
    hpp,
    items: detailItems,
  };
}

function processTransaction(
  tx: PemasukanData,
  map: Map<string, ShiftSummaryRow>,
  catalogLookup: Map<string, HppCatalogItem>,
): void {
  const createdAt = new Date(tx.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return;
  }

  const shift = getShiftLabel(createdAt);
  if (!shift) {
    return;
  }

  const dateKey = formatDateForInput(createdAt);
  const summaryKey = `${dateKey}__${shift}`;

  if (!map.has(summaryKey)) {
    const displayDate = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(createdAt);
    map.set(
      summaryKey,
      createShiftSummaryRow(summaryKey, dateKey, displayDate, shift),
    );
  }

  const summary = map.get(summaryKey)!;
  const { apotek, klinik, hpp, items } = calculateTransactionTotals(
    tx,
    catalogLookup,
  );

  addSectionTotals(summary.apotek, apotek);
  addSectionTotals(summary.klinik, klinik);
  summary.hpp += hpp;

  const onlineInfo = extractOnlineOrderMetadata(tx);
  const time = !Number.isNaN(createdAt.getTime())
    ? new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(createdAt)
    : "-";
  const dateStr = !Number.isNaN(createdAt.getTime())
    ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(createdAt)
    : "-";

  const totalFee = apotek.total + klinik.total;
  // Laba kotor dan margin dihitung khusus untuk apotek saja (tidak mengikutsertakan klinik)
  const grossProfit = apotek.total - hpp;
  const marginPercent = apotek.total > 0 ? (grossProfit / apotek.total) * 100 : 0;

  const hasApotek = apotek.total > 0 || items.some((it) => it.incomeType === "apotek");
  const hasKlinik = klinik.total > 0 || items.some((it) => it.incomeType === "klinik");
  const incomeType = hasApotek && hasKlinik ? "campuran" : hasKlinik ? "klinik" : "apotek";

  const payments: TransactionPaymentInfo[] = (tx.Payments ?? []).map((p) => ({
    id: p._id || "",
    name: p.name || "-",
    type: p.type || "-",
    totalFee: p.totalFee || 0,
    paidName: p.paidName || "",
    reason: p.reason || "",
    createdName: p.createdName || "",
  }));

  const primaryPayment = tx.Payments?.[0];
  const paymentMethod = primaryPayment
    ? [primaryPayment.name, primaryPayment.type].filter(Boolean).join(" • ")
    : "Tunai";

  const channel = onlineInfo.platform || primaryPayment?.name || "Kasir";
  const createdName =
    primaryPayment?.createdName ||
    tx.Items?.[0]?.createdName ||
    "-";

  const doctorName = (tx.Practices as any)?.Dokters?.nama
    ? `${(tx.Practices as any).Dokters.nama}${(tx.Practices as any).Dokters.gelar ? `, ${(tx.Practices as any).Dokters.gelar}` : ""}`
    : undefined;

  const otherNotes = Array.isArray(tx.OtherNotes)
    ? tx.OtherNotes.map((n) =>
        typeof n === "string" ? n : (n?.notes || n?.note || JSON.stringify(n))
      ).filter(Boolean)
    : [];

  summary.details.push({
    transactionId: tx._id,
    code: tx.code || "-",
    createdAt: tx.createdAt,
    dateStr,
    time,
    shift,
    patientName: tx.Patients?.nama || (tx as any).patientName || "-",
    createdName,
    doctorName,
    channel,
    paymentMethod,
    onlineInfo,
    incomeType,
    totalFee,
    paidFee: tx.paidFee ?? totalFee,
    apotek,
    klinik,
    hpp,
    grossProfit,
    marginPercent,
    payments,
    items,
    otherNotes,
  });

  summary.transactionCount = summary.details.length;
  summary.totalOmset = summary.apotek.total + summary.klinik.total;
  // Laba kotor dan margin dihitung khusus untuk apotek saja (tidak mengikutsertakan klinik)
  summary.grossProfit = summary.apotek.total - summary.hpp;
  summary.marginPercent =
    summary.apotek.total > 0 ? (summary.grossProfit / summary.apotek.total) * 100 : 0;

  // Breakdown Online vs Offline Apotek
  summary.offlineOmset = summary.details
    .filter((d) => !d.onlineInfo.isOnline)
    .reduce((acc, d) => acc + d.apotek.total, 0);
  summary.hppOffline = summary.details
    .filter((d) => !d.onlineInfo.isOnline)
    .reduce((acc, d) => acc + d.hpp, 0);
  summary.grossProfitOffline = summary.offlineOmset - summary.hppOffline;
  summary.marginPercentOffline =
    summary.offlineOmset > 0
      ? (summary.grossProfitOffline / summary.offlineOmset) * 100
      : 0;

  summary.onlineOmset = summary.details
    .filter((d) => d.onlineInfo.isOnline)
    .reduce((acc, d) => acc + d.apotek.total, 0);
  summary.hppOnline = summary.details
    .filter((d) => d.onlineInfo.isOnline)
    .reduce((acc, d) => acc + d.hpp, 0);
  summary.grossProfitOnline = summary.onlineOmset - summary.hppOnline;
  summary.marginPercentOnline =
    summary.onlineOmset > 0
      ? (summary.grossProfitOnline / summary.onlineOmset) * 100
      : 0;
}

function sortShiftSummaries(summaries: ShiftSummaryRow[]): ShiftSummaryRow[] {
  return summaries.sort((a, b) => {
    if (a.dateKey === b.dateKey) {
      return SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift);
    }
    return a.dateKey.localeCompare(b.dateKey);
  });
}

export function calculateShiftSummaries(
  data: PemasukanData[],
  hppCatalog: HppCatalogItem[] = [],
): ShiftSummaryRow[] {
  const map = new Map<string, ShiftSummaryRow>();
  const catalogLookup = createHppCatalogLookup(hppCatalog);

  for (const tx of data) {
    processTransaction(tx, map, catalogLookup);
  }

  const summaries = Array.from(map.values());
  return sortShiftSummaries(summaries);
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
