import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { GeminiConfig } from "@/types/fakturScan";

export const GEMINI_SETTINGS_COLLECTION = "settings";
export const GEMINI_SETTINGS_DOC = "gemini";
export const GEMINI_LOCAL_STORAGE_KEY = "gemini_config";

export const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";
export const DEFAULT_GEMINI_TIMEOUT_SECONDS = 120;

export const AVAILABLE_GEMINI_MODELS = [
  { label: "Gemini 2.5 Flash (Cepat & Direkomendasikan)", value: "gemini-2.5-flash" },
  { label: "Gemini 3.7 Flash (Model AI Terbaru)", value: "gemini-3.7-flash" },
  { label: "Gemini 1.5 Flash (Legacy Fast)", value: "gemini-1.5-flash" },
  { label: "Gemini 1.5 Pro (Akurasi Tinggi Dokumen Kompleks)", value: "gemini-1.5-pro" },
];

/**
 * Loads Gemini API configuration from Firestore with local storage fallback cache.
 */
export async function fetchGeminiConfig(): Promise<GeminiConfig> {
  let cachedConfig: GeminiConfig = {
    apiKey: "",
    model: DEFAULT_GEMINI_MODEL,
    timeoutSeconds: DEFAULT_GEMINI_TIMEOUT_SECONDS,
  };

  // Try loading from local storage cache first
  try {
    const storageLocal = browser?.storage?.local;
    if (storageLocal) {
      const stored = await storageLocal.get(GEMINI_LOCAL_STORAGE_KEY);
      if (stored && stored[GEMINI_LOCAL_STORAGE_KEY]) {
        cachedConfig = {
          ...cachedConfig,
          ...stored[GEMINI_LOCAL_STORAGE_KEY],
        };
      }
    }
  } catch (err) {
    console.warn("[GeminiConfig] Failed to read from local storage:", err);
  }

  // Try fetching latest config from Firestore
  try {
    const docRef = doc(db, GEMINI_SETTINGS_COLLECTION, GEMINI_SETTINGS_DOC);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<GeminiConfig>;
      const config: GeminiConfig = {
        apiKey: data.apiKey?.trim() || cachedConfig.apiKey || "",
        model: data.model?.trim() || cachedConfig.model || DEFAULT_GEMINI_MODEL,
        timeoutSeconds: data.timeoutSeconds || cachedConfig.timeoutSeconds || DEFAULT_GEMINI_TIMEOUT_SECONDS,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };

      // Update local storage cache
      try {
        const storageLocal = browser?.storage?.local;
        if (storageLocal) {
          await storageLocal.set({ [GEMINI_LOCAL_STORAGE_KEY]: config });
        }
      } catch {
        // ignore cache write error
      }

      return config;
    }
  } catch (err) {
    console.warn("[GeminiConfig] Could not fetch from Firestore (using cached config):", err);
  }

  return cachedConfig;
}

/**
 * Saves Gemini API configuration to Firestore and updates local cache.
 */
export async function saveGeminiConfig(
  config: Partial<GeminiConfig>,
  updatedBy?: string,
): Promise<GeminiConfig> {
  const existing = await fetchGeminiConfig();
  const merged: GeminiConfig = {
    apiKey: config.apiKey !== undefined ? config.apiKey.trim() : existing.apiKey,
    model: config.model !== undefined ? config.model.trim() : existing.model || DEFAULT_GEMINI_MODEL,
    timeoutSeconds: config.timeoutSeconds || existing.timeoutSeconds || DEFAULT_GEMINI_TIMEOUT_SECONDS,
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };

  // Save to Firestore
  try {
    const docRef = doc(db, GEMINI_SETTINGS_COLLECTION, GEMINI_SETTINGS_DOC);
    await setDoc(docRef, merged, { merge: true });
  } catch (err) {
    console.error("[GeminiConfig] Failed to write to Firestore:", err);
    throw new Error(
      `Gagal menyimpan ke Firestore: ${err instanceof Error ? err.message : String(err)}. Pastikan Anda sudah login.`
    );
  }

  // Save to local storage
  try {
    const storageLocal = browser?.storage?.local;
    if (storageLocal) {
      await storageLocal.set({ [GEMINI_LOCAL_STORAGE_KEY]: merged });
    }
  } catch (err) {
    console.warn("[GeminiConfig] Failed to update local storage cache:", err);
  }

  return merged;
}

/**
 * Tests connection to Google Gemini API using the given API key and model.
 */
export async function testGeminiConnection(
  apiKey: string,
  model = DEFAULT_GEMINI_MODEL,
): Promise<{ ok: boolean; message: string; durationMs: number }> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { ok: false, message: "API Key Gemini tidak boleh kosong.", durationMs: 0 };
  }

  const cleanModel = model.trim() || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanKey}`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: "Hello, confirm you are ready." }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 20,
        },
      }),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorDetail = errorJson.error.message;
        }
      } catch {
        // ignore json parse error
      }
      return {
        ok: false,
        message: `Koneksi gagal: ${errorDetail}`,
        durationMs,
      };
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "OK";

    return {
      ok: true,
      message: `Berhasil terhubung ke Google Gemini (${cleanModel}) dalam ${durationMs}ms: "${reply.trim()}"`,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    return {
      ok: false,
      message: `Terjadi kesalahan jaringan: ${err instanceof Error ? err.message : String(err)}`,
      durationMs,
    };
  }
}
