import { Payment, PemasukanData } from "@/types/PemasukanData";

const SHIFT_CONFIG = [
  { label: "Pagi" as const, startHour: 7, endHour: 14 },
  { label: "Siang" as const, startHour: 14, endHour: 21 },
];

const SHIFT_ORDER = SHIFT_CONFIG.map((config) => config.label);

type ShiftLabel = (typeof SHIFT_CONFIG)[number]["label"];

type PaymentCategory = "cash" | "debit";

interface SectionTotals {
  cash: number;
  debit: number;
  total: number;
}

interface ShiftDetailItem {
  id: string;
  name: string;
  type: string;
  incomeType?: string;
  totalFee: number;
}

interface ShiftDetailPayment {
  id: string;
  label: string;
  amount: number;
}

interface ShiftDetailRow {
  transactionId: string;
  code: string;
  createdAt: string;
  patientName: string;
  apotek: SectionTotals;
  klinik: SectionTotals;
  items: ShiftDetailItem[];
}

interface ShiftSummaryRow {
  key: string;
  dateKey: string;
  displayDate: string;
  shift: ShiftLabel;
  apotek: SectionTotals;
  klinik: SectionTotals;
  details: ShiftDetailRow[];
}

export type {
  ShiftLabel,
  PaymentCategory,
  SectionTotals,
  ShiftDetailItem,
  ShiftDetailPayment,
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
  return { cash: 0, debit: 0, total: 0 };
}

function normalisePaymentCategory(payment: Payment): PaymentCategory {
  const raw = `${payment.type ?? ""} ${payment.name ?? ""} ${
    payment.intent ?? ""
  }`;
  const normalised = raw.toLowerCase();
  if (
    normalised.includes("debit") ||
    normalised.includes("transfer") ||
    normalised.includes("kartu") ||
    normalised.includes("card") ||
    normalised.includes("bpjs") ||
    normalised.includes("asuransi") ||
    normalised.includes("perusahaan") ||
    normalised.includes("bank") ||
    normalised.includes("kredit") ||
    normalised.includes("qris")
  ) {
    return "debit";
  }
  return "cash";
}

function sumItemTotals(
  items: PemasukanData["Items"],
  type: "apotek" | "klinik"
): number {
  return items
    .filter((item) => item.incomeType === type)
    .reduce((sum, item) => sum + (item.totalFee ?? 0), 0);
}

function addSectionTotals(target: SectionTotals, addition: SectionTotals) {
  target.cash += addition.cash;
  target.debit += addition.debit;
  target.total += addition.total;
}

export function calculateShiftSummaries(
  data: PemasukanData[]
): ShiftSummaryRow[] {
  const map = new Map<string, ShiftSummaryRow>();

  for (const tx of data) {
    const createdAt = new Date(tx.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }

    const shift = getShiftLabel(createdAt);
    if (!shift) {
      continue;
    }

    const dateKey = formatDateForInput(createdAt);
    const summaryKey = `${dateKey}__${shift}`;

    if (!map.has(summaryKey)) {
      map.set(summaryKey, {
        key: summaryKey,
        dateKey,
        displayDate: new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }).format(createdAt),
        shift,
        apotek: createEmptyTotals(),
        klinik: createEmptyTotals(),
        details: [],
      });
    }

    const summary = map.get(summaryKey)!;

    const apotekItemTotal = sumItemTotals(tx.Items ?? [], "apotek");
    const klinikItemTotal = sumItemTotals(tx.Items ?? [], "klinik");

    const detailTotals = {
      apotek: createEmptyTotals(),
      klinik: createEmptyTotals(),
    };
    let pengeluaran = 0;
    const paymentCategory = normalisePaymentCategory(tx.Payments[0]);

    const detailItems: ShiftDetailItem[] = (tx.Items ?? []).map((item) => ({
      id: item._id,
      name: item.name ?? "-",
      type: item.type ?? "",
      incomeType: item.incomeType,
      totalFee: item.totalFee ?? 0,
    }));

    for (const item of tx.Items ?? []) {
      const incomeType = item.incomeType;
      const amount = item.totalFee ?? 0;
      if (incomeType === "apotek") {
        if (paymentCategory === "cash") {
          detailTotals.apotek.cash += amount;
        } else {
          detailTotals.apotek.debit += amount;
        }
      } else if (incomeType === "klinik") {
        if (paymentCategory === "cash") {
          detailTotals.klinik.cash += amount;
        } else {
          detailTotals.klinik.debit += amount;
        }
      }
    }

    detailTotals.apotek.total =
      detailTotals.apotek.cash + detailTotals.apotek.debit;
    detailTotals.klinik.total =
      detailTotals.klinik.cash + detailTotals.klinik.debit;

    addSectionTotals(summary.apotek, detailTotals.apotek);
    addSectionTotals(summary.klinik, detailTotals.klinik);

    summary.details.push({
      transactionId: tx._id,
      code: tx.code,
      createdAt: tx.createdAt,
      patientName: tx.Patients?.nama ?? "-",
      apotek: detailTotals.apotek,
      klinik: detailTotals.klinik,
      items: detailItems,
    });
  }

  const summaries = Array.from(map.values());
  summaries.sort((a, b) => {
    if (a.dateKey === b.dateKey) {
      return SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift);
    }
    return a.dateKey.localeCompare(b.dateKey);
  });

  return summaries;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPaymentLabel(payment: Payment): string {
  const parts = [payment.type, payment.name, payment.intent]
    .map((part) => (part ? part.trim() : ""))
    .filter(Boolean);
  const uniqueParts = Array.from(new Set(parts));
  if (!uniqueParts.length) {
    return "Tidak diketahui";
  }
  return uniqueParts.map(formatLabel).join(" • ");
}

function formatLabel(value: string): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
