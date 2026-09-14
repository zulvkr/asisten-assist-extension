<template>
  <q-dialog :model-value="!isAuthenticated && !authLoading" persistent>
    <q-card style="min-width: 380px; max-width: 440px" class="q-pa-sm shadow-10">
      <q-card-section class="bg-teal text-white rounded-borders">
        <div class="row items-center no-wrap">
          <q-avatar icon="lock" color="teal-8" text-color="white" class="q-mr-sm" />
          <div>
            <div class="text-h6 text-weight-bold">Login AsistenAssist</div>
            <div class="text-caption text-teal-1">Autentikasi Akses & Sinkronisasi Online</div>
          </div>
        </div>
      </q-card-section>

      <q-card-section class="q-pt-lg">
        <q-banner v-if="loginError" rounded class="bg-negative text-white q-mb-md">
          <template v-slot:avatar>
            <q-icon name="error" />
          </template>
          {{ loginError }}
        </q-banner>

        <q-form @submit.prevent="handleLogin" class="q-gutter-y-md">
          <!-- User Email Selection / Input -->
          <div>
            <div class="text-caption text-grey-8 text-weight-medium q-mb-xs">Pilih Akun Email:</div>
            <q-select
              v-model="selectedEmail"
              :options="presetUsers"
              outlined
              dense
              use-input
              new-value-mode="add-unique"
              color="teal"
              label="Email Akun"
              hint="Pilih email atau ketik akun terdaftar"
            >
              <template v-slot:prepend>
                <q-icon name="person" color="teal" />
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
              label="Masuk & Sinkronkan"
              icon="login"
              :loading="submitting"
            />
          </div>
        </q-form>
      </q-card-section>

      <q-card-section class="text-center text-caption text-grey-6 q-pt-none">
        Database terenkripsi & tersinkronisasi antar staf.
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useFirebaseAuth, PRESET_USERS } from "../../../composables/useFirebaseAuth";

const { isAuthenticated, authLoading, loginError, presetUsers, login } = useFirebaseAuth();

const selectedEmail = ref(PRESET_USERS[0] || "");
const password = ref("");
const showPassword = ref(false);
const submitting = ref(false);

async function handleLogin() {
  if (!selectedEmail.value || !password.value) return;
  submitting.value = true;
  const success = await login(selectedEmail.value, password.value);
  submitting.value = false;
  if (success) {
    password.value = "";
  }
}
</script>
