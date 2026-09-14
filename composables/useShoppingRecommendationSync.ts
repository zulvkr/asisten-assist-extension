import { ref } from "vue";
import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../config/firebase";
import { useFirebaseAuth } from "./useFirebaseAuth";
import type { ShoppingRecommendationSettings } from "@/types/ShoppingRecommendation";

const REKOMENDASI_DOC_PATH = { collection: "rekomendasi_belanja", id: "shared_state" };

export interface SharedShoppingState {
  skippedItemIds?: Record<string, boolean>;
  ignoredItemIds?: Record<string, boolean>;
  settings?: Partial<ShoppingRecommendationSettings>;
  lastUpdatedBy?: string;
  updatedAt?: string;
}

export function useShoppingRecommendationSync() {
  const { currentUser, userEmail } = useFirebaseAuth();
  const isSyncing = ref(false);
  const lastSyncTime = ref<string | null>(null);
  const syncError = ref<string | null>(null);

  let unsubscribe: Unsubscribe | null = null;

  function subscribeToSharedState(
    onUpdate: (state: SharedShoppingState) => void,
  ) {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    try {
      const docRef = doc(db, REKOMENDASI_DOC_PATH.collection, REKOMENDASI_DOC_PATH.id);
      unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as SharedShoppingState;
            lastSyncTime.value = new Date().toLocaleTimeString();
            onUpdate(data);
          }
        },
        (error) => {
          console.warn("Firestore snapshot error (akan fallback ke offline):", error);
          syncError.value = error.message;
        },
      );
    } catch (err: unknown) {
      console.warn("Gagal inisialisasi Firestore listener:", err);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
  }

  async function updateSharedState(partialState: Partial<SharedShoppingState>) {
    if (!currentUser.value) return;

    isSyncing.value = true;
    syncError.value = null;
    try {
      const docRef = doc(db, REKOMENDASI_DOC_PATH.collection, REKOMENDASI_DOC_PATH.id);
      const payload: Partial<SharedShoppingState> = {
        ...partialState,
        lastUpdatedBy: userEmail.value || "Anonymous",
        updatedAt: new Date().toISOString(),
      };
      await setDoc(docRef, payload, { merge: true });
      lastSyncTime.value = new Date().toLocaleTimeString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Gagal sinkronisasi data ke Firestore:", msg);
      syncError.value = msg;
    } finally {
      isSyncing.value = false;
    }
  }

  return {
    isSyncing,
    lastSyncTime,
    syncError,
    subscribeToSharedState,
    updateSharedState,
  };
}
