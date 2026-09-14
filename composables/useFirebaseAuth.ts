import { ref, computed } from "vue";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { auth } from "../config/firebase";

export const PRESET_USERS = [
  "atk1.apotekaldila@gmail.com",
];

const currentUser = ref<User | null>(null);
const authLoading = ref(true);
const loginError = ref<string | null>(null);
let listenerInitialized = false;

export function useFirebaseAuth() {
  function initAuthListener() {
    if (listenerInitialized) return;
    listenerInitialized = true;

    authLoading.value = true;
    onAuthStateChanged(auth, (user) => {
      currentUser.value = user;
      authLoading.value = false;
    });
  }

  async function login(email: string, password: string): Promise<boolean> {
    loginError.value = null;
    authLoading.value = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      currentUser.value = cred.user;
      authLoading.value = false;
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
    } catch (err) {
      console.error("Gagal logout:", err);
    }
  }

  const isAuthenticated = computed(() => Boolean(currentUser.value));
  const userEmail = computed(() => currentUser.value?.email || "");

  return {
    currentUser,
    userEmail,
    isAuthenticated,
    authLoading,
    loginError,
    presetUsers: PRESET_USERS,
    initAuthListener,
    login,
    logout,
  };
}
