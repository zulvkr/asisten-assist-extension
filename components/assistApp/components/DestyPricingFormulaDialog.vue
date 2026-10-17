<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useQuasar } from "quasar";
import type { MarketplacePricingConfig, PriceRangeTier } from "@/types/destyPriceUpdate";
import { getDefaultPricingTiers } from "@/services/destySync/pricingConfigStorage";
import { calculateTargetPrice, computeMarginForPrice } from "@/services/destySync/destyPriceUpdateService";

const props = defineProps<{
  modelValue: boolean;
  initialConfig: MarketplacePricingConfig;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "save", config: MarketplacePricingConfig): void;
}>();

const $q = useQuasar();

const form = ref<MarketplacePricingConfig>({
  adminPercent: 10,
  adminFixedPerTx: 1000,
  basePriceSource: "buyPrice",
  rounding: 100,
  tiers: [],
});

// Simulator state
const simCost = ref<number>(15000);
const simOfflinePrice = ref<number>(18000);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = JSON.parse(JSON.stringify(props.initialConfig));
      if (!form.value.tiers || form.value.tiers.length === 0) {
        form.value.tiers = getDefaultPricingTiers();
      }
    }
  },
  { immediate: true },
);

function handleAddTier() {
  const lastTier = form.value.tiers[form.value.tiers.length - 1];
  const newMin = lastTier && lastTier.maxPrice !== null ? lastTier.maxPrice + 1 : 0;
  form.value.tiers.push({
    id: `tier-${Date.now()}`,
    minPrice: newMin,
    maxPrice: null,
    marginPercent: 15,
    minBuyQty: 1,
  });
}

function handleRemoveTier(index: number) {
  if (form.value.tiers.length <= 1) {
    $q.notify({
      type: "warning",
      message: "Minimal harus ada 1 rentang harga aktif.",
      position: "top-right",
    });
    return;
  }
  form.value.tiers.splice(index, 1);
}

function moveTier(index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= form.value.tiers.length) return;
  const temp = form.value.tiers[index];
  form.value.tiers[index] = form.value.tiers[targetIndex];
  form.value.tiers[targetIndex] = temp;
}

function autoSortTiers() {
  form.value.tiers.sort((a, b) => a.minPrice - b.minPrice);
  $q.notify({
    type: "info",
    message: "Rentang harga diurutkan dari harga minimal terendah.",
    position: "top-right",
  });
}

function handleResetDefaults() {
  form.value = {
    adminPercent: 10,
    adminFixedPerTx: 1000,
    basePriceSource: "buyPrice",
    rounding: 100,
    tiers: getDefaultPricingTiers(),
  };
  $q.notify({
    type: "info",
    message: "Formula dikembalikan ke pengaturan standar.",
    position: "top-right",
  });
}

// Live simulation calculation
const simulationResult = computed(() => {
  return calculateTargetPrice(simCost.value, 1, form.value);
});

const simOfflineMarginPercent = computed(() => {
  if (simOfflinePrice.value <= 0) return 0;
  return ((simOfflinePrice.value - simCost.value) / simOfflinePrice.value) * 100;
});

function handleSave() {
  // Validate tiers continuity and structure
  for (let i = 0; i < form.value.tiers.length; i++) {
    const tier = form.value.tiers[i];
    if (tier.minPrice < 0) {
      $q.notify({
        type: "negative",
        message: `Tier ${i + 1}: Harga minimal tidak boleh negatif.`,
        position: "top-right",
      });
      return;
    }
    if (tier.maxPrice !== null && tier.maxPrice <= tier.minPrice) {
      $q.notify({
        type: "negative",
        message: `Tier ${i + 1}: Harga maksimal harus lebih besar dari harga minimal.`,
        position: "top-right",
      });
      return;
    }
    if (tier.marginPercent <= 0 || tier.marginPercent >= 100) {
      $q.notify({
        type: "negative",
        message: `Tier ${i + 1}: Margin target harus antara 1% dan 99%.`,
        position: "top-right",
      });
      return;
    }
  }

  emit("save", JSON.parse(JSON.stringify(form.value)));
  emit("update:modelValue", false);
}

function formatRupiah(val?: number | null): string {
  if (val === null || val === undefined) return "-";
  return `Rp ${Math.round(val).toLocaleString("id-ID")}`;
}
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" persistent>
    <q-card style="width: 900px; max-width: 95vw;" class="rounded-borders">
      <q-card-section class="bg-teal text-white row items-center justify-between q-py-sm">
        <div class="text-subtitle1 text-weight-bold row items-center">
          <q-icon name="tune" class="q-mr-sm" size="20px" />
          Atur Formula Harga Marketplace Dinamis
        </div>
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pa-md q-gutter-y-md" style="max-height: 80vh; overflow-y: auto;">
        <!-- Banner HPP / Harga Beli Terakhir -->
        <q-banner rounded class="bg-teal-1 text-teal-10 border-teal">
          <template v-slot:avatar>
            <q-icon name="info" color="teal" />
          </template>
          <div>
            <strong>Basis Modal (HPP):</strong> Formula ini secara otomatis menggunakan <strong>Harga Beli Terakhir (buyFee)</strong> yang tercatat di Assist.id sebagai dasar perhitungan HPP, disesuaikan dengan faktor konversi satuan SKU Desty.
          </div>
        </q-banner>

        <!-- General Parameters -->
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-4">
            <q-input
              v-model.number="form.adminPercent"
              type="number"
              min="0"
              max="99"
              step="0.5"
              outlined
              dense
              label="Biaya Admin Marketplace (%)"
              color="teal"
              suffix="%"
              hint="Potongan komisi Shopee, TikTok, Tokped (misal: 10%)"
            />
          </div>

          <div class="col-12 col-md-4">
            <q-input
              v-model.number="form.adminFixedPerTx"
              type="number"
              min="0"
              step="100"
              outlined
              dense
              label="Biaya Admin Tetap per Transaksi"
              color="teal"
              prefix="Rp"
              hint="Biaya proses per pesanan (misal: Rp 1.000)"
            />
          </div>

          <div class="col-12 col-md-4">
            <q-select
              v-model.number="form.rounding"
              :options="[
                { label: 'Bulatkan ke 100 terdekat', value: 100 },
                { label: 'Bulatkan ke 500 terdekat', value: 500 },
                { label: 'Bulatkan ke 1.000 terdekat', value: 1000 },
                { label: 'Tanpa pembulatan', value: 1 }
              ]"
              emit-value
              map-options
              outlined
              dense
              label="Pembulatan Harga"
              color="teal"
              hint="Harga akan dibulatkan ke atas"
            />
          </div>
        </div>

        <q-separator class="q-my-sm" />

        <!-- Price Range Tiers -->
        <div>
          <div class="row items-center justify-between q-mb-sm">
            <div>
              <div class="text-subtitle2 text-weight-bold text-slate-800">
                Rentang Modal & Target Margin Bersih (Tiers)
              </div>
              <div class="text-caption text-grey-7">
                Semakin murah harga modal obat, margin dan estimasi minimal beli disesuaikan agar tidak rugi terpotong admin tetap.
              </div>
            </div>
            <div class="row q-gutter-xs">
              <q-btn
                flat
                dense
                size="sm"
                color="teal"
                icon="sort"
                label="Urutkan"
                no-caps
                @click="autoSortTiers"
              />
              <q-btn
                flat
                dense
                size="sm"
                color="grey-7"
                icon="restart_alt"
                label="Reset Standar"
                no-caps
                @click="handleResetDefaults"
              />
              <q-btn
                unelevated
                dense
                size="sm"
                color="teal"
                icon="add"
                label="Tambah Rentang"
                no-caps
                class="q-px-sm"
                @click="handleAddTier"
              />
            </div>
          </div>

          <div class="q-gutter-y-xs">
            <q-card
              v-for="(tier, idx) in form.tiers"
              :key="tier.id"
              flat
              bordered
              class="q-pa-xs bg-grey-1"
            >
              <div class="row q-col-gutter-xs items-center">
                <div class="col-auto text-caption font-mono text-grey-7 q-px-xs">
                  #{{ idx + 1 }}
                </div>
                <div class="col-12 col-sm-3">
                  <q-input
                    v-model.number="tier.minPrice"
                    type="number"
                    min="0"
                    outlined
                    dense
                    label="Min Modal"
                    prefix="Rp"
                    bg-color="white"
                    color="teal"
                  />
                </div>
                <div class="col-12 col-sm-3">
                  <q-input
                    :model-value="tier.maxPrice === null ? '' : tier.maxPrice"
                    @update:model-value="val => tier.maxPrice = (val === '' ? null : Number(val))"
                    type="number"
                    min="0"
                    outlined
                    dense
                    label="Max Modal"
                    prefix="Rp"
                    placeholder="Tak terbatas"
                    bg-color="white"
                    color="teal"
                  />
                </div>
                <div class="col-6 col-sm-2">
                  <q-input
                    v-model.number="tier.marginPercent"
                    type="number"
                    min="1"
                    max="99"
                    step="0.5"
                    outlined
                    dense
                    label="Margin Net"
                    suffix="%"
                    bg-color="white"
                    color="teal"
                  />
                </div>
                <div class="col-6 col-sm-2">
                  <q-input
                    v-model.number="tier.minBuyQty"
                    type="number"
                    min="1"
                    outlined
                    dense
                    label="Min Beli"
                    suffix="unit"
                    bg-color="white"
                    color="teal"
                  />
                </div>
                <div class="col-auto row items-center justify-end">
                  <q-btn
                    flat
                    round
                    dense
                    size="xs"
                    icon="arrow_upward"
                    color="grey-7"
                    :disable="idx === 0"
                    @click="moveTier(idx, -1)"
                  />
                  <q-btn
                    flat
                    round
                    dense
                    size="xs"
                    icon="arrow_downward"
                    color="grey-7"
                    :disable="idx === form.tiers.length - 1"
                    @click="moveTier(idx, 1)"
                  />
                  <q-btn
                    flat
                    round
                    dense
                    size="xs"
                    icon="delete"
                    color="negative"
                    @click="handleRemoveTier(idx)"
                  />
                </div>
              </div>
            </q-card>
          </div>
        </div>

        <q-separator class="q-my-sm" />

        <!-- Live Interactive Simulator -->
        <q-card flat bordered class="bg-blue-grey-1 q-pa-sm rounded-borders">
          <div class="text-caption text-weight-bold text-teal row items-center q-mb-xs">
            <q-icon name="calculate" size="18px" class="q-mr-xs" />
            Simulasi Perhitungan Live:
          </div>

          <div class="row q-col-gutter-sm items-center q-mb-xs">
            <div class="col-12 col-sm-6">
              <q-input
                v-model.number="simCost"
                type="number"
                min="100"
                step="500"
                outlined
                dense
                label="Simulasi Harga Beli Terakhir (HPP)"
                prefix="Rp"
                bg-color="white"
                color="teal"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model.number="simOfflinePrice"
                type="number"
                min="100"
                step="500"
                outlined
                dense
                label="Simulasi Harga Jual Kasir Offline"
                prefix="Rp"
                bg-color="white"
                color="teal"
              />
            </div>
          </div>

          <div class="row q-col-gutter-xs text-caption bg-white q-pa-sm rounded-borders border">
            <div class="col-6 col-md-3">
              <div class="text-grey-7">Tier Terpakai:</div>
              <div class="text-weight-bold text-teal">
                Margin {{ simulationResult.matchedTier?.marginPercent }}% (Min {{ simulationResult.matchedTier?.minBuyQty }} pcs)
              </div>
            </div>
            <div class="col-6 col-md-3">
              <div class="text-grey-7">Admin Tetap/Unit:</div>
              <div class="text-weight-bold text-slate-800">
                {{ formatRupiah(simulationResult.adminPerUnit) }}
              </div>
            </div>
            <div class="col-6 col-md-3">
              <div class="text-grey-7">Harga Marketplace:</div>
              <div class="text-weight-bold text-subtitle2 text-teal">
                {{ formatRupiah(simulationResult.calculatedPrice) }}
              </div>
            </div>
            <div class="col-6 col-md-3">
              <div class="text-grey-7">Net Diterima Apotek:</div>
              <div class="text-weight-bold text-positive">
                {{ formatRupiah(simulationResult.netReceived) }}
                <span class="text-grey-7 text-2xs">({{ simulationResult.actualMarginPercent.toFixed(1) }}%)</span>
              </div>
            </div>
          </div>
        </q-card>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md bg-white">
        <q-btn flat label="Batal" color="grey-7" v-close-popup no-caps />
        <q-btn
          unelevated
          label="Terapkan Formula Harga"
          icon="save"
          color="teal"
          @click="handleSave"
          no-caps
          class="q-px-md"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.border-teal {
  border: 1px solid #009688;
}
.border {
  border: 1px solid #cfd8dc;
}
</style>
