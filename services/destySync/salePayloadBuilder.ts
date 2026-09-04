import type {
  DestySkuMapping,
  NormalizedDestyOrder,
  NormalizedDestyOrderItem,
} from "@/types/destySync";

export interface AssistSaleItemPayload {
  name: string;
  code: string;
  type: "prescription" | "akhp";
  medicineId?: string;
  akhpId?: string;
  depotId: string;
  quantity: number;
  hospitalId: string;
  unit?: string;
  dosage: string;
  isPriceLock: true;
  baseFee: number;
  discount: 0;
  totalFee: number;
  sellingPrice: [];
  idTemp: string;
  category: "Lainnya";
  jenis: "";
  isFromCashier: true;
  isIdDisc: null;
  isEditFromCashier: true;
  transactionType: "selling";
}

export interface AssistSalePaymentPayload {
  isOutcome: false;
  totalFee: number;
  percentageTotal: 100;
  status: "paid";
  type: "Kartu Debit";
  name: string;
  paidName: string;
  cardNumber: "0000-0000-0000-0000";
  cardOwner: "Desty";
  isNeedClaim: false;
  accountTxId: string;
}

export const DEFAULT_ASSIST_TRANSACTION_ACCOUNT_TX_ID = "6874f95a091ef4f8f365d800";

export interface AssistSalePayload {
  milis: number;
  isBpjs: false;
  subTotalFee: number;
  totalTaxFee: 0;
  totalFee: number;
  paidFee: number;
  creditFee: 0;
  hospitalId: string;
  removedItem: [];
  removedPayment: [];
  accountTxId: string;
  pointExchange: null;
  baseFee: number;
  discount: 0;
  roundedValue: 0;
  isOutcome: false;
  status: "paid off";
  txType: "ktx";
  isPendingStock: false;
  anonymousPatient: true;
  patientName: string;
  isOnlyPOS: true;
  item: AssistSaleItemPayload[];
  payment: AssistSalePaymentPayload[];
}

export interface SalePayloadItem {
  orderItem: NormalizedDestyOrderItem;
  mapping: DestySkuMapping;
  assistQuantity: number;
}

export interface SalePayloadBuilderOptions {
  accountTxId: string;
  transactionAccountTxId?: string;
  hospitalId: string;
  depotIdByAssistId?: Record<string, string | undefined>; 
  defaultDepotId?: string;
  patientName?: string;
}

function required(value: string | undefined, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} wajib dikonfigurasi.`);
  return normalized;
}

function createTemporaryId(index: number): string {
  return `desty-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function allocateLineTotals(order: NormalizedDestyOrder, items: SalePayloadItem[]): number[] {
  if (!items.length) return [];
  const weights = items.map(({ orderItem, assistQuantity }) => {
    const explicitTotal = orderItem.totalPrice;
    if (typeof explicitTotal === "number" && Number.isFinite(explicitTotal) && explicitTotal > 0) {
      return explicitTotal;
    }
    if (typeof orderItem.unitPrice === "number" && Number.isFinite(orderItem.unitPrice) && orderItem.unitPrice > 0) {
      return orderItem.unitPrice * orderItem.quantity;
    }
    return assistQuantity;
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  let allocated = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return order.totalSales - allocated;
    const lineTotal = Math.round(order.totalSales * (weight / weightTotal));
    allocated += lineTotal;
    return lineTotal;
  });
}

function safeMetadata(value: string): string {
  return value.trim().replace(/[|\r\n]/g, (character) =>
    character === "|" ? "%7C" : " ",
  );
}

export function buildDestyPaidName(order: NormalizedDestyOrder): string {
  return [
    "DESTY",
    `platform=${safeMetadata(order.platformName || "Desty")}`,
    `order=${safeMetadata(order.marketplaceOrderSn)}`,
    `booking=${safeMetadata(order.bookingSn)}`,
    `resi=${safeMetadata(order.trackingNumber)}`,
  ].join("|");
}

export function buildAssistSalePayload(
  order: NormalizedDestyOrder,
  items: SalePayloadItem[],
  options: SalePayloadBuilderOptions,
): AssistSalePayload {
  const accountTxId = required(options.accountTxId, "accountTxId payment akun Kas Assist");
  const transactionAccountTxId = options.transactionAccountTxId?.trim() || DEFAULT_ASSIST_TRANSACTION_ACCOUNT_TX_ID;
  const hospitalId = required(options.hospitalId, "hospitalId Assist");
  const patientName = options.patientName?.trim() || "Pasien Apotek";
  const platformName = order.platformName.trim() || "Desty";

  const lineTotals = allocateLineTotals(order, items);
  const saleItems = items.map(({ mapping, assistQuantity, orderItem }, index) => {
    if (!Number.isFinite(assistQuantity) || assistQuantity <= 0) {
      throw new Error(`Quantity Assist tidak valid untuk SKU ${mapping.destySku}.`);
    }
    const depotId = (mapping.depotId || options.depotIdByAssistId?.[mapping.assistId] || options.defaultDepotId)?.trim();
    if (!depotId) {
      throw new Error(`Depot Assist tidak ditemukan untuk SKU ${mapping.destySku}.`);
    }

    const totalFee = lineTotals[index];
    const common = {
      name: mapping.assistName || orderItem.productName,
      code: mapping.assistCode,
      depotId,
      quantity: assistQuantity,
      hospitalId,
      unit: mapping.assistUnit || orderItem.unit,
      dosage: "-",
      isPriceLock: true as const,
      baseFee: assistQuantity > 0 ? totalFee / assistQuantity : 0,
      discount: 0 as const,
      totalFee,
      sellingPrice: [] as [],
      idTemp: createTemporaryId(index),
      category: "Lainnya" as const,
      jenis: "" as const,
      isFromCashier: true as const,
      isIdDisc: null,
      isEditFromCashier: true as const,
      transactionType: "selling" as const,
    };

    if (mapping.assistType === "prescription") {
      return {
        ...common,
        type: "prescription" as const,
        medicineId: mapping.assistId,
      };
    }

    return {
      ...common,
      type: "akhp" as const,
      akhpId: mapping.assistId,
    };
  });

  const totalFee = Number(order.totalSales);
  if (!Number.isFinite(totalFee) || totalFee < 0) {
    throw new Error("Total penjualan Desty tidak valid.");
  }

  return {
    milis: Date.now(),
    isBpjs: false,
    subTotalFee: totalFee,
    totalTaxFee: 0,
    totalFee,
    paidFee: totalFee,
    creditFee: 0,
    hospitalId,
    removedItem: [],
    removedPayment: [],
    accountTxId: transactionAccountTxId,
    pointExchange: null,
    baseFee: totalFee,
    discount: 0,
    roundedValue: 0,
    isOutcome: false,
    status: "paid off",
    txType: "ktx",
    isPendingStock: false,
    anonymousPatient: true,
    patientName,
    isOnlyPOS: true,
    item: saleItems,
    payment: [
      {
        isOutcome: false,
        totalFee,
        percentageTotal: 100,
        status: "paid",
        type: "Kartu Debit",
        name: platformName,
        paidName: buildDestyPaidName(order),
        cardNumber: "0000-0000-0000-0000",
        cardOwner: "Desty",
        isNeedClaim: false,
        accountTxId,
      },
    ],
  };
}
