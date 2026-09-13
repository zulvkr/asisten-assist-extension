<template>
  <div>
    <!-- Header Section -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="sync" class="q-mr-sm" />
        PLDMP (Desty Helper Integration)
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

    <!-- Filters & Actions Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-md items-center">
        <!-- Status Dropdown Selector -->
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

        <!-- Control Buttons -->
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
            label="Ekspor Excel"
            @click="exportToExcel"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Status Alerts -->
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

    <!-- Desty Sales Synchronization -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold text-teal q-mb-sm">
          Sinkronisasi Penjualan Desty → Assist
        </div>
        <q-tabs v-model="syncTab" dense active-color="teal" indicator-color="teal" align="left">
          <q-tab name="import" label="Impor Pesanan (Online)" />
          <q-tab name="offline_sync" label="SO Stok Offline (Assist → Desty)" />
          <q-tab v-if="store.developerMode" name="mapping" label="Pemetaan/Override SKU" />
          <q-tab name="log" label="Log Impor" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="syncTab" animated>
          <q-tab-panel name="import" class="q-px-none">
            <div class="row q-col-gutter-sm items-end">
              <div class="col-12 col-md-6">
                <q-select
                  v-model="selectedOrderKey"
                  :options="orderOptions"
                  emit-value
                  map-options
                  outlined
                  dense
                  label="Order yang akan direview"
                  :disable="!orders.length"
                />
              </div>
              <div class="col-auto">
                <q-btn outline color="blue-grey-8" label="Muat Katalog Assist" :loading="syncBusy" @click="loadSyncCatalog" />
              </div>
              <div v-if="store.developerMode" class="col-auto">
                <q-btn outline color="teal" label="Validasi" :disable="!selectedOrder" @click="validateSelectedOrder" />
              </div>
              <div v-if="store.developerMode" class="col-auto">
                <q-btn color="teal" label="Dry-run" :disable="!selectedOrder" :loading="syncBusy" @click="dryRunSelectedOrder" />
              </div>
              <div class="col-auto">
                <q-btn color="positive" label="Impor ke Assist" :disable="!selectedOrder || !store.assistAccountTxId" :loading="syncBusy" @click="importSelectedOrder" />
              </div>
              <div class="col-auto">
                <q-btn
                  color="positive"
                  :label="selectedOrdersCount > 0 ? `Impor Terpilih (${selectedOrdersCount})` : 'Impor Terpilih'"
                  :disable="!selectedOrdersCount || !store.assistAccountTxId"
                  :loading="syncBusy"
                  @click="importSelectedCheckedOrders"
                >
                  <q-tooltip v-if="!selectedOrdersCount">Pilih pesanan pada tabel dengan mencentang checkbox</q-tooltip>
                </q-btn>
              </div>
              <div class="col-auto">
                <q-btn color="positive" outline label="Impor Semua Valid" :disable="!orders.length || !store.assistAccountTxId" :loading="syncBusy" @click="bulkImportOrders" />
              </div>
            </div>
            <div v-if="!store.assistAccountTxId" class="text-caption text-red q-mt-sm">
              Isi accountTxId akun Kas di Pengaturan sebelum mengirim transaksi.
            </div>
            <q-banner v-if="syncValidationMessage" rounded class="q-mt-md bg-grey-2">
              {{ syncValidationMessage }}
            </q-banner>
            <q-list v-if="syncIssues.length" bordered separator class="q-mt-md">
              <q-item v-for="issue in syncIssues" :key="`${issue.code}-${issue.sku ?? issue.message}`">
                <q-item-section avatar><q-icon name="error" color="negative" /></q-item-section>
                <q-item-section>{{ issue.message }}</q-item-section>
              </q-item>
            </q-list>
            <q-input
              v-if="store.developerMode && syncPayloadPreview"
              v-model="syncPayloadPreview"
              class="q-mt-md"
              type="textarea"
              outlined
              readonly
              autogrow
              label="Preview payload (dry-run)"
              :input-style="{ fontFamily: 'monospace', fontSize: '11px' }"
            />
          </q-tab-panel>

          <!-- Offline Sales to Desty Stock Reduction Panel -->
          <q-tab-panel name="offline_sync" class="q-px-none">
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
                      <th class="text-left">Produk Assist (POS)</th>
                      <th class="text-center">Terjual Offline</th>
                      <th class="text-center">Stok Assist Saat Ini</th>
                      <th class="text-left">Pemetaan SKU Desty</th>
                      <th class="text-center">Stok Desty Live</th>
                      <th class="text-left" style="min-width: 200px;">Pengurangan Stok (-)</th>
                      <th class="text-center">Status Validasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in filteredOfflineReductionItems" :key="item.rowKey">
                      <td class="text-center">
                        <q-checkbox
                          :model-value="item.checked"
                          @update:model-value="(val) => updateOfflineRowChecked(item.rowKey, val)"
                          :disable="!item.destySkuId || item.status === 'synced'"
                          color="teal"
                          dense
                        />
                      </td>
                      <td>
                        <div class="text-weight-bold text-slate-900">{{ item.assistItemName }}</div>
                        <div class="text-caption font-mono text-grey-7">
                          Kode: {{ item.assistCode || item.assistItemId || "-" }}
                          <q-badge color="blue-grey-2" text-color="blue-grey-9" class="q-ml-xs text-2xs">
                            {{ item.assistItemType }}
                          </q-badge>
                        </div>
                      </td>
                      <td class="text-center">
                        <div class="text-weight-bold text-subtitle2 text-teal">
                          {{ item.offlineQty }} <span class="text-caption text-grey-6">{{ item.assistUnit }}</span>
                        </div>
                      </td>
                      <td class="text-center">
                        <div v-if="item.assistStock !== null && item.assistStock !== undefined">
                          <div class="text-weight-bold text-subtitle2 text-slate-900">
                            {{ item.assistStock }} <span class="text-caption text-grey-6">{{ item.assistUnit }}</span>
                          </div>
                        </div>
                        <div v-else class="text-caption text-grey-5 flex items-center justify-center">
                          <q-icon name="help_outline" size="14px" class="q-mr-xs text-grey-5" />
                          -
                        </div>
                      </td>
                      <td>
                        <div class="row items-center q-gutter-x-xs">
                          <span class="font-mono text-weight-bold text-primary">{{ item.destySku }}</span>
                          <q-badge color="teal-1" text-color="teal-9" v-if="item.isMapped" class="text-2xs">
                            Mapped
                          </q-badge>
                          <q-badge color="grey-2" text-color="grey-8" v-else class="text-2xs">
                            Auto 1:1
                          </q-badge>
                        </div>
                        <div class="text-caption text-grey-6 q-mt-2xs" v-if="item.conversionFactor !== 1">
                          1 {{ item.destyUnit }} = {{ item.conversionFactor }} {{ item.assistUnit }}
                        </div>
                        <div class="text-caption text-primary text-weight-bold q-mt-2xs">
                          Ekuivalen Desty: {{ item.qtyDesty }} {{ item.destyUnit }}
                        </div>
                      </td>
                      <td class="text-center">
                        <div v-if="item.destyStockFound" class="q-gutter-y-2xs">
                          <div class="row items-center justify-center q-gutter-x-xs text-caption">
                            <span>Fisik: <strong class="text-slate-900">{{ item.destyFisik }}</strong></span>
                            <span class="text-grey-4">|</span>
                            <span :class="item.destyReserved > 0 ? 'text-amber-9 text-weight-bold' : 'text-grey-6'">
                              Pesanan: {{ item.destyReserved }}
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
                          Tidak Ditemukan
                        </div>
                      </td>
                      <td>
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
                          >
                            <template v-slot:append>
                              <span class="text-caption text-grey-7 font-weight-bold">{{ item.destyUnit }}</span>
                            </template>
                          </q-input>
                          <div class="text-caption text-grey-7 q-mt-xs flex items-center justify-between">
                            <span>Fisik Baru: <strong>{{ item.calculatedFisikBaru !== null ? item.calculatedFisikBaru : '-' }}</strong></span>
                            <span>Tersedia: <strong :class="(item.calculatedTersediaBaru ?? 0) < 0 ? 'text-red font-weight-bold' : 'text-teal'">{{ item.calculatedTersediaBaru !== null ? item.calculatedTersediaBaru : '-' }}</strong></span>
                          </div>
                        </div>
                        <span v-else class="text-caption text-grey-4">-</span>
                      </td>
                      <td class="text-center" style="max-width: 180px;">
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

          <q-tab-panel v-if="store.developerMode" name="mapping" class="q-px-none">
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-md-3"><q-input v-model="mappingDraft.destySku" outlined dense label="SKU Desty" /></div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistCode" outlined dense label="Kode Assist" /></div>
              <div class="col-12 text-caption text-grey-7 q-mb-sm">Mapping utama diambil otomatis dari Google Sheet (SKU kolom F → kode Assist kolom A). Form berikut hanya untuk pengecualian/manual override.</div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistId" outlined dense label="ID Assist" /></div>
              <div class="col-12 col-md-3"><q-input v-model="mappingDraft.assistName" outlined dense label="Nama Assist" /></div>
              <div class="col-12 col-md-2"><q-select v-model="mappingDraft.assistType" :options="['prescription', 'akhp']" outlined dense label="Tipe" /></div>
              <div class="col-12 col-md-2"><q-input v-model="mappingDraft.assistUnit" outlined dense label="Unit Assist" /></div>
              <div class="col-12 col-md-2"><q-input v-model.number="mappingDraft.conversionFactor" type="number" min="0.0001" step="any" outlined dense label="Faktor konversi" /></div>
              <div class="col-12 col-md-3 flex items-center text-caption text-grey-7">Depot default: {{ DEFAULT_ASSIST_DEPOT_ID }}</div>
              <div class="col-12 col-md-3 flex items-center"><q-checkbox v-model="mappingDraft.active" label="Aktif" /></div>
              <div class="col-12 row q-gutter-sm">
                <q-btn color="teal" icon="save" label="Simpan Mapping" :loading="syncBusy" @click="saveMapping" />
                <q-btn outline color="teal" icon="file_download" label="Ekspor JSON" :disable="syncBusy" @click="exportMappings" />
                <q-btn outline color="teal" icon="file_upload" label="Impor JSON" :disable="syncBusy" @click="mappingFileInput?.click()" />
                <input ref="mappingFileInput" type="file" accept="application/json,.json" style="display:none" @change="importMappings" />
              </div>
            </div>
            <q-table class="q-mt-md" flat bordered dense :rows="mappings" :columns="mappingColumns" row-key="destySku" no-data-label="Belum ada mapping SKU.">
              <template #body-cell-actions="props">
                <q-td :props="props" class="q-gutter-xs">
                  <q-btn flat round dense icon="edit" color="teal" aria-label="Edit mapping" @click="editMapping(props.row)" />
                  <q-btn flat round dense icon="delete" color="negative" aria-label="Hapus mapping" @click="deleteMapping(props.row.destySku)" />
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <q-tab-panel name="log" class="q-px-none">
            <q-table flat bordered dense :rows="importLedger" :columns="ledgerColumns" row-key="marketplaceOrderSn" no-data-label="Belum ada log impor." />
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>
    </q-card>

    <!-- Results Table Card -->
    <q-card flat bordered>
      <q-card-section class="q-pa-none">
        <div v-if="flattenedItems.length" class="row items-center justify-between q-px-md q-py-sm bg-grey-1 text-caption">
          <div class="row items-center q-gutter-sm">
            <span class="text-weight-medium text-grey-8">
              Terpilih: <strong class="text-teal-9">{{ selectedOrdersCount }} order</strong> ({{ selectedRows.length }} baris)
            </span>
            <q-btn size="sm" flat dense color="teal" label="Pilih Semua Valid" @click="selectAllValid" />
            <q-btn size="sm" flat dense color="grey-7" label="Batal Pilih" @click="clearSelection" :disable="!selectedRows.length" />
          </div>
          <div v-if="!assistCatalog.length" class="text-orange-9 row items-center">
            <q-icon name="warning" size="xs" class="q-mr-xs" />
            Katalog Assist belum dimuat. Klik "Muat Katalog Assist" untuk validasi stok & mapping akurat.
          </div>
        </div>

        <q-separator v-if="flattenedItems.length" />

        <q-table
          :rows="flattenedItems"
          :columns="tableColumns"
          row-key="rowId"
          selection="multiple"
          v-model:selected="selectedRows"
          flat
          :loading="loading"
          :pagination="{ rowsPerPage: 15 }"
          no-data-label="Belum ada data pesanan. Klik 'Tarik Data' untuk memuat."
        >
          <!-- Custom Header Selection Checkbox -->
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

          <!-- Custom Body Selection Checkbox -->
          <template v-slot:body-selection="scope">
            <q-checkbox
              v-model="scope.selected"
              :disable="!scope.row.isValid"
              color="teal"
            >
              <q-tooltip v-if="!scope.row.isValid">Pesanan tidak valid tidak dapat dipilih untuk impor</q-tooltip>
            </q-checkbox>
          </template>

          <!-- Index column -->
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

          <template v-slot:body-cell-platformName="props">
            <q-td :props="props">
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
            <q-td :props="props">
              <q-badge color="teal-1" text-color="teal-9" class="q-px-sm text-weight-bold text-subtitle2">
                {{ props.value }}
              </q-badge>
            </q-td>
          </template>
        </q-table>
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
  upsertDestySkuMapping,
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
const syncTab = ref<"import" | "offline_sync" | "mapping" | "log">("import");
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
  { name: "destySku", label: "SKU Desty", field: "destySku", align: "left" },
  { name: "assistCode", label: "Kode Assist", field: "assistCode", align: "left" },
  { name: "assistName", label: "Item Assist", field: "assistName", align: "left" },
  { name: "assistType", label: "Tipe", field: "assistType", align: "left" },
  { name: "conversionFactor", label: "Faktor", field: "conversionFactor", align: "right" },
  { name: "depotId", label: "Depot", field: "depotId", align: "left" },
  { name: "active", label: "Aktif", field: (row: DestySkuMapping) => row.active ? "Ya" : "Tidak", align: "center" },
  { name: "actions", label: "Aksi", field: "destySku", align: "center" },
];

const ledgerColumns = [
  { name: "marketplaceOrderSn", label: "Order", field: "marketplaceOrderSn", align: "left" },
  { name: "status", label: "Status", field: "status", align: "left" },
  { name: "txId", label: "txId", field: "txId", align: "left" },
  { name: "invoice", label: "Invoice", field: "invoice", align: "left" },
  { name: "error", label: "Error", field: "error", align: "left" },
  { name: "updatedAt", label: "Diperbarui", field: "updatedAt", align: "left" },
];

const tableColumns = [
  { name: "no", label: "No", align: "center", field: (row: any, idx: number) => idx + 1, sortable: false },
  { name: "validationStatus", label: "Validasi", align: "center", field: "isValid", sortable: true },
  { name: "inputKeAssist", label: "Input Ke Assist", align: "left", field: "inputKeAssist", sortable: true },
  { name: "productName", label: "Nama Produk", align: "left", field: "productName", sortable: true },
  { name: "platformName", label: "Market Place", align: "center", field: "platformName", sortable: true },
  { name: "assistInvoice", label: "Invoice Assist", align: "left", field: "assistInvoice" },
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

function parseSatuan(sku?: string): string {
  if (!sku) return "";
  const parts = sku.split("-");
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim();
    const last = lastPart.toUpperCase();
    if (/^\d+$/.test(last) && parts.length > 2) {
      const secondLast = parts[parts.length - 2].trim().toUpperCase();
      return `${secondLast}-${last}`;
    }
    return last;
  }
  return sku.trim().toUpperCase();
}

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
  // Assist history is the source of truth. The local ledger is for audit/logging only.
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

      const assistUnit = unitMap.value[itemSkuUpper];
      const satuan = assistUnit !== undefined && assistUnit !== "" ? assistUnit : "";

      const totalHargaModalCalculated: number | "" = typeof hargaModalSatuan === "number" ? (item?.quantity ?? 0) * hargaModalSatuan : "";

      result.push({
        rowId: `${orderKey}_${itemIdx}_${sku}`,
        orderKey,
        productName: item?.productName ?? "-",
        platformName: parsePlatformName(record.platformName),
        inputKeAssist: importStatusForOrder(orderKey),
        isValid,
        validationMessages,
        assistInvoice: assistInvoiceForOrder(orderKey),
        quantity: item?.quantity ?? 0,
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
        sku
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
    ? "Order valid dan siap untuk dry-run."
    : `Order tidak valid (${validation.issues.length} masalah).`;
  return validation.valid;
}

async function loadSyncData() {
  mappings.value = await getDestySkuMappings();
  importLedger.value = await getDestyImportLedger();
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
    // Keep automatic Sheet → Assist mappings runtime-only; only manual overrides are persisted.
    syncValidationMessage.value = `Katalog ${assistCatalog.value.length} item dan ${mappings.value.length} mapping otomatis dimuat (tidak disimpan).` +
      (autoMapping.unmatchedSkus.length ? ` ${autoMapping.unmatchedSkus.length} SKU tidak ditemukan di katalog Assist.` : "");
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
    syncValidationMessage.value = `Mapping ${mappingDraft.value.destySku} berhasil disimpan.`;
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

    // Query Assist immediately before sending. A failed remote check aborts the send.
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
    // A successful Assist history query is authoritative; local ledger is fallback only.
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
    // Server history is authoritative after a successful query; do not retain stale local duplicates.
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

  // Always load Assist maps on start
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
    statusMessage.value = `Berhasil menarik ${orders.value.length} pesanan dengan total ${flattenedItems.value.length} baris barang.`;
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
    statusMessage.value = "File Excel berhasil dibuat.";
    statusVariant.value = "success";
  } catch (err) {
    console.error(err);
    statusMessage.value = "Gagal membuat berkas Excel.";
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

    // Ensure catalog & mappings are loaded
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
        offlineProgressLogs.value.push(p.log);
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

watch(() => store.developerMode, (enabled) => {
  if (!enabled && syncTab.value === "mapping") syncTab.value = "import";
  if (!enabled) syncPayloadPreview.value = "";
});

onMounted(() => {
  void probeTokens();
  void loadSyncData();
});
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
