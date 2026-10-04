export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutSeconds?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface RawGeminiInvoiceExtraction {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  purchaseType?: "Cod" | "Tempo" | "Konsinyasi";
  ppnType?: "Include" | "Exclude" | "None";
  subTotal?: number;
  totalDiscount?: number;
  totalPpn?: number;
  grandTotal?: number;
  items: RawGeminiInvoiceItem[];
  tokenUsage?: AiTokenUsage;
}

export interface RawGeminiInvoiceItem {
  rawProductName: string;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  quantity: number;
  unitName?: string;
  conversionFactor?: number;
  packInfo?: string;
  unitPrice: number;
  discountPercent1?: number;
  discountPercent2?: number;
  totalLinePrice?: number;
}

export interface AiTokenUsage {
  model: string;
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  cachedTokens: number;
  elapsedMilliseconds: number;
  estimatedCostUsd: number;
  estimatedCostIdr: number;
}

export interface ExtractedInvoiceItem {
  rawProductName: string;
  matchedProductId?: string;
  matchedProductName?: string;
  matchedCode?: string;
  matchedType?: "prescription" | "akhp";
  isBHP?: boolean;
  depotId?: string;
  medicineId?: string;
  akhpId?: string;
  productMatchConfidence: number;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  isNearExpiry: boolean;
  quantity: number; // Converted qty in base unit
  rawQuantity: number; // Stated qty on invoice
  conversionFactor: number;
  packInfo?: string;
  extractedUnitName?: string;
  matchedUnitName?: string;
  unitPrice: number; // Converted unit price in base unit
  rawUnitPrice: number; // Stated unit price per pack
  discountPercent1: number;
  discountPercent2: number;
  discountAmount: number;
  subtotal: number;
  netPricePerUnit: number;
  previousBuyPrice?: number;
  currentSellPrice?: number;
  currentMarginPercent?: number;
  targetMarginPercent?: number;
  suggestedSellPrice?: number;
  newSellPrice?: number;
  isPriceIncreased: boolean;
  hppChangePercent?: number;
  originalCatalog?: any;
  _isUserModified?: boolean;
  _sellPriceManuallyEdited?: boolean;
}

export interface ExtractInvoiceResult {
  attachmentFileName?: string;
  attachmentUrl?: string;
  extractedSupplierName?: string;
  matchedSupplierId?: string;
  matchedSupplierName?: string;
  supplierMatchConfidence: number;
  invoiceNumber?: string;
  invoiceDate: string;
  receivedDate: string;
  dueDate?: string;
  purchaseType: "Cod" | "Tempo" | "Konsinyasi" | string;
  ppnType: "Include" | "Exclude";
  totalBeforeDiscount: number;
  totalDiscount: number;
  totalPpn: number;
  grandTotal: number;
  items: ExtractedInvoiceItem[];
  totalItemsCount: number;
  matchedProductsCount: number;
  priceIncreaseCount: number;
  tokenUsage?: AiTokenUsage;
}
