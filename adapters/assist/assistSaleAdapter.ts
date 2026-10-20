import type {
  CanonicalSaleCommand,
  CanonicalSaleItemCommand,
} from "@/domain/integration/models";

export const DEFAULT_ASSIST_TRANSACTION_ACCOUNT_TX_ID = "6874f95a091ef4f8f365d800";

export interface AssistRawSaleItemPayload {
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

export interface AssistRawSalePaymentPayload {
  isOutcome: false;
  totalFee: number;
  percentageTotal: 100;
  status: "paid";
  type: "Kartu Debit";
  name: string;
  paidName: string;
  cardNumber: "0000-0000-0000-0000";
  cardOwner: string;
  isNeedClaim: false;
  accountTxId: string;
}

export interface AssistRawSalePayload {
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
  item: AssistRawSaleItemPayload[];
  payment: AssistRawSalePaymentPayload[];
}

function safeMetadata(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[|\r\n]/g, (char) => (char === "|" ? "%7C" : " "));
}

export function buildPaidNameMetadata(params: {
  platform: string;
  orderId: string;
  bookingSn?: string;
  trackingNumber?: string;
}): string {
  return [
    "DESTY",
    `platform=${safeMetadata(params.platform || "Desty")}`,
    `order=${safeMetadata(params.orderId)}`,
    `booking=${safeMetadata(params.bookingSn)}`,
    `resi=${safeMetadata(params.trackingNumber)}`,
  ].join("|");
}

function createTemporaryId(index: number): string {
  return `sync-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Outbound ACL Adapter: translates CanonicalSaleCommand to Assist proprietary JSON payload format.
 */
export function toAssistSalePayload(command: CanonicalSaleCommand): AssistRawSalePayload {
  const accountTxId = command.accountTxId.trim();
  const transactionAccountTxId =
    command.transactionAccountTxId?.trim() || DEFAULT_ASSIST_TRANSACTION_ACCOUNT_TX_ID;
  const hospitalId = command.hospitalId.trim();
  const patientName = command.patientName.trim() || "Pasien Apotek";
  const platformName = command.platformName.trim() || "Marketplace";

  const rawItems: AssistRawSaleItemPayload[] = command.items.map((item, index) => {
    const isMedicine = item.type === "prescription";
    return {
      name: item.assistName,
      code: item.assistCode,
      type: item.type,
      medicineId: isMedicine ? item.assistItemId : undefined,
      akhpId: !isMedicine ? item.assistItemId : undefined,
      depotId: item.depotId,
      quantity: item.quantity,
      hospitalId,
      unit: item.unit,
      dosage: "-",
      isPriceLock: true,
      baseFee: item.quantity > 0 ? item.totalFee / item.quantity : 0,
      discount: 0,
      totalFee: item.totalFee,
      sellingPrice: [],
      idTemp: createTemporaryId(index),
      category: "Lainnya",
      jenis: "",
      isFromCashier: true,
      isIdDisc: null,
      isEditFromCashier: true,
      transactionType: "selling",
    };
  });

  const paidName = buildPaidNameMetadata({
    platform: platformName,
    orderId: command.externalOrderSn || command.orderId,
    bookingSn: command.rawOrder?.bookingSn,
    trackingNumber: command.rawOrder?.trackingNumber,
  });

  const payment: AssistRawSalePaymentPayload = {
    isOutcome: false,
    totalFee: command.totalFee,
    percentageTotal: 100,
    status: "paid",
    type: "Kartu Debit",
    name: platformName,
    paidName,
    cardNumber: "0000-0000-0000-0000",
    cardOwner: "Desty",
    isNeedClaim: false,
    accountTxId,
  };

  return {
    milis: Date.now(),
    isBpjs: false,
    subTotalFee: command.totalFee,
    totalTaxFee: 0,
    totalFee: command.totalFee,
    paidFee: command.paidFee,
    creditFee: 0,
    hospitalId,
    removedItem: [],
    removedPayment: [],
    accountTxId: transactionAccountTxId,
    pointExchange: null,
    baseFee: command.totalFee,
    discount: 0,
    roundedValue: 0,
    isOutcome: false,
    status: "paid off",
    txType: "ktx",
    isPendingStock: false,
    anonymousPatient: true,
    patientName,
    isOnlyPOS: true,
    item: rawItems,
    payment: [payment],
  };
}
