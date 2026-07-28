/**
 * HNA & HPP Utility Functions
 * Follows Pragmatic Programmer (Orthogonality, DRY, Defensive Contract)
 * & DDIA (Derived State from Event Streams) principles.
 */

export interface CatalogStockItem {
  id: string;
  code: string;
  name: string;
  category?: string;
  unit?: string;
  stockTotal: number;
  buyFee: number;
  avgHPP: number;
}

export interface SalesHnaItem {
  transactionId: string;
  transactionCode: string;
  createdAt: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  sellingPrice: number;
  totalRevenue: number;
  unitHna: number;
  totalHna: number;
  profit: number;
  profitMarginPct: number;
  itemType: "prescription" | "akhp" | "procedure" | string;
}

export interface HnaSalesSummary {
  totalItemsSold: number;
  totalRevenue: number;
  totalHna: number;
  totalProfit: number;
  overallMarginPct: number;
  items: SalesHnaItem[];
}

export interface HistoricalStockSnapshot {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  currentStock: number;
  deltaOutbound: number; // Qty sold/issued between Target Date & Today
  deltaInbound: number;  // Qty restocked/received between Target Date & Today
  reconstructedStock: number; // Stock at Target Date = Current + DeltaOutbound - DeltaInbound
  unitHna: number;
  historicalHnaValue: number; // reconstructedStock * unitHna
  currentHnaValue: number;    // currentStock * unitHna
}

/**
 * Calculates Unit HNA defensively.
 * Prefers avgHPP (which stores weighted average net cost after discount & PPN in Assist),
 * fallback to buyFee.
 */
export function calculateUnitHna(item: {
  avgHPP?: number | null;
  buyFee?: number | null;
}): number {
  if (item.avgHPP !== undefined && item.avgHPP !== null && item.avgHPP > 0) {
    return Math.round(item.avgHPP);
  }
  if (item.buyFee !== undefined && item.buyFee !== null && item.buyFee > 0) {
    return Math.round(item.buyFee);
  }
  return 0;
}

/**
 * Calculates profit metrics for a sold item.
 */
export function calculateProfitMetrics(
  quantity: number,
  sellingPrice: number,
  unitHna: number
) {
  const totalRevenue = Math.round(quantity * sellingPrice);
  const totalHna = Math.round(quantity * unitHna);
  const profit = totalRevenue - totalHna;
  const profitMarginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  return {
    totalRevenue,
    totalHna,
    profit,
    profitMarginPct: Number(profitMarginPct.toFixed(2))
  };
}

/**
 * Backtracks stock quantities and historical valuation to a target date.
 * Event-sourcing replay formula:
 * Stock_T = CurrentStock + Outbound(T->Now) - Inbound(T->Now)
 */
export function backtrackStockSnapshot(
  catalogItems: CatalogStockItem[],
  salesEvents: Array<{ itemCode?: string; medicineId?: string; akhpId?: string; quantity: number; date: string }>,
  restockEvents: Array<{ itemCode?: string; medicineId?: string; akhpId?: string; quantity: number; date: string }>,
  targetDateIsoStr: string
): HistoricalStockSnapshot[] {
  const targetTime = new Date(targetDateIsoStr).getTime();

  // 1. Group outbound quantities after targetDate (targetTime to Infinity)
  const outboundMap = new Map<string, number>();
  for (const event of salesEvents) {
    const eventTime = new Date(event.date).getTime();
    if (eventTime >= targetTime) {
      const key = event.medicineId || event.akhpId || event.itemCode || "";
      if (key) {
        outboundMap.set(key, (outboundMap.get(key) || 0) + (event.quantity || 0));
      }
    }
  }

  // 2. Group inbound quantities after targetDate (targetTime to Infinity)
  const inboundMap = new Map<string, number>();
  for (const event of restockEvents) {
    const eventTime = new Date(event.date).getTime();
    if (eventTime >= targetTime) {
      const key = event.medicineId || event.akhpId || event.itemCode || "";
      if (key) {
        inboundMap.set(key, (inboundMap.get(key) || 0) + (event.quantity || 0));
      }
    }
  }

  // 3. Reconstruct snapshot for each item in catalog
  return catalogItems.map((item) => {
    const key = item.id || item.code;
    const deltaOutbound = outboundMap.get(key) || outboundMap.get(item.code) || 0;
    const deltaInbound = inboundMap.get(key) || inboundMap.get(item.code) || 0;
    
    // Formula: Stock_T = CurrentStock + DeltaOutbound - DeltaInbound
    const rawReconstructed = item.stockTotal + deltaOutbound - deltaInbound;
    const reconstructedStock = Math.max(0, rawReconstructed); // Defensive guard non-negative

    const unitHna = calculateUnitHna(item);
    const currentHnaValue = Math.round(item.stockTotal * unitHna);
    const historicalHnaValue = Math.round(reconstructedStock * unitHna);

    return {
      id: item.id,
      code: item.code || "-",
      name: item.name || "-",
      unit: item.unit || "PCS",
      category: item.category || "Umum",
      currentStock: item.stockTotal,
      deltaOutbound,
      deltaInbound,
      reconstructedStock,
      unitHna,
      currentHnaValue,
      historicalHnaValue
    };
  });
}
