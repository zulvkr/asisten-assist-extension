const DEFAULT_SECRET_KEY = "KPURSYSSCRTASPSBLLKGVRMNTDO!!!!!";

async function getSecretKey(): Promise<string> {
  try {
    const data = await browser.storage.local.get("assistSecretKey");
    if (data && data.assistSecretKey) {
      return data.assistSecretKey;
    }
  } catch (e) {
    console.error("Gagal mendapatkan secret key dari storage:", e);
  }
  return DEFAULT_SECRET_KEY;
}

export async function encryptPayload(plainText: string): Promise<string> {
  const secretKey = await getSecretKey();
  const enc = new TextEncoder();
  const keyBuffer = enc.encode(secretKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(16));
  const dataBuffer = enc.encode(plainText);

  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-CBC", iv: iv },
    cryptoKey,
    dataBuffer
  );

  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  // Convert combined Uint8Array to base64
  let binary = "";
  const len = combined.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

export async function decryptPayload(encryptedText: string): Promise<string> {
  const secretKey = await getSecretKey();
  const binary = atob(encryptedText);
  const combined = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  if (combined.byteLength <= 16) {
    throw new Error("Payload terenkripsi tidak valid: IV atau ciphertext tidak ditemukan.");
  }

  const iv = combined.slice(0, 16);
  const ciphertext = combined.slice(16);
  const keyBuffer = new TextEncoder().encode(secretKey);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );

  const plainBuffer = await globalThis.crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    ciphertext,
  );

  return new TextDecoder().decode(plainBuffer);
}

export async function decryptWrappedPayload(
  wrappedPayload: Record<string, unknown>,
): Promise<string> {
  const encryptedText = Object.values(wrappedPayload).find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  if (!encryptedText) {
    throw new Error("Payload terbungkus tidak berisi ciphertext.");
  }

  return decryptPayload(encryptedText);
}

export function wrapEncryptedPayload(encryptedText: string): Record<string, string> {
  const randomKey = (Math.random().toString(36) + Date.now().toString(36)).substring(2);
  return {
    [randomKey]: encryptedText
  };
}
