import { ref, computed } from "vue";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { auth } from "../config/firebase";
import type { AppRole, RolePermissions, UserRoleRecord } from "@/types/userRole";
import { resolveUserPermissions } from "@/types/userRole";
import { fetchUserRole } from "@/services/auth/userRoleStorage";

export const PRESET_USERS: string[] = [];

const currentUser = ref<User | null>(null);
const userRoleRecord = ref<UserRoleRecord | null>(null);
const authLoading = ref(true);
const roleLoading = ref(false);
const loginError = ref<string | null>(null);
let listenerInitialized = false;

async function syncUserRole(email: string | null | undefined) {
  if (!email) {
    userRoleRecord.value = null;
    return;
  }
  roleLoading.value = true;
  try {
    const record = await fetchUserRole(email);
    userRoleRecord.value = record;
  } finally {
    roleLoading.value = false;
  }
}

export function useFirebaseAuth() {
  function initAuthListener() {
    if (listenerInitialized) return;
    listenerInitialized = true;

    authLoading.value = true;
    onAuthStateChanged(auth, async (user) => {
      currentUser.value = user;
      authLoading.value = false;
      await syncUserRole(user?.email);
    });
  }

  async function login(email: string, password: string): Promise<boolean> {
    loginError.value = null;
    authLoading.value = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      currentUser.value = cred.user;
      authLoading.value = false;
      await syncUserRole(cred.user.email);
      return true;
    } catch (err: unknown) {
      authLoading.value = false;
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("auth/invalid-credential") || errorMsg.includes("auth/wrong-password")) {
        loginError.value = "Password atau email salah.";
      } else if (errorMsg.includes("auth/user-not-found")) {
        loginError.value = "Pengguna tidak ditemukan di Firebase.";
      } else if (errorMsg.includes("auth/too-many-requests")) {
        loginError.value = "Terlalu banyak percobaan gagal. Coba lagi nanti.";
      } else {
        loginError.value = `Gagal login: ${errorMsg}`;
      }
      return false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await signOut(auth);
      currentUser.value = null;
      userRoleRecord.value = null;
    } catch (err) {
      console.error("Gagal logout:", err);
    }
  }

  async function refreshRole(): Promise<void> {
    await syncUserRole(currentUser.value?.email);
  }

  const isAuthenticated = computed(() => Boolean(currentUser.value));
  const userEmail = computed(() => currentUser.value?.email || "");
  const currentRole = computed<AppRole>(() => userRoleRecord.value?.role || "kasir");

  const permissions = computed<RolePermissions>(() => {
    return resolveUserPermissions(
      currentRole.value,
      userRoleRecord.value?.canViewSystemQty !== undefined
        ? { canViewSystemQty: userRoleRecord.value.canViewSystemQty }
        : undefined,
    );
  });

  return {
    currentUser,
    userEmail,
    userRoleRecord,
    currentRole,
    permissions,
    roleLoading,
    isAuthenticated,
    authLoading,
    loginError,
    presetUsers: PRESET_USERS,
    initAuthListener,
    login,
    logout,
    refreshRole,
  };
}
