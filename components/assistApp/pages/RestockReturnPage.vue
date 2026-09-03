<template>
  <div>
    <!-- Form View (Penerimaan Baru / Restock Form) -->
    <div v-if="showCreateForm" class="q-pa-md restock-form-container">
      <!-- Breadcrumb / Top Bar -->
      <div class="row items-center justify-between q-mb-md border-bottom q-pb-sm">
        <div class="row items-center">
          <q-btn
            flat
            round
            color="teal"
            icon="arrow_back"
            @click="showCreateForm = false"
            class="q-mr-sm"
          />
          <div class="text-h5 text-blue-grey-9 text-weight-bold">Penerimaan Baru</div>
        </div>
        <div class="row q-gutter-x-sm">
          <q-btn
            outline
            color="blue-grey-7"
            label="Batal"
            no-caps
            class="q-px-md"
            @click="showCreateForm = false"
          />
          <q-btn
            color="teal"
            icon="save"
            label="Simpan Transaksi"
            :loading="saving"
            no-caps
            class="q-px-md text-weight-bold"
            @click="confirmSaveTransaction"
          />
        </div>
      </div>

      <!-- Invoice Header Card -->
      <q-card flat bordered class="q-mb-md rounded-borders shadow-subtle">
        <q-card-section class="q-py-sm bg-grey-1 border-bottom">
          <div class="text-subtitle2 text-blue-grey-8 text-weight-bold">Informasi Faktur</div>
        </q-card-section>
        <q-card-section class="row q-col-gutter-md">
          <!-- Supplier Selection & Details -->
          <div class="col-12 col-md-6">
            <div class="row q-col-gutter-sm">
              <!-- Supplier Select -->
              <div class="col-12">
                <q-select
                  v-model="selectedDistributor"
                  outlined
                  dense
                  emit-value
                  map-options
                  use-input
                  input-debounce="300"
                  :options="distributorOptions"
                  option-value="id"
                  option-label="supplierName"
                  label="Supplier *"
                  color="teal"
                  @filter="filterDistributor"
                  @update:model-value="onDistributorChange"
                  v-if="!isNewSupplier"
                >
                  <template v-slot:no-option>
                    <q-item>
                      <q-item-section class="text-grey">
                        Tidak ditemukan supplier terdaftar
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
                <q-input
                  v-model="supplierName"
                  outlined
                  dense
                  label="Nama Supplier Baru *"
                  color="teal"
                  v-else
                  :rules="[val => !!val || 'Nama supplier wajib diisi']"
                />
              </div>

              <!-- Toggle Manual Supplier -->
              <div class="col-12 q-py-none">
                <q-checkbox
                  v-model="isNewSupplier"
                  label="Input Supplier Baru Manual"
                  color="teal"
                  dense
                  class="text-caption text-grey-8"
                />
              </div>

              <!-- Penanggung Jawab (PIC Name) -->
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="picSupplierName"
                  outlined
                  dense
                  label="Nama Penanggung Jawab (PIC)"
                  color="teal"
                />
              </div>

              <!-- No HP Penanggung Jawab -->
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="phoneNumberSupplier"
                  outlined
                  dense
                  label="No. HP Penanggung Jawab"
                  color="teal"
                />
              </div>

              <!-- Address & Email Supplier (Editable) -->
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="emailSupplier"
                  outlined
                  dense
                  label="Email Supplier"
                  color="teal"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="addressSupplier"
                  outlined
                  dense
                  label="Alamat Supplier"
                  color="teal"
                />
              </div>
            </div>
          </div>

          <!-- Right side: Invoice Details -->
          <div class="col-12 col-md-6">
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="nomorFaktur"
                  outlined
                  dense
                  label="No. Faktur *"
                  color="teal"
                  :rules="[val => !!val || 'Nomor faktur wajib diisi']"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="ppnType"
                  outlined
                  dense
                  emit-value
                  map-options
                  :options="ppnTypeOptions"
                  label="Tipe PPN"
                  color="teal"
                  @update:model-value="recalcAllRows"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="transactionDate"
                  outlined
                  dense
                  type="date"
                  label="Tanggal Faktur *"
                  color="teal"
                  stack-label
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="receiveDate"
                  outlined
                  dense
                  type="date"
                  label="Tanggal Terima *"
                  color="teal"
                  stack-label
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="dueDatePayment"
                  outlined
                  dense
                  type="date"
                  label="Tanggal Jatuh Tempo *"
                  color="teal"
                  stack-label
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="hospitalPhone"
                  outlined
                  dense
                  label="No. Telepon Klinik"
                  color="teal"
                />
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Items Section (Daftar Barang) -->
      <div class="row items-center justify-between q-mb-sm q-mt-lg">
        <div class="row items-center q-gutter-x-md">
          <div class="text-h6 text-blue-grey-9 text-weight-bold">Daftar Barang</div>
          <q-toggle
            v-model="showDiscountColumn"
            label="Tampilkan Diskon"
            color="teal"
            dense
          />
        </div>
        <q-btn
          flat
          color="teal"
          icon="add"
          label="Tambah Baris (Alt+N)"
          no-caps
          class="text-weight-bold"
          @click="addNewRow"
        />
      </div>

      <!-- Main Inline Table with Separator="cell" for clear grid lines -->
      <q-card flat bordered class="q-mb-md rounded-borders shadow-subtle overflow-hidden">
        <q-markup-table flat bordered dense separator="cell" class="invoice-table">
          <thead>
            <tr class="bg-grey-1 text-blue-grey-8">
              <th class="text-left" style="width: 50px;">No.</th>
              <th class="text-left" style="min-width: 250px;">PRODUK</th>
              <th class="text-left" style="width: 110px;">BATCH</th>
              <th class="text-left" style="width: 145px;">EXP. DATE</th>
              <th class="text-center" style="width: 100px;">QTY</th>
              <th class="text-right" style="width: 140px;">HARGA BELI</th>
              <th class="text-right" style="width: 110px;">PPN</th>
              <th class="text-right" style="width: 140px;">SUBTOTAL (BELI)</th>
              <th class="text-right" style="width: 150px;">HRG JUAL</th>
              <th class="text-right" style="width: 90px;">MARGIN</th>
              <th v-if="showDiscountColumn" class="text-right" style="width: 90px;">DISC %</th>
              <th class="text-center" style="width: 120px;">AKSI</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="formItems.length === 0">
              <td colspan="12" class="text-center text-grey q-py-xl">
                <q-icon name="playlist_add" size="lg" class="q-mb-sm text-grey-4" /><br />
                Belum ada baris barang. Klik "+ Tambah Baris" atau tekan Alt+N.
              </td>
            </tr>
            <tr v-for="(row, index) in formItems" :key="index" class="invoice-item-row align-top-row">
              <!-- Numbering -->
              <td class="q-pt-sm">{{ index + 1 }}</td>

              <!-- Product autocomplete search -->
              <td>
                <q-select
                  v-model="row.selectedProduct"
                  use-input
                  fill-input
                  hide-selected
                  dense
                  borderless
                  input-debounce="300"
                  :options="row.options || []"
                  :loading="row.loading"
                  label="Cari barang..."
                  color="teal"
                  class="font-weight-medium"
                  @filter="(val, update, abort) => searchItemRow(val, update, abort, row)"
                  @virtual-scroll="(details) => onScrollRow(details, row)"
                  @update:model-value="(val) => onItemSelectRow(val, row)"
                >
                  <template v-slot:no-option>
                    <q-item>
                      <q-item-section class="text-grey text-caption">
                        {{ row.loading ? 'Mencari barang...' : 'Tidak ada produk ditemukan' }}
                      </q-item-section>
                    </q-item>
                  </template>
                  <template v-slot:after-options v-if="row.loadingMore">
                    <q-item dense>
                      <q-item-section class="text-center text-caption text-grey-6">
                        <q-spinner size="16px" color="teal" class="q-mr-xs" /> Memuat lebih banyak...
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
                <div v-if="row.code" class="text-caption text-grey-6 font-mono q-pl-xs">
                  • {{ row.code }}
                </div>
              </td>

              <!-- Batch No -->
              <td>
                <q-input
                  v-model="row.batchNo"
                  dense
                  borderless
                  placeholder="Batch"
                  class="font-mono text-body2"
                />
              </td>

              <!-- Expiration Date -->
              <td>
                <q-input
                  v-model="row.expiredDate"
                  type="date"
                  dense
                  borderless
                  class="text-body2"
                />
              </td>

              <!-- Quantity and Unit -->
              <td>
                <div class="row no-wrap items-center justify-center">
                  <q-input
                    v-model.number="row.quantity"
                    type="number"
                    dense
                    borderless
                    class="text-center text-body2"
                    style="width: 55px;"
                    @update:model-value="recalcRow(row)"
                  />
                  <span class="text-caption text-grey-7 q-ml-xs">{{ row.unit }}</span>
                </div>
              </td>

              <!-- Buy Price -->
              <td>
                <div class="row no-wrap items-center justify-end">
                  <span class="text-caption text-grey-6 q-mr-xs">Rp</span>
                  <q-input
                    v-model.number="row.buyFee"
                    type="number"
                    dense
                    borderless
                    class="text-right text-body2 text-weight-medium"
                    style="width: 90px;"
                    @update:model-value="recalcRow(row)"
                  />
                </div>
              </td>

              <!-- Calculated PPN -->
              <td class="text-right text-body2 text-grey-7 q-pt-sm">
                {{ formatRupiah(row.ppnAmount * row.quantity) }}
              </td>

              <!-- Subtotal (Beli) -->
              <td class="text-right text-body2 q-pt-sm">
                <div class="text-weight-bold text-blue-grey-9">
                  {{ formatRupiah(row.totalFee) }}
                </div>
                <div class="text-caption text-grey-5" v-if="row.quantity > 1">
                  {{ formatRupiah(row.baseFee) }} / {{ row.unit }}
                </div>
              </td>

              <!-- Selling Price (Hrg Jual) -->
              <td>
                <div class="row no-wrap items-center justify-end">
                  <span class="text-caption text-grey-6 q-mr-xs">Rp</span>
                  <q-input
                    v-model.number="row.sellNormalFeeNew"
                    type="number"
                    dense
                    borderless
                    class="text-right text-body2 text-weight-medium"
                    style="width: 90px;"
                    @update:model-value="recalcRow(row)"
                  />
                </div>
                <!-- Prev and Rec Helper text -->
                <div class="text-right text-xxs q-pr-xs q-mt-xxs text-grey-5 line-height-tight" v-if="row.code">
                  <div>Prev: {{ formatRupiah(row.prevPrice) }}</div>
                  <div class="text-teal font-weight-medium">Rec: {{ formatRupiah(row.recPrice) }} (15%)</div>
                </div>
              </td>

              <!-- Margin -->
              <td class="text-right q-pt-sm">
                <q-badge
                  v-if="row.margin !== 0"
                  :color="row.margin > 0 ? 'positive' : 'negative'"
                  class="q-px-sm text-weight-bold"
                  label=""
                >
                  {{ row.margin > 0 ? '+' : '' }}{{ row.margin.toFixed(1) }}%
                </q-badge>
                <span v-else class="text-grey-4">-</span>
              </td>

              <!-- Discount % Column (if toggled) -->
              <td v-if="showDiscountColumn">
                <q-input
                  v-model.number="row.diskonObat"
                  type="number"
                  dense
                  borderless
                  suffix="%"
                  class="text-right text-body2"
                  style="width: 60px;"
                  @update:model-value="recalcRow(row)"
                />
              </td>

              <!-- Move Up/Down/Delete Actions -->
              <td class="text-center q-pt-xs">
                <div class="row no-wrap justify-center q-gutter-x-xs">
                  <q-btn
                    flat
                    round
                    dense
                    color="blue-grey-6"
                    icon="arrow_upward"
                    size="sm"
                    :disabled="index === 0"
                    @click="moveRowUp(index)"
                  />
                  <q-btn
                    flat
                    round
                    dense
                    color="blue-grey-6"
                    icon="arrow_downward"
                    size="sm"
                    :disabled="index === formItems.length - 1"
                    @click="moveRowDown(index)"
                  />
                  <q-btn
                    flat
                    round
                    dense
                    color="red"
                    icon="delete"
                    size="sm"
                    @click="removeRow(index)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </q-markup-table>
      </q-card>

      <!-- Bottom Panel (Notes & Totals) -->
      <div class="row q-col-gutter-md q-mt-md">
        <!-- Notes Section -->
        <div class="col-12 col-md-6">
          <q-card flat bordered class="rounded-borders shadow-subtle bg-white">
            <q-card-section class="q-py-sm bg-grey-1 border-bottom">
              <div class="text-subtitle2 text-blue-grey-8 text-weight-bold">Pembayaran & Keterangan</div>
            </q-card-section>
            <q-card-section class="q-gutter-y-md">
              <q-input
                v-model="notes"
                outlined
                type="textarea"
                rows="2"
                label="Catatan Faktur"
                color="teal"
              />

              <div class="row q-col-gutter-sm items-center">
                <div class="col-12 col-sm-6">
                  <q-checkbox
                    v-model="isPaidDirectly"
                    label="Langsung Dibayar (Lunas)"
                    color="teal"
                    dense
                  />
                </div>
                <div class="col-12 col-sm-6" v-if="isPaidDirectly">
                  <q-select
                    v-model="selectedAccountTxId"
                    outlined
                    dense
                    emit-value
                    map-options
                    :options="paymentAccountOptions"
                    label="Akun Kas / Pembayaran"
                    color="teal"
                  />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Grand Totals Section -->
        <div class="col-12 col-md-6">
          <q-card flat bordered class="rounded-borders shadow-subtle bg-white">
            <q-card-section class="q-py-md text-blue-grey-9">
              <!-- Subtotal -->
              <div class="row justify-between text-body1 q-mb-sm">
                <span class="text-grey-7">Subtotal:</span>
                <span class="text-weight-bold">{{ formatRupiah(subtotalFee) }}</span>
              </div>
              <!-- Discount Summary -->
              <div class="row justify-between text-body1 q-mb-sm text-red" v-if="totalDiscountVal > 0">
                <span class="text-red-7">Diskon:</span>
                <span class="text-weight-bold">-{{ formatRupiah(totalDiscountVal) }}</span>
              </div>
              <!-- PPN Summary -->
              <div class="row justify-between text-body1 q-mb-sm">
                <span class="text-grey-7">
                  PPN ({{ ppnType === 'include' ? 'Include' : 'Exclude' }}):
                </span>
                <span class="text-weight-bold text-grey-9">{{ formatRupiah(totalPpnVal) }}</span>
              </div>
              <!-- Other Fees -->
              <div class="row justify-between items-center q-mb-md">
                <span class="text-grey-7">Biaya Lain-lain:</span>
                <q-input
                  v-model.number="elseFee"
                  type="number"
                  dense
                  outlined
                  prefix="Rp"
                  color="teal"
                  class="text-right"
                  style="width: 140px;"
                />
              </div>
              <q-separator class="q-my-sm" />
              <!-- Grand Total -->
              <div class="row justify-between items-center q-py-sm text-teal text-h5 text-weight-bold">
                <span>Grand Total:</span>
                <span>{{ formatRupiah(grandTotal) }}</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>

    <!-- Normal List View -->
    <div v-else>
      <div class="row items-center justify-between q-mb-md">
        <div class="text-h5 text-teal font-weight-bold row items-center">
          <q-icon name="receipt_long" class="q-mr-sm" />
          Transaksi Restock & Return
        </div>
        <div class="row q-gutter-x-sm">
          <q-btn
            color="teal"
            icon="refresh"
            label="Segarkan Data"
            :loading="loading"
            @click="fetchTransactions"
            :disabled="!store.assistToken"
            no-caps
          />
          <q-btn
            color="positive"
            icon="add"
            label="Buat Restock Baru"
            @click="openRestockForm"
            :disabled="!store.assistToken"
            no-caps
          />
        </div>
      </div>

      <!-- Token Check Warning -->
      <q-banner v-if="!store.assistToken" rounded class="bg-warning text-black q-mb-md">
        <template v-slot:avatar>
          <q-icon name="warning" color="black" />
        </template>
        Token Assist belum terdeteksi. Silakan klik label <strong>Token Assist Belum Diisi</strong> di bagian atas (header) untuk memuat token dari tab clinica.assist.id yang aktif.
      </q-banner>

      <div v-else>

        <!-- Main Table -->
        <q-card flat bordered>
          <q-card-section class="row q-col-gutter-sm items-center">
            <div class="col-12 col-md-6">
              <q-input
                v-model="searchText"
                outlined
                dense
                placeholder="Cari berdasarkan invoice, faktur, atau supplier..."
                color="teal"
                clearable
              >
                <template v-slot:prepend>
                  <q-icon name="search" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-md-3">
              <q-select
                v-model="statusFilter"
                outlined
                dense
                emit-value
                map-options
                :options="statusOptions"
                label="Filter Status"
                color="teal"
              />
            </div>
          </q-card-section>

          <q-card-section class="q-pa-none">
            <q-table
              :rows="filteredItems"
              :columns="columns"
              row-key="id"
              :loading="loading"
              :pagination="initialPagination"
              flat
              no-data-label="Tidak ada transaksi restock & return ditemukan"
              loading-label="Mengambil data transaksi restock dari Assist..."
            >
              <template v-slot:header="props">
                <q-tr :props="props">
                  <q-th auto-width />
                  <q-th v-for="col in props.cols" :key="col.name" :props="props">
                    {{ col.label }}
                  </q-th>
                </q-tr>
              </template>

              <template v-slot:body="props">
                <q-tr :props="props">
                  <q-td auto-width>
                    <q-btn
                      size="sm"
                      color="teal"
                      round
                      dense
                      @click="props.expand = !props.expand"
                      :icon="props.expand ? 'expand_less' : 'expand_more'"
                      :title="props.expand ? 'Sembunyikan Detail' : 'Tampilkan Detail'"
                    />
                  </q-td>
                  <q-td v-for="col in props.cols" :key="col.name" :props="props">
                    <template v-if="col.name === 'status'">
                      <q-badge
                        :color="props.row.status === 'paid off' ? 'positive' : 'negative'"
                        class="q-px-sm q-py-xs"
                      >
                        {{ props.row.status === 'paid off' ? 'LUNAS' : props.row.status.toUpperCase() }}
                      </q-badge>
                    </template>
                    <template v-else-if="col.name === 'code' || col.name === 'nomorFaktur'">
                      <span class="font-mono">{{ col.value || '-' }}</span>
                    </template>
                    <template v-else>
                      {{ col.value }}
                    </template>
                  </q-td>
                </q-tr>

                <!-- Collapsible Row Detail -->
                <q-tr v-show="props.expand" :props="props">
                  <q-td colspan="100%" class="bg-grey-2">
                    <div class="q-pa-md">
                      <!-- Section Title -->
                      <div class="text-subtitle1 text-teal text-weight-bold q-mb-sm row items-center">
                        <q-icon name="shopping_basket" class="q-mr-xs" />
                        Detail Item Restock ({{ props.row.item ? props.row.item.length : 0 }} Item)
                      </div>

                      <!-- Items Detail Table -->
                      <q-markup-table flat bordered dense class="q-mb-md">
                        <thead>
                          <tr class="bg-teal-1">
                            <th class="text-left">No.</th>
                            <th class="text-left">Nama Item / Obat</th>
                            <th class="text-right">Kuantitas</th>
                            <th class="text-left">Satuan</th>
                            <th class="text-right">Harga Beli Satuan</th>
                            <th class="text-right">Diskon (%)</th>
                            <th class="text-right">Total Biaya</th>
                            <th class="text-left">No. Batch</th>
                            <th class="text-left">Tgl Kedaluwarsa (ED)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-if="!props.row.item || props.row.item.length === 0">
                            <td colspan="9" class="text-center text-grey-6 q-py-md">
                              Tidak ada item rincian dalam transaksi ini.
                            </td>
                          </tr>
                          <tr v-for="(item, idx) in props.row.item" :key="idx">
                            <td>{{ idx + 1 }}</td>
                            <td class="text-weight-bold">{{ item.name }}</td>
                            <td class="text-right">{{ item.quantity }}</td>
                            <td>{{ item.unit || '-' }}</td>
                            <td class="text-right">{{ formatRupiah(item.buyFee) }}</td>
                            <td class="text-right">{{ item.diskonObat ? `${item.diskonObat}%` : '-' }}</td>
                            <td class="text-right text-weight-bold">{{ formatRupiah(item.totalFee) }}</td>
                            <td class="font-mono">{{ item.batchNo || '-' }}</td>
                            <td>
                              <q-badge
                                v-if="item.expiredDate"
                                color="grey-7"
                                class="q-px-sm"
                              >
                                {{ new Date(item.expiredDate).toLocaleDateString("id-ID") }}
                              </q-badge>
                              <span v-else>-</span>
                            </td>
                          </tr>
                        </tbody>
                      </q-markup-table>

                      <!-- Payments Section -->
                      <div class="text-subtitle1 text-teal text-weight-bold q-mb-sm row items-center q-mt-md">
                        <q-icon name="payments" class="q-mr-xs" />
                        Histori Pembayaran
                      </div>

                      <div class="row q-col-gutter-md">
                        <div class="col-12 col-md-6">
                          <q-markup-table flat bordered dense>
                            <thead>
                              <tr class="bg-teal-1">
                                <th class="text-left">No.</th>
                                <th class="text-left">Tgl Transaksi</th>
                                <th class="text-left">Metode</th>
                                <th class="text-left">Oleh</th>
                                <th class="text-right">Jumlah</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr v-if="!props.row.Payments || props.row.Payments.length === 0">
                                <td colspan="5" class="text-center text-grey-6 q-py-sm">
                                  Belum ada catatan pembayaran.
                                </td>
                              </tr>
                              <tr v-for="(pay, pIdx) in props.row.Payments" :key="pIdx">
                                <td>{{ pIdx + 1 }}</td>
                                <td>{{ pay.transactionDate ? new Date(pay.transactionDate).toLocaleString("id-ID") : '-' }}</td>
                                <td>
                                  <q-badge color="blue-7" class="q-mr-xs">{{ pay.type }}</q-badge>
                                  <span>{{ pay.name }}</span>
                                </td>
                                <td>{{ pay.paidName || pay.createdName || '-' }}</td>
                                <td class="text-right text-weight-bold text-teal">{{ formatRupiah(pay.totalFee) }}</td>
                              </tr>
                            </tbody>
                          </q-markup-table>
                        </div>

                        <!-- General Notes Info -->
                        <div class="col-12 col-md-6">
                          <q-card flat bordered class="bg-white">
                            <q-card-section class="q-py-sm">
                              <div class="text-caption text-grey-6">Informasi Distributor</div>
                              <div class="text-body2 text-weight-bold">
                                {{ props.row.Distributors?.supplierName || props.row.supplierName || '-' }}
                              </div>
                              <div class="text-body2" v-if="props.row.Distributors?.phoneNumberSupplier">
                                Hubungi: {{ props.row.Distributors.phoneNumberSupplier }} (PIC: {{ props.row.Distributors.picSupplierName || '-' }})
                              </div>
                              <div class="text-body2" v-if="props.row.Distributors?.address">
                                Alamat: {{ props.row.Distributors.address }}
                              </div>
                              <q-separator class="q-my-sm" />
                              <div class="row justify-between text-body2">
                                <span>Nomor Faktur:</span>
                                <span class="text-weight-bold">{{ props.row.nomorFaktur || '-' }}</span>
                              </div>
                              <div class="row justify-between text-body2">
                                <span>Tanggal Dibuat:</span>
                                <span>{{ props.row.createdAt ? new Date(props.row.createdAt).toLocaleString("id-ID") : '-' }}</span>
                              </div>
                            </q-card-section>
                          </q-card>
                        </div>
                      </div>

                    </div>
                  </q-td>
                </q-tr>
              </template>
            </q-table>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useQuasar } from "quasar";
import { useAssistStore } from "../stores/assistStore";
import { formatRupiah } from "@/utils/rupiahUtils";
import { encryptPayload, wrapEncryptedPayload } from "@/utils/cryptoUtils";

const $q = useQuasar();
const store = useAssistStore();

const loading = ref(false);
const items = ref<any[]>([]);
const searchText = ref("");
const statusFilter = ref("all");

// Form Toggling & States
const showCreateForm = ref(false);
const saving = ref(false);

// Header Info
const isNewSupplier = ref(false);
const selectedDistributor = ref<any>(null);
const allDistributors = ref<any[]>([]);
const distributorOptions = ref<any[]>([]);

const supplierName = ref("");
const picSupplierName = ref("");
const phoneNumberSupplier = ref("000");
const emailSupplier = ref("");
const addressSupplier = ref("");

const nomorFaktur = ref("");
const hospitalPhone = ref("6282225253600");
const transactionDate = ref(formatDateForInput(new Date()));
const receiveDate = ref(formatDateForInput(new Date()));
const dueDatePayment = ref(formatDateForInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))); // Default 14 days due

// PPN Config
const ppnType = ref("include");
const ppnTypeOptions = [
  { label: "PPN Sudah Termasuk", value: "include" },
  { label: "PPN Belum Termasuk", value: "exclude" }
];

// Show Discount Switch
const showDiscountColumn = ref(false);

// Faktur Items List
const formItems = ref<any[]>([]);

// Payment Info
const isPaidDirectly = ref(true);
const selectedAccountTxId = ref("");
const paymentAccountOptions = ref<any[]>([]);
const pharmacyAccount = ref("");

// Creator info
const createdId = ref("6887269187d19b31798b9baf");
const createdName = ref("Ivan");

// Notes
const notes = ref("");
const elseFee = ref<number>(0);

// Global Keydown Listener for Alt+N
function handleGlobalKeydown(e: KeyboardEvent) {
  if (showCreateForm.value && e.altKey && e.key.toLowerCase() === "n") {
    e.preventDefault();
    addNewRow();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});

// Financial Summaries
const subtotalFee = computed(() => {
  // Pre-tax subtotal based on PPN inclusion/exclusion type
  return formItems.value.reduce((sum, item) => {
    const qty = item.quantity || 0;
    if (ppnType.value === "include") {
      const preTaxBase = item.baseFee - item.ppnAmount;
      return sum + (preTaxBase * qty);
    }
    return sum + (item.baseFee * qty);
  }, 0);
});

const totalDiscountVal = computed(() => {
  return formItems.value.reduce((sum, item) => {
    const qty = item.quantity || 0;
    const discountVal = (item.diskonObat || 0) / 100;
    const discountPerUnit = item.buyFee * discountVal;
    return sum + (discountPerUnit * qty);
  }, 0);
});

const totalPpnVal = computed(() => {
  return formItems.value.reduce((sum, item) => sum + ((item.ppnAmount || 0) * (item.quantity || 0)), 0);
});

const taxFee = computed(() => {
  return totalPpnVal.value;
});

const taxPercent = computed(() => {
  return 11; // 11% standard Indonesian PPN
});

const grandTotal = computed(() => {
  // Grand total always accumulates pre-tax subtotal + PPN + extra fees
  return subtotalFee.value + totalPpnVal.value + (elseFee.value || 0);
});

const statusOptions = [
  { label: "Semua Status", value: "all" },
  { label: "Lunas (Paid Off)", value: "paid off" },
  { label: "Hutang (Debt)", value: "debt" }
];

const initialPagination = {
  sortBy: "transactionDate",
  descending: true,
  page: 1,
  rowsPerPage: 10
};

const columns = [
  { name: "code", label: "Invoice Code", align: "left", field: "code", sortable: true },
  { name: "nomorFaktur", label: "No. Faktur", align: "left", field: "nomorFaktur", sortable: true },
  { name: "supplierName", label: "Supplier / Distributor", align: "left", field: "supplierName", sortable: true },
  {
    name: "transactionDate",
    label: "Tgl Transaksi",
    align: "left",
    field: "transactionDate",
    sortable: true,
    sort: (a: any, b: any) => {
      const dateA = a ? new Date(a).getTime() : 0;
      const dateB = b ? new Date(b).getTime() : 0;
      return dateA - dateB;
    },
    format: (val: any) => (val ? new Date(val).toLocaleDateString("id-ID") : "-")
  },
  { name: "totalFee", label: "Total Tagihan", align: "right", field: "totalFee", sortable: true, format: (val: any) => formatRupiah(val) },
  { name: "paidFee", label: "Dibayar", align: "right", field: "paidFee", sortable: true, format: (val: any) => formatRupiah(val) },
  { name: "debtFee", label: "Sisa Hutang", align: "right", field: "debtFee", sortable: true, format: (val: any) => formatRupiah(val) },
  { name: "status", label: "Status", align: "center", field: "status", sortable: true }
];



// Computed Filtered Rows
const filteredItems = computed(() => {
  let list = [...items.value];
  if (searchText.value) {
    const q = searchText.value.toLowerCase().trim();
    list = list.filter((row) => {
      return (
        (row.code || "").toLowerCase().includes(q) ||
        (row.nomorFaktur || "").toLowerCase().includes(q) ||
        (row.supplierName || "").toLowerCase().includes(q)
      );
    });
  }
  if (statusFilter.value !== "all") {
    list = list.filter((row) => row.status === statusFilter.value);
  }
  return list;
});

// Helper Formatting Dates
function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Open Form View
async function openRestockForm() {
  formItems.value = [];
  nomorFaktur.value = "";
  notes.value = "";
  elseFee.value = 0;
  ppnType.value = "include"; // Default to include mode as it is the standard reference image setting
  showDiscountColumn.value = false;
  isPaidDirectly.value = true;
  isNewSupplier.value = false;
  selectedDistributor.value = null;
  
  showCreateForm.value = true;
  
  // Add first row automatically
  addNewRow();

  await Promise.all([
    fetchDistributors(),
    fetchClinicConfig(),
    fetchUserProfile()
  ]);
}

// Fetch Distributors list
async function fetchDistributors() {
  if (!store.assistToken) return;
  try {
    const filter = {
      where: { hospitalId: store.hospitalId }
    };
    const url = `${store.apiBaseUrl}/KTxItemDistributors?filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const res = await fetch(url, { headers: store.getHeaders() });
    if (res.ok) {
      const data = await res.json();
      allDistributors.value = Array.isArray(data) ? data : [];
      distributorOptions.value = [...allDistributors.value];
    }
  } catch (err) {
    console.error("Gagal mengambil daftar distributor:", err);
  }
}

// Fetch Clinic config (Ledger accounts & Phone)
async function fetchClinicConfig() {
  if (!store.assistToken) return;
  try {
    const filter = { where: { hospitalId: store.hospitalId } };
    const url = `${store.apiBaseUrl}/KConfigs?filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const res = await fetch(url, { headers: store.getHeaders() });
    if (res.ok) {
      const configs = await res.json();
      if (configs && configs[0]) {
        pharmacyAccount.value = configs[0].pharmacyAccount || "";
        hospitalPhone.value = configs[0].hospitalPhone || "";
        selectedAccountTxId.value = configs[0].pharmacyAccount || "";
      }
    }
    
    // Fetch payment methods for dropdown
    const resPay = await fetch(`${store.apiBaseUrl}/MetodePembayarans/getAll`, {
      headers: store.getHeaders()
    });
    if (resPay.ok) {
      const list = await resPay.json();
      paymentAccountOptions.value = list
        .filter((item: any) => item.hospitalId === store.hospitalId || !item.hospitalId)
        .map((item: any) => ({
          label: `${item.nama} (${item.tipe})`,
          value: item.id
        }));
      
      // Add default cash account manually if the list doesn't have it explicitly
      if (pharmacyAccount.value && !paymentAccountOptions.value.some(o => o.value === pharmacyAccount.value)) {
        paymentAccountOptions.value.unshift({
          label: "Kas Utama Apotek (Default)",
          value: pharmacyAccount.value
        });
      }
    }
  } catch (err) {
    console.error("Gagal mengambil konfigurasi klinik:", err);
  }
}

// Fetch user profile from current session token
async function fetchUserProfile() {
  if (!store.assistToken) return;
  try {
    const url = `${store.apiBaseUrl}/KConfigAccounts/findOne`;
    const res = await fetch(url, { headers: store.getHeaders() });
    if (res.ok) {
      const data = await res.json();
      createdId.value = data.accountId || data.id || "6887269187d19b31798b9baf";
      createdName.value = data.name || "Ivan";
    }
  } catch (err) {
    console.error("Gagal mengambil data user profile:", err);
  }
}

// Filter distributor list in lookup
function filterDistributor(val: string, update: Function) {
  if (val === "") {
    update(() => {
      distributorOptions.value = allDistributors.value;
    });
    return;
  }
  update(() => {
    const needle = val.toLowerCase();
    distributorOptions.value = allDistributors.value.filter(
      v => v.supplierName.toLowerCase().indexOf(needle) > -1
    );
  });
}

// Fill distributor info fields on change
function onDistributorChange(val: any) {
  const dist = allDistributors.value.find(d => d.id === val || d.supplierName === val);
  if (dist) {
    supplierName.value = dist.supplierName;
    picSupplierName.value = dist.picSupplierName || "";
    phoneNumberSupplier.value = dist.phoneNumberSupplier || "000";
    emailSupplier.value = dist.email || "";
    addressSupplier.value = dist.address || "";
  }
}

const PRODUCT_PAGE_SIZE = 20;

// Fetch products from Assist KStockDepots with pagination
async function fetchProductsFromAssist(searchVal: string, skip: number = 0) {
  if (!store.assistToken) return [];
  const where: any = {
    hospitalId: store.hospitalId,
    name: "Apotek"
  };
  const trimmed = (searchVal || "").trim();
  if (trimmed) {
    where.or = [
      { medName: { like: trimmed, options: "i" } },
      { itemName: { like: trimmed, options: "i" } },
      { barcode: trimmed }
    ];
  }
  const filter = {
    where,
    include: ["KMedicineStocks", "KAKHPStocks"],
    limit: PRODUCT_PAGE_SIZE,
    skip
  };
  const url = `${store.apiBaseUrl}/KStockDepots?filter=${encodeURIComponent(JSON.stringify(filter))}`;
  const res = await fetch(url, { headers: store.getHeaders() });
  if (!res.ok) throw new Error(`Search failed with status ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : [];
  return list.map((item: any) => {
    const isBHP = !!item.KAKHPStocks;
    const catalog = isBHP ? item.KAKHPStocks : item.KMedicineStocks;
    const name = isBHP ? item.itemName : item.medName;
    return {
      label: `${name} (${isBHP ? "BHP" : "Obat"}) - [${catalog?.code || "N/A"}]`,
      value: item,
      isBHP,
      catalog,
      name
    };
  });
}

// Add empty row
function addNewRow() {
  formItems.value.push({
    selectedProduct: null,
    name: "",
    dosage: "-",
    quantity: 1,
    type: "prescription",
    code: "",
    avgHPPOld: 0,
    batchNo: "",
    baseFee: 0,
    buyFee: 0,
    sellNormalFeeNew: 0,
    avgHPPNew: 0,
    sellBPJSFeeNew: 0,
    sellOtcFeeNew: 0,
    discount: 0,
    diskonObat: 0,
    totalFee: 0,
    unit: "PCS",
    expiredDate: formatDateForInput(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
    depotId: "",
    ppnAmount: 0,
    margin: 0,
    prevPrice: 0,
    recPrice: 0,
    options: [],
    searchTerm: "",
    hasMore: true,
    loading: false,
    loadingMore: false,
    _searchSeq: 0,
    itemNotes: "",
    isPendingStock: false,
    isSlotTransacted: true,
    createdAt: new Date().toISOString(),
    createdId: createdId.value,
    hospitalId: store.hospitalId
  });
}

// Autocomplete filter inside each row for Medicine & BHP Search
async function searchItemRow(val: string, update: Function, abort: Function, row: any) {
  row.searchTerm = val || "";
  row.hasMore = true;
  row.loading = true;
  row._searchSeq = (row._searchSeq || 0) + 1;
  const seq = row._searchSeq;

  try {
    const items = await fetchProductsFromAssist(row.searchTerm, 0);
    if (seq !== row._searchSeq) {
      return;
    }
    if (items.length < PRODUCT_PAGE_SIZE) {
      row.hasMore = false;
    }
    update(() => {
      row.options = items;
      row.loading = false;
    });
  } catch (err) {
    console.error("Gagal mencari produk:", err);
    if (seq === row._searchSeq) {
      row.loading = false;
    }
    abort();
  }
}

// Virtual scroll handler for infinite scrolling product options
async function onScrollRow(details: { to: number; ref: any }, row: any) {
  const lastIndex = (row.options?.length || 0) - 1;
  if (row.loading || row.loadingMore || !row.hasMore || lastIndex < 0) {
    return;
  }

  // When scrolling close to the end of the loaded list
  if (details.to >= lastIndex - 3) {
    row.loadingMore = true;
    const seq = row._searchSeq;
    try {
      const nextSkip = row.options.length;
      const newItems = await fetchProductsFromAssist(row.searchTerm || "", nextSkip);
      if (seq !== row._searchSeq) {
        return;
      }
      if (newItems.length < PRODUCT_PAGE_SIZE) {
        row.hasMore = false;
      }
      if (newItems.length > 0) {
        row.options.push(...newItems);
        if (details.ref && typeof details.ref.refresh === "function") {
          setTimeout(() => {
            details.ref.refresh();
          }, 30);
        }
      } else {
        row.hasMore = false;
      }
    } catch (err) {
      console.error("Gagal memuat produk tambahan:", err);
    } finally {
      if (seq === row._searchSeq) {
        row.loadingMore = false;
      }
    }
  }
}

// Prefill form states on selecting catalog item inside row
function onItemSelectRow(selected: any, row: any) {
  if (!selected) return;
  const isBHP = selected.isBHP;
  const rawItem = selected.value;
  const catalog = selected.catalog;
  
  row.name = selected.name;
  row.type = isBHP ? "akhp" : "prescription";
  row.code = catalog?.code || "";
  row.unit = rawItem.unit || catalog?.unit || "PCS";
  row.dosage = rawItem.dosage || "-";
  row.buyFee = catalog?.buyFee || 0;
  row.sellNormalFeeNew = catalog?.sellNormalFee || 0;
  row.avgHPPOld = catalog?.avgHPP || catalog?.buyFee || 0;
  row.depotId = rawItem.id;
  row.prevPrice = catalog?.sellNormalFee || 0;
  
  if (isBHP) {
    row.akhpId = rawItem.akhpId;
    row.normalPriceAKHPNew = catalog?.sellNormalFee || 0;
    if (row.medicineId) delete row.medicineId;
  } else {
    row.medicineId = rawItem.medicineId;
    row.masterCode = "";
    if (row.akhpId) delete row.akhpId;
  }

  recalcRow(row);
}

// Inline edit row calculation helper
function recalcRow(row: any) {
  const discountVal = (row.diskonObat || 0) / 100;
  row.discount = discountVal;
  row.baseFee = Math.round(row.buyFee * (1 - discountVal));
  row.feeDiscount = row.buyFee - row.baseFee;
  row.avgHPPNew = row.baseFee;

  // Calculate row level PPN and Row Subtotal dynamically
  if (ppnType.value === "include") {
    row.ppnAmount = Math.round(row.baseFee - (row.baseFee / 1.11));
    row.totalFee = row.baseFee * row.quantity;
  } else {
    // exclude mode
    row.ppnAmount = Math.round(row.baseFee * 0.11);
    row.totalFee = (row.baseFee + row.ppnAmount) * row.quantity;
  }

  // Margin calculation (Retail formula: profit / selling price)
  if (row.sellNormalFeeNew > 0) {
    row.margin = ((row.sellNormalFeeNew - row.baseFee) / row.sellNormalFeeNew) * 100;
  } else {
    row.margin = 0;
  }

  // Recommended Selling Price helper (15% markup)
  row.recPrice = Math.round(row.baseFee * 1.15);
}

// Recalculates all rows when PPN type changes
function recalcAllRows() {
  formItems.value.forEach(recalcRow);
}

function removeRow(index: number) {
  formItems.value.splice(index, 1);
}

// Row Reordering
function moveRowUp(index: number) {
  if (index === 0) return;
  const temp = formItems.value[index];
  formItems.value[index] = formItems.value[index - 1];
  formItems.value[index - 1] = temp;
}

function moveRowDown(index: number) {
  if (index === formItems.value.length - 1) return;
  const temp = formItems.value[index];
  formItems.value[index] = formItems.value[index + 1];
  formItems.value[index + 1] = temp;
}

// Trigger Confirmation Dialog before saving
function confirmSaveTransaction() {
  const validItems = formItems.value.filter(item => item.code && item.quantity > 0);
  if (validItems.length === 0) {
    $q.notify({ type: "negative", message: "Silakan masukkan minimal 1 barang dengan benar." });
    return;
  }
  if (!nomorFaktur.value.trim()) {
    $q.notify({ type: "negative", message: "Nomor faktur wajib diisi." });
    return;
  }
  if (isNewSupplier.value && !supplierName.value.trim()) {
    $q.notify({ type: "negative", message: "Nama supplier baru wajib diisi." });
    return;
  }

  $q.dialog({
    title: "Konfirmasi Simpan Faktur",
    message: "Apakah Anda yakin ingin menyimpan transaksi restock ini? Transaksi yang sudah disimpan bersifat final dan tidak dapat diubah atau dihapus kembali.",
    cancel: {
      label: "Batal",
      color: "grey-7",
      flat: true
    },
    ok: {
      label: "Ya, Simpan",
      color: "teal",
      flat: false
    },
    persistent: true
  }).onOk(() => {
    saveRestockTransaction(validItems);
  });
}

// Submit Transaction to Clinic API
async function saveRestockTransaction(validItems: any[]) {
  saving.value = true;
  try {
    const processedItems = validItems.map(item => {
      const copy = { ...item };
      delete copy.options;
      delete copy.selectedProduct;
      delete copy.ppnAmount;
      delete copy.margin;
      delete copy.prevPrice;
      delete copy.recPrice;
      delete copy.searchTerm;
      delete copy.hasMore;
      delete copy.loading;
      delete copy.loadingMore;
      delete copy._searchSeq;
      copy.expiredDate = new Date(copy.expiredDate).toISOString();
      return copy;
    });

    const rawPayload: any = {
      milis: Date.now(),
      date: new Date(transactionDate.value).toISOString(),
      hospitalId: store.hospitalId,
      createdAt: new Date().toISOString(),
      createdId: createdId.value,
      createdName: createdName.value,
      paidFee: isPaidDirectly.value ? grandTotal.value : 0,
      item: processedItems,
      payment: isPaidDirectly.value ? [
        {
          isOutcome: true,
          totalFee: grandTotal.value,
          percentageTotal: 100,
          status: "paid",
          type: "Langsung",
          name: "Tunai",
          paidName: createdName.value,
          change: 0,
          createdAt: new Date().toISOString(),
          createdName: createdName.value,
          transactionDate: new Date().toISOString(),
          isNeedClaim: false,
          discount: totalDiscountVal.value,
          accountTxId: selectedAccountTxId.value || pharmacyAccount.value
        }
      ] : [],
      emailTo: "",
      emailCc: "",
      fileAttach: [],
      isSendEmail: false,
      hospitalPhone: hospitalPhone.value,
      dueDatePayment: new Date(dueDatePayment.value).toISOString(),
      nomorFaktur: nomorFaktur.value,
      supplierName: isNewSupplier.value ? supplierName.value : supplierName.value || "PT. AAM",
      picSupplierName: picSupplierName.value,
      phoneNumberSupplier: phoneNumberSupplier.value,
      status: isPaidDirectly.value ? "paid off" : "debt",
      isOutcome: true,
      transactionDate: new Date(transactionDate.value).toISOString(),
      debtFee: isPaidDirectly.value ? 0 : grandTotal.value,
      creditFee: 0,
      totalFee: grandTotal.value,
      taxFee: taxFee.value,
      taxPercent: taxPercent.value,
      elseFee: elseFee.value || 0,
      accountTxId: selectedAccountTxId.value || pharmacyAccount.value
    };

    if (selectedDistributor.value && !isNewSupplier.value) {
      rawPayload.distributorId = selectedDistributor.value;
    }

    const plainTextBody = JSON.stringify(rawPayload);
    const encryptedBody = await encryptPayload(plainTextBody);
    const wrappedPayload = wrapEncryptedPayload(encryptedBody);

    const url = `${store.apiBaseUrl}/KTxes/payment`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...store.getHeaders(),
        "content-type": "application/json;charset=UTF-8"
      },
      body: JSON.stringify(wrappedPayload)
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status} ${response.statusText}`);
    }

    $q.notify({
      type: "positive",
      message: "Faktur restock berhasil disimpan!",
      position: "top"
    });
    
    showCreateForm.value = false;
    await fetchTransactions();
  } catch (err) {
    console.error("Gagal menyimpan transaksi:", err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan transaksi restock.",
      position: "top"
    });
  } finally {
    saving.value = false;
  }
}

// Fetch Transactions list
async function fetchTransactions() {
  if (!store.assistToken) return;

  loading.value = true;
  items.value = [];
  try {
    const filter = {
      where: {
        hospitalId: store.hospitalId,
        distributorId: { neq: null }
      },
      include: ["Distributors", "Payments"]
    };

    const url = `${store.apiBaseUrl}/KTxes?filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const res = await fetch(url, {
      method: "GET",
      headers: store.getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Gagal fetch data: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    items.value = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(err);
    $q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Gagal mengambil data transaksi restock.",
      position: "top"
    });
  } finally {
    loading.value = false;
  }
}

watch(
  () => store.assistToken,
  (newToken) => {
    if (newToken) {
      fetchTransactions();
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}

.text-xxs {
  font-size: 10px;
}

.line-height-tight {
  line-height: 1.2;
}

.border-bottom {
  border-bottom: 1px solid #e0e0e0;
}

.restock-form-container {
  background-color: #f7fafc;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}

.shadow-subtle {
  box-shadow: 0 1px 4px rgba(0,0,0,0.02) !important;
}

.invoice-table {
  width: 100%;
}

.invoice-table th {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #546e7a;
  letter-spacing: 0.5px;
}

.invoice-item-row:hover {
  background-color: #f9fbfb;
}

.align-top-row td {
  vertical-align: top;
  padding-top: 8px;
}

.inline-edit-input :deep(.q-field__control) {
  height: 32px;
  padding: 0 4px;
}

.inline-edit-input :deep(input) {
  font-size: 13px;
  height: 32px;
}
</style>
