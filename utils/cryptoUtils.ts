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

export function wrapEncryptedPayload(encryptedText: string): Record<string, string> {
  const randomKey = (Math.random().toString(36) + Date.now().toString(36)).substring(2);
  return {
    [randomKey]: encryptedText
  };
}
