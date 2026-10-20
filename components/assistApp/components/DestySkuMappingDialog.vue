<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useQuasar } from "quasar";
import type { AssistCatalogItem } from "@/types/destySync";
import type { QuickMappingFormData } from "@/types/destyStockOpname";

const props = defineProps<{
  modelValue: boolean;
  initialData?: Partial<QuickMappingFormData>;
  catalog?: AssistCatalogItem[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "save", data: QuickMappingFormData): void;
}>();

const $q = useQuasar();

const form = ref<QuickMappingFormData>({
  destySku: "",
  destyUnit: "Pcs",
  assistCode: "",
  assistId: "",
  assistName: "",
  assistType: "prescription",
  assistUnit: "Pcs",
  conversionFactor: 1,
});

const filterText = ref("");

const catalogOptions = computed(() => {
  const items = props.catalog || [];
  return items.map((c) => ({
    label: `${c.code || "-"} - ${c.name} (${c.type === "akhp" ? "AKHP" : "Obat"}) [${c.unit || "Pcs"}]`,
    value: c.id || c.code,
    item: c,
  }));
});

const filteredCatalogOptions = computed(() => {
  if (!filterText.value.trim()) {
    return catalogOptions.value.slice(0, 100);
  }
  const needle = filterText.value.toLowerCase().trim();
  return catalogOptions.value
    .filter((opt) => opt.label.toLowerCase().includes(needle))
    .slice(0, 100);
});

function filterCatalogFn(val: string, update: (cb: () => void) => void) {
  update(() => {
    filterText.value = val;
  });
}

const selectedCatalogValue = ref<string>("");

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = {
        destySku: props.initialData?.destySku || "",
        destyUnit: props.initialData?.destyUnit || "Pcs",
        assistCode: props.initialData?.assistCode || "",
        assistId: props.initialData?.assistId || "",
        assistName: props.initialData?.assistName || "",
        assistType: props.initialData?.assistType || "prescription",
        assistUnit: props.initialData?.assistUnit || "Pcs",
        conversionFactor: Number(props.initialData?.conversionFactor) || 1,
      };
      selectedCatalogValue.value = props.initialData?.assistId || props.initialData?.assistCode || "";
    }
  },
  { immediate: true }
);

function onCatalogSelected(val: string) {
  const found = (props.catalog || []).find((c) => c.id === val || c.code === val);
  if (found) {
    form.value.assistId = found.id;
    form.value.assistCode = found.code;
    form.value.assistName = found.name;
    form.value.assistType = found.type;
    form.value.assistUnit = found.unit || "Pcs";
  }
}

function handleSave() {
  if (!form.value.destySku.trim()) {
    $q.notify({
      type: "warning",
      message: "SKU Desty harus diisi.",
      position: "top-right",
    });
    return;
  }
  if (!form.value.assistCode.trim() && !form.value.assistId.trim()) {
    $q.notify({
      type: "warning",
      message: "Produk Assist harus dipilih.",
      position: "top-right",
    });
    return;
  }

  emit("save", { ...form.value });
  emit("update:modelValue", false);
}
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    persistent
  >
    <q-card style="width: 520px; max-width: 95vw;" class="rounded-borders">
      <q-card-section class="bg-teal text-white row items-center justify-between q-py-sm">
        <div class="text-subtitle1 text-weight-bold row items-center">
          <q-icon name="tune" class="q-mr-xs" size="20px" />
          Override Pemetaan SKU & Konversi
        </div>
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pa-md bg-grey-1 q-gutter-y-md">
        <!-- Desty SKU & Unit -->
        <div class="row q-col-gutter-sm">
          <div class="col-8">
            <div class="text-caption text-grey-8 q-mb-2xs text-weight-medium">SKU Desty *</div>
            <q-input
              v-model="form.destySku"
              outlined
              dense
              bg-color="white"
              placeholder="SKU di Desty Omni..."
            />
          </div>
          <div class="col-4">
            <div class="text-caption text-grey-8 q-mb-2xs text-weight-medium">Satuan Desty</div>
            <q-input
              v-model="form.destyUnit"
              outlined
              dense
              bg-color="white"
              placeholder="e.g. Box, Botol"
            />
          </div>
        </div>

        <!-- Assist Product Autocomplete -->
        <div>
          <div class="text-caption text-grey-8 q-mb-2xs text-weight-medium">Produk Assist (Katalog) *</div>
          <q-select
            v-model="selectedCatalogValue"
            :options="filteredCatalogOptions"
            use-input
            fill-input
            hide-selected
            emit-value
            map-options
            @filter="filterCatalogFn"
            @update:model-value="onCatalogSelected"
            outlined
            dense
            bg-color="white"
            placeholder="Cari kode atau nama obat Assist..."
          >
            <template v-slot:no-option>
              <q-item>
                <q-item-section class="text-grey-6 text-caption">
                  Tidak ada produk Assist ditemukan
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <div v-if="form.assistName" class="text-caption text-teal-9 q-mt-2xs">
            Terpilih: <strong>{{ form.assistCode }}</strong> - {{ form.assistName }} ({{ form.assistUnit }})
          </div>
        </div>

        <!-- Conversion Factor & Assist Unit -->
        <div class="row q-col-gutter-sm items-center">
          <div class="col-6">
            <div class="text-caption text-grey-8 q-mb-2xs text-weight-medium">Faktor Konversi *</div>
            <q-input
              v-model.number="form.conversionFactor"
              type="number"
              outlined
              dense
              min="0.0001"
              step="any"
              bg-color="white"
            >
              <template v-slot:prepend>
                <span class="text-caption text-grey-6 font-mono">1 {{ form.destyUnit || 'Desty' }} =</span>
              </template>
            </q-input>
          </div>
          <div class="col-6">
            <div class="text-caption text-grey-8 q-mb-2xs text-weight-medium">Satuan Assist</div>
            <q-input
              v-model="form.assistUnit"
              outlined
              dense
              bg-color="grey-2"
              readonly
            />
          </div>
        </div>

        <div class="text-caption text-grey-7 bg-teal-1 q-pa-sm rounded-borders border-teal-light">
          Contoh: Jika 1 Box Desty berisi 10 Strip di Assist, isi faktor konversi <strong>10</strong>.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md bg-white q-gutter-x-sm">
        <q-btn label="Batal" color="grey-7" flat v-close-popup no-caps />
        <q-btn label="Simpan Override Pemetaan" color="teal" unelevated no-caps @click="handleSave" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.font-mono {
  font-family: monospace;
}
.border-teal-light {
  border: 1px solid #b2dfdb;
}
</style>
