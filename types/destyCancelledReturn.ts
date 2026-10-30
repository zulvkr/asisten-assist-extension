export interface DestyReturnCheckRecord {
  /** ID unik dokumen Firestore: orderSn atau orderId */
  orderId: string;
  orderSn: string;
  displayedOrderSn: string;
  bookingSn?: string;
  trackingNumber?: string;
  platformName: string;

  /** Status penerimaan fisik barang di apotek */
  received: boolean;
  checkedByUid?: string;
  checkedByEmail?: string;
  checkedByName?: string;
  checkedAt?: string; // ISO 8601
  notes?: string; // Catatan kondisi fisik barang

  /** Waktu proses di Desty */
  processedAt?: string; // Tanggal & waktu pesanan diproses / dipacking
  createdAt?: string; // Tanggal pesanan dibuat di marketplace

  updatedAt: string;
}

export interface CancelledOrderItem {
  sku: string;
  productName: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
}

export interface CancelledOrderRow {
  rowId: string; // orderId / orderSn
  orderId: string;
  orderSn: string;
  displayedOrderSn: string;
  bookingSn?: string;
  trackingNumber?: string;
  courier?: string;
  platformName: string;
  destyStatus: string; // e.g. "Cancellations" | "Returns"

  // Waktu
  orderCreatedAt?: string;
  orderProcessedAt?: string; // Kapan diproses / dipacking
  hasBeenProcessed: boolean; // True jika ada tanggal pemrosesan/packing

  // Data tambahan dari Desty
  labelPrinted?: boolean;
  cancelBy?: string;
  cancelReason?: string;
  logisticsStatus?: string; // "DeliveryFailed" | "Error" | null
  requestCancelStatus?: number; // 2 = cancel accepted
  handoverStatus: "DELIVERY_FAILED" | "READY_TO_SHIP" | "NOT_HANDED_OVER";
  packageStatusHistory?: Array<{
    status: string;
    statusUpdateTime: number;
  }>;

  // Rincian produk dalam pesanan
  items: CancelledOrderItem[];
  totalQuantity: number;
  totalPrice: number;

  // Status Checklist & Petugas (dari Firebase/Storage)
  isReceived: boolean;
  checkedBy?: string;
  checkedByEmail?: string;
  checkedAt?: string;
  notes?: string;

  // Referensi Impor Assist (jika ada di ledger)
  assistInvoice?: string;
  assistTxId?: string;
}
