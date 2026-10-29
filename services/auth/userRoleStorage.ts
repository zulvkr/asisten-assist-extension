import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { AppRole, UserRoleRecord } from "@/types/userRole";

export const USER_ROLES_COLLECTION = "user_roles";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Mengambil profil peran user dari Firestore.
 * Jika dokumen belum ada, otomatis mengembalikan peran default 'kasir'.
 */
export async function fetchUserRole(email: string): Promise<UserRoleRecord> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) {
    return { email: "", role: "kasir" };
  }

  try {
    if (!db) {
      return { email: cleanEmail, role: "kasir" };
    }

    const docRef = doc(db, USER_ROLES_COLLECTION, cleanEmail);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      const rawRole = String(data.role || "kasir").toLowerCase();
      const role: AppRole = rawRole === "owner" || rawRole === "auditor" ? rawRole : "kasir";

      return {
        email: cleanEmail,
        role,
        name: data.name || cleanEmail.split("@")[0],
        canViewSystemQty: data.canViewSystemQty !== undefined ? Boolean(data.canViewSystemQty) : undefined,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
  } catch (err) {
    console.warn(`[UserRoleStorage] Gagal mengambil peran untuk ${cleanEmail}, menggunakan default 'kasir':`, err);
  }

  return { email: cleanEmail, role: "kasir" };
}

/**
 * Menyimpan / memperbarui peran pengguna di Firestore.
 */
export async function setUserRole(record: UserRoleRecord): Promise<void> {
  const cleanEmail = normalizeEmail(record.email);
  if (!cleanEmail || !db) return;

  const docRef = doc(db, USER_ROLES_COLLECTION, cleanEmail);
  await setDoc(
    docRef,
    {
      email: cleanEmail,
      role: record.role,
      name: record.name || cleanEmail.split("@")[0],
      canViewSystemQty: record.canViewSystemQty !== undefined ? record.canViewSystemQty : true,
      updatedAt: new Date().toISOString(),
      ...(record.updatedBy ? { updatedBy: record.updatedBy } : {}),
    },
    { merge: true },
  );
}

/**
 * Mengambil seluruh daftar peran pengguna di Firestore.
 */
export async function fetchAllUserRoles(): Promise<UserRoleRecord[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, USER_ROLES_COLLECTION);
    const snap = await getDocs(colRef);
    const list: UserRoleRecord[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const rawRole = String(data.role || "kasir").toLowerCase();
      const role: AppRole = rawRole === "owner" || rawRole === "auditor" ? rawRole : "kasir";
      list.push({
        email: d.id,
        role,
        name: data.name,
        canViewSystemQty: data.canViewSystemQty !== undefined ? Boolean(data.canViewSystemQty) : undefined,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      });
    });
    return list;
  } catch (err) {
    console.error("[UserRoleStorage] Gagal mengambil daftar pengguna:", err);
    return [];
  }
}
