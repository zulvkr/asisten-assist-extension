export interface DepotStock {
  name: string;
  id: string;
  stock: number;
  old?: boolean;
}

export interface SellingPrice {
  idMetodeBayar: string;
  type: string;
  harga: number;
}

export interface Item {
  _id: string;
  name: string;
  type: "prescription" | "akhp" | "procedure";
  medicineId?: string;
  akhpId?: string;
  procedureId?: string;
  hospitalId: string;
  transactionId: string;
  quantity: number;
  unit?: string;
  dosage?: string;
  stockBefore?: number;
  stockAfter?: number;
  isPendingStock: boolean;
  depotId?: string;
  isSlotTransacted: boolean;
  baseFee: number;
  discount: number;
  totalFee: number;
  isPriceLock: boolean;
  paidFee: number;
  payableFee: number;
  transactionType: string;
  depotStockAfter?: DepotStock[];
  depotStockBefore?: DepotStock[];
  categoryId: string;
  isPaidOff: boolean;
  createdAt: string;
  updatedAt: string;
  createdId: string;
  medicalHelperIds: string[];
  isFromCashier?: boolean;
  isIdDisc?: any;
  sellingPrice?: SellingPrice[];
  idTemp?: string;
  category?: string;
  jenis?: string;
  isEditFromCashier?: boolean;
  createdName: string;
  kmrProcedureId?: string;
  embalaseFee?: number;
  tuslahFee?: number;
  discountType?: string;
  itemsUsed?: any[];
  isPercent?: number;
  percentVal?: number;
  isInpatient?: boolean;
  updatedId?: string;
  updatedName?: string;
  isAdminFee?: boolean;
  incomeType?: "apotek" | "klinik";
}

export interface Payment {
  _id: string;
  totalFee: number;
  percentageTotal: number;
  status: string;
  type: string;
  name: string;
  transactionId: string;
  transactionDate: string;
  accountTxId: string;
  hospitalId: string;
  reason: string;
  isCovered: boolean;
  isNeedClaim: boolean;
  isOutcome: boolean;
  intent: string;
  createdAt: string;
  createdId: string;
  paidName: string;
  change: number;
  createdName: string;
  showPrescriptionPrice?: boolean;
  trueCreatedAt: string;
  discount?: number;
}

export interface Diagnosis {
  name: {
    keyword: string;
    isICD10: boolean;
    id: string;
  }[];
}

export interface Appointment {
  date?: string;
  jenisPerawatan?: string;
  poli?: string;
}

export interface Patient {
  nama: string;
  tanggalLahir: string;
  address: {
    jalan: string;
    region: string;
    city: string;
    district: string;
    postcode: string;
    subdistrict: string;
    post: number;
  };
  address_domicile: string;
  job: string;
}

export interface Practices {
  Dokters?: {
    nama: string;
    gelar: string;
  };
}

export interface PemasukanData {
  _id: string;
  status: "not paid off" | "paid off" | "credit";
  totalFee: number;
  creditFee: number;
  isOnlyPOS: boolean;
  createdAt: string;
  code: string;
  debtFee: number;
  isOutcome: boolean;
  paidFee: number;
  sumFee: number;
  roundedValue: number;
  Appointment: Appointment | {};
  Items: Item[];
  Payments: Payment[];
  Diagnoses: Diagnosis[];
  OtherNotes: any[];
  Practices: Practices | {};
  practiceId?: string;
  appointId?: string;
  patientId?: string;
  Patients?: Patient;
}

export type PemasukanDataArray = PemasukanData[];
