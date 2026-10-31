<template>
  <q-dialog :model-value="!isAuthenticated && !authLoading" persistent>
    <q-card style="min-width: 390px; max-width: 460px" class="q-pa-sm shadow-10">
      <q-card-section class="bg-teal text-white rounded-borders">
        <div class="row items-center no-wrap">
          <q-avatar icon="lock" color="teal-8" text-color="white" class="q-mr-sm" />
          <div>
            <div class="text-h6 text-weight-bold">Login AsistenAssist</div>
            <div class="text-caption text-teal-1">Pilih Pengguna & Autentikasi Firebase</div>
          </div>
        </div>
      </q-card-section>

      <q-card-section class="q-pt-lg">
        <!-- Banner Error Login -->
        <q-banner v-if="loginError" rounded class="bg-negative text-white q-mb-md">
          <template v-slot:avatar>
            <q-icon name="error" />
          </template>
          {{ loginError }}
        </q-banner>

        <!-- Banner Peringatan Rules Firestore jika baca diblokir -->
        <q-banner v-if="firestoreRuleWarning" rounded class="bg-warning text-black q-mb-md text-caption">
          <template v-slot:avatar>
            <q-icon name="warning" color="black" />
          </template>
          Daftar pengguna dari Firestore belum dapat dimuat. Pastikan aturan Firestore di Firebase Console mengizinkan <code>allow read: if true;</code> pada <code>/user_roles/{email}</code>. Anda tetap dapat mengetikkan email secara manual di bawah.
        </q-banner>

        <q-form @submit.prevent="handleLogin" class="q-gutter-y-md">
          <!-- Select User Dropdown (100% dinamis dari Firestore) -->
          <div>
            <div class="row items-center justify-between text-caption text-grey-8 text-weight-medium q-mb-xs">
              <span>Pilih Akun Pengguna:</span>
              <q-btn
                flat
                dense
                size="xs"
                color="teal"
                icon="sync"
                label="Segarkan Akun"
                :loading="loadingUsers"
                @click="loadUsersFromFirestore"
              >
                <q-tooltip>Muat ulang daftar akun langsung dari Firestore</q-tooltip>
              </q-btn>
            </div>

            <q-select
              v-model="selectedEmail"
              :options="filteredOptions"
              outlined
              dense
              use-input
              new-value-mode="add-unique"
              emit-value
              map-options
              color="teal"
              label="Pilih Pengguna"
              placeholder="Pilih dari daftar atau ketik email..."
              hint="Pilih akun dari Firestore atau ketik email terdaftar"
              :loading="loadingUsers"
              @filter="filterFn"
              :rules="[val => !!val || 'Pengguna wajib dipilih atau diisi']"
            >
              <template v-slot:prepend>
                <q-icon name="account_circle" color="teal" />
              </template>

              <!-- Custom Selected Display -->
              <template v-slot:selected-item="scope">
                <div class="row items-center q-gutter-x-sm no-wrap ellipsis">
                  <span class="text-weight-bold">{{ scope.opt.label || scope.opt.value }}</span>
                  <q-badge
                    v-if="scope.opt.role"
                    :color="getRoleBadgeColor(scope.opt.role)"
                    class="text-uppercase text-weight-bold q-px-xs"
                    size="sm"
                  >
                    {{ scope.opt.role }}
                  </q-badge>
                </div>
              </template>

              <!-- Custom Dropdown Option Display -->
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps" class="q-py-sm">
                  <q-item-section avatar>
                    <q-avatar
                      size="32px"
                      :color="getRoleAvatarBg(scope.opt.role)"
                      :text-color="getRoleAvatarColor(scope.opt.role)"
                      icon="person"
                    />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-weight-bold">{{ scope.opt.label }}</q-item-label>
                    <q-item-label caption class="text-grey-7">{{ scope.opt.value }}</q-item-label>
                  </q-item-section>
                  <q-item-section side v-if="scope.opt.role">
                    <q-badge
                      :color="getRoleBadgeColor(scope.opt.role)"
                      class="text-uppercase text-weight-bold q-px-sm"
                    >
                      {{ scope.opt.role }}
                    </q-badge>
                  </q-item-section>
                </q-item>
              </template>

              <template v-slot:no-option>
                <q-item>
                  <q-item-section class="text-grey">
                    Ketik alamat email lalu tekan Enter untuk menggunakan akun tersebut.
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>

          <!-- Password Input -->
          <div>
            <div class="text-caption text-grey-8 text-weight-medium q-mb-xs">Password:</div>
            <q-input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              outlined
              dense
              color="teal"
              label="Password Akun"
              autocomplete="current-password"
              :rules="[val => !!val || 'Password wajib diisi']"
            >
              <template v-slot:prepend>
                <q-icon name="key" color="teal" />
              </template>
              <template v-slot:append>
                <q-icon
                  :name="showPassword ? 'visibility_off' : 'visibility'"
                  class="cursor-pointer"
                  @click="showPassword = !showPassword"
                />
              </template>
            </q-input>
          </div>

          <div class="q-mt-lg">
            <q-btn
              type="submit"
              color="teal"
              class="full-width text-weight-bold"
              size="md"
              label="Masuk ke Sistem"
              icon="login"
              :loading="submitting"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useFirebaseAuth } from "../../../composables/useFirebaseAuth";
import { fetchAllUserRoles } from "@/services/auth/userRoleStorage";

const { isAuthenticated, authLoading, loginError, login } = useFirebaseAuth();

interface UserOption {
  label: string;
  value: string;
  role: string;
}

const LAST_EMAIL_KEY = "asisten_assist_last_email";
const CACHED_USERS_KEY = "asisten_assist_cached_users";

const selectedEmail = ref("");
const password = ref("");
const showPassword = ref(false);
const submitting = ref(false);
const loadingUsers = ref(false);
const firestoreRuleWarning = ref(false);

const allUserOptions = ref<UserOption[]>([]);
const filteredOptions = ref<UserOption[]>([]);

function getRoleBadgeColor(role?: string): string {
  switch (role?.toLowerCase()) {
    case "owner":
      return "purple";
    case "auditor":
      return "orange";
    case "kasir":
      return "teal";
    default:
      return "grey-7";
  }
}

function getRoleAvatarBg(role?: string): string {
  switch (role?.toLowerCase()) {
    case "owner":
      return "purple-1";
    case "auditor":
      return "orange-1";
    case "kasir":
      return "teal-1";
    default:
      return "grey-2";
  }
}

function getRoleAvatarColor(role?: string): string {
  switch (role?.toLowerCase()) {
    case "owner":
      return "purple";
    case "auditor":
      return "orange-9";
    case "kasir":
      return "teal-8";
    default:
      return "grey-8";
  }
}

function initCachedUsers() {
  const cachedStr = localStorage.getItem(CACHED_USERS_KEY);
  if (cachedStr) {
    try {
      const cached = JSON.parse(cachedStr) as UserOption[];
      if (Array.isArray(cached) && cached.length > 0) {
        allUserOptions.value = cached;
        filteredOptions.value = [...cached];
      }
    } catch {
      // ignore
    }
  }

  const savedLast = localStorage.getItem(LAST_EMAIL_KEY);
  if (savedLast) {
    selectedEmail.value = savedLast.toLowerCase().trim();
  } else if (allUserOptions.value.length > 0) {
    selectedEmail.value = allUserOptions.value[0].value;
  }
}

async function loadUsersFromFirestore() {
  loadingUsers.value = true;
  firestoreRuleWarning.value = false;
  try {
    const users = await fetchAllUserRoles();
    if (users && users.length > 0) {
      const options: UserOption[] = users.map((u) => {
        const cleanEmail = u.email.toLowerCase().trim();
        const role = u.role || "kasir";
        const name = u.name ? u.name.trim() : cleanEmail.split("@")[0];
        return {
          label: name,
          value: cleanEmail,
          role,
        };
      }).sort((a, b) => {
        // Urutkan: Owner -> Auditor -> Kasir -> Nama
        const rank = (r: string) => (r === "owner" ? 0 : r === "auditor" ? 1 : 2);
        return rank(a.role) - rank(b.role) || a.label.localeCompare(b.label);
      });

      allUserOptions.value = options;
      filteredOptions.value = [...options];

      // Perbarui cache lokal
      localStorage.setItem(CACHED_USERS_KEY, JSON.stringify(options));

      if (!selectedEmail.value && options.length > 0) {
        selectedEmail.value = options[0].value;
      }
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn("[LoginDialog] Gagal memuat daftar pengguna dari Firestore:", msg);
    if (msg.includes("permission") || msg.includes("denied")) {
      firestoreRuleWarning.value = true;
    }
  } finally {
    loadingUsers.value = false;
  }
}

function filterFn(val: string, update: (fn: () => void) => void) {
  if (!val) {
    update(() => {
      filteredOptions.value = allUserOptions.value;
    });
    return;
  }

  update(() => {
    const needle = val.toLowerCase().trim();
    const matches = allUserOptions.value.filter(
      (v) => v.label.toLowerCase().includes(needle) || v.value.toLowerCase().includes(needle),
    );

    // Jika user mengetikkan alamat email baru yang belum ada di daftar, izinkan pilih
    if (needle.includes("@") && !matches.some((m) => m.value === needle)) {
      matches.push({
        label: val.trim(),
        value: needle,
        role: "kasir",
      });
    }

    filteredOptions.value = matches;
  });
}

onMounted(() => {
  initCachedUsers();
  loadUsersFromFirestore();
});

async function handleLogin() {
  if (!selectedEmail.value || !password.value) return;
  submitting.value = true;
  const targetEmail = selectedEmail.value.trim().toLowerCase();
  const success = await login(targetEmail, password.value);
  submitting.value = false;
  if (success) {
    localStorage.setItem(LAST_EMAIL_KEY, targetEmail);
    // Tambahkan ke cache lokal jika belum ada
    if (!allUserOptions.value.some((u) => u.value === targetEmail)) {
      allUserOptions.value.push({
        label: targetEmail.split("@")[0],
        value: targetEmail,
        role: "kasir",
      });
      localStorage.setItem(CACHED_USERS_KEY, JSON.stringify(allUserOptions.value));
    }
    password.value = "";
  }
}
</script>
