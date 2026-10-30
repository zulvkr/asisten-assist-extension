import {
  collection,
  doc,
  getDocs,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type { DestyReturnCheckRecord } from "@/types/destyCancelledReturn";

export const DESTY_RETURN_CHECKS_STORAGE_KEY = "destySync:returnChecks";
export const DESTY_RETURN_CHECKS_COLLECTION = "desty_return_checks";

/**
 * Normalizes an order identifier (orderSn / orderId) to be safe for Firestore document keys.
 */
export function sanitizeReturnCheckDocId(id: string): string {
  return String(id ?? "").trim().toUpperCase().replace(/[\/\.#$\[\]\s]/g, "_");
}

/**
 * Retrieves cached return check records from browser local storage.
 */
export async function getReturnCheckRecordsFromLocal(): Promise<Record<string, DestyReturnCheckRecord>> {
  try {
    const stored = await browser.storage.local.get(DESTY_RETURN_CHECKS_STORAGE_KEY);
    const value = stored?.[DESTY_RETURN_CHECKS_STORAGE_KEY];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, DestyReturnCheckRecord>;
    }
  } catch (err) {
    console.warn("[DestyReturnCheckStorage] Gagal membaca cache local storage:", err);
  }
  return {};
}

/**
 * Saves return check records to browser local storage.
 */
export async function saveReturnCheckRecordsToLocal(
  records: Record<string, DestyReturnCheckRecord>,
): Promise<void> {
  try {
    await browser.storage.local.set({
      [DESTY_RETURN_CHECKS_STORAGE_KEY]: records,
    });
  } catch (err) {
    console.warn("[DestyReturnCheckStorage] Gagal menulis ke local storage:", err);
  }
}

/**
 * Fetches all return check records directly from Firestore.
 */
export async function fetchReturnCheckRecordsFromFirestore(): Promise<Record<string, DestyReturnCheckRecord>> {
  try {
    if (!db) return {};
    const collRef = collection(db, DESTY_RETURN_CHECKS_COLLECTION);
    const snapshot = await getDocs(collRef);
    const result: Record<string, DestyReturnCheckRecord> = {};
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Partial<DestyReturnCheckRecord>;
      const key = String(data.orderSn || data.orderId || docSnap.id).trim().toUpperCase();
      if (key) {
        result[key] = {
          orderId: String(data.orderId || docSnap.id),
          orderSn: String(data.orderSn || key),
          displayedOrderSn: String(data.displayedOrderSn || data.orderSn || key),
          bookingSn: data.bookingSn ? String(data.bookingSn) : undefined,
          trackingNumber: data.trackingNumber ? String(data.trackingNumber) : undefined,
          platformName: String(data.platformName || "Marketplace"),
          received: Boolean(data.received),
          checkedByUid: data.checkedByUid ? String(data.checkedByUid) : undefined,
          checkedByEmail: data.checkedByEmail ? String(data.checkedByEmail) : undefined,
          checkedByName: data.checkedByName ? String(data.checkedByName) : undefined,
          checkedAt: data.checkedAt ? String(data.checkedAt) : undefined,
          notes: data.notes ? String(data.notes) : undefined,
          processedAt: data.processedAt ? String(data.processedAt) : undefined,
          createdAt: data.createdAt ? String(data.createdAt) : undefined,
          updatedAt: String(data.updatedAt || new Date().toISOString()),
        };
      }
    });
    return result;
  } catch (err) {
    console.warn("[DestyReturnCheckStorage] Gagal membaca Firestore:", err);
    return {};
  }
}

/**
 * Merges local and Firestore records (prioritizing the newer updatedAt timestamp).
 */
export async function getReturnCheckRecords(): Promise<Record<string, DestyReturnCheckRecord>> {
  const localMap = await getReturnCheckRecordsFromLocal();
  const firestoreMap = await fetchReturnCheckRecordsFromFirestore();

  const merged: Record<string, DestyReturnCheckRecord> = { ...localMap };

  for (const [key, firestoreRecord] of Object.entries(firestoreMap)) {
    const localRecord = merged[key];
    if (!localRecord) {
      merged[key] = firestoreRecord;
    } else {
      const localTime = new Date(localRecord.updatedAt || 0).getTime();
      const firestoreTime = new Date(firestoreRecord.updatedAt || 0).getTime();
      if (firestoreTime >= localTime) {
        merged[key] = firestoreRecord;
      }
    }
  }

  // Update local storage with the merged dataset
  await saveReturnCheckRecordsToLocal(merged);
  return merged;
}

/**
 * Persists a single return check record to local storage and Firestore.
 */
export async function saveReturnCheckRecord(record: DestyReturnCheckRecord): Promise<void> {
  const key = String(record.orderSn || record.orderId).trim().toUpperCase();
  const localMap = await getReturnCheckRecordsFromLocal();
  localMap[key] = record;
  await saveReturnCheckRecordsToLocal(localMap);

  try {
    if (db) {
      const docId = sanitizeReturnCheckDocId(key);
      const docRef = doc(db, DESTY_RETURN_CHECKS_COLLECTION, docId);
      const payload: Record<string, unknown> = {
        orderId: record.orderId,
        orderSn: record.orderSn,
        displayedOrderSn: record.displayedOrderSn,
        platformName: record.platformName,
        received: record.received,
        updatedAt: record.updatedAt,
      };
      if (record.bookingSn) payload.bookingSn = record.bookingSn;
      if (record.trackingNumber) payload.trackingNumber = record.trackingNumber;
      if (record.checkedByUid) payload.checkedByUid = record.checkedByUid;
      if (record.checkedByEmail) payload.checkedByEmail = record.checkedByEmail;
      if (record.checkedByName) payload.checkedByName = record.checkedByName;
      if (record.checkedAt) payload.checkedAt = record.checkedAt;
      if (record.notes !== undefined) payload.notes = record.notes;
      if (record.processedAt) payload.processedAt = record.processedAt;
      if (record.createdAt) payload.createdAt = record.createdAt;

      await setDoc(docRef, payload, { merge: true });
    }
  } catch (err) {
    console.warn("[DestyReturnCheckStorage] Gagal sinkron ke Firestore (tersimpan lokal):", err);
  }
}

export interface ToggleReturnCheckParams {
  orderId: string;
  orderSn: string;
  displayedOrderSn?: string;
  bookingSn?: string;
  trackingNumber?: string;
  platformName?: string;
  processedAt?: string;
  createdAt?: string;
  checkedByEmail?: string;
  checkedByName?: string;
  checkedByUid?: string;
  notes?: string;
  forceReceived?: boolean;
}

/**
 * Toggles or sets the physical return reception state for an order.
 */
export async function toggleReturnCheckOrder(
  params: ToggleReturnCheckParams,
): Promise<DestyReturnCheckRecord> {
  const key = String(params.orderSn || params.orderId).trim().toUpperCase();
  const localMap = await getReturnCheckRecordsFromLocal();
  const existing = localMap[key];

  const willBeReceived = params.forceReceived !== undefined ? params.forceReceived : !existing?.received;
  const now = new Date().toISOString();

  const record: DestyReturnCheckRecord = {
    orderId: params.orderId,
    orderSn: params.orderSn,
    displayedOrderSn: params.displayedOrderSn || params.orderSn,
    bookingSn: params.bookingSn || existing?.bookingSn,
    trackingNumber: params.trackingNumber || existing?.trackingNumber,
    platformName: params.platformName || existing?.platformName || "Marketplace",
    received: willBeReceived,
    checkedByUid: willBeReceived ? params.checkedByUid || existing?.checkedByUid : undefined,
    checkedByEmail: willBeReceived ? params.checkedByEmail || existing?.checkedByEmail : undefined,
    checkedByName: willBeReceived ? params.checkedByName || existing?.checkedByName : undefined,
    checkedAt: willBeReceived ? now : undefined,
    notes: params.notes !== undefined ? params.notes : existing?.notes,
    processedAt: params.processedAt || existing?.processedAt,
    createdAt: params.createdAt || existing?.createdAt,
    updatedAt: now,
  };

  await saveReturnCheckRecord(record);
  return record;
}

/**
 * Updates the notes for an order.
 */
export async function updateOrderNotes(
  orderKey: string,
  notes: string,
): Promise<DestyReturnCheckRecord | null> {
  const key = String(orderKey).trim().toUpperCase();
  const localMap = await getReturnCheckRecordsFromLocal();
  const existing = localMap[key];
  if (!existing) {
    return null;
  }

  const updated: DestyReturnCheckRecord = {
    ...existing,
    notes: notes.trim(),
    updatedAt: new Date().toISOString(),
  };

  await saveReturnCheckRecord(updated);
  return updated;
}

/**
 * Real-time listener for return checks across clients.
 */
export function subscribeReturnChecks(
  callback: (records: Record<string, DestyReturnCheckRecord>) => void,
): () => void {
  try {
    if (!db) return () => {};
    const collRef = collection(db, DESTY_RETURN_CHECKS_COLLECTION);
    const unsubscribe = onSnapshot(
      collRef,
      (snapshot) => {
        const records: Record<string, DestyReturnCheckRecord> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Partial<DestyReturnCheckRecord>;
          const key = String(data.orderSn || data.orderId || docSnap.id).trim().toUpperCase();
          if (key) {
            records[key] = {
              orderId: String(data.orderId || docSnap.id),
              orderSn: String(data.orderSn || key),
              displayedOrderSn: String(data.displayedOrderSn || data.orderSn || key),
              bookingSn: data.bookingSn ? String(data.bookingSn) : undefined,
              trackingNumber: data.trackingNumber ? String(data.trackingNumber) : undefined,
              platformName: String(data.platformName || "Marketplace"),
              received: Boolean(data.received),
              checkedByUid: data.checkedByUid ? String(data.checkedByUid) : undefined,
              checkedByEmail: data.checkedByEmail ? String(data.checkedByEmail) : undefined,
              checkedByName: data.checkedByName ? String(data.checkedByName) : undefined,
              checkedAt: data.checkedAt ? String(data.checkedAt) : undefined,
              notes: data.notes ? String(data.notes) : undefined,
              processedAt: data.processedAt ? String(data.processedAt) : undefined,
              createdAt: data.createdAt ? String(data.createdAt) : undefined,
              updatedAt: String(data.updatedAt || new Date().toISOString()),
            };
          }
        });
        void saveReturnCheckRecordsToLocal(records);
        callback(records);
      },
      (error) => {
        console.warn("[DestyReturnCheckStorage] Snapshot listener error:", error);
      },
    );
    return unsubscribe;
  } catch (err) {
    console.warn("[DestyReturnCheckStorage] Gagal subscribe onSnapshot:", err);
    return () => {};
  }
}
