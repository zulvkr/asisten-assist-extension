import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type {
  StockOpnameSession,
  StockOpnameCountsMap,
  StockOpnameStatus,
  StockOpnameScope,
  StockOpnameScopeDetails,
} from "@/types/stockOpname";

export const STOCK_OPNAMES_COLLECTION = "stock_opnames";

function generateTodayPrefix(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `SO-${year}${month}${day}`;
}

/**
 * Mengambil daftar seluruh sesi stock opname dari Firestore.
 */
export async function fetchStockOpnameSessions(): Promise<StockOpnameSession[]> {
  if (!db) return [];
  try {
    const collRef = collection(db, STOCK_OPNAMES_COLLECTION);
    const q = query(collRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const sessions: StockOpnameSession[] = [];
    snap.forEach((d) => {
      const data = d.data();
      sessions.push({
        id: d.id,
        opnameNumber: data.opnameNumber || d.id,
        status: (data.status as StockOpnameStatus) || "InProgress",
        scope: (data.scope as StockOpnameScope) || "Full",
        scopeDetails: data.scopeDetails,
        itemIdsFilter: Array.isArray(data.itemIdsFilter) ? data.itemIdsFilter : undefined,
        notes: data.notes || "",
        createdAt: data.createdAt || new Date().toISOString(),
        createdBy: data.createdBy || "-",
        completedAt: data.completedAt,
        completedBy: data.completedBy,
        totalItems: Number(data.totalItems) || 0,
        countedItems: Number(data.countedItems) || 0,
        discrepancyCount: Number(data.discrepancyCount) || 0,
        totalVariance: Number(data.totalVariance) || 0,
      });
    });

    return sessions;
  } catch (err) {
    console.error("[StockOpnameStorage] Gagal mengambil daftar sesi:", err);
    return [];
  }
}

/**
 * Mengambil detail header sesi berdasarkan ID.
 */
export async function fetchStockOpnameSessionById(
  sessionId: string,
): Promise<StockOpnameSession | null> {
  if (!db || !sessionId) return null;
  try {
    const docRef = doc(db, STOCK_OPNAMES_COLLECTION, sessionId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;

    const data = snap.data();
    return {
      id: snap.id,
      opnameNumber: data.opnameNumber || snap.id,
      status: (data.status as StockOpnameStatus) || "InProgress",
      scope: (data.scope as StockOpnameScope) || "Full",
      scopeDetails: data.scopeDetails,
      itemIdsFilter: Array.isArray(data.itemIdsFilter) ? data.itemIdsFilter : undefined,
      notes: data.notes || "",
      createdAt: data.createdAt || new Date().toISOString(),
      createdBy: data.createdBy || "-",
      completedAt: data.completedAt,
      completedBy: data.completedBy,
      totalItems: Number(data.totalItems) || 0,
      countedItems: Number(data.countedItems) || 0,
      discrepancyCount: Number(data.discrepancyCount) || 0,
      totalVariance: Number(data.totalVariance) || 0,
    };
  } catch (err) {
    console.error(`[StockOpnameStorage] Gagal mengambil detail sesi ${sessionId}:`, err);
    return null;
  }
}

/**
 * Membuat sesi Stock Opname baru di Firestore.
 */
export async function createStockOpnameSession(params: {
  createdBy: string;
  totalItems: number;
  scope?: StockOpnameScope;
  scopeDetails?: StockOpnameScopeDetails;
  itemIdsFilter?: string[];
  notes?: string;
}): Promise<StockOpnameSession> {
  if (!db) throw new Error("Firestore database tidak terinisialisasi.");

  const prefix = generateTodayPrefix();
  // Ambil count untuk nomor urut
  const allSessions = await fetchStockOpnameSessions();
  const todaySessions = allSessions.filter((s) => s.opnameNumber.startsWith(prefix));
  const seq = String(todaySessions.length + 1).padStart(3, "0");
  const opnameNumber = `${prefix}-${seq}`;

  const sessionId = `so_${Date.now()}`;
  const now = new Date().toISOString();

  const newSession: StockOpnameSession = {
    id: sessionId,
    opnameNumber,
    status: "InProgress",
    scope: params.scope || "Full",
    ...(params.scopeDetails ? { scopeDetails: params.scopeDetails } : {}),
    ...(params.itemIdsFilter ? { itemIdsFilter: params.itemIdsFilter } : {}),
    notes: params.notes || "",
    createdAt: now,
    createdBy: params.createdBy,
    totalItems: params.totalItems,
    countedItems: 0,
    discrepancyCount: 0,
    totalVariance: 0,
  };

  const docRef = doc(db, STOCK_OPNAMES_COLLECTION, sessionId);
  await setDoc(docRef, newSession);

  // Inisialisasi dokumen data/counts kosong
  const countsDocRef = doc(db, STOCK_OPNAMES_COLLECTION, sessionId, "data", "counts");
  await setDoc(countsDocRef, { counts: {} });

  return newSession;
}

/**
 * Mengambil map hitungan fisik dari sub-dokumen data/counts.
 */
export async function fetchStockOpnameCounts(
  sessionId: string,
): Promise<StockOpnameCountsMap> {
  if (!db || !sessionId) return {};
  try {
    const countsDocRef = doc(db, STOCK_OPNAMES_COLLECTION, sessionId, "data", "counts");
    const snap = await getDoc(countsDocRef);
    if (!snap.exists()) return {};
    const data = snap.data();
    return (data.counts as StockOpnameCountsMap) || {};
  } catch (err) {
    console.error(`[StockOpnameStorage] Gagal mengambil hitungan untuk ${sessionId}:`, err);
    return {};
  }
}

/**
 * Menyimpan / memperbarui map hitungan fisik ke sub-dokumen data/counts,
 * serta mengupdate statistik di dokumen header sesi.
 */
export async function saveStockOpnameCounts(
  sessionId: string,
  countsMap: StockOpnameCountsMap,
  summary: { countedItems: number; discrepancyCount: number; totalVariance: number },
): Promise<void> {
  if (!db || !sessionId) return;

  const countsDocRef = doc(db, STOCK_OPNAMES_COLLECTION, sessionId, "data", "counts");
  await setDoc(countsDocRef, { counts: countsMap }, { merge: true });

  const headerDocRef = doc(db, STOCK_OPNAMES_COLLECTION, sessionId);
  await updateDoc(headerDocRef, {
    countedItems: summary.countedItems,
    discrepancyCount: summary.discrepancyCount,
    totalVariance: summary.totalVariance,
  });
}

/**
 * Memperbarui status sesi (Completed atau Cancelled).
 */
export async function updateStockOpnameStatus(
  sessionId: string,
  status: StockOpnameStatus,
  userEmail: string,
): Promise<void> {
  if (!db || !sessionId) return;

  const headerDocRef = doc(db, STOCK_OPNAMES_COLLECTION, sessionId);
  const now = new Date().toISOString();

  await updateDoc(headerDocRef, {
    status,
    completedAt: now,
    completedBy: userEmail,
  });
}
