import { fetchGeminiConfig } from "@/services/gemini/geminiConfigStorage";
import type {
  AiTokenUsage,
  RawGeminiInvoiceExtraction,
} from "@/types/fakturScan";

const SYSTEM_PROMPT = `You are 'Budi', an expert Indonesian Pharmacy Invoice (Faktur Farmasi PBF) OCR and Data Extraction Assistant.
Analyze this Indonesian pharmaceutical invoice (Faktur Penjualan PBF) carefully.
Extract all required data into strict structured JSON format according to the schema.

Guidelines for Indonesian PBF Invoices:
1. Supplier / PBF Name: Often starts with PT, e.g. PT TIGATRA ANUGRAH LESTARI, PT ANUGERAH PHARMINDO LESTARI, PT KIMIA FARMA, PT MENSA BINASUKSES, PT MILLENNIUM PHARMACON INTERNATIONAL, PT ENSEVAL PUTERA MEGATRADING, etc.
2. Invoice Number (No. Faktur): Look for 'No. Faktur', 'Nomor Faktur', 'No. Dokumen', or 'No. Invoice' (e.g. 09260014, F-2026/09/0123).
3. Dates & Payment Terms:
   - Invoice Date (Tgl Faktur): Convert Indonesian dates like '1 Sep 2026' or '01/09/2026' or '2026-09-01' to ISO YYYY-MM-DD.
   - Due Date (Jatuh Tempo / Tgl Jatuh Tempo): Convert to ISO YYYY-MM-DD if present.
   - Purchase Type: 'Cod' (Cash on delivery/Tunai/Kontan), 'Tempo' (Credit with TOP / Jatuh Tempo), or 'Konsinyasi' (Consignment). If there is a due date or TOP days, set 'Tempo'.
4. PPN Type:
   - Check if PPN 11% or 12% is added to subtotal (Exclude) or already included in item unit price (Include). If tax is explicitly added after subtotal to form grand total, use 'Exclude'.
5. Line Items:
   - Product Name (Nama Barang): Clean up trailing packaging codes if needed, e.g., 'CALCIFAR PLUS TAB', 'ANTASID DOEN 200MG BOX (TRIFA)', 'CEFIXIME 200MG BOX', 'PARACETAMOL 500 MG TAB'.
   - Batch Number: Extract clean batch number (e.g. 'AX0AB', '2602318', '57C0158', 'E362F56', 'K6040097', '56L0506').
   - Expiry Date: Extract expiry date (ED / Expired Date) and convert to ISO YYYY-MM-DD (e.g. '15/5/2028' -> '2028-05-15', '01/11/2027' -> '2027-11-01', 'Nov-27' -> '2027-11-01').
   - Quantity: Integer quantity received in invoice packaging unit.
   - Unit Name: Packaging unit stated on invoice: 'BOX', 'DUS', 'BTL', 'STRIP', 'TAB', 'VIAL', 'TUBE', 'PCS', 'SACHET', etc.
   - Pack Info & Conversion Factor:
     * Look for packaging descriptions like '10X10', '10 STRIP @ 10 TAB', 'BOX ISI 100', 'BTL 60ML', '24 SACHET'.
     * If invoice unit is BOX / DUS and contains multiple strips (e.g. 10 strip/box) or tablets (e.g. 100 tab/box), extract conversionFactor (e.g. 10 or 100) and packInfo (e.g. '10 strip x 10 tab').
     * If not specified, default conversionFactor to 1.
   - Unit Price: Base unit price before discounts for the stated invoice unit. Numbers with dot or comma as thousands separator (e.g. 20.128 or 20,128) must be parsed as numeric 20128.
   - Discount percent: Parse single or tiered discount (e.g. Disk % or Disk 1 / Disk 2).
   - Total line price: Total amount for this item line.`;

const JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    supplierName: { type: "STRING" },
    invoiceNumber: { type: "STRING" },
    invoiceDate: { type: "STRING", description: "YYYY-MM-DD format" },
    dueDate: { type: "STRING", description: "YYYY-MM-DD format" },
    purchaseType: {
      type: "STRING",
      enum: ["Cod", "Tempo", "Konsinyasi"],
    },
    ppnType: {
      type: "STRING",
      enum: ["Include", "Exclude", "None"],
    },
    subTotal: { type: "NUMBER" },
    totalDiscount: { type: "NUMBER" },
    totalPpn: { type: "NUMBER" },
    grandTotal: { type: "NUMBER" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          rawProductName: { type: "STRING" },
          batchNumber: { type: "STRING" },
          expiryDate: {
            type: "STRING",
            description: "YYYY-MM-DD format",
          },
          quantity: { type: "INTEGER" },
          unitName: { type: "STRING" },
          conversionFactor: {
            type: "INTEGER",
            description: "Conversion factor from box/pack to inner unit (e.g. 10 if 10 strips per box)",
          },
          packInfo: {
            type: "STRING",
            description: "Packaging details e.g. 10x10 or 100 tab",
          },
          unitPrice: { type: "NUMBER" },
          discountPercent1: { type: "NUMBER" },
          discountPercent2: { type: "NUMBER" },
          totalLinePrice: { type: "NUMBER" },
        },
        required: [
          "rawProductName",
          "batchNumber",
          "expiryDate",
          "quantity",
          "unitPrice",
        ],
      },
    },
  },
  required: ["supplierName", "invoiceNumber", "items"],
};

export async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Calculates Token Usage & Cost Estimation in USD & IDR.
 */
export function calculateTokenCost(
  model: string,
  promptTokens: number,
  candidateTokens: number,
  cachedTokens: number,
  elapsedMs: number,
): AiTokenUsage {
  let inputRatePerMillion = 0.75;
  let outputRatePerMillion = 3.75;
  let cachedRatePerMillion = 0.075;

  const lowerModel = model.toLowerCase();
  if (lowerModel.includes("3.7-flash")) {
    inputRatePerMillion = 0.75;
    outputRatePerMillion = 3.75;
    cachedRatePerMillion = 0.075;
  } else if (lowerModel.includes("flash-lite") || lowerModel.includes("2.5-flash")) {
    inputRatePerMillion = 0.30;
    outputRatePerMillion = 2.50;
    cachedRatePerMillion = 0.075;
  } else if (lowerModel.includes("pro")) {
    inputRatePerMillion = 2.00;
    outputRatePerMillion = 12.00;
    cachedRatePerMillion = 0.50;
  } else {
    // Default 1.5 flash rate
    inputRatePerMillion = 0.075;
    outputRatePerMillion = 0.30;
    cachedRatePerMillion = 0.01875;
  }

  const uncachedPromptTokens = Math.max(0, promptTokens - cachedTokens);
  const costUsd =
    (uncachedPromptTokens / 1_000_000) * inputRatePerMillion +
    (cachedTokens / 1_000_000) * cachedRatePerMillion +
    (candidateTokens / 1_000_000) * outputRatePerMillion;

  const USD_TO_IDR = 17740;
  const costIdr = costUsd * USD_TO_IDR;

  return {
    model,
    promptTokens,
    candidateTokens,
    totalTokens: promptTokens + candidateTokens,
    cachedTokens,
    elapsedMilliseconds: elapsedMs,
    estimatedCostUsd: Number(costUsd.toFixed(6)),
    estimatedCostIdr: Number(costIdr.toFixed(2)),
  };
}

/**
 * Executes Gemini Vision OCR on an invoice file / image base64.
 */
export async function extractInvoiceWithGemini(
  fileOrBase64: File | Blob | string,
  mimeType = "image/jpeg",
): Promise<RawGeminiInvoiceExtraction> {
  const config = await fetchGeminiConfig();
  if (!config.apiKey?.trim()) {
    throw new Error(
      "API Key Google Gemini belum diatur. Silakan masukkan Gemini API Key di menu Pengaturan (Settings)."
    );
  }

  let base64Data: string;
  let effectiveMimeType = mimeType;

  if (typeof fileOrBase64 === "string") {
    base64Data = fileOrBase64.includes(",") ? fileOrBase64.split(",")[1] : fileOrBase64;
  } else {
    base64Data = await fileToBase64(fileOrBase64);
    if (fileOrBase64 instanceof File && fileOrBase64.type) {
      effectiveMimeType = fileOrBase64.type;
    }
  }

  const model = config.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey.trim()}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: SYSTEM_PROMPT },
          {
            inline_data: {
              mime_type: effectiveMimeType || "image/jpeg",
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: JSON_SCHEMA,
    },
  };

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (config.timeoutSeconds || 120) * 1000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startTime;

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorObj = await response.json();
        if (errorObj?.error?.message) {
          errorDetail = errorObj.error.message;
        }
      } catch {
        // ignore json parse error
      }
      throw new Error(`Google Gemini Error (${response.status}): ${errorDetail}`);
    }

    const responseJson = await response.json();
    const rawText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText || !rawText.trim()) {
      throw new Error("Gemini mengembalikan respon kosong saat ekstraksi faktur.");
    }

    // Parse Token Usage
    const usageMetadata = responseJson?.usageMetadata;
    const promptTokens = Number(usageMetadata?.promptTokenCount) || 0;
    const candidateTokens = Number(usageMetadata?.candidatesTokenCount) || 0;
    const cachedTokens = Number(usageMetadata?.cachedContentTokenCount) || 0;

    const tokenUsage = calculateTokenCost(
      model,
      promptTokens,
      candidateTokens,
      cachedTokens,
      elapsedMs,
    );

    let parsed: RawGeminiInvoiceExtraction;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.error("[GeminiInvoiceOCR] Failed to parse JSON:", rawText);
      throw new Error(`Gagal memparsing struktur JSON faktur dari AI: ${err instanceof Error ? err.message : String(err)}`);
    }

    parsed.tokenUsage = tokenUsage;
    return parsed;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Batas waktu OCR Gemini terlampaui (${config.timeoutSeconds || 120} detik). Silakan coba lagi.`);
    }
    throw err;
  }
}
