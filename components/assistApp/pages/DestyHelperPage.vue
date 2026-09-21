<template>
  <div>
    <!-- Header Section -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="sync_alt" class="q-mr-sm" />
        Desty Omni Integration & PLDMP Helper
      </div>
    </div>

    <!-- Probe Status / Warnings -->
    <q-banner
      v-if="!destyToken"
      rounded
      class="bg-warning text-black q-mb-md"
    >
      <template v-slot:avatar>
        <q-icon name="warning" color="black" />
      </template>
      Token Desty Omni tidak ditemukan. Silakan buka tab Desty Omni, masuk/login, lalu segarkan halaman ini.
    </q-banner>

    <q-banner v-if="probeWarnings.length" rounded class="bg-warning text-black q-mb-md">
      <template v-slot:avatar>
        <q-icon name="warning" />
      </template>
      <div class="text-weight-bold font-title">Peringatan Token:</div>
      <ul class="q-my-none q-pl-md">
        <li v-for="w in probeWarnings" :key="w">{{ w }}</li>
      </ul>
    </q-banner>

    <!-- Global Status Message Banner -->
    <q-banner
      v-if="statusMessage"
      rounded
      :class="statusVariant === 'success' ? 'bg-green-1 text-green-9' : statusVariant === 'error' ? 'bg-red-1 text-red-9' : 'bg-grey-2 text-grey-8'"
      class="q-mb-md"
    >
      <template v-slot:avatar>
        <q-icon :name="statusVariant === 'success' ? 'check_circle' : statusVariant === 'error' ? 'error' : 'info'" />
      </template>
      {{ statusMessage }}
    </q-banner>

    <!-- Main Navigation Tabs Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-pa-none">
        <q-tabs
          v-model="syncTab"
          dense
          active-color="teal"
          indicator-color="teal"
          align="left"
          class="bg-grey-1"
        >
          <q-tab name="pldmp" icon="table_chart" label="PLDMP (Ekspor Pesanan)" />
          <q-tab name="import" icon="cloud_download" label="Impor Pesanan (Desty → Assist)" />
          <q-tab name="offline_sync" icon="sync" label="SO Stok Offline (Assist → Desty)" />
          <q-tab name="mapping" icon="tune" label="Pemetaan & Konversi SKU" />
          <q-tab name="log" icon="history" label="Log Impor" />
        </q-tabs>
        <q-separator />

        <q-tab-panels v-model="syncTab" animated>
          <!-- TAB 1: PLDMP (Ekspor Data Pesanan Desty) -->
          <q-tab-panel name="pldmp" class="q-pa-md">
            <!-- Filter & Action Bar for PLDMP -->
            <div class="row q-col-gutter-md items-center q-mb-md">
              <div class="col-12 col-md-4">
                <q-select
                  v-model="selectedStatus"
                  outlined
                  dense
                  emit-value
                  map-options
                  :options="statusOptions.map(o => ({
                    label: `${o.label} (${statusCounts[o.countKey] !== undefined ? statusCounts[o.countKey] : '0'})`,
                    value: o.value
                  }))"
                  label="Status Pesanan Desty"
                  color="teal"
                  :disabled="!destyToken"
                />
              </div>

              <q-space />

              <div class="col-12 col-md-6 row q-gutter-sm justify-end">
                <q-btn
                  color="teal"
                  icon="download"
                  :loading="loading"
                  :label="loading ? `Memuat (${progressText})...` : 'Tarik Data'"
                  @click="fetchOrders"
                  :disabled="!destyToken"
                />
                <q-btn
                  color="teal"
                  outline
                  icon="content_copy"
                  :disabled="!flattenedItems.length || loading"
                  :label="copyStatusText"
                  @click="copyToClipboard"
                />
                <q-btn
                  color="positive"
                  icon="file_download"
                  :disabled="!flattenedItems.length || loading"
                  :loading="exporting"
                  label="Ekspor Excel PLDMP"
                  @click="exportToExcel"
                />
              </div>
            </div>

            <!-- Summary header -->
            <div v-if="flattenedItems.length" class="row items-center justify-between q-px-md q-py-sm bg-grey-1 rounded-borders q-mb-sm text-caption">
              <div>
                Total: <strong>{{ orders.length }} pesanan</strong> ({{ flattenedItems.length }} baris barang)
              </div>
              <div class="text-grey-7">
                Format formula excel modal: <code>=E[baris]*H[baris]</code>
              </div>
            </div>

            <!-- PLDMP Dedicated Table -->
            <q-table
              :rows="flattenedItems"
              :columns="pldmpTableColumns"
              row-key="rowId"
              flat
              bordered
              :loading="loading"
              :pagination="{ rowsPerPage: 15 }"
              no-data-label="Belum ada data pesanan PLDMP. Klik 'Tarik Data' untuk memuat."
            >
              <template v-slot:body-cell-no="props">
                <q-td :props="props" class="text-center font-mono">
                  {{ props.rowIndex + 1 }}
                </q-td>
              </template>

              <template v-slot:body-cell-mappingStatus="props">
                <q-td :props="props" class="text-center">
                  <div v-if="props.row.mappedItem">
                    <div class="row items-center justify-center q-gutter-x-xs no-wrap">
                      <q-badge
                        :color="props.row.is1to1Fallback ? 'teal-1' : 'positive'"
                        :text-color="props.row.is1to1Fallback ? 'teal-9' : 'white'"
                        class="q-px-sm text-weight-bold cursor-pointer"
                      >
                        <q-icon :name="props.row.is1to1Fallback ? 'sync_alt' : 'check_circle'" size="xs" class="q-mr-xs" />
                        {{ props.row.is1to1Fallback ? '1:1 Auto' : 'Termapping' }}
                        <q-tooltip anchor="top middle" self="bottom middle">
                          <div class="text-weight-bold">{{ props.row.is1to1Fallback ? 'Cocok 1:1 Katalog Assist:' : 'Terpetakan (Firebase):' }}</div>
                          <div>Kode: {{ props.row.mappedItem.assistCode }}</div>
                          <div>Nama: {{ props.row.mappedItem.assistName }}</div>
                          <div v-if="props.row.mappedItem.conversionFactor !== 1">Faktor: {{ props.row.mappedItem.conversionFactor }}</div>
                        </q-tooltip>
                      </q-badge>
                      <q-btn
                        size="xs"
                        flat
                        round
                        color="teal"
                        icon="tune"
                        @click="openSkuRecommendationDialog(props.row.sku, props.row.productName)"
                      >
                        <q-tooltip>Ubah pemetaan SKU ini</q-tooltip>
                      </q-btn>
                    </div>
                    <div class="text-2xs font-mono text-grey-7 ellipsis q-mt-2xs" style="max-width: 140px;" :title="props.row.mappedItem.assistName">
                      {{ props.row.mappedItem.assistCode }}
                    </div>
                  </div>
                  <div v-else class="column items-center q-gutter-y-2xs">
                    <q-badge
                      color="negative"
                      class="q-px-sm cursor-pointer"
                    >
                      <q-icon name="link_off" size="xs" class="q-mr-xs" />
                      Belum Termapping
                      <q-tooltip anchor="top middle" self="bottom middle">
                        SKU Desty belum dipetakan ke katalog Assist di Firebase
                      </q-tooltip>
                    </q-badge>

                    <!-- Quick SKU matching recommendation if unmapped -->
                    <div v-if="getSkuRecommendation(props.row.sku, props.row.productName).bestMatch" class="row items-center justify-center no-wrap q-mt-2xs">
                      <q-btn
                        size="xs"
                        color="teal"
                        icon="auto_fix_high"
                        :label="`Match (${Math.round((getSkuRecommendation(props.row.sku, props.row.productName).bestMatch?.score ?? 0) * 100)}%)`"
                        :loading="syncBusy"
                        @click="applyQuickMapping(props.row.sku, getSkuRecommendation(props.row.sku, props.row.productName).bestMatch!)"
                      >
                        <q-tooltip>
                          Hubungkan ke: {{ getSkuRecommendation(props.row.sku, props.row.productName).bestMatch?.catalogItem.code }} - {{ getSkuRecommendation(props.row.sku, props.row.productName).bestMatch?.catalogItem.name }} (Disimpan ke Firebase)
                        </q-tooltip>
                      </q-btn>
                      <q-btn
                        size="xs"
                        flat
                        round
                        color="teal"
                        icon="edit"
                        class="q-ml-2xs"
                        @click="openSkuRecommendationDialog(props.row.sku, props.row.productName)"
                      >
                        <q-tooltip>Pilih rekomendasi lain</q-tooltip>
                      </q-btn>
                    </div>
                    <div v-else class="q-mt-2xs">
                      <q-btn
                        size="xs"
                        outline
                        color="teal"
                        label="Petakan SKU"
                        icon="link"
                        @click="openSkuRecommendationDialog(props.row.sku, props.row.productName)"
                      />
                    </div>
                  </div>
                </q-td>
              </template>

              <template v-slot:body-cell-platformName="props">
                <q-td :props="props" class="text-center">
                  <q-badge
                    :color="props.value === 'SHOPEE' ? 'orange' : props.value.includes('TIKTOK') ? 'black' : 'teal'"
                    class="q-px-sm text-weight-bold"
                  >
                    {{ props.value }}
                  </q-badge>
                </q-td>
              </template>

              <template v-slot:body-cell-inputKeAssist="props">
                <q-td :props="props">
                  <q-badge
                    :color="props.value.startsWith('Sudah diimpor') ? 'positive' : props.value.includes('Void') ? 'orange' : props.value.startsWith('Belum') ? 'grey-6' : 'negative'"
                    class="q-px-sm"
                  >
                    {{ props.value }}
                  </q-badge>
                </q-td>
              </template>

              <template v-slot:body-cell-quantity="props">
                <q-td :props="props" class="text-right">
                  <q-badge color="teal-1" text-color="teal-9" class="q-px-sm text-weight-bold text-subtitle2">
                    {{ props.value }}
                  </q-badge>
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <!-- TAB 2: IMPOR PESANAN ONLINE (Desty → Assist) -->
          <q-tab-panel name="import" class="q-pa-md">
            <!-- Controls for Online Import -->
            <div class="row q-col-gutter-sm items-center q-mb-md">
              <div class="col-12 col-md-3">
                <q-select
                  v-model="selectedStatus"
                  outlined
                  dense
                  emit-value
                  map-options
                  :options="statusOptions.map(o => ({
                    label: `${o.label} (${statusCounts[o.countKey] !== undefined ? statusCounts[o.countKey] : '0'})`,
                    value: o.value
                  }))"
                  label="Status Pesanan Desty"
                  color="teal"
                  :disabled="!destyToken"
                />
              </div>
              <div class="col-auto">
                <q-btn
                  color="teal"
                  icon="download"
                  :loading="loading"
                  label="Tarik Pesanan"
                  @click="fetchOrders"
                  :disabled="!destyToken"
                />
              </div>
              <div class="col-auto">
                <q-btn
                  outline
                  color="blue-grey-8"
                  icon="refresh"
                  label="Segarkan Katalog"
                  :loading="syncBusy"
                  @click="loadSyncCatalog"
                >
                  <q-tooltip>Muat ulang katalog dan stok Assist terbaru</q-tooltip>
                </q-btn>
              </div>
              <div v-if="store.developerMode" class="col-auto">
                <q-btn outline color="teal" label="Validasi" :disable="!selectedOrder" @click="validateSelectedOrder" />
              </div>
              <div v-if="store.developerMode" class="col-auto">
                <q-btn color="teal" label="Dry-run" :disable="!selectedOrder" :loading="syncBusy" @click="dryRunSelectedOrder" />
              </div>
              <div class="col-auto">
                <q-btn
                  color="positive"
                  :label="selectedOrdersCount > 0 ? `Impor Terpilih (${selectedOrdersCount})` : 'Impor Terpilih'"
                  icon="cloud_upload"
                  :disable="!selectedOrdersCount || !store.assistAccountTxId"
                  :loading="syncBusy"
                  @click="importSelectedCheckedOrders"
                >
                  <q-tooltip v-if="!selectedOrdersCount">Pilih pesanan valid pada tabel di bawah dengan mencentang checkbox</q-tooltip>
                </q-btn>
              </div>
              <div class="col-auto">
                <q-btn
                  color="positive"
                  outline
                  label="Impor Semua Valid"
                  icon="done_all"
                  :disable="!orders.length || !store.assistAccountTxId"
                  :loading="syncBusy"
                  @click="bulkImportOrders"
                />
              </div>
            </div>

            <div v-if="!store.assistAccountTxId" class="text-caption text-red q-mb-sm">
              Isi accountTxId akun Kas di Pengaturan sebelum mengirim transaksi ke Assist.
            </div>

            <!-- Unmapped SKUs Recommendation Banner -->
            <q-banner
              v-if="unmappedSkusInOrders.length > 0"
              rounded
              class="bg-amber-1 text-black q-mb-md border-amber"
            >
              <template v-slot:avatar>
                <q-icon name="auto_fix_high" color="amber-9" size="md" />
              </template>
              <div class="row items-center justify-between">
                <div class="col-12 col-md-8">
                  <div class="text-subtitle2 text-weight-bold text-amber-10">
                    Ditemukan {{ unmappedSkusInOrders.length }} SKU Desty yang belum dipetakan
                  </div>
                  <div class="text-caption text-grey-9">
                    Tersedia {{ highConfidenceUnmappedCount }} rekomendasi otomatis dengan tingkat kecocokan tinggi berdasarkan kesamaan kode, kemasan, dosis, dan nama obat.
                  </div>
                </div>
                <div class="col-12 col-md-4 row q-gutter-xs justify-end q-mt-xs-sm">
                  <q-btn
                    v-if="highConfidenceUnmappedCount > 0"
                    color="positive"
                    icon="done_all"
                    :label="`Petakan Otomatis (${highConfidenceUnmappedCount})`"
                    :loading="syncBusy"
                    @click="applyAllHighConfidenceRecommendations"
                  >
                    <q-tooltip>Simpan semua rekomendasi SKU berakurasi tinggi</q-tooltip>
                  </q-btn>
                  <q-btn
                    outline
                    color="teal"
                    icon="manage_search"
                    label="Review Rekomendasi"
                    @click="openSkuRecommendationDialog(unmappedSkusInOrders[0].sku, unmappedSkusInOrders[0].productName)"
                  />
                </div>
              </div>
            </q-banner>

            <!-- Sync Issues List with In-Place Recommendation Matching -->
            <q-list v-if="syncIssues.length" bordered separator class="q-mb-md">
              <q-item v-for="issue in syncIssues" :key="`${issue.code}-${issue.sku ?? issue.message}`">
                <q-item-section avatar><q-icon name="error" color="negative" /></q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold text-red-9">{{ issue.message }}</q-item-label>
                  <div v-if="issue.code === 'unmapped-sku' && issue.sku" class="q-mt-xs">
                    <template v-if="getSkuRecommendation(issue.sku).bestMatch">
                      <div class="row items-center q-gutter-x-sm q-gutter-y-xs q-mt-2xs">
                        <q-badge
                          :color="getSkuRecommendation(issue.sku).bestMatch?.confidence === 'high' ? 'green-1' : 'amber-1'"
                          :text-color="getSkuRecommendation(issue.sku).bestMatch?.confidence === 'high' ? 'green-9' : 'amber-10'"
                          class="q-pa-xs text-weight-bold"
                        >
                          <q-icon name="auto_fix_high" size="14px" class="q-mr-xs" />
                          Rekomendasi ({{ Math.round((getSkuRecommendation(issue.sku).bestMatch?.score ?? 0) * 100) }}% Cocok):
                          <span class="font-mono q-ml-xs">{{ getSkuRecommendation(issue.sku).bestMatch?.catalogItem.code }}</span>
                          <span class="q-mx-xs">-</span>
                          <span>{{ getSkuRecommendation(issue.sku).bestMatch?.catalogItem.name }}</span>
                        </q-badge>
                        <q-btn
                          size="sm"
                          color="teal"
                          icon="link"
                          label="Hubungkan Sekarang"
                          :loading="syncBusy"
                          @click="applyQuickMapping(issue.sku, getSkuRecommendation(issue.sku).bestMatch!)"
                        />
                        <q-btn
                          size="sm"
                          outline
                          color="teal"
                          icon="manage_search"
                          label="Pilih / Cari Lainnya"
                          @click="openSkuRecommendationDialog(issue.sku)"
                        />
                      </div>
                      <div class="text-caption text-grey-7 q-mt-2xs" style="font-size: 11px;">
                        Alasan: {{ getSkuRecommendation(issue.sku).bestMatch?.matchReasons.join(" • ") }}
                      </div>
                    </template>
                  </div>
                </q-item-section>
              </q-item>
            </q-list>

            <!-- Table Header Control Bar -->
            <div v-if="flattenedItems.length" class="row items-center justify-between q-px-md q-py-sm bg-grey-1 rounded-borders q-mb-sm text-caption">
              <div class="row items-center q-gutter-sm">
                <span class="text-weight-medium text-grey-8">
                  Terpilih: <strong class="text-teal-9">{{ selectedOrdersCount }} order</strong> ({{ selectedRows.length }} baris)
                </span>
                <q-btn size="sm" flat dense color="teal" label="Pilih Semua Valid" @click="selectAllValid" />
                <q-btn size="sm" flat dense color="grey-7" label="Batal Pilih" @click="clearSelection" :disable="!selectedRows.length" />
              </div>
              <div class="row items-center q-gutter-sm">
                <div v-if="!assistCatalog.length && syncBusy" class="text-teal row items-center">
                  <q-spinner size="xs" class="q-mr-xs" />
                  Memuat katalog Assist otomatis...
                </div>
                <div v-else-if="assistCatalog.length" class="text-teal-9 row items-center">
                  <q-icon name="check_circle" size="xs" color="positive" class="q-mr-xs" />
                  Katalog Assist Aktif ({{ assistCatalog.length }} item)
                </div>
              </div>
            </div>

            <!-- Dedicated Import Table with Conversion Factor Adjustment Column -->
            <q-table
              :rows="flattenedItems"
              :columns="importTableColumns"
              row-key="rowId"
              selection="multiple"
              v-model:selected="selectedRows"
              flat
              bordered
              :loading="loading"
              :pagination="{ rowsPerPage: 15 }"
              no-data-label="Belum ada data pesanan. Klik 'Tarik Pesanan' untuk memuat."
            >
              <!-- Selection header -->
              <template v-slot:header-selection="scope">
                <q-checkbox
                  :model-value="allValidSelected"
                  :indeterminate="someValidSelected && !allValidSelected"
                  :disable="!validItems.length"
                  color="teal"
                  @update:model-value="toggleSelectAllValid"
                >
                  <q-tooltip v-if="!validItems.length">Tidak ada pesanan valid yang dapat dipilih</q-tooltip>
                  <q-tooltip v-else>Pilih semua pesanan valid</q-tooltip>
                </q-checkbox>
              </template>

              <!-- Selection body -->
              <template v-slot:body-selection="scope">
                <q-checkbox
                  v-model="scope.selected"
                  :disable="!scope.row.isValid"
                  color="teal"
                >
                  <q-tooltip v-if="!scope.row.isValid">Pesanan tidak valid tidak dapat dipilih untuk impor</q-tooltip>
                </q-checkbox>
              </template>

              <template v-slot:body-cell-no="props">
                <q-td :props="props" class="text-center font-mono">
                  {{ props.rowIndex + 1 }}
                </q-td>
              </template>

              <template v-slot:body-cell-validationStatus="props">
                <q-td :props="props" class="text-center">
                  <q-badge
                    v-if="props.row.isValid"
                    color="positive"
                    class="q-px-sm cursor-pointer"
                  >
                    <q-icon name="check_circle" size="xs" class="q-mr-xs" />
                    Valid
                    <q-tooltip anchor="top middle" self="bottom middle">
                      Order valid dan siap diimpor ke Assist
                    </q-tooltip>
                  </q-badge>
                  <q-badge
                    v-else
                    color="negative"
                    class="q-px-sm cursor-pointer"
                  >
                    <q-icon name="error" size="xs" class="q-mr-xs" />
                    Tidak Valid
                    <q-tooltip anchor="top middle" self="bottom middle" max-width="360px">
                      <div class="text-weight-bold q-mb-xs">Masalah Validasi:</div>
                      <div v-for="(msg, i) in props.row.validationMessages" :key="i">• {{ msg }}</div>
                    </q-tooltip>
                  </q-badge>
                </q-td>
              </template>

              <template v-slot:body-cell-orderSn="props">
                <q-td :props="props" style="max-width: 140px;">
                  <div class="font-mono text-weight-bold text-slate-900 ellipsis" :title="props.row.displayedOrderSn || props.row.orderKey">
                    {{ props.row.displayedOrderSn || props.row.orderKey }}
                  </div>
                  <div class="row items-center q-gutter-x-xs q-mt-2xs no-wrap ellipsis">
                    <q-badge
                      :color="props.row.platformName === 'SHOPEE' ? 'orange' : props.row.platformName.includes('TIKTOK') ? 'black' : 'teal'"
                      class="text-2xs"
                    >
                      {{ props.row.platformName }}
                    </q-badge>
                    <span v-if="props.row.courier" class="text-caption text-grey-7 text-2xs ellipsis" :title="props.row.courier">{{ props.row.courier }}</span>
                  </div>
                </q-td>
              </template>

              <template v-slot:body-cell-destyItem="props">
                <q-td :props="props" style="max-width: 180px;">
                  <div class="text-weight-bold text-slate-900 ellipsis-2-lines" :title="props.row.productName">{{ props.row.productName }}</div>
                  <div class="font-mono text-caption text-primary ellipsis" :title="props.row.sku">
                    SKU: {{ props.row.sku || "(kosong)" }}
                  </div>
                </q-td>
              </template>

              <template v-slot:body-cell-quantity="props">
                <q-td :props="props" class="text-center" style="width: 75px;">
                  <div class="text-weight-bold text-subtitle2 text-teal">
                    {{ props.row.quantity }} <span class="text-caption text-grey-7">{{ props.row.satuan || 'Pcs' }}</span>
                  </div>
                </q-td>
              </template>

              <!-- Assist Mapped Item Details -->
              <template v-slot:body-cell-assistItem="props">
                <q-td :props="props" style="max-width: 180px;">
                  <div v-if="props.row.mappedItem">
                    <div class="text-weight-bold text-slate-900 ellipsis-2-lines" :title="props.row.mappedItem.assistName">{{ props.row.mappedItem.assistName }}</div>
                    <div class="text-caption font-mono text-grey-7 ellipsis" :title="props.row.mappedItem.assistCode">
                      Kode: {{ props.row.mappedItem.assistCode }}
                      <q-badge color="blue-grey-2" text-color="blue-grey-9" class="q-ml-xs text-2xs">
                        {{ props.row.mappedItem.assistType }}
                      </q-badge>
                      <q-badge v-if="props.row.is1to1Fallback" color="teal-1" text-color="teal-9" class="q-ml-xs text-2xs">
                        1:1 Auto
                      </q-badge>
                    </div>
                  </div>
                  <div v-else class="text-caption text-negative row items-center no-wrap">
                    <q-icon name="warning" size="14px" class="q-mr-xs" />
                    <span class="ellipsis">Belum Dipetakan</span>
                    <q-btn
                      size="xs"
                      flat
                      color="teal"
                      label="Petakan"
                      class="q-ml-xs"
                      @click="openSkuRecommendationDialog(props.row.sku, props.row.productName)"
                    />
                  </div>
                </q-td>
              </template>

              <!-- Editable Conversion Factor Column -->
              <template v-slot:body-cell-conversionFactor="props">
                <q-td :props="props" style="width: 110px;">
                  <div class="row items-center no-wrap">
                    <q-input
                      :model-value="props.row.conversionFactor"
                      @update:model-value="(val) => updateRowConversionFactor(props.row, val)"
                      type="number"
                      min="0.0001"
                      step="any"
                      outlined
                      dense
                      color="teal"
                      hide-bottom-space
                      style="width: 75px;"
                    >
                      <template v-slot:prepend>
                        <span class="text-2xs text-grey-6 font-mono">1:</span>
                      </template>
                    </q-input>
                    <q-btn
                      flat
                      round
                      dense
                      size="xs"
                      color="teal"
                      icon="tune"
                      class="q-ml-xs"
                      @click="openSkuRecommendationDialog(props.row.sku, props.row.productName)"
                    >
                      <q-tooltip>Sesuaikan mapping & referensi konversi</q-tooltip>
                    </q-btn>
                  </div>
                  <div class="text-2xs text-grey-6 q-mt-2xs">
                    Disimpan otomatis
                  </div>
                </q-td>
              </template>

              <!-- Calculated Assist Quantity -->
              <template v-slot:body-cell-assistQty="props">
                <q-td :props="props" class="text-center" style="width: 75px;">
                  <div class="text-weight-bold text-subtitle2 text-positive">
                    {{ props.row.assistQty }} <span class="text-caption text-grey-7">{{ props.row.assistUnit || 'Pcs' }}</span>
                  </div>
                </q-td>
              </template>

              <!-- Assist Stock Level -->
              <template v-slot:body-cell-assistStock="props">
                <q-td :props="props" class="text-center" style="width: 85px;">
                  <div v-if="props.row.assistStock !== null && props.row.assistStock !== undefined">
                    <q-badge
                      :color="props.row.assistStock >= props.row.assistQty ? 'green-1' : 'red-1'"
                      :text-color="props.row.assistStock >= props.row.assistQty ? 'green-9' : 'red-9'"
                      class="text-weight-bold"
                    >
                      {{ props.row.assistStock }} {{ props.row.assistUnit || 'Pcs' }}
                    </q-badge>
                  </div>
                  <div v-else class="text-caption text-grey-5">-</div>
                </q-td>
              </template>

              <template v-slot:body-cell-inputKeAssist="props">
                <q-td :props="props" style="width: 120px;">
                  <q-badge
                    :color="props.value.startsWith('Sudah diimpor') ? 'positive' : props.value.includes('Void') ? 'orange' : props.value.startsWith('Belum') ? 'grey-6' : 'negative'"
                    class="q-px-sm"
                  >
                    {{ props.value }}
                  </q-badge>
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <!-- TAB 3: SO STOK OFFLINE (Assist → Desty Stock Reduction) -->
          <q-tab-panel name="offline_sync" class="q-pa-md">
            <!-- Filter Bar -->
            <div class="row q-col-gutter-md items-center q-mb-md">
              <div class="col-12 col-md-3">
                <q-input
                  v-model="offlineStartDate"
                  type="date"
                  outlined
                  dense
                  label="Mulai Tanggal"
                  color="teal"
                  stack-label
                />
              </div>
              <div class="col-12 col-md-3">
                <q-input
                  v-model="offlineEndDate"
                  type="date"
                  outlined
                  dense
                  label="Akhir Tanggal"
                  color="teal"
                  stack-label
                />
              </div>
              <div class="col-12 col-md-3 flex items-center">
                <q-checkbox
                  v-model="offlineExcludeOnline"
                  label="Hanya Offline POS (Exclude Marketplace)"
                  color="teal"
                >
                  <q-tooltip>Mengecualikan transaksi dengan tanda pembayaran Marketplace / Desty</q-tooltip>
                </q-checkbox>
              </div>
              <div class="col-12 col-md-3 row q-gutter-sm justify-end">
                <q-btn
                  color="teal"
                  icon="download"
                  label="Tarik Penjualan Offline"
                  :loading="isFetchingOfflineSales"
                  @click="fetchOfflineSales"
                />
                <q-btn
                  outline
                  color="teal"
                  icon="sync"
                  label="Tarik Stok Desty"
                  :loading="isLoadingLiveDestyStockForOffline"
                  :disabled="!destyToken || !offlineSoldItems.length"
                  @click="fetchLiveDestyStockForOffline()"
                >
                  <q-tooltip>Muat ulang tingkat stok live dari Desty Omni</q-tooltip>
                </q-btn>
              </div>
            </div>

            <!-- Summary Metrics -->
            <div v-if="offlineReductionItems.length > 0" class="row q-col-gutter-sm q-mb-md">
              <div class="col">
                <q-card flat bordered class="bg-grey-1 text-center q-pa-sm">
                  <div class="text-caption text-grey-7">Total Item Terjual</div>
                  <div class="text-h6 text-weight-bold text-teal">{{ offlineSummaryStats.total }}</div>
                </q-card>
              </div>
              <div class="col">
                <q-card flat bordered class="bg-green-1 text-center q-pa-sm">
                  <div class="text-caption text-green-9">Siap Dikurangi</div>
                  <div class="text-h6 text-weight-bold text-positive">{{ offlineSummaryStats.ready }}</div>
                </q-card>
              </div>
              <div class="col">
                <q-card flat bordered class="bg-amber-1 text-center q-pa-sm">
                  <div class="text-caption text-amber-10">Peringatan Stok</div>
                  <div class="text-h6 text-weight-bold text-amber-9">{{ offlineSummaryStats.warning }}</div>
                </q-card>
              </div>
              <div class="col">
                <q-card flat bordered class="bg-red-1 text-center q-pa-sm">
                  <div class="text-caption text-red-9">Belum Dipetakan</div>
                  <div class="text-h6 text-weight-bold text-negative">{{ offlineSummaryStats.unmapped }}</div>
                </q-card>
              </div>
              <div class="col">
                <q-card flat bordered class="bg-purple-1 text-center q-pa-sm">
                  <div class="text-caption text-purple-9">Sudah Terkoreksi</div>
                  <div class="text-h6 text-weight-bold text-purple-8">{{ offlineSummaryStats.synced }}</div>
                </q-card>
              </div>
            </div>

            <!-- Filter Controls & Action Button -->
            <div v-if="offlineReductionItems.length > 0" class="row q-col-gutter-sm items-center justify-between q-mb-md">
              <div class="col-12 col-md-4">
                <q-input
                  v-model="offlineSearchQuery"
                  outlined
                  dense
                  placeholder="Cari SKU lokal, SKU Desty, nama obat..."
                  color="teal"
                  clearable
                >
                  <template v-slot:prepend><q-icon name="search" /></template>
                </q-input>
              </div>
              <div class="col-12 col-md-4">
                <q-select
                  v-model="offlineStatusFilter"
                  :options="[
                    { label: 'Semua Status', value: 'all' },
                    { label: 'Siap Dikurangi', value: 'ready' },
                    { label: 'Peringatan Stok / Minus', value: 'warning' },
                    { label: 'Belum Dipetakan / SKU Hilang', value: 'unmapped' },
                    { label: 'Sudah Terkoreksi', value: 'synced' },
                  ]"
                  emit-value
                  map-options
                  outlined
                  dense
                  color="teal"
                  label="Filter Status"
                />
              </div>
              <div class="col-12 col-md-4 text-right">
                <q-btn
                  color="positive"
                  icon="sync"
                  :label="`Koreksi ke Desty (${offlineCheckedItems.length} dipilih)`"
                  :disabled="offlineCheckedItems.length === 0 || !destyToken || isSyncingOfflineStock"
                  :loading="isSyncingOfflineStock"
                  @click="openOfflineConfirmDialog"
                >
                  <q-tooltip v-if="!destyToken">Token Desty tidak aktif. Pastikan omni.desty.app terbuka.</q-tooltip>
                </q-btn>
              </div>
            </div>

            <!-- Offline Reduction Table -->
            <div v-if="offlineReductionItems.length > 0" class="q-table__container q-table--bordered bg-white rounded-borders">
              <div class="q-table__middle scroll" style="max-height: 520px;">
                <table class="q-table q-table--dense">
                  <thead>
                    <tr>
                      <th style="width: 48px;" class="text-center">
                        <q-checkbox
                          :model-value="isAllOfflineChecked"
                          @update:model-value="toggleSelectAllOffline"
                          color="teal"
                          dense
                        />
                      </th>
                      <th class="text-left" style="max-width: 220px;">Produk Assist (POS)</th>
                      <th class="text-center" style="width: 95px;">Terjual Offline</th>
                      <th class="text-center" style="width: 105px;">Stok Assist</th>
                      <th class="text-left" style="max-width: 170px;">Pemetaan SKU Desty</th>
                      <th class="text-center" style="width: 120px;">Stok Desty Live</th>
                      <th class="text-left" style="width: 170px;">Pengurangan Stok (-)</th>
                      <th class="text-center" style="width: 120px;">Status Validasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in filteredOfflineReductionItems" :key="item.rowKey">
                      <td class="text-center" style="width: 48px;">
                        <q-checkbox
                          :model-value="item.checked"
                          @update:model-value="(val) => updateOfflineRowChecked(item.rowKey, val)"
                          :disable="!item.destySkuId || item.status === 'synced'"
                          color="teal"
                          dense
                        />
                      </td>
                      <td style="max-width: 220px;">
                        <div class="text-weight-bold text-slate-900 ellipsis-2-lines" :title="item.assistItemName">{{ item.assistItemName }}</div>
                        <div class="text-caption font-mono text-grey-7 ellipsis" :title="item.assistCode || item.assistItemId">
                          Kode: {{ item.assistCode || item.assistItemId || "-" }}
                          <q-badge color="blue-grey-2" text-color="blue-grey-9" class="q-ml-xs text-2xs">
                            {{ item.assistItemType }}
                          </q-badge>
                        </div>
                      </td>
                      <td class="text-center" style="width: 95px;">
                        <div class="text-weight-bold text-subtitle2 text-teal">
                          {{ item.offlineQty }} <span class="text-caption text-grey-6">{{ item.assistUnit }}</span>
                        </div>
                      </td>
                      <td class="text-center" style="width: 105px;">
                        <div v-if="item.assistStock !== null && item.assistStock !== undefined">
                          <div class="text-weight-bold text-subtitle2 text-slate-900">
                            {{ item.assistStock }} <span class="text-caption text-grey-6">{{ item.assistUnit }}</span>
                          </div>
                        </div>
                        <div v-else class="text-caption text-grey-5 flex items-center justify-center">
                          -
                        </div>
                      </td>
                      <td style="max-width: 170px;">
                        <div class="row items-center q-gutter-x-xs no-wrap">
                          <span class="font-mono text-weight-bold text-primary ellipsis" :title="item.destySku">{{ item.destySku }}</span>
                          <q-badge color="teal-1" text-color="teal-9" v-if="item.isMapped" class="text-2xs">
                            Mapped
                          </q-badge>
                          <q-badge color="grey-2" text-color="grey-8" v-else class="text-2xs">
                            1:1
                          </q-badge>
                        </div>
                        <div class="text-caption text-grey-6 q-mt-2xs ellipsis" v-if="item.conversionFactor !== 1">
                          1 {{ item.destyUnit }} = {{ item.conversionFactor }} {{ item.assistUnit }}
                        </div>
                        <div class="text-caption text-primary text-weight-bold q-mt-2xs">
                          Eq: {{ item.qtyDesty }} {{ item.destyUnit }}
                        </div>
                      </td>
                      <td class="text-center" style="width: 120px;">
                        <div v-if="item.destyStockFound" class="q-gutter-y-2xs">
                          <div class="row items-center justify-center q-gutter-x-xs text-caption">
                            <span>Fisik: <strong class="text-slate-900">{{ item.destyFisik }}</strong></span>
                            <span class="text-grey-4">|</span>
                            <span :class="item.destyReserved > 0 ? 'text-amber-9 text-weight-bold' : 'text-grey-6'">
                              Rsv: {{ item.destyReserved }}
                            </span>
                          </div>
                          <div>
                            <q-badge
                              :color="(item.destyTersedia ?? 0) > 0 ? 'green-1' : 'red-1'"
                              :text-color="(item.destyTersedia ?? 0) > 0 ? 'green-9' : 'red-9'"
                              class="text-weight-bold"
                            >
                              Tersedia: {{ item.destyTersedia }} {{ item.destyUnit }}
                            </q-badge>
                          </div>
                        </div>
                        <div v-else class="text-caption text-grey-5 flex items-center justify-center">
                          <q-icon name="cloud_off" size="14px" class="q-mr-xs text-grey-5" />
                          Tidak Ada
                        </div>
                      </td>
                      <td style="width: 170px;">
                        <div v-if="item.destySkuId">
                          <q-input
                            :model-value="item.reductionQty"
                            @update:model-value="(val) => updateOfflineRowReductionQty(item.rowKey, val)"
                            type="number"
                            prefix="-"
                            outlined
                            dense
                            color="teal"
                            :disable="item.status === 'synced'"
                            hide-bottom-space
                            style="width: 120px;"
                          >
                            <template v-slot:append>
                              <span class="text-caption text-grey-7 font-weight-bold">{{ item.destyUnit }}</span>
                            </template>
                          </q-input>
                          <div class="text-caption text-grey-7 q-mt-xs flex items-center justify-between">
                            <span>Fisik: <strong>{{ item.calculatedFisikBaru !== null ? item.calculatedFisikBaru : '-' }}</strong></span>
                            <span>Tersedia: <strong :class="(item.calculatedTersediaBaru ?? 0) < 0 ? 'text-red font-weight-bold' : 'text-teal'">{{ item.calculatedTersediaBaru !== null ? item.calculatedTersediaBaru : '-' }}</strong></span>
                          </div>
                        </div>
                        <span v-else class="text-caption text-grey-4">-</span>
                      </td>
                      <td class="text-center" style="width: 120px;">
                        <q-badge
                          :color="item.badgeColor"
                          class="q-px-sm q-py-xs"
                        >
                          <q-icon
                            :name="item.status === 'synced' ? 'check_circle' : item.status === 'ready' ? 'check' : item.status === 'warning' ? 'warning' : 'error'"
                            size="12px"
                            class="q-mr-xs"
                          />
                          {{ item.status === 'synced' ? 'Terkoreksi' : item.status === 'ready' ? 'Siap' : item.status === 'warning' ? 'Peringatan' : 'Belum Cocok' }}
                        </q-badge>
                        <div class="text-caption text-grey-7 q-mt-xs ellipsis" :title="item.statusMessage" style="font-size: 10px;">
                          {{ item.statusMessage }}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Empty state -->
            <div v-else class="text-center q-pa-lg text-grey-6 border-dashed rounded-borders q-mt-md">
              <q-icon name="sync_saved_locally" size="48px" class="text-grey-4 q-mb-sm" />
              <div>Pilih rentang tanggal lalu klik <strong>Tarik Penjualan Offline</strong> untuk memuat data transaksi.</div>
            </div>
          </q-tab-panel>

          <!-- TAB 4: PEMETAAN & KONVERSI SKU -->
          <q-tab-panel name="mapping" class="q-pa-md">
            <!-- Unmapped SKU Suggestions Box -->
            <div v-if="unmappedSkuRecommendations.length" class="q-mb-md q-pa-sm bg-grey-1 rounded-borders border">
              <div class="text-caption text-weight-bold text-teal row items-center justify-between q-mb-xs">
                <span>
                  <q-icon name="auto_fix_high" class="q-mr-xs" />
                  SKU Belum Dipetakan dari Pesanan Desty ({{ unmappedSkuRecommendations.length }} SKU):
                </span>
                <q-btn
                  v-if="highConfidenceUnmappedCount > 0"
                  size="xs"
                  color="positive"
                  icon="done_all"
                  :label="`Petakan Otomatis Semua (${highConfidenceUnmappedCount})`"
                  :loading="syncBusy"
                  @click="applyAllHighConfidenceRecommendations"
                />
              </div>
              <div class="row q-col-gutter-xs">
                <div v-for="item in unmappedSkuRecommendations" :key="item.sku" class="col-12 col-md-6">
                  <q-card flat bordered class="q-pa-xs bg-white">
                    <div class="row items-center justify-between no-wrap">
                      <div class="ellipsis q-mr-sm" style="max-width: 65%;">
                        <span class="font-mono text-weight-bold text-primary">{{ item.sku }}</span>
                        <div class="text-caption text-grey-8 ellipsis" :title="item.productName">{{ item.productName }}</div>
                      </div>
                      <div class="row q-gutter-x-2xs items-center">
                        <template v-if="item.recommendation.bestMatch">
                          <q-badge
                            :color="item.recommendation.bestMatch.confidence === 'high' ? 'green-1' : 'amber-1'"
                            :text-color="item.recommendation.bestMatch.confidence === 'high' ? 'green-9' : 'amber-10'"
                            class="text-weight-bold"
                          >
                            {{ Math.round(item.recommendation.bestMatch.score * 100) }}%
                          </q-badge>
                          <q-btn
                            size="xs"
                            color="teal"
                            icon="link"
                            label="Hubungkan"
                            :loading="syncBusy"
                            @click="applyQuickMapping(item.sku, item.recommendation.bestMatch)"
                          >
                            <q-tooltip>
                              Hubungkan ke: {{ item.recommendation.bestMatch.catalogItem.code }} - {{ item.recommendation.bestMatch.catalogItem.name }}
                            </q-tooltip>
                          </q-btn>
                        </template>
                        <q-btn
                          size="xs"
                          flat
                          round
                          color="teal"
                          icon="edit"
                          @click="openSkuRecommendationDialog(item.sku, item.productName)"
                        >
                          <q-tooltip>Pilih item atau sesuaikan pemetaan</q-tooltip>
                        </q-btn>
                      </div>
                    </div>
                  </q-card>
                </div>
              </div>
            </div>

            <!-- Manual / Override Mapping Form -->
            <div class="row q-col-gutter-sm q-mb-md">
              <div class="col-12 col-md-3">
                <q-input v-model="mappingDraft.destySku" outlined dense label="SKU Desty">
                  <template v-slot:after>
                    <q-btn
                      round
                      dense
                      flat
                      color="teal"
                      icon="auto_fix_high"
                      :disable="!mappingDraft.destySku"
                      @click="autoFillMappingDraft()"
                    >
                      <q-tooltip>Cari rekomendasi otomatis untuk SKU ini</q-tooltip>
                    </q-btn>
                  </template>
                </q-input>
              </div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistCode" outlined dense label="Kode Assist" /></div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistId" outlined dense label="ID Assist" /></div>
              <div class="col-12 col-md-3"><q-input v-model="mappingDraft.assistName" outlined dense label="Nama Assist" /></div>
              <div class="col-12 col-md-2"><q-select v-model="mappingDraft.assistType" :options="['prescription', 'akhp']" outlined dense label="Tipe" /></div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistUnit" outlined dense label="Unit Assist" /></div>
              <div class="col-12 col-md-2"><q-input v-model.number="mappingDraft.conversionFactor" type="number" min="0.0001" step="any" outlined dense label="Faktor konversi" /></div>
              <div class="col-12 col-md-3 flex items-center text-caption text-grey-7">Depot default: {{ DEFAULT_ASSIST_DEPOT_ID }}</div>
              <div class="col-12 col-md-2 flex items-center"><q-checkbox v-model="mappingDraft.active" label="Aktif" /></div>
              <div class="col-12 row q-gutter-sm items-center">
                <q-btn color="teal" icon="save" label="Simpan Mapping" :loading="syncBusy" @click="saveMapping" />
                <q-btn outline color="teal" icon="sync" label="Sync Firebase" :loading="syncBusy" @click="syncWithFirebase" />
                <q-btn outline color="teal" icon="file_download" label="Ekspor JSON" :disable="syncBusy" @click="exportMappings" />
                <q-btn outline color="teal" icon="file_upload" label="Impor JSON" :disable="syncBusy" @click="mappingFileInput?.click()" />
                <input ref="mappingFileInput" type="file" accept="application/json,.json" style="display:none" @change="importMappings" />
              </div>
            </div>

            <!-- Master Mappings Table -->
            <q-table class="q-mt-md" flat bordered dense :rows="mappings" :columns="mappingColumns" row-key="destySku" no-data-label="Belum ada mapping SKU.">
              <template #body-cell-destySku="props">
                <q-td :props="props" style="max-width: 170px;">
                  <span class="font-mono text-weight-bold text-primary ellipsis inline-block" style="max-width: 160px;" :title="props.value">{{ props.value }}</span>
                </q-td>
              </template>
              <template #body-cell-assistName="props">
                <q-td :props="props" style="max-width: 250px;">
                  <span class="ellipsis inline-block" style="max-width: 240px;" :title="props.value">{{ props.value }}</span>
                </q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" class="q-gutter-xs">
                  <q-btn flat round dense icon="edit" color="teal" aria-label="Edit mapping" @click="editMapping(props.row)" />
                  <q-btn flat round dense icon="delete" color="negative" aria-label="Hapus mapping" @click="deleteMapping(props.row.destySku)" />
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <!-- TAB 5: LOG IMPOR -->
          <q-tab-panel name="log" class="q-pa-md">
            <q-table flat bordered dense :rows="importLedger" :columns="ledgerColumns" row-key="marketplaceOrderSn" no-data-label="Belum ada log impor." />
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>
    </q-card>

    <!-- Dialog Konfirmasi Koreksi Pengurangan Stok Desty -->
    <q-dialog v-model="showOfflineConfirmDialog" persistent>
      <q-card style="min-width: 450px; max-width: 600px;">
        <q-card-section class="row items-center bg-teal text-white">
          <q-icon name="sync_saved_locally" size="24px" class="q-mr-sm" />
          <div class="text-h6">Konfirmasi Koreksi Stok Desty</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="text-body2 text-slate-800 q-mb-md">
            Anda akan melakukan <strong>pengurangan stok fisik</strong> pada Desty Omni untuk <strong>{{ offlineCheckedItems.length }} SKU</strong> berikut:
          </div>

          <q-list bordered separator class="rounded-borders bg-grey-1" style="max-height: 240px; overflow-y: auto;">
            <q-item v-for="item in offlineCheckedItems" :key="item.rowKey" dense>
              <q-item-section>
                <q-item-label class="text-weight-bold font-mono text-primary">{{ item.destySku }}</q-item-label>
                <q-item-label caption>{{ item.assistItemName }} ({{ item.assistItemType }})</q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="text-weight-bold text-negative">
                  -{{ item.reductionQty }} {{ item.destyUnit }}
                </div>
                <div class="text-caption text-grey-6" style="font-size: 10px;">
                  Fisik baru: {{ item.calculatedFisikBaru !== null ? item.calculatedFisikBaru : '-' }}
                </div>
              </q-item-section>
            </q-item>
          </q-list>

          <q-banner rounded class="bg-amber-1 text-amber-10 q-mt-md text-caption">
            <template v-slot:avatar>
              <q-icon name="warning" color="amber-9" />
            </template>
            Stok fisik di Desty Omni akan dikurangi secara langsung via API. Pastikan data di atas sudah sesuai.
          </q-banner>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Batal" color="grey-7" v-close-popup />
          <q-btn
            color="positive"
            label="Ya, Potong Stok Desty"
            icon="check"
            @click="handleExecuteOfflineStockSync"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog Progress & Log Eksekusi Koreksi Stok Desty -->
    <q-dialog v-model="showOfflineProgressDialog" persistent>
      <q-card style="min-width: 500px; max-width: 700px;">
        <q-card-section class="row items-center bg-teal text-white">
          <q-icon name="sync" size="24px" class="q-mr-sm" :class="{ 'rotate-spinner': isSyncingOfflineStock }" />
          <div class="text-h6">
            {{ isSyncingOfflineStock ? 'Memproses Koreksi Stok Desty...' : 'Koreksi Stok Desty Selesai' }}
          </div>
        </q-card-section>

        <q-card-section class="q-pt-md">
          <!-- Progress Bar -->
          <div class="q-mb-sm">
            <div class="row justify-between text-caption text-grey-8 q-mb-xs">
              <span>Progress: {{ offlineProgressCurrent }} / {{ offlineProgressTotal }} item</span>
              <span class="text-weight-bold">
                <span class="text-positive">{{ offlineProgressSuccess }} Sukses</span> • 
                <span class="text-negative">{{ offlineProgressFailed }} Gagal</span>
              </span>
            </div>
            <q-linear-progress
              :value="offlineProgressTotal > 0 ? offlineProgressCurrent / offlineProgressTotal : 0"
              color="teal"
              size="8px"
              rounded
            />
          </div>

          <!-- Log stream list -->
          <div class="text-caption text-grey-7 q-mb-xs">Log Aktivitas:</div>
          <div class="bg-grey-10 text-grey-2 q-pa-sm rounded-borders font-mono text-caption" style="height: 200px; overflow-y: auto;">
            <div
              v-for="(log, idx) in offlineProgressLogs"
              :key="idx"
              class="q-mb-xs"
              :class="{
                'text-green-4': log.type === 'success',
                'text-red-4': log.type === 'error',
                'text-amber-4': log.type === 'warning',
                'text-grey-4': log.type === 'info'
              }"
            >
              <span class="text-grey-6">[{{ log.time }}]</span> {{ log.text }}
            </div>
            <div v-if="!offlineProgressLogs.length" class="text-grey-6 text-italic">Menunggu proses...</div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn
            color="teal"
            label="Tutup"
            :disable="isSyncingOfflineStock"
            v-close-popup
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog Rekomendasi & Pemetaan SKU Otomatis -->
    <q-dialog v-model="showSkuRecommendationModal" persistent>
      <q-card style="min-width: 550px; max-width: 750px;">
        <q-card-section class="row items-center bg-teal text-white">
          <q-icon name="auto_fix_high" size="24px" class="q-mr-sm" />
          <div class="text-h6">Rekomendasi Pemetaan SKU</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <!-- Target Desty SKU details -->
          <div class="q-pa-sm bg-grey-2 rounded-borders q-mb-md">
            <div class="row justify-between items-center">
              <div>
                <span class="text-caption text-grey-7">SKU Desty:</span>
                <span class="text-weight-bold font-mono text-primary q-ml-xs text-subtitle2">{{ modalTargetSku }}</span>
              </div>
              <div v-if="modalTargetProductName" class="text-caption text-grey-8 ellipsis" style="max-width: 320px;">
                {{ modalTargetProductName }}
              </div>
            </div>
          </div>

          <!-- Candidates List from SkuMatcher -->
          <div class="text-subtitle2 text-weight-bold text-teal q-mb-xs">
            Rekomendasi Terbaik dari Katalog Assist:
          </div>
          
          <div v-if="getSkuRecommendation(modalTargetSku, modalTargetProductName).candidates.length > 0" class="q-gutter-y-xs q-mb-md">
            <q-card
              v-for="cand in getSkuRecommendation(modalTargetSku, modalTargetProductName).candidates"
              :key="cand.catalogItem.id"
              flat
              bordered
              class="cursor-pointer transition-all"
              :class="modalSelectedCandidate?.catalogItem.id === cand.catalogItem.id ? 'bg-teal-1 border-teal' : 'bg-white'"
              @click="modalSelectedCandidate = cand; modalConversionFactor = cand.suggestedConversionFactor || 1"
            >
              <q-card-section class="q-pa-sm">
                <div class="row items-center justify-between">
                  <div class="row items-center q-gutter-x-sm">
                    <q-radio
                      :model-value="modalSelectedCandidate?.catalogItem.id"
                      :val="cand.catalogItem.id"
                      color="teal"
                      dense
                    />
                    <div>
                      <div class="text-weight-bold text-slate-900">
                        {{ cand.catalogItem.name }}
                        <q-badge color="blue-grey-2" text-color="blue-grey-9" class="q-ml-xs text-2xs">
                          {{ cand.catalogItem.type }}
                        </q-badge>
                      </div>
                      <div class="text-caption font-mono text-grey-7">
                        Kode: {{ cand.catalogItem.code }} • Satuan: {{ cand.catalogItem.unit || 'Pcs' }}
                        <span v-if="cand.catalogItem.stock !== undefined" class="q-ml-xs text-teal">
                          • Stok Assist: {{ cand.catalogItem.stock }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="text-right">
                    <q-badge
                      :color="cand.confidence === 'high' ? 'green-1' : cand.confidence === 'medium' ? 'amber-1' : 'grey-2'"
                      :text-color="cand.confidence === 'high' ? 'green-9' : cand.confidence === 'medium' ? 'amber-10' : 'grey-8'"
                      class="text-weight-bold"
                    >
                      {{ Math.round(cand.score * 100) }}% Cocok
                    </q-badge>
                  </div>
                </div>
                <div class="text-caption text-grey-7 q-mt-xs q-pl-lg" style="font-size: 11px;">
                  Alasan: {{ cand.matchReasons.join(" • ") }}
                </div>
              </q-card-section>
            </q-card>
          </div>

          <div v-else class="text-center q-pa-sm text-grey-6 border-dashed rounded-borders q-mb-md">
            Tidak ada rekomendasi otomatis yang cukup cocok. Anda dapat mencari item katalog manual di bawah ini.
          </div>

          <!-- Manual Catalog Search if needed -->
          <div class="q-mb-md">
            <q-input
              v-model="modalCatalogSearchQuery"
              outlined
              dense
              placeholder="Cari item lain di katalog Assist (kode / nama obat)..."
              color="teal"
              clearable
            >
              <template v-slot:prepend><q-icon name="search" /></template>
            </q-input>

            <q-list v-if="modalFilteredCatalogItems.length > 0" bordered separator class="rounded-borders q-mt-xs bg-grey-1" style="max-height: 150px; overflow-y: auto;">
              <q-item
                v-for="item in modalFilteredCatalogItems"
                :key="item.id"
                clickable
                dense
                @click="selectCatalogItemForModal(item)"
              >
                <q-item-section>
                  <q-item-label class="text-weight-bold">{{ item.name }}</q-item-label>
                  <q-item-label caption class="font-mono">Kode: {{ item.code }} ({{ item.type }}) - {{ item.unit }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-btn size="xs" color="teal" label="Pilih" dense />
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <!-- Conversion factor input -->
          <div v-if="modalSelectedCandidate" class="row q-col-gutter-sm items-center bg-teal-1 q-pa-sm rounded-borders">
            <div class="col-12 col-md-6 text-caption text-grey-8">
              Terpilih: <strong>{{ modalSelectedCandidate.catalogItem.code }}</strong> ({{ modalSelectedCandidate.catalogItem.name }})
            </div>
            <div class="col-12 col-md-6">
              <q-input
                v-model.number="modalConversionFactor"
                type="number"
                min="0.0001"
                step="any"
                outlined
                dense
                color="teal"
                label="Faktor Konversi (1 Desty = X Assist)"
                bg-color="white"
                hide-bottom-space
              />
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Batal" color="grey-7" v-close-popup />
          <q-btn
            color="positive"
            label="Simpan Pemetaan"
            icon="save"
            :disable="!modalSelectedCandidate"
            :loading="syncBusy"
            @click="saveMappingFromDialog"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import * as XLSX from "xlsx";
import { resolveDestyToken } from "@/composables/destyOmniTokenManager";
import { resolveAssistToken } from "@/composables/assistTokenManager";
import { useAssistStore } from "../stores/assistStore";
import { fetchAssistCatalog, buildAssistDepotIndex, buildAssistStockIndex } from "@/services/integration/assistCatalogApi";
import {
  createAssistSaleOrder,
  DestyOrderValidationError,
  fetchAssistDestyTransactionDetails,
} from "@/services/integration/assistSalesApi";
import { normalizeDestyOrder } from "@/services/destySync/orderNormalizer";
import { validateDestyOrder } from "@/utils/destyOrderValidation";
import {
  buildDestyDuplicateIndex,
  getDestyImportLedger,
  getDestyOrderIdentifiers,
  reconcileDestyImportLedger,
  recordDestyImport,
} from "@/services/destySync/importLedgerStorage";
import { bulkImportDestyOrders } from "@/services/destySync/bulkImport";
import {
  buildMappingsFromGoogleSheet,
  DEFAULT_ASSIST_DEPOT_ID,
  exportDestySkuMappings,
  getDestySkuMappings,
  importDestySkuMappings,
  removeDestySkuMapping,
  syncDestySkuMappings,
  updateSkuConversionFactor,
  upsertDestySkuMapping,
  findDestySkuMapping,
  resolveEffectiveDestySkuMapping,
} from "@/services/destySync/mappingStorage";
import type {
  AssistCatalogItem,
  DestyImportLedgerEntry,
  DestyOrderValidationIssue,
  DestySkuMapping,
  DestySkuMappingInput,
} from "@/types/destySync";
import type { DestyOmniStockItem } from "@/composables/destyOmniStockApi";
import {
  getAssistOfflineSoldItems,
  buildOfflineStockReductionItems,
  executeOfflineStockReduction,
  fetchAllAssistPemasukan,
} from "@/services/destySync/offlineStockSync";
import type {
  OfflineSoldItem,
  OfflineSaleReductionItem,
  OfflineStockSyncLog,
} from "@/types/offlineStockSync";
import {
  recommendMatchesForSku,
  createMappingFromRecommendation,
  matchCatalogItem,
  type SkuMatchCandidate,
  type SkuRecommendation,
} from "@/services/destySync/skuMatcher";
import {
  fetchAllDestyOrders,
  fetchDestyOrderStatusCount,
  type DestyOrderRecord,
} from "@/composables/destyOmniOrderApi";

interface FlattenedOrderItem {
  rowId: string;
  orderKey: string;
  productName: string;
  platformName: string;
  inputKeAssist: string;
  isValid: boolean;
  validationMessages: string[];
  quantity: number;
  satuan: string;
  totalPrice: number;
  assistInvoice: string;
  hargaModalSatuan: number | "";
  totalHargaModalFormula: string;
  totalHargaModalCalculated: number | "";
  formattedOrderCreateTime: string;
  formattedDeliveryDeadline: string;
  displayedOrderSn: string;
  shipmentNo: string;
  courier: string;
  externalShopName: string;
  rawOrderCreateTime: number;
  rawDeliveryDeadline: number;
  sku: string;
  mappedItem?: DestySkuMapping;
  is1to1Fallback?: boolean;
  conversionFactor: number;
  assistQty: number;
  assistUnit: string;
  assistStock?: number | null;
}

const statusOptions = [
  { value: "Unpaid", label: "Belum Bayar (Unpaid)", countKey: "unpaid" },
  { value: "New_Orders", label: "Pesanan Baru (New Orders)", countKey: "newOrders" },
  { value: "To_Process", label: "Perlu Diproses (To Process)", countKey: "toProcess" },
  { value: "Processing", label: "Sedang Diproses (Processing)", countKey: "processing" },
  { value: "Processed", label: "Selesai Diproses (Processed)", countKey: "processed" },
  { value: "In_Delivery", label: "Dalam Pengiriman (In Delivery)", countKey: "inDelivery" },
  { value: "Delivered", label: "Terkirim (Delivered)", countKey: "delivered" },
];

const store = useAssistStore();
const statusCounts = ref<Record<string, string>>({});
const buyFeeMap = ref<Record<string, number>>({});
const unitMap = ref<Record<string, string>>({});
const destyToken = ref("");
const destyTenantId = ref("");
const tokenSource = ref<"manual" | "localStorage" | "sessionStorage" | "cookie" | "content-script" | "">("");
const probeWarnings = ref<string[]>([]);

const selectedStatus = ref("To_Process");
const loading = ref(false);
const exporting = ref(false);
const copyStatusText = ref("Salin ke Clipboard");
const statusMessage = ref("");
const statusVariant = ref<"muted" | "success" | "error">("muted");

const orders = ref<DestyOrderRecord[]>([]);
const selectedRows = ref<FlattenedOrderItem[]>([]);
const syncTab = ref<"pldmp" | "import" | "offline_sync" | "mapping" | "log">("pldmp");
const selectedOrderKey = ref("");
const mappings = ref<DestySkuMapping[]>([]);

// --- Offline Sales Stock Reduction States ---
const todayStr = new Date().toISOString().slice(0, 10);
const offlineStartDate = ref(todayStr);
const offlineEndDate = ref(todayStr);
const offlineExcludeOnline = ref(true);

const offlineSoldItems = ref<OfflineSoldItem[]>([]);
const destyStockMapForOffline = ref<Record<string, DestyOmniStockItem>>({});
const offlineManualOverrides = ref<Record<string, { reductionQty?: number; checked?: boolean }>>({});
const offlineSyncResults = ref<Record<string, { status: "success" | "error"; message?: string }>>({});

const isFetchingOfflineSales = ref(false);
const isLoadingLiveDestyStockForOffline = ref(false);
const offlineSearchQuery = ref("");
const offlineStatusFilter = ref<"all" | "ready" | "warning" | "unmapped" | "synced">("all");

// Dialog & progress states for offline sync
const showOfflineConfirmDialog = ref(false);
const showOfflineProgressDialog = ref(false);
const isSyncingOfflineStock = ref(false);
const offlineProgressTotal = ref(0);
const offlineProgressCurrent = ref(0);
const offlineProgressSuccess = ref(0);
const offlineProgressFailed = ref(0);
const offlineProgressLogs = ref<OfflineStockSyncLog[]>([]);
const assistCatalog = ref<AssistCatalogItem[]>([]);
const assistDetailsByIdentifier = ref<Record<string, { invoice?: string; txId?: string; status: string; voided: boolean }>>({});
const assistLookupCompleted = ref(false);
const importLedger = ref<DestyImportLedgerEntry[]>([]);
const syncIssues = ref<DestyOrderValidationIssue[]>([]);
const syncValidationMessage = ref("");
const syncPayloadPreview = ref("");
const syncBusy = ref(false);
const mappingFileInput = ref<HTMLInputElement | null>(null);
const mappingDraft = ref<DestySkuMappingInput & { depotId?: string }>({
  destySku: "",
  assistCode: "",
  assistType: "prescription",
  assistId: "",
  assistName: "",
  destyUnit: "",
  assistUnit: "",
  depotId: "",
  conversionFactor: 1,
  active: true,
});

// --- SKU Auto-Recommendation States & Computed ---
const showSkuRecommendationModal = ref(false);
const modalTargetSku = ref("");
const modalTargetProductName = ref("");
const modalSelectedCandidate = ref<SkuMatchCandidate | null>(null);
const modalConversionFactor = ref(1);
const modalCatalogSearchQuery = ref("");

const unmappedSkusInOrders = computed(() => {
  const unmapped = new Map<string, { sku: string; productName: string; count: number }>();
  const existingMappingKeys = new Set(
    mappings.value.filter((m) => m.active).map((m) => m.destySku.trim().toUpperCase())
  );
  const catalogCodeKeys = new Set(
    assistCatalog.value.map((item) => (item.code || "").trim().toUpperCase()).filter(Boolean)
  );

  for (const order of orders.value) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const sku = (item.skuCode ?? item.masterSku ?? item.sku ?? "").trim();
      if (!sku) continue;
      const skuUpper = sku.toUpperCase();
      // Only treat as unmapped if NOT in explicit mappings AND NOT matching catalog code 1:1
      if (!existingMappingKeys.has(skuUpper) && !catalogCodeKeys.has(skuUpper)) {
        const existing = unmapped.get(skuUpper);
        if (existing) {
          existing.count += Number(item.quantity ?? 1);
        } else {
          unmapped.set(skuUpper, {
            sku,
            productName: item.productName || item.name || "-",
            count: Number(item.quantity ?? 1),
          });
        }
      }
    }
  }
  return Array.from(unmapped.values());
});

const unmappedSkuRecommendations = computed(() => {
  if (!assistCatalog.value.length) return [];
  return unmappedSkusInOrders.value.map((item) => {
    const rec = recommendMatchesForSku(item.sku, item.productName, assistCatalog.value);
    return {
      ...item,
      recommendation: rec,
    };
  });
});

const highConfidenceUnmappedCount = computed(() => {
  return unmappedSkuRecommendations.value.filter(
    (r) => r.recommendation.bestMatch && r.recommendation.bestMatch.confidence === "high"
  ).length;
});

const modalFilteredCatalogItems = computed<AssistCatalogItem[]>(() => {
  const q = modalCatalogSearchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return assistCatalog.value
    .filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
    )
    .slice(0, 10);
});

const fetchedCount = ref(0);
const totalCount = ref(0);
const progressPhase = ref<"list" | "detail">("list");

const progressText = computed(() => {
  const suffix = progressPhase.value === "detail" ? " detail" : "";
  if (totalCount.value === 0) return `${fetchedCount.value}${suffix}`;
  return `${fetchedCount.value}/${totalCount.value}${suffix}`;
});

const orderOptions = computed(() => orders.value.map((order) => ({
  label: `${order.displayedOrderSn || order.orderId || order.id || "(tanpa nomor)"} — ${parsePlatformName(order.platformName)}`,
  value: order.displayedOrderSn || order.orderId || order.id || "",
})));

const mappingColumns = [
  { name: "destySku", label: "SKU Desty", field: "destySku", align: "left", sortable: true, style: "max-width: 170px;", headerStyle: "max-width: 170px;", classes: "font-mono ellipsis" },
  { name: "assistCode", label: "Kode Assist", field: "assistCode", align: "left", sortable: true, style: "width: 110px;", headerStyle: "width: 110px;", classes: "font-mono" },
  { name: "assistName", label: "Item Assist", field: "assistName", align: "left", sortable: true, style: "max-width: 250px;", headerStyle: "max-width: 250px;", classes: "ellipsis" },
  { name: "assistType", label: "Tipe", field: "assistType", align: "left", sortable: true, style: "width: 90px;", headerStyle: "width: 90px;" },
  { name: "conversionFactor", label: "Faktor", field: "conversionFactor", align: "right", sortable: true, style: "width: 80px;", headerStyle: "width: 80px;" },
  { name: "depotId", label: "Depot", field: "depotId", align: "left", style: "width: 80px;", headerStyle: "width: 80px;" },
  { name: "active", label: "Aktif", field: (row: DestySkuMapping) => row.active ? "Ya" : "Tidak", align: "center", style: "width: 60px;", headerStyle: "width: 60px;" },
  { name: "actions", label: "Aksi", field: "destySku", align: "center", style: "width: 90px;", headerStyle: "width: 90px;" },
];

const ledgerColumns = [
  { name: "marketplaceOrderSn", label: "Order", field: "marketplaceOrderSn", align: "left", style: "width: 160px;", classes: "font-mono ellipsis" },
  { name: "status", label: "Status", field: "status", align: "left", style: "width: 100px;" },
  { name: "txId", label: "txId", field: "txId", align: "left", style: "width: 110px;", classes: "font-mono" },
  { name: "invoice", label: "Invoice", field: "invoice", align: "left", style: "width: 140px;", classes: "font-mono" },
  { name: "error", label: "Error", field: "error", align: "left", style: "max-width: 200px;", classes: "ellipsis text-negative" },
  { name: "updatedAt", label: "Diperbarui", field: "updatedAt", align: "left", style: "width: 140px;" },
];

const pldmpTableColumns = [
  { name: "no", label: "No", align: "center", field: (row: any, idx: number) => idx + 1, sortable: false, style: "width: 45px;", headerStyle: "width: 45px;" },
  { name: "mappingStatus", label: "SKU Termapping", align: "center", field: (row: any) => Boolean(row.mappedItem), sortable: true, style: "width: 150px; min-width: 150px;", headerStyle: "width: 150px; min-width: 150px;" },
  { name: "productName", label: "Nama Produk", align: "left", field: "productName", sortable: true },
  { name: "platformName", label: "Market Place", align: "center", field: "platformName", sortable: true },
  { name: "inputKeAssist", label: "Input Ke Assist", align: "left", field: "inputKeAssist", sortable: true },
  { name: "quantity", label: "Jml", align: "right", field: "quantity", sortable: true },
  { name: "satuan", label: "Satuan", align: "center", field: "satuan" },
  { name: "totalPrice", label: "Total Harga MP", align: "right", field: "totalPrice", sortable: true, format: (val: any) => formatNumber(val) },
  { name: "hargaModalSatuan", label: "Harga Modal Satuan", align: "right", field: "hargaModalSatuan", sortable: true, format: (val: any) => val !== "" ? formatNumber(val) : "" },
  { name: "totalHargaModalCalculated", label: "Total Harga Modal", align: "right", field: "totalHargaModalCalculated", sortable: true, format: (val: any) => val !== "" ? formatNumber(val) : "" },
  { name: "formattedOrderCreateTime", label: "Tgl Pesan", align: "center", field: "formattedOrderCreateTime", sortable: true },
  { name: "formattedDeliveryDeadline", label: "Kirim Sebelum", align: "center", field: "formattedDeliveryDeadline", sortable: true },
  { name: "courier", label: "Ekspedisi", align: "left", field: "courier" },
  { name: "displayedOrderSn", label: "No. Pesanan", align: "left", field: "displayedOrderSn", classes: "font-mono" },
  { name: "shipmentNo", label: "No. Resi", align: "left", field: "shipmentNo", classes: "font-mono" },
  { name: "externalShopName", label: "Nama Toko Asal", align: "left", field: "externalShopName" }
];

const importTableColumns = [
  { name: "no", label: "No", align: "center", field: (row: any, idx: number) => idx + 1, sortable: false, style: "width: 45px;", headerStyle: "width: 45px;" },
  { name: "validationStatus", label: "Validasi", align: "center", field: "isValid", sortable: true, style: "width: 80px;", headerStyle: "width: 80px;" },
  { name: "inputKeAssist", label: "Status Assist", align: "left", field: "inputKeAssist", sortable: true, style: "width: 120px;", headerStyle: "width: 120px;" },
  { name: "orderSn", label: "MP & No. Pesanan", align: "left", field: "displayedOrderSn", sortable: true, style: "width: 140px; max-width: 140px;", headerStyle: "width: 140px; max-width: 140px;" },
  { name: "destyItem", label: "Item Desty", align: "left", field: "productName", sortable: true, style: "max-width: 180px;", headerStyle: "max-width: 180px;" },
  { name: "quantity", label: "Qty Desty", align: "center", field: "quantity", sortable: true, style: "width: 75px;", headerStyle: "width: 75px;" },
  { name: "assistItem", label: "Pemetaan Item Assist", align: "left", field: "assistItem", sortable: true, style: "max-width: 180px;", headerStyle: "max-width: 180px;" },
  { name: "conversionFactor", label: "Faktor", align: "center", field: "conversionFactor", sortable: true, style: "width: 110px;", headerStyle: "width: 110px;" },
  { name: "assistQty", label: "Qty Assist", align: "center", field: "assistQty", sortable: true, style: "width: 75px;", headerStyle: "width: 75px;" },
  { name: "assistStock", label: "Stok Assist", align: "center", field: "assistStock", sortable: true, style: "width: 85px;", headerStyle: "width: 85px;" },
];

function formatTimestamp(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function formatNumber(val?: number): string {
  if (val === undefined || val === null) return "";
  return new Intl.NumberFormat("id-ID").format(val);
}

function applyAssistTransactionDetails(details: Awaited<ReturnType<typeof fetchAssistDestyTransactionDetails>>) {
  const next = { ...assistDetailsByIdentifier.value };
  for (const detail of details) {
    for (const identifier of detail.identifiers) {
      next[identifier] = { invoice: detail.invoice, txId: detail.txId, status: detail.status, voided: detail.voided };
    }
  }
  assistDetailsByIdentifier.value = next;
}

function assistDetailsForOrder(orderNumber: string) {
  const record = orders.value.find((order) => (order.displayedOrderSn ?? order.orderId ?? order.id ?? "") === orderNumber);
  const identifiers = record
    ? getDestyOrderIdentifiers(normalizeDestyOrder(record))
    : [orderNumber.trim().toUpperCase()];
  return identifiers.map((identifier) => assistDetailsByIdentifier.value[identifier]).find(Boolean);
}

function assistInvoiceForOrder(orderNumber: string): string {
  return assistDetailsForOrder(orderNumber)?.invoice || "-";
}

function importStatusForOrder(orderNumber: string): string {
  const remote = assistDetailsForOrder(orderNumber);
  if (remote) return remote.voided ? "Void — dapat diimpor ulang" : "Sudah diimpor (Assist)";
  return assistLookupCompleted.value ? "Belum diimpor" : "Belum dicek";
}

function parsePlatformName(platform?: string): string {
  if (!platform) return "";
  const lower = platform.trim().toLowerCase();
  if (lower === "shopee") {
    return "SHOPEE";
  }
  if (lower.includes("tiktok") || lower.includes("tokopedia") || lower === "tokped") {
    return "TIKTOK-TOKPED";
  }
  if (lower === "blibli") {
    return "BLIBLI";
  }
  if (lower === "desty" || lower.includes("desty")) {
    return "DESTY";
  }
  return platform.toUpperCase();
}

function buildSyncContext() {
  const duplicateIndex = new Set(
    Object.entries(assistDetailsByIdentifier.value)
      .filter(([, detail]) => !detail.voided)
      .map(([identifier]) => identifier),
  );
  const depotIndex = buildAssistDepotIndex(assistCatalog.value);
  for (const mapping of mappings.value) {
    if (mapping.depotId) depotIndex[mapping.assistId] = mapping.depotId;
  }
  return {
    mappings: mappings.value,
    assistCatalog: assistCatalog.value.length ? assistCatalog.value : undefined,
    stockByAssistId: buildAssistStockIndex(assistCatalog.value),
    depotByAssistId: depotIndex,
    duplicateOrderNumbers: duplicateIndex,
    defaultDepotId: DEFAULT_ASSIST_DEPOT_ID,
  };
}

const orderValidationMap = computed<Map<string, ReturnType<typeof validateDestyOrder>>>(() => {
  const context = buildSyncContext();
  const map = new Map<string, ReturnType<typeof validateDestyOrder>>();
  for (const order of orders.value) {
    const key = order.displayedOrderSn || order.orderId || order.id || "";
    if (key) {
      map.set(key, validateDestyOrder(normalizeDestyOrder(order), context));
    }
  }
  return map;
});

const stockIndexByAssistId = computed(() => buildAssistStockIndex(assistCatalog.value));

const flattenedItems = computed<FlattenedOrderItem[]>(() => {
  const result: FlattenedOrderItem[] = [];
  let rowIndex = 0;

  for (const record of orders.value) {
    const orderKey = record.displayedOrderSn || record.orderId || record.id || "";
    const validationResult = orderValidationMap.value.get(orderKey);
    const isValid = validationResult ? validationResult.valid : false;
    const validationMessages = validationResult ? validationResult.issues.map((i) => i.message) : [];

    const items = Array.isArray(record.items) && record.items.length ? record.items : [undefined];
    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const item = items[itemIdx];
      const sku = item?.skuCode ?? item?.masterSku ?? "";
      const excelRow = rowIndex + 2;
      
      const itemSkuUpper = sku.trim().toUpperCase();
      const buyFee = buyFeeMap.value[itemSkuUpper];
      const hargaModalSatuan: number | "" = buyFee !== undefined ? buyFee : "";

      const assistUnitFromMap = unitMap.value[itemSkuUpper];
      const satuan = assistUnitFromMap !== undefined && assistUnitFromMap !== "" ? assistUnitFromMap : "";

      const totalHargaModalCalculated: number | "" = typeof hargaModalSatuan === "number" ? (item?.quantity ?? 0) * hargaModalSatuan : "";

      const mappedItem = resolveEffectiveDestySkuMapping(sku, mappings.value, assistCatalog.value);
      const isExplicit = Boolean(findDestySkuMapping(mappings.value, sku));
      const is1to1Fallback = Boolean(mappedItem && !isExplicit);
      const conversionFactor = mappedItem?.conversionFactor ?? 1;
      const quantity = item?.quantity ?? 0;
      const assistQty = Math.round(quantity * conversionFactor * 1000) / 1000;
      const assistUnit = mappedItem?.assistUnit || satuan || "Pcs";
      const assistStock = mappedItem?.assistId ? stockIndexByAssistId.value[mappedItem.assistId] : null;

      result.push({
        rowId: `${orderKey}_${itemIdx}_${sku}`,
        orderKey,
        productName: item?.productName ?? "-",
        platformName: parsePlatformName(record.platformName),
        inputKeAssist: importStatusForOrder(orderKey),
        isValid,
        validationMessages,
        assistInvoice: assistInvoiceForOrder(orderKey),
        quantity,
        satuan,
        totalPrice: record.totalSales ?? 0,
        hargaModalSatuan,
        totalHargaModalFormula: `=E${excelRow}*H${excelRow}`,
        totalHargaModalCalculated,
        formattedOrderCreateTime: formatTimestamp(record.orderCreateTime),
        formattedDeliveryDeadline: formatTimestamp(record.deliveryDeadline),
        displayedOrderSn: record.displayedOrderSn ?? "",
        shipmentNo: record.shipmentNo ?? "",
        courier: record.courier ?? "",
        externalShopName: record.externalShopName ?? "",
        rawOrderCreateTime: record.orderCreateTime,
        rawDeliveryDeadline: record.deliveryDeadline,
        sku,
        mappedItem,
        is1to1Fallback,
        conversionFactor,
        assistQty,
        assistUnit,
        assistStock,
      });
      rowIndex += 1;
    }
  }

  return result;
});

const validItems = computed(() => flattenedItems.value.filter((item) => item.isValid));

const allValidSelected = computed(() => {
  return validItems.value.length > 0 && validItems.value.every((item) =>
    selectedRows.value.some((r) => r.rowId === item.rowId)
  );
});

const someValidSelected = computed(() => {
  return selectedRows.value.some((r) => r.isValid);
});

const selectedOrderKeys = computed(() => {
  return Array.from(new Set(selectedRows.value.filter((r) => r.isValid).map((r) => r.orderKey).filter(Boolean)));
});

const selectedOrdersCount = computed(() => selectedOrderKeys.value.length);

const selectedOrders = computed(() => {
  const keys = new Set(selectedOrderKeys.value);
  return orders.value.filter((order) => {
    const key = order.displayedOrderSn || order.orderId || order.id || "";
    const validation = orderValidationMap.value.get(key);
    return keys.has(key) && validation?.valid;
  });
});

function toggleSelectAllValid(val: boolean | any) {
  if (val) {
    selectedRows.value = [...validItems.value];
  } else {
    selectedRows.value = [];
  }
}

function selectAllValid() {
  selectedRows.value = [...validItems.value];
}

function clearSelection() {
  selectedRows.value = [];
}

watch(flattenedItems, (items) => {
  const validRowIds = new Set(items.filter((i) => i.isValid).map((i) => i.rowId));
  selectedRows.value = selectedRows.value.filter((r) => validRowIds.has(r.rowId));
});

const selectedOrder = computed(() => {
  if (!selectedOrderKey.value) return undefined;
  return orders.value.find((order) =>
    (order.displayedOrderSn || order.orderId || order.id || "") === selectedOrderKey.value,
  );
});

function validateSelectedOrder() {
  syncPayloadPreview.value = "";
  syncIssues.value = [];
  syncValidationMessage.value = "";
  if (!selectedOrder.value) {
    syncValidationMessage.value = "Pilih order terlebih dahulu.";
    return false;
  }
  const validation = validateDestyOrder(
    normalizeDestyOrder(selectedOrder.value),
    buildSyncContext(),
  );
  syncIssues.value = validation.issues;
  syncValidationMessage.value = validation.valid
    ? "Order valid dan siap untuk dry-run / impor."
    : `Order tidak valid (${validation.issues.length} masalah).`;
  return validation.valid;
}

async function loadSyncData() {
  try {
    mappings.value = await syncDestySkuMappings();
  } catch {
    mappings.value = await getDestySkuMappings();
  }
  importLedger.value = await getDestyImportLedger();
}

async function syncWithFirebase() {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    mappings.value = await syncDestySkuMappings();
    syncValidationMessage.value = `Berhasil menyinkronkan ${mappings.value.length} mapping SKU dari Firebase.`;
  } catch (err) {
    syncValidationMessage.value = err instanceof Error ? err.message : "Gagal menyinkronkan Firebase.";
  } finally {
    syncBusy.value = false;
  }
}

async function loadRemoteAssistDetails(orderList: DestyOrderRecord[]) {
  if (!orderList.length) return;
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) return;
    const normalizedOrders = orderList.map(normalizeDestyOrder);
    const dates = normalizedOrders.map((order) => order.createdAt?.slice(0, 10)).filter(Boolean).sort() as string[];
    const details = await fetchAssistDestyTransactionDetails({
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
      startDate: dates[0] || new Date().toISOString().slice(0, 10),
      endDate: dates[dates.length - 1] || dates[0] || new Date().toISOString().slice(0, 10),
    });
    applyAssistTransactionDetails(details);
    assistLookupCompleted.value = true;
  } catch {
    // Invoice lookup is informative; import duplicate-check remains authoritative.
  }
}

async function loadSyncCatalog() {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    const result = await resolveAssistToken();
    if (!result.token) throw new Error("Token Assist tidak ditemukan. Buka tab clinica.assist.id.");
    assistCatalog.value = await fetchAssistCatalog({
      token: result.token,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
    });
    await store.fetchMarginData();
    const autoMapping = buildMappingsFromGoogleSheet(
      store.marginData,
      assistCatalog.value,
      mappings.value,
      DEFAULT_ASSIST_DEPOT_ID,
    );
    mappings.value = autoMapping.mappings;
    syncValidationMessage.value = `Katalog ${assistCatalog.value.length} item dan ${mappings.value.length} mapping dimuat.` +
      (autoMapping.unmatchedSkus.length ? ` ${autoMapping.unmatchedSkus.length} SKU belum cocok di katalog Assist.` : "");
    if (selectedOrder.value) validateSelectedOrder();
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal memuat katalog Assist.";
  } finally {
    syncBusy.value = false;
  }
}

function editMapping(mapping: DestySkuMapping) {
  mappingDraft.value = { ...mapping };
  syncTab.value = "mapping";
}

async function deleteMapping(destySku: string) {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    mappings.value = await removeDestySkuMapping(destySku);
    syncValidationMessage.value = `Mapping ${destySku} dihapus.`;
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal menghapus mapping.";
  } finally {
    syncBusy.value = false;
  }
}

function exportMappings() {
  const blob = new Blob([exportDestySkuMappings(mappings.value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `desty-sku-mappings-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  syncValidationMessage.value = "Mapping berhasil diekspor.";
}

async function importMappings(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    mappings.value = await importDestySkuMappings(await file.text());
    syncValidationMessage.value = `${mappings.value.length} mapping berhasil diimpor.`;
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal mengimpor mapping.";
  } finally {
    input.value = "";
  }
}

async function saveMapping() {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    mappings.value = await upsertDestySkuMapping(mappingDraft.value);
    syncValidationMessage.value = `Mapping ${mappingDraft.value.destySku} berhasil disimpan ke Firebase & lokal.`;
    mappingDraft.value = {
      destySku: "", assistCode: "", assistType: "prescription", assistId: "", assistName: "",
      destyUnit: "", assistUnit: "", depotId: "", conversionFactor: 1, active: true,
    };
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal menyimpan mapping.";
  } finally {
    syncBusy.value = false;
  }
}

function getSkuRecommendation(sku: string, productName?: string): SkuRecommendation {
  if (!assistCatalog.value.length) {
    return { destySku: sku, productName, candidates: [] };
  }
  return recommendMatchesForSku(sku, productName, assistCatalog.value);
}

async function applyQuickMapping(destySku: string, candidate: SkuMatchCandidate) {
  if (syncBusy.value) return;
  syncBusy.value = true;
  try {
    const input = createMappingFromRecommendation(
      destySku,
      candidate,
      DEFAULT_ASSIST_DEPOT_ID,
    );
    mappings.value = await upsertDestySkuMapping(input);
    syncValidationMessage.value = `Berhasil menghubungkan SKU "${destySku}" → ${candidate.catalogItem.code} (${candidate.catalogItem.name}).`;
    if (selectedOrder.value) validateSelectedOrder();
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal menyimpan mapping.";
  } finally {
    syncBusy.value = false;
  }
}

async function applyAllHighConfidenceRecommendations() {
  const eligible = unmappedSkuRecommendations.value.filter(
    (r) => r.recommendation.bestMatch && r.recommendation.bestMatch.confidence === "high"
  );
  if (!eligible.length || syncBusy.value) return;
  syncBusy.value = true;
  try {
    let currentMappings = [...mappings.value];
    let mappedCount = 0;
    for (const item of eligible) {
      if (item.recommendation.bestMatch) {
        const input = createMappingFromRecommendation(
          item.sku,
          item.recommendation.bestMatch,
          DEFAULT_ASSIST_DEPOT_ID,
        );
        currentMappings = await upsertDestySkuMapping(input);
        mappedCount++;
      }
    }
    mappings.value = currentMappings;
    syncValidationMessage.value = `Berhasil memetakan otomatis ${mappedCount} SKU dengan tingkat kecocokan tinggi!`;
    if (selectedOrder.value) validateSelectedOrder();
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal memetakan SKU secara otomatis.";
  } finally {
    syncBusy.value = false;
  }
}

function openSkuRecommendationDialog(sku: string, productName?: string) {
  modalTargetSku.value = sku;
  modalTargetProductName.value = productName || "";
  modalCatalogSearchQuery.value = "";
  
  const rec = getSkuRecommendation(sku, productName);
  modalSelectedCandidate.value = rec.bestMatch || null;
  modalConversionFactor.value = rec.bestMatch?.suggestedConversionFactor || 1;
  showSkuRecommendationModal.value = true;
}

function selectCatalogItemForModal(item: AssistCatalogItem) {
  const candidate = matchCatalogItem(
    modalTargetSku.value,
    modalTargetProductName.value,
    item
  ) || {
    catalogItem: item,
    score: 1.0,
    confidence: "high" as const,
    matchReasons: ["Dipilih secara manual oleh pengguna"],
    suggestedConversionFactor: 1,
  };
  modalSelectedCandidate.value = candidate;
  modalConversionFactor.value = candidate.suggestedConversionFactor || 1;
  modalCatalogSearchQuery.value = "";
}

async function saveMappingFromDialog() {
  if (!modalTargetSku.value || !modalSelectedCandidate.value || syncBusy.value) return;
  syncBusy.value = true;
  try {
    const candidate = {
      ...modalSelectedCandidate.value,
      suggestedConversionFactor: modalConversionFactor.value > 0 ? modalConversionFactor.value : 1,
    };
    const input = createMappingFromRecommendation(
      modalTargetSku.value,
      candidate,
      DEFAULT_ASSIST_DEPOT_ID,
    );
    mappings.value = await upsertDestySkuMapping(input);
    syncValidationMessage.value = `Berhasil memetakan SKU ${modalTargetSku.value} → ${candidate.catalogItem.code}.`;
    showSkuRecommendationModal.value = false;
    if (selectedOrder.value) validateSelectedOrder();
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Gagal menyimpan pemetaan.";
  } finally {
    syncBusy.value = false;
  }
}

async function updateRowConversionFactor(row: FlattenedOrderItem, newFactorVal: string | number | null | undefined) {
  const factor = Number(newFactorVal);
  if (!Number.isFinite(factor) || factor <= 0) return;
  try {
    const mapping = row.mappedItem;
    const fallback = mapping ? undefined : (row.sku ? {
      assistCode: row.sku,
      assistName: row.productName,
      assistUnit: row.satuan || "Pcs",
      destyUnit: row.satuan || "Pcs",
    } : undefined);

    mappings.value = await updateSkuConversionFactor(row.sku, factor, fallback);
    syncValidationMessage.value = `Faktor konversi untuk SKU "${row.sku}" diupdate ke ${factor} (disimpan ke Firebase).`;
    if (selectedOrder.value) validateSelectedOrder();
  } catch (err) {
    console.error("Gagal update conversion factor:", err);
  }
}

function autoFillMappingDraft(sku?: string) {
  const targetSku = sku || mappingDraft.value.destySku;
  if (!targetSku) return;
  const rec = getSkuRecommendation(targetSku);
  if (rec.bestMatch) {
    const input = createMappingFromRecommendation(targetSku, rec.bestMatch, DEFAULT_ASSIST_DEPOT_ID);
    mappingDraft.value = { ...input };
    syncValidationMessage.value = `Form mapping diisi otomatis dengan rekomendasi terbaik (${Math.round(rec.bestMatch.score * 100)}% Cocok).`;
  }
}

async function dryRunSelectedOrder() {
  if (!selectedOrder.value || syncBusy.value) return;
  syncBusy.value = true;
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) throw new Error("Token Assist tidak ditemukan.");
    const context = buildSyncContext();
    const result = await createAssistSaleOrder(selectedOrder.value, mappings.value, {
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      accountTxId: store.assistAccountTxId,
      hospitalId: store.hospitalId,
      depotIdByAssistId: context.depotByAssistId,
      ...context,
      dryRun: true,
    });
    syncIssues.value = [];
    syncPayloadPreview.value = JSON.stringify(result.payload, null, 2);
    syncValidationMessage.value = "Dry-run berhasil. Tidak ada transaksi atau perubahan stok yang dikirim.";
  } catch (error) {
    syncIssues.value = error instanceof DestyOrderValidationError ? error.validation.issues : [];
    syncValidationMessage.value = error instanceof Error ? error.message : "Dry-run gagal.";
  } finally {
    syncBusy.value = false;
  }
}

async function importSelectedOrder() {
  if (!selectedOrder.value || syncBusy.value) return;
  syncBusy.value = true;
  const normalizedOrder = normalizeDestyOrder(selectedOrder.value);
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) throw new Error("Token Assist tidak ditemukan.");
    if (!assistCatalog.value.length) throw new Error("Muat katalog dan stok Assist terlebih dahulu sebelum impor.");

    const date = normalizedOrder.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const remoteDetails = await fetchAssistDestyTransactionDetails({
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
      startDate: date,
    });
    applyAssistTransactionDetails(remoteDetails);
    assistLookupCompleted.value = true;
    const remoteDuplicates = new Set(remoteDetails.filter((detail) => !detail.voided).flatMap((detail) => [...detail.identifiers]));
    const checkedIdentifiers = getDestyOrderIdentifiers(normalizedOrder);
    importLedger.value = await reconcileDestyImportLedger(remoteDuplicates, checkedIdentifiers);

    const duplicateIndex = new Set(remoteDuplicates);
    const context = buildSyncContext();
    const result = await createAssistSaleOrder(selectedOrder.value, mappings.value, {
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      accountTxId: store.assistAccountTxId,
      hospitalId: store.hospitalId,
      depotIdByAssistId: context.depotByAssistId,
      ...context,
      duplicateOrderNumbers: duplicateIndex,
      dryRun: false,
    });
    await recordDestyImport({
      marketplaceOrderSn: normalizedOrder.marketplaceOrderSn,
      bookingSn: normalizedOrder.bookingSn,
      trackingNumber: normalizedOrder.trackingNumber,
      platformName: normalizedOrder.platformName,
      status: "success",
      txId: result.txId,
      invoice: result.invoice,
    });
    importLedger.value = await getDestyImportLedger();
    await loadRemoteAssistDetails([normalizedOrder]);
    syncValidationMessage.value = `Impor berhasil${result.txId ? ` (txId: ${result.txId})` : ""}${result.invoice ? `, invoice: ${result.invoice}` : ""}.`;
    syncPayloadPreview.value = "";
  } catch (error) {
    if (error instanceof DestyOrderValidationError) syncIssues.value = error.validation.issues;
    if (normalizedOrder.marketplaceOrderSn) {
      const isDuplicate = error instanceof DestyOrderValidationError && error.validation.issues.some((issue) => issue.code === "duplicate-order");
      const remoteReference = getDestyOrderIdentifiers(normalizedOrder)
        .map((identifier) => assistDetailsByIdentifier.value[identifier])
        .find(Boolean);
      await recordDestyImport({
        marketplaceOrderSn: normalizedOrder.marketplaceOrderSn,
        bookingSn: normalizedOrder.bookingSn,
        trackingNumber: normalizedOrder.trackingNumber,
        platformName: normalizedOrder.platformName,
        status: isDuplicate ? "duplicate" : "failed",
        txId: remoteReference?.txId,
        invoice: remoteReference?.invoice,
        error: error instanceof Error ? error.message : "Gagal impor.",
      });
      importLedger.value = await getDestyImportLedger();
    }
    syncValidationMessage.value = error instanceof Error ? error.message : "Impor gagal. Jangan retry sebelum duplicate-check ulang.";
  } finally {
    syncBusy.value = false;
  }
}

async function importSelectedCheckedOrders() {
  const targetOrders = selectedOrders.value;
  if (!targetOrders.length || syncBusy.value) return;
  syncBusy.value = true;
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) throw new Error("Token Assist tidak ditemukan.");
    if (!assistCatalog.value.length) throw new Error("Muat katalog dan stok Assist terlebih dahulu sebelum impor.");

    const normalizedOrders = targetOrders.map(normalizeDestyOrder);
    const dates = normalizedOrders.map((order) => order.createdAt?.slice(0, 10)).filter(Boolean).sort() as string[];
    const startDate = dates[0] || new Date().toISOString().slice(0, 10);
    const endDate = dates[dates.length - 1] || startDate;

    const remoteDetails = await fetchAssistDestyTransactionDetails({
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
      startDate,
      endDate,
    });
    applyAssistTransactionDetails(remoteDetails);
    assistLookupCompleted.value = true;

    const remoteDuplicates = new Set(remoteDetails.filter((detail) => !detail.voided).flatMap((detail) => [...detail.identifiers]));
    const context = buildSyncContext();
    const checkedIdentifiers = normalizedOrders.flatMap((order) => getDestyOrderIdentifiers(order));
    importLedger.value = await reconcileDestyImportLedger(remoteDuplicates, checkedIdentifiers);

    const duplicateIndex = new Set(remoteDuplicates);
    const results = await bulkImportDestyOrders({
      orders: targetOrders,
      mappings: mappings.value,
      config: {
        token: assistToken,
        apiBaseUrl: store.apiBaseUrl,
        accountTxId: store.assistAccountTxId,
        hospitalId: store.hospitalId,
        assistCatalog: assistCatalog.value.length ? assistCatalog.value : undefined,
        stockByAssistId: context.stockByAssistId,
        depotIdByAssistId: context.depotByAssistId,
        defaultDepotId: DEFAULT_ASSIST_DEPOT_ID,
        duplicateOrderNumbers: duplicateIndex,
      },
      concurrency: 2,
      onProgress: (completed, total, item) => {
        syncValidationMessage.value = `Proses impor terpilih ${completed}/${total}: ${item.order.marketplaceOrderSn} (${item.status}).`;
      },
    });

    importLedger.value = await getDestyImportLedger();
    await loadRemoteAssistDetails(targetOrders);

    const successCount = results.filter((item) => item.status === "success").length;
    syncValidationMessage.value = `Impor terpilih selesai: ${successCount}/${results.length} berhasil. Order invalid/duplicate tidak dikirim.`;

    const successfulOrderSns = new Set(
      results
        .filter((item) => item.status === "success")
        .map((item) => item.order.marketplaceOrderSn || item.order.bookingSn || item.order.trackingNumber)
        .filter(Boolean),
    );
    selectedRows.value = selectedRows.value.filter(
      (row) => !successfulOrderSns.has(row.orderKey) && !successfulOrderSns.has(row.displayedOrderSn),
    );
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Impor terpilih gagal dan tidak dilanjutkan.";
  } finally {
    syncBusy.value = false;
  }
}

async function bulkImportOrders() {
  if (!orders.value.length || syncBusy.value) return;
  syncBusy.value = true;
  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) throw new Error("Token Assist tidak ditemukan.");
    if (!assistCatalog.value.length) throw new Error("Muat katalog dan stok Assist terlebih dahulu sebelum bulk import.");
    const normalizedOrders = orders.value.map(normalizeDestyOrder);
    const dates = normalizedOrders.map((order) => order.createdAt?.slice(0, 10)).filter(Boolean).sort() as string[];
    const startDate = dates[0] || new Date().toISOString().slice(0, 10);
    const endDate = dates[dates.length - 1] || startDate;
    const remoteDetails = await fetchAssistDestyTransactionDetails({
      token: assistToken,
      apiBaseUrl: store.apiBaseUrl,
      hospitalId: store.hospitalId,
      startDate,
      endDate,
    });
    applyAssistTransactionDetails(remoteDetails);
    assistLookupCompleted.value = true;
    const remoteDuplicates = new Set(remoteDetails.filter((detail) => !detail.voided).flatMap((detail) => [...detail.identifiers]));
    const context = buildSyncContext();
    const checkedIdentifiers = normalizedOrders.flatMap((order) => getDestyOrderIdentifiers(order));
    importLedger.value = await reconcileDestyImportLedger(remoteDuplicates, checkedIdentifiers);
    const duplicateIndex = new Set(remoteDuplicates);
    const results = await bulkImportDestyOrders({
      orders: orders.value,
      mappings: mappings.value,
      config: {
        token: assistToken,
        apiBaseUrl: store.apiBaseUrl,
        accountTxId: store.assistAccountTxId,
        hospitalId: store.hospitalId,
        assistCatalog: assistCatalog.value.length ? assistCatalog.value : undefined,
        stockByAssistId: context.stockByAssistId,
        depotIdByAssistId: context.depotByAssistId,
        defaultDepotId: DEFAULT_ASSIST_DEPOT_ID,
        duplicateOrderNumbers: duplicateIndex,
      },
      concurrency: 2,
      onProgress: (completed, total, item) => {
        syncValidationMessage.value = `Proses impor ${completed}/${total}: ${item.order.marketplaceOrderSn} (${item.status}).`;
      },
    });
    importLedger.value = await getDestyImportLedger();
    await loadRemoteAssistDetails(orders.value);
    const successCount = results.filter((item) => item.status === "success").length;
    syncValidationMessage.value = `Bulk import selesai: ${successCount}/${results.length} berhasil. Order invalid/duplicate tidak dikirim.`;
  } catch (error) {
    syncValidationMessage.value = error instanceof Error ? error.message : "Bulk import gagal dan tidak dilanjutkan.";
  } finally {
    syncBusy.value = false;
  }
}

async function loadStatusCounts() {
  if (!destyToken.value) return;
  try {
    const counts = await fetchDestyOrderStatusCount({
      token: destyToken.value,
      tenantId: destyTenantId.value,
      status: selectedStatus.value,
    });
    statusCounts.value = counts;
  } catch (err) {
    console.error("Gagal mengambil info hitungan status:", err);
  }
}

async function probeTokens() {
  probeWarnings.value = [];
  statusMessage.value = "";
  statusVariant.value = "muted";

  await loadAssistLocalMaps();

  try {
    const result = await resolveDestyToken();
    destyToken.value = result.token;
    destyTenantId.value = result.tenantId;
    tokenSource.value = result.source;
    probeWarnings.value = result.warnings;

    if (!destyToken.value) {
      statusMessage.value = "Token Desty Omni tidak terdeteksi. Silakan login ke Desty Omni.";
      statusVariant.value = "error";
      return;
    }

    await loadStatusCounts();
  } catch (err) {
    console.error("Gagal mendeteksi token:", err);
    statusMessage.value = "Gagal mendeteksi status token.";
    statusVariant.value = "error";
  }
}

async function loadAssistLocalMaps() {
  try {
    const result = await resolveAssistToken();
    const token = result.token;
    if (!token) return;

    const response = await browser.runtime.sendMessage({
      type: "FETCH_ASSIST_SKU_BUY_FEES",
      payload: { assistToken: token },
    });

    if (response && response.ok) {
      buyFeeMap.value = response.buyFeeBySku || {};
      unitMap.value = response.unitBySku || {};
    }
  } catch (err) {
    console.error("Gagal memuat catalog map dari Assist:", err);
  }
}

async function fetchOrders() {
  if (!destyToken.value) {
    statusMessage.value = "Token Desty Omni tidak terdeteksi. Silakan login.";
    statusVariant.value = "error";
    return;
  }

  loading.value = true;
  statusMessage.value = "Memulai pengambilan data pesanan...";
  statusVariant.value = "muted";
  orders.value = [];
  selectedRows.value = [];
  fetchedCount.value = 0;
  totalCount.value = 0;
  progressPhase.value = "list";

  try {
    const fetched = await fetchAllDestyOrders({
      token: destyToken.value,
      tenantId: destyTenantId.value,
      status: selectedStatus.value,
      onProgress: (p) => {
        fetchedCount.value = p.fetched;
        totalCount.value = p.total;
        progressPhase.value = p.phase;
      },
    });

    orders.value = fetched;
    selectedOrderKey.value = orderOptions.value[0]?.value ?? "";
    void loadRemoteAssistDetails(fetched);
    statusMessage.value = `Berhasil menarik ${orders.value.length} pesanan (${flattenedItems.value.length} baris barang).`;
    statusVariant.value = "success";

    await loadStatusCounts();
  } catch (err) {
    console.error("Gagal mengambil data pesanan:", err);
    statusMessage.value = err instanceof Error ? err.message : "Terjadi kesalahan saat mengambil pesanan.";
    statusVariant.value = "error";
  } finally {
    loading.value = false;
  }
}

async function copyToClipboard() {
  if (!flattenedItems.value.length) return;

  copyStatusText.value = "Menyalin...";
  try {
    const tsvLines = flattenedItems.value.map((row, idx) =>
      [
        String(idx + 1),
        row.productName,
        row.platformName,
        row.inputKeAssist,
        String(row.quantity),
        row.satuan,
        String(row.totalPrice),
        row.hargaModalSatuan !== "" ? String(row.hargaModalSatuan) : "",
        row.totalHargaModalCalculated !== "" ? String(row.totalHargaModalCalculated) : "",
        row.formattedOrderCreateTime,
        row.formattedDeliveryDeadline,
        row.courier,
        row.displayedOrderSn,
        row.shipmentNo,
        row.externalShopName,
      ].join("\t"),
    );

    const headers = [
      "No",
      "Nama Produk",
      "Market Place",
      "Input Ke Assist",
      "Jml",
      "Satuan",
      "Total Harga MP",
      "Harga Modal Satuan",
      "Total Harga Modal",
      "Tgl Pesan, Jam Pesan",
      "Kirim Sebelum",
      "Ekspedisi",
      "No. Pesanan",
      "No. Resi",
      "Nama Toko Asal",
    ].join("\t");

    const textToCopy = [headers, ...tsvLines].join("\n");
    await navigator.clipboard.writeText(textToCopy);

    copyStatusText.value = "Berhasil Disalin!";
    setTimeout(() => {
      copyStatusText.value = "Salin ke Clipboard";
    }, 2000);
  } catch (err) {
    console.error(err);
    copyStatusText.value = "Gagal Menyalin";
    setTimeout(() => {
      copyStatusText.value = "Salin ke Clipboard";
    }, 2000);
  }
}

function exportToExcel() {
  if (!flattenedItems.value.length) return;
  exporting.value = true;

  try {
    const headers = [
      "No",
      "Nama Produk",
      "Market Place",
      "Input Ke Assist",
      "Jml",
      "Satuan",
      "Total Harga MP",
      "Harga Modal Satuan",
      "Total Harga Modal",
      "Tgl Pesan, Jam Pesan",
      "Kirim Sebelum",
      "Ekspedisi",
      "No. Pesanan",
      "No. Resi",
      "Nama Toko Asal",
    ];

    const rowsData = flattenedItems.value.map((row, idx) => [
      idx + 1,
      row.productName,
      row.platformName,
      row.inputKeAssist,
      row.quantity,
      row.satuan,
      row.totalPrice,
      row.hargaModalSatuan,
      { f: row.totalHargaModalFormula },
      row.formattedOrderCreateTime,
      row.formattedDeliveryDeadline,
      row.courier,
      row.displayedOrderSn,
      row.shipmentNo,
      row.externalShopName,
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PLDMP Orders");

    XLSX.writeFile(workbook, `pldmp-orders-${selectedStatus.value}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    statusMessage.value = "File Excel PLDMP berhasil dibuat.";
    statusVariant.value = "success";
  } catch (err) {
    console.error(err);
    statusMessage.value = "Gagal membuat berkas Excel PLDMP.";
    statusVariant.value = "error";
  } finally {
    exporting.value = false;
  }
}

// --- Offline Stock Reduction Computed & Handlers ---
const offlineReductionItems = computed<OfflineSaleReductionItem[]>(() => {
  return buildOfflineStockReductionItems({
    soldItems: offlineSoldItems.value,
    mappings: mappings.value,
    destyStockMap: destyStockMapForOffline.value,
    assistCatalog: assistCatalog.value,
    manualOverrides: offlineManualOverrides.value,
    syncResults: offlineSyncResults.value,
  });
});

const filteredOfflineReductionItems = computed(() => {
  let list = offlineReductionItems.value;
  const q = offlineSearchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (item) =>
        item.assistItemName.toLowerCase().includes(q) ||
        item.assistCode.toLowerCase().includes(q) ||
        item.destySku.toLowerCase().includes(q),
    );
  }
  if (offlineStatusFilter.value !== "all") {
    list = list.filter((item) => item.status === offlineStatusFilter.value);
  }
  return list;
});

const offlineCheckedItems = computed(() => {
  return offlineReductionItems.value.filter((item) => item.checked && item.status !== "synced");
});

const isAllOfflineChecked = computed(() => {
  const eligible = filteredOfflineReductionItems.value.filter(
    (item) => item.destySkuId && item.status !== "synced",
  );
  return eligible.length > 0 && eligible.every((item) => item.checked);
});

const offlineSummaryStats = computed(() => {
  const list = offlineReductionItems.value;
  return {
    total: list.length,
    ready: list.filter((i) => i.status === "ready").length,
    warning: list.filter((i) => i.status === "warning").length,
    unmapped: list.filter((i) => i.status === "unmapped").length,
    synced: list.filter((i) => i.status === "synced").length,
  };
});

function toggleSelectAllOffline(val: boolean | any) {
  for (const item of filteredOfflineReductionItems.value) {
    if (item.destySkuId && item.status !== "synced") {
      const existing = offlineManualOverrides.value[item.rowKey] || {};
      offlineManualOverrides.value[item.rowKey] = { ...existing, checked: Boolean(val) };
    }
  }
}

function updateOfflineRowChecked(rowKey: string, checked: boolean) {
  const existing = offlineManualOverrides.value[rowKey] || {};
  offlineManualOverrides.value[rowKey] = { ...existing, checked };
}

function updateOfflineRowReductionQty(rowKey: string, val: string | number | null | undefined) {
  const existing = offlineManualOverrides.value[rowKey] || {};
  offlineManualOverrides.value[rowKey] = {
    ...existing,
    reductionQty: Math.max(0, Number(val ?? 0)),
  };
}

async function fetchLiveDestyStockForOffline(skusToFetch?: string[]) {
  if (!destyToken.value) return;

  let targetSkus = skusToFetch;
  if (!targetSkus || targetSkus.length === 0) {
    const skuSet = new Set<string>();
    for (const item of offlineReductionItems.value) {
      if (item.destySku) skuSet.add(item.destySku.toUpperCase());
    }
    targetSkus = Array.from(skuSet);
  }

  if (targetSkus.length === 0) return;

  isLoadingLiveDestyStockForOffline.value = true;
  try {
    const res = (await browser.runtime.sendMessage({
      type: "FETCH_DESTY_STOCK",
      payload: {
        token: destyToken.value,
        tenantId: destyTenantId.value,
        masterWarehouseId: store.destyMasterWarehouseId || "2042620805094077644",
        skus: targetSkus,
      },
    })) as { ok: boolean; items?: DestyOmniStockItem[]; error?: string } | undefined;

    if (res && res.ok && Array.isArray(res.items)) {
      const nextMap = { ...destyStockMapForOffline.value };
      for (const item of res.items) {
        if (item.sku) {
          nextMap[item.sku.toUpperCase()] = item;
        }
      }
      destyStockMapForOffline.value = nextMap;
    } else {
      throw new Error(res?.error || "Gagal mengambil stok Desty");
    }
  } catch (err) {
    console.error("Gagal mengambil stok live Desty:", err);
    statusVariant.value = "error";
    statusMessage.value = "Gagal mengambil live stock Desty: " + (err instanceof Error ? err.message : String(err));
  } finally {
    isLoadingLiveDestyStockForOffline.value = false;
  }
}

async function fetchOfflineSales() {
  if (isFetchingOfflineSales.value) return;
  isFetchingOfflineSales.value = true;
  offlineManualOverrides.value = {};
  offlineSyncResults.value = {};

  try {
    const tokenResult = await resolveAssistToken();
    const assistToken = tokenResult.token || store.assistToken;
    if (!assistToken) {
      throw new Error("Token Assist tidak ditemukan. Buka tab clinica.assist.id terlebih dahulu.");
    }

    if (!mappings.value.length || !assistCatalog.value.length) {
      await loadSyncCatalog();
    }

    const transactions = await fetchAllAssistPemasukan(
      offlineStartDate.value,
      offlineEndDate.value,
      assistToken,
    );

    const result = getAssistOfflineSoldItems(transactions, {
      includeOnlyPaidOff: true,
      excludeOnline: offlineExcludeOnline.value,
    });

    offlineSoldItems.value = result.soldItems;
    statusVariant.value = "success";
    statusMessage.value = `Berhasil memuat ${result.soldItems.length} produk terjual offline (${result.skippedOnlineCount} transaksi online dilewati).`;

    if (destyToken.value) {
      await fetchLiveDestyStockForOffline();
    }
  } catch (err) {
    console.error("Gagal memuat penjualan offline:", err);
    statusVariant.value = "error";
    statusMessage.value = err instanceof Error ? err.message : "Gagal memuat penjualan offline Assist.";
  } finally {
    isFetchingOfflineSales.value = false;
  }
}

function openOfflineConfirmDialog() {
  if (!offlineCheckedItems.value.length) {
    statusVariant.value = "error";
    statusMessage.value = "Pilih setidaknya satu item yang siap dikurangi.";
    return;
  }
  showOfflineConfirmDialog.value = true;
}

async function handleExecuteOfflineStockSync() {
  showOfflineConfirmDialog.value = false;
  const itemsToSync = [...offlineCheckedItems.value];
  if (itemsToSync.length === 0) return;

  showOfflineProgressDialog.value = true;
  isSyncingOfflineStock.value = true;
  offlineProgressTotal.value = itemsToSync.length;
  offlineProgressCurrent.value = 0;
  offlineProgressSuccess.value = 0;
  offlineProgressFailed.value = 0;
  offlineProgressLogs.value = [];

  try {
    const { successCount, failedCount, results } = await executeOfflineStockReduction({
      items: itemsToSync,
      destyToken: destyToken.value,
      destyTenantId: destyTenantId.value,
      defaultWarehouseId: store.destyMasterWarehouseId || "2042620805094077644",
      onProgress: (p) => {
        offlineProgressCurrent.value = p.current;
        offlineProgressSuccess.value = p.success;
        offlineProgressFailed.value = p.failed;
        offlineProgressLogs.push(p.log);
      },
    });

    offlineSyncResults.value = { ...offlineSyncResults.value, ...results };
    await fetchLiveDestyStockForOffline();

    statusVariant.value = failedCount === 0 ? "success" : "error";
    statusMessage.value = `Koreksi stok Desty selesai: ${successCount} berhasil, ${failedCount} gagal.`;
  } catch (err) {
    console.error("Error executing stock reduction:", err);
    statusVariant.value = "error";
    statusMessage.value = err instanceof Error ? err.message : "Gagal memproses koreksi stok Desty.";
  } finally {
    isSyncingOfflineStock.value = false;
  }
}

watch(selectedStatus, () => {
  void loadStatusCounts();
});

watch(syncTab, (newTab) => {
  if ((newTab === "import" || newTab === "mapping" || newTab === "offline_sync") && !assistCatalog.value.length && !syncBusy.value) {
    void loadSyncCatalog();
  }
});

onMounted(async () => {
  await probeTokens();
  await loadSyncData();
  void loadSyncCatalog();
});
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
.text-2xs {
  font-size: 10px;
}
.border-amber {
  border: 1px solid #ffe082;
}
</style>
