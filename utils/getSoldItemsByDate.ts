import type { PemasukanData } from "@/types/PemasukanData";
import type { SoldItemAggregate } from "@/utils/compareStockLevels";

export interface GetAssistSoldItemsOptions {
  includeOnlyPaidOff?: boolean;
}

export interface GetSoldItemsByDateResult {
  soldItems: SoldItemAggregate[];
  skippedByType: number;
}

const ALLOWED_ASSIST_ITEM_TYPES = new Set([
  "prescription",
  "akhp",
  "scourPrescription",
]);

export function getAssistSoldItemsByDate(
  transactions: PemasukanData[],
  options: GetAssistSoldItemsOptions = {},
): GetSoldItemsByDateResult {
  const includeOnlyPaidOff = options.includeOnlyPaidOff ?? true;
  const grouped = new Map<string, SoldItemAggregate>();

  let skippedByType = 0;

  for (const transaction of transactions) {
    if (includeOnlyPaidOff && transaction.status !== "paid off") {
      continue;
    }

    for (const item of transaction.Items) {
      if (!ALLOWED_ASSIST_ITEM_TYPES.has(item.type)) {
        skippedByType += 1;
        continue;
      }

      const medicineId = item.medicineId?.trim() ?? "";
      // Items without a medicineId are grouped under "" — they won't find stock data
      // but we never skip them, so they appear in the output as "unknown" status.
      const key = medicineId || `__noId__::${item.name}`;

      const existing = grouped.get(key);
      if (existing) {
        existing.qtySold += item.quantity;
        continue;
      }

      grouped.set(key, {
        medicineId,
        itemName: item.name,
        qtySold: item.quantity,
        source: "assist",
      });
    }
  }

  return {
    soldItems: Array.from(grouped.values()).sort(
      (a, b) => b.qtySold - a.qtySold || a.itemName.localeCompare(b.itemName),
    ),
    skippedByType,
  };
}
