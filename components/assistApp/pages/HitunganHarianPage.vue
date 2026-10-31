<template>
  <div class="hitungan-harian-page q-pa-sm">
    <!-- Header Section -->
    <div class="row items-center justify-between q-mb-sm">
      <div class="text-h5 text-teal font-weight-bold row items-center">
        <q-icon name="calculate" class="q-mr-sm" size="32px" />
        Hitungan Harian Per Shift & Transaksi
      </div>
      <div v-if="statusText" class="text-caption text-grey-7">
        {{ statusText }}
      </div>
    </div>

    <!-- Date Filters Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-py-sm">
        <div class="row q-col-gutter-sm items-center">
          <div class="col-12 col-sm-3 col-md-2">
            <q-input
              v-model="startDate"
              type="date"
              outlined
              dense
              label="Mulai Tanggal"
              color="teal"
              stack-label
            />
          </div>
          <div class="col-12 col-sm-3 col-md-2">
            <q-input
              v-model="endDate"
              type="date"
              outlined
              dense
              label="Akhir Tanggal"
              color="teal"
              stack-label
            />
          </div>
          <div class="col-12 col-sm-6 col-md-4 row q-gutter-x-sm">
            <q-btn
              color="teal"
              icon="play_arrow"
              label="Muat Data"
              :loading="loading"
              @click="loadSummaries"
              class="col"
              dense
              no-caps
            />
            <q-btn
              color="positive"
              icon="file_download"
              label="Export Excel"
              :disabled="!canExport"
              :loading="exporting"
              @click="exportToExcel"
              class="col"
              dense
              no-caps
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Global Summary KPI Cards (When Data Available) -->
    <div v-if="summaries.length" class="row q-col-gutter-sm q-mb-md">
      <!-- Total Omset Card -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="bg-teal-1 text-teal-10">
          <q-card-section class="q-py-sm">
            <div class="text-caption text-weight-medium text-teal-8">Total Omset Keseluruhan</div>
            <div class="text-h6 text-weight-bolder">{{ formatRupiah(globalMetrics.totalOmset) }}</div>
            <div class="text-caption row justify-between q-mt-xs text-grey-8">
              <span>Apotek: <strong>{{ formatRupiah(globalMetrics.totalApotek) }}</strong></span>
              <span>Klinik: <strong>{{ formatRupiah(globalMetrics.totalKlinik) }}</strong></span>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Total HPP Card -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="bg-orange-1 text-orange-10">
          <q-card-section class="q-py-sm">
            <div class="text-caption text-weight-medium text-orange-9">Total HPP (Harga Beli)</div>
            <div class="text-h6 text-weight-bolder">{{ formatRupiah(globalMetrics.totalHpp) }}</div>
            <div class="text-caption text-grey-8 q-mt-xs">
              Biaya modal persediaan terjual
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Total Gross Profit Card -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="bg-green-1 text-green-10">
          <q-card-section class="q-py-sm">
            <div class="text-caption text-weight-medium text-green-9">Laba Kotor (Apotek)</div>
            <div class="text-h6 text-weight-bolder">
              {{ formatRupiah(globalMetrics.totalGrossProfit) }}
              <span class="text-caption text-weight-bold text-green-8">
                ({{ globalMetrics.marginPercent.toFixed(1) }}%)
              </span>
            </div>
            <div class="text-caption text-grey-8 q-mt-xs">
              Rata-rata Margin Penjualan
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Total Transactions Card -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="bg-blue-1 text-blue-10">
          <q-card-section class="q-py-sm">
            <div class="text-caption text-weight-medium text-blue-9">Total Transaksi & Shift</div>
            <div class="text-h6 text-weight-bolder">
              {{ globalMetrics.totalTransactions }} <span class="text-subtitle2 font-weight-normal">transaksi</span>
            </div>
            <div class="text-caption row justify-between q-mt-xs text-grey-8">
              <span>Shift: <strong>{{ globalMetrics.totalShift }}</strong></span>
              <span>Online: <strong>{{ globalMetrics.totalOnlineTransactions }}</strong></span>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Channel Comparison KPI Cards: Offline vs Online Apotek -->
    <div v-if="summaries.length" class="row q-col-gutter-sm q-mb-md">
      <!-- Apotek Offline Card -->
      <div class="col-12 col-md-6">
        <q-card flat bordered class="bg-blue-grey-1 text-blue-grey-10">
          <q-card-section class="q-py-sm">
            <div class="row items-center justify-between">
              <div class="text-subtitle2 text-weight-bolder text-teal-9 row items-center">
                <q-icon name="storefront" size="20px" class="q-mr-xs" />
                Apotek Offline (Kasir Fisik)
              </div>
              <q-badge color="teal" text-color="white" class="text-caption text-weight-bold">
                Margin: {{ globalMetrics.marginPercentOffline.toFixed(1) }}%
              </q-badge>
            </div>
            <div class="row q-col-gutter-sm q-mt-xs">
              <div class="col-4">
                <div class="text-caption text-grey-7">Omset Kasir</div>
                <div class="text-weight-bold font-mono">{{ formatRupiah(globalMetrics.offlineOmset) }}</div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-7">HPP Offline</div>
                <div class="text-weight-bold font-mono text-orange-9">{{ formatRupiah(globalMetrics.hppOffline) }}</div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-7">Laba Kotor</div>
                <div class="text-weight-bold font-mono text-positive">{{ formatRupiah(globalMetrics.grossProfitOffline) }}</div>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Apotek Online Card -->
      <div class="col-12 col-md-6">
        <q-card flat bordered class="bg-deep-purple-1 text-deep-purple-10">
          <q-card-section class="q-py-sm">
            <div class="row items-center justify-between">
              <div class="text-subtitle2 text-weight-bolder text-deep-purple-9 row items-center">
                <q-icon name="shopping_cart" size="20px" class="q-mr-xs" />
                Apotek Online (Marketplace)
              </div>
              <q-badge color="deep-purple" text-color="white" class="text-caption text-weight-bold">
                Margin: {{ globalMetrics.marginPercentOnline.toFixed(1) }}%
              </q-badge>
            </div>
            <div class="row q-col-gutter-sm q-mt-xs">
              <div class="col-4">
                <div class="text-caption text-grey-7">Omset Online</div>
                <div class="text-weight-bold font-mono">{{ formatRupiah(globalMetrics.onlineOmset) }}</div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-7">HPP Online</div>
                <div class="text-weight-bold font-mono text-orange-9">{{ formatRupiah(globalMetrics.hppOnline) }}</div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-7">Laba Kotor</div>
                <div class="text-weight-bold font-mono text-positive">{{ formatRupiah(globalMetrics.grossProfitOnline) }}</div>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Navigation Tabs: Shift View vs Transactions View -->
    <q-card flat bordered class="q-mb-md">
      <q-tabs
        v-model="activeTab"
        dense
        class="text-teal"
        active-color="teal"
        indicator-color="teal"
        align="left"
        narrow-indicator
      >
        <q-tab name="shift" icon="schedule" label="Halaman Shift (Ringkasan Shift)">
          <q-badge color="teal" floating v-if="summaries.length">
            {{ summaries.length }}
          </q-badge>
        </q-tab>
        <q-tab name="transaksi" icon="receipt_long" label="Halaman Transaksi (1 Row 1 Transaksi)">
          <q-badge color="primary" floating v-if="allTransactions.length">
            {{ allTransactions.length }}
          </q-badge>
        </q-tab>
      </q-tabs>
      <q-separator />

      <!-- TAB 1: HALAMAN SHIFT -->
      <div v-show="activeTab === 'shift'">
        <q-table
          :rows="summaries"
          :columns="shiftColumns"
          row-key="key"
          flat
          :loading="loading"
          :pagination="paginationShift"
          no-data-label="Tidak ada data shift ditemukan untuk rentang tanggal terpilih."
          class="shift-table"
        >
          <!-- Custom Body with Expansions -->
          <template v-slot:body="props">
            <q-tr :props="props">
              <q-td v-for="col in props.cols" :key="col.name" :props="props">
                <template v-if="col.name === 'action'">
                  <q-btn
                    size="sm"
                    color="teal"
                    round
                    flat
                    :icon="props.expand ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
                    @click="props.expand = !props.expand"
                  >
                    <q-tooltip>{{ props.expand ? 'Tutup Detail' : 'Buka Detail Transaksi' }}</q-tooltip>
                  </q-btn>
                </template>
                <template v-else-if="col.name === 'shift'">
                  <q-chip
                    dense
                    size="sm"
                    :color="props.row.shift === 'Pagi' ? 'amber-2' : 'blue-2'"
                    :text-color="props.row.shift === 'Pagi' ? 'amber-10' : 'blue-10'"
                    class="text-weight-bold"
                  >
                    {{ props.row.shift }}
                  </q-chip>
                </template>
                <template v-else-if="col.name === 'transactionCount'">
                  <q-badge color="grey-3" text-color="grey-9" class="text-weight-bold">
                    {{ props.row.transactionCount }} tx
                  </q-badge>
                </template>
                <template v-else-if="col.name === 'grossProfit'">
                  <span class="text-weight-bold text-positive">
                    {{ formatRupiah(props.row.grossProfit) }}
                  </span>
                </template>
                <template v-else-if="col.name === 'marginPercent'">
                  <span
                    class="text-weight-bold"
                    :class="props.row.marginPercent >= 20 ? 'text-positive' : props.row.marginPercent > 0 ? 'text-orange-9' : 'text-negative'"
                  >
                    {{ props.row.marginPercent.toFixed(1) }}%
                  </span>
                </template>
                <template v-else-if="col.name === 'marginOffline'">
                  <span
                    class="text-weight-bold"
                    :class="props.row.marginPercentOffline >= 20 ? 'text-positive' : props.row.marginPercentOffline > 0 ? 'text-teal-9' : 'text-negative'"
                  >
                    {{ props.row.marginPercentOffline.toFixed(1) }}%
                  </span>
                </template>
                <template v-else-if="col.name === 'marginOnline'">
                  <span
                    class="text-weight-bold"
                    :class="props.row.marginPercentOnline >= 20 ? 'text-positive' : props.row.marginPercentOnline > 0 ? 'text-deep-purple-9' : 'text-negative'"
                  >
                    {{ props.row.marginPercentOnline.toFixed(1) }}%
                  </span>
                </template>
                <template v-else>
                  {{ col.value }}
                </template>
              </q-td>
            </q-tr>

            <!-- Row Expansion: Shift Details Stack -->
            <q-tr v-show="props.expand" :props="props" class="expanded-detail-row">
              <q-td colspan="100%" class="bg-grey-1 q-pa-md">
                <!-- Shift Mini Summary Bar -->
                <div class="row items-center justify-between q-mb-sm bg-teal-1 q-pa-sm rounded-borders border-teal-light">
                  <div class="row items-center q-gutter-x-md">
                    <span class="text-subtitle2 text-teal-9 text-weight-bolder">
                      Shift {{ props.row.shift }} • {{ props.row.displayDate }}
                    </span>
                    <span class="text-caption text-grey-8">
                      Jumlah: <strong>{{ props.row.details.length }} Transaksi</strong>
                    </span>
                    <span class="text-caption text-grey-8">
                      Omset: <strong>{{ formatRupiah(props.row.totalOmset) }}</strong>
                    </span>
                    <span class="text-caption text-grey-8">
                      HPP: <strong>{{ formatRupiah(props.row.hpp) }}</strong>
                    </span>
                    <span class="text-caption text-positive">
                      Laba Kotor: <strong>{{ formatRupiah(props.row.grossProfit) }} ({{ props.row.marginPercent.toFixed(1) }}%)</strong>
                    </span>
                  </div>
                  <q-btn
                    size="xs"
                    color="teal"
                    outline
                    label="Lihat di Tab Transaksi"
                    icon="open_in_new"
                    no-caps
                    @click="filterToShift(props.row)"
                  />
                </div>

                <!-- Shift Transactions List -->
                <q-list bordered separator class="bg-white rounded-borders" v-if="props.row.details.length">
                  <q-item v-for="detail in props.row.details" :key="detail.transactionId" class="q-py-md">
                    <q-item-section>
                      <!-- Header Row: Code, Time, Online Badge, Patient, Kasir -->
                      <div class="row items-center justify-between q-mb-xs">
                        <div class="row items-center q-gutter-x-sm">
                          <span class="text-subtitle2 text-weight-bold text-teal">
                            {{ detail.code || "-" }}
                          </span>
                          <span class="text-caption text-grey-7 font-mono">
                            {{ detail.time }}
                          </span>
                          <!-- Online Order Badge -->
                          <template v-if="detail.onlineInfo.isOnline">
                            <q-badge
                              :style="getPlatformBadgeStyle(detail.onlineInfo.platform)"
                              class="q-px-xs text-weight-bold"
                            >
                              {{ detail.onlineInfo.platform || "Online" }}
                            </q-badge>
                            <span v-if="detail.onlineInfo.orderNo" class="text-caption text-weight-bold text-teal-9 font-mono">
                              No. Pesanan: {{ detail.onlineInfo.orderNo }}
                            </span>
                            <span v-if="detail.onlineInfo.resi" class="text-caption text-grey-8 font-mono">
                              (Resi: {{ detail.onlineInfo.resi }})
                            </span>
                          </template>
                        </div>

                        <!-- Right: Patient & Kasir -->
                        <div class="text-caption">
                          Pasien: <strong class="text-grey-9">{{ detail.patientName }}</strong>
                          <span class="text-grey-6 q-ml-sm">• Kasir: {{ detail.createdName }}</span>
                        </div>
                      </div>
                      <q-separator class="q-my-xs" />

                      <!-- Financial Summary Row -->
                      <div class="row q-col-gutter-sm text-caption text-grey-8 q-mb-xs">
                        <div class="col-12 col-md-5">
                          <strong>Pembayaran:</strong>
                          <span class="q-ml-xs text-teal-9 text-weight-medium">{{ detail.paymentMethod }}</span>
                          <span class="q-ml-xs">({{ formatRupiah(detail.totalFee) }})</span>
                        </div>
                        <div class="col-12 col-md-4">
                          <strong>HPP:</strong> {{ formatRupiah(detail.hpp) }} •
                          <strong>Laba:</strong>
                          <span class="text-positive text-weight-bold q-ml-xs">
                            {{ formatRupiah(detail.grossProfit) }} ({{ detail.marginPercent.toFixed(1) }}%)
                          </span>
                        </div>
                        <div class="col-12 col-md-3 text-right">
                          <q-badge
                            dense
                            :color="detail.incomeType === 'klinik' ? 'purple-2' : detail.incomeType === 'campuran' ? 'amber-3' : 'teal-2'"
                            :text-color="detail.incomeType === 'klinik' ? 'purple-10' : detail.incomeType === 'campuran' ? 'amber-10' : 'teal-10'"
                            class="text-weight-bold text-capitalize"
                          >
                            {{ detail.incomeType }}
                          </q-badge>
                        </div>
                      </div>

                      <!-- Items List inside Shift Row -->
                      <div class="q-mt-xs bg-grey-1 q-pa-xs rounded-borders">
                        <div class="text-caption text-weight-medium text-grey-7 q-mb-xs">Item Transaksi:</div>
                        <div
                          v-for="item in detail.items"
                          :key="item.id"
                          class="row justify-between text-caption text-grey-9 font-mono q-py-xs border-bottom-light"
                        >
                          <div class="col-12 col-sm-7">
                            • {{ item.name }}
                            <span v-if="item.unit" class="text-grey-6">({{ item.unit }})</span>
                            <span class="text-weight-bold q-ml-xs">x{{ item.quantity }}</span>
                            <span v-if="item.category" class="text-grey-6 text-italic q-ml-xs">[{{ item.category }}]</span>
                          </div>
                          <div class="col-12 col-sm-5 text-right">
                            <span>Omset {{ formatRupiah(item.totalFee) }}</span>
                            <span class="text-grey-7 q-ml-sm">• HPP {{ formatRupiah(item.totalHpp) }}</span>
                            <span class="text-positive text-weight-medium q-ml-sm">
                              • Margin {{ formatRupiah(item.grossProfit || 0) }}
                            </span>
                          </div>
                        </div>
                        <div v-if="!detail.items.length" class="text-grey-5 text-italic text-caption">
                          Tidak ada data item tercatat.
                        </div>
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-else class="text-caption text-grey-5 text-italic q-pa-sm text-center">
                  Tidak ada transaksi tercatat pada shift ini.
                </div>
              </q-td>
            </q-tr>
          </template>

          <!-- Grand Total Bottom Row -->
          <template v-slot:bottom-row v-if="summaries.length">
            <q-tr class="bg-teal-1 text-weight-bold">
              <q-td>TOTAL</q-td>
              <q-td>-</q-td>
              <q-td align="right">{{ globalMetrics.totalTransactions }} tx</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.apotekCash) }}</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.apotekMandiri) }}</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.apotekQris) }}</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.apotekShopee) }}</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.apotekTiktok) }}</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.apotekBlibli) }}</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.apotekGoApotik) }}</q-td>
              <q-td align="right" class="text-teal-9">{{ formatRupiah(shiftTotals.apotekTotal) }}</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.klinikCash) }}</q-td>
              <q-td align="right">{{ formatRupiah(shiftTotals.klinikDebit) }}</q-td>
              <q-td align="right" class="text-purple-9">{{ formatRupiah(shiftTotals.klinikTotal) }}</q-td>
              <q-td align="right" class="text-teal-10 text-weight-bolder">{{ formatRupiah(globalMetrics.totalOmset) }}</q-td>
              <q-td align="right" class="text-orange-9">{{ formatRupiah(globalMetrics.totalHpp) }}</q-td>
              <q-td align="right" class="text-positive">{{ formatRupiah(globalMetrics.totalGrossProfit) }}</q-td>
              <q-td align="right" class="text-positive">{{ globalMetrics.marginPercent.toFixed(1) }}%</q-td>
              <q-td align="right" class="text-teal-9">{{ globalMetrics.marginPercentOffline.toFixed(1) }}%</q-td>
              <q-td align="right" class="text-deep-purple-9">{{ globalMetrics.marginPercentOnline.toFixed(1) }}%</q-td>
              <q-td align="center">-</q-td>
            </q-tr>
          </template>
        </q-table>
      </div>

      <!-- TAB 2: HALAMAN TRANSAKSI (1 ROW 1 TRANSAKSI) -->
      <div v-show="activeTab === 'transaksi'">
        <!-- Filter Toolbar -->
        <div class="q-pa-md bg-grey-1 border-bottom">
          <div class="row q-col-gutter-sm items-center">
            <!-- Search Input -->
            <div class="col-12 col-md-4">
              <q-input
                v-model="searchFilter"
                outlined
                dense
                clearable
                placeholder="Cari No Invoice, No Pesanan Online, Resi, Pasien, Kasir, Obat..."
                color="teal"
                bg-color="white"
              >
                <template v-slot:prepend>
                  <q-icon name="search" />
                </template>
              </q-input>
            </div>

            <!-- Filter Shift -->
            <div class="col-6 col-sm-3 col-md-2">
              <q-select
                v-model="shiftFilter"
                outlined
                dense
                emit-value
                map-options
                :options="shiftFilterOptions"
                label="Filter Shift"
                color="teal"
                bg-color="white"
              />
            </div>

            <!-- Filter Saluran / Sumber -->
            <div class="col-6 col-sm-3 col-md-2">
              <q-select
                v-model="sourceFilter"
                outlined
                dense
                emit-value
                map-options
                :options="sourceFilterOptions"
                label="Kategori / Saluran"
                color="teal"
                bg-color="white"
              />
            </div>

            <!-- Filter Platform Online -->
            <div class="col-6 col-sm-3 col-md-2">
              <q-select
                v-model="platformFilter"
                outlined
                dense
                emit-value
                map-options
                :options="platformFilterOptions"
                label="Platform Online"
                color="teal"
                bg-color="white"
              />
            </div>

            <!-- Reset Button & Counter -->
            <div class="col-6 col-sm-3 col-md-2 text-right">
              <q-btn
                flat
                dense
                color="grey-7"
                icon="restart_alt"
                label="Reset Filter"
                no-caps
                @click="resetTransactionFilters"
                v-if="searchFilter || shiftFilter !== 'all' || sourceFilter !== 'all' || platformFilter !== 'all'"
              />
            </div>
          </div>

          <!-- Quick Stats Pill for Filtered Transactions -->
          <div class="row items-center q-gutter-x-md q-mt-xs text-caption text-grey-8">
            <span>
              Menampilkan: <strong>{{ filteredTransactions.length }}</strong> dari <strong>{{ allTransactions.length }}</strong> transaksi
            </span>
            <span v-if="filteredTransactions.length !== allTransactions.length" class="text-teal-9">
              • Omset Terfilter: <strong>{{ formatRupiah(filteredMetrics.omset) }}</strong>
            </span>
            <span v-if="filteredTransactions.length !== allTransactions.length" class="text-orange-9">
              • HPP: <strong>{{ formatRupiah(filteredMetrics.hpp) }}</strong>
            </span>
            <span v-if="filteredTransactions.length !== allTransactions.length" class="text-positive">
              • Laba: <strong>{{ formatRupiah(filteredMetrics.grossProfit) }} ({{ filteredMetrics.marginPercent.toFixed(1) }}%)</strong>
            </span>
          </div>
        </div>

        <!-- Alert Banner when Search Yields No Results but Day Has Transactions -->
        <div
          v-if="!loading && searchFilter && !filteredTransactions.length && allTransactions.length > 0"
          class="q-pa-sm q-mx-md q-mt-sm bg-amber-1 text-amber-10 rounded-borders row items-center justify-between border-amber"
        >
          <div class="row items-center q-gutter-x-sm col-12 col-md-9">
            <q-icon name="info" size="sm" color="amber-9" />
            <div class="text-caption">
              Tidak ditemukan transaksi dengan kata kunci <strong>"{{ searchFilter }}"</strong>, tetapi ada <strong>{{ allTransactions.length }} transaksi kasir</strong> pada tanggal ini. Kemungkinan kasir tidak mencatat No. Pesanan / Resi di sistem.
            </div>
          </div>
          <div class="col-12 col-md-3 text-right q-mt-xs q-mt-md-none">
            <q-btn
              size="sm"
              color="amber-9"
              outline
              label="Hapus Filter & Tampilkan Semua"
              icon="filter_alt_off"
              @click="searchFilter = ''"
              no-caps
            />
          </div>
        </div>

        <!-- 1 Row 1 Transaction Table -->
        <q-table
          :rows="filteredTransactions"
          :columns="transactionColumns"
          row-key="transactionId"
          flat
          :loading="loading"
          :pagination="paginationTransaksi"
          no-data-label="Tidak ada data transaksi yang cocok dengan filter."
          class="transaction-table"
        >
          <!-- Custom Body with Expansions -->
          <template v-slot:body="props">
            <q-tr :props="props" :class="{ 'bg-teal-0': props.expand }">
              <q-td v-for="col in props.cols" :key="col.name" :props="props">
                <!-- Action / Expand Column -->
                <template v-if="col.name === 'action'">
                  <q-btn
                    size="sm"
                    color="teal"
                    round
                    flat
                    :icon="props.expand ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
                    @click="props.expand = !props.expand"
                  >
                    <q-tooltip>{{ props.expand ? 'Tutup Rincian' : 'Buka Rincian Item' }}</q-tooltip>
                  </q-btn>
                </template>

                <!-- No Index Column -->
                <template v-else-if="col.name === 'index'">
                  <span class="text-caption text-grey-6 font-mono">{{ props.pageIndex + 1 }}</span>
                </template>

                <!-- Time & Date Column -->
                <template v-else-if="col.name === 'time'">
                  <div class="font-mono text-weight-bold text-grey-9">{{ props.row.time }}</div>
                  <div class="text-caption text-grey-6">{{ props.row.dateStr }}</div>
                </template>

                <!-- Shift Badge -->
                <template v-else-if="col.name === 'shift'">
                  <q-chip
                    dense
                    size="sm"
                    :color="props.row.shift === 'Pagi' ? 'amber-2' : 'blue-2'"
                    :text-color="props.row.shift === 'Pagi' ? 'amber-10' : 'blue-10'"
                    class="text-weight-bold"
                  >
                    {{ props.row.shift }}
                  </q-chip>
                </template>

                <!-- Code / Invoice -->
                <template v-else-if="col.name === 'code'">
                  <div class="text-weight-bold text-teal font-mono">
                    {{ props.row.code }}
                  </div>
                </template>

                <!-- Online Order & Reference Info -->
                <template v-else-if="col.name === 'onlineOrder'">
                  <div v-if="props.row.onlineInfo.isOnline" class="q-gutter-y-xs">
                    <div class="row items-center q-gutter-x-xs no-wrap">
                      <q-badge
                        :style="getPlatformBadgeStyle(props.row.onlineInfo.platform)"
                        class="text-weight-bold"
                      >
                        {{ props.row.onlineInfo.platform || "Online" }}
                      </q-badge>
                      <span
                        v-if="props.row.onlineInfo.orderNo"
                        class="text-weight-bold font-mono text-teal-10 cursor-pointer"
                        @click="copyText(props.row.onlineInfo.orderNo, 'No. Pesanan')"
                      >
                        {{ props.row.onlineInfo.orderNo }}
                        <q-tooltip>Klik untuk salin No. Pesanan</q-tooltip>
                      </span>
                    </div>
                    <div v-if="props.row.onlineInfo.resi" class="text-caption text-grey-7 font-mono">
                      Resi: {{ props.row.onlineInfo.resi }}
                    </div>
                  </div>
                  <div v-else class="text-caption text-grey-5">
                    Offline POS
                  </div>
                </template>

                <!-- Patient Name -->
                <template v-else-if="col.name === 'patientName'">
                  <div class="text-weight-medium text-grey-9">
                    {{ props.row.patientName }}
                  </div>
                  <div v-if="props.row.doctorName" class="text-caption text-grey-6">
                    dr. {{ props.row.doctorName }}
                  </div>
                </template>

                <!-- Payment Method -->
                <template v-else-if="col.name === 'paymentMethod'">
                  <div class="text-caption text-weight-medium">
                    {{ props.row.paymentMethod }}
                  </div>
                  <div class="text-caption text-grey-6" v-if="props.row.createdName">
                    Kasir: {{ props.row.createdName }}
                  </div>
                </template>

                <!-- Income Type -->
                <template v-else-if="col.name === 'incomeType'">
                  <q-badge
                    dense
                    :color="props.row.incomeType === 'klinik' ? 'purple-2' : props.row.incomeType === 'campuran' ? 'amber-2' : 'teal-2'"
                    :text-color="props.row.incomeType === 'klinik' ? 'purple-10' : props.row.incomeType === 'campuran' ? 'amber-10' : 'teal-10'"
                    class="text-weight-bold text-capitalize"
                  >
                    {{ props.row.incomeType }}
                  </q-badge>
                </template>

                <!-- Omset -->
                <template v-else-if="col.name === 'totalFee'">
                  <span class="text-weight-bold text-grey-9 font-mono">
                    {{ formatRupiah(props.row.totalFee) }}
                  </span>
                </template>

                <!-- HPP -->
                <template v-else-if="col.name === 'hpp'">
                  <span class="text-orange-9 font-mono">
                    {{ formatRupiah(props.row.hpp) }}
                  </span>
                </template>

                <!-- Gross Profit & Margin % -->
                <template v-else-if="col.name === 'grossProfit'">
                  <div class="text-positive text-weight-bold font-mono">
                    {{ formatRupiah(props.row.grossProfit) }}
                  </div>
                  <div
                    class="text-caption text-weight-bold"
                    :class="props.row.marginPercent >= 20 ? 'text-positive' : props.row.marginPercent > 0 ? 'text-orange-9' : 'text-negative'"
                  >
                    {{ props.row.marginPercent.toFixed(1) }}%
                  </div>
                </template>

                <!-- Default Fallback -->
                <template v-else>
                  {{ col.value }}
                </template>
              </q-td>
            </q-tr>

            <!-- Row Expansion: Full Transaction Itemization & Metadata -->
            <q-tr v-show="props.expand" :props="props" class="expanded-detail-row">
              <q-td colspan="100%" class="bg-grey-1 q-pa-md">
                <!-- Online Order Banner (If Online) -->
                <div
                  v-if="props.row.onlineInfo.isOnline"
                  class="q-mb-md q-pa-sm bg-white rounded-borders border-teal-light shadow-1"
                >
                  <div class="row items-center justify-between">
                    <div class="row items-center q-gutter-x-sm">
                      <q-badge
                        :style="getPlatformBadgeStyle(props.row.onlineInfo.platform)"
                        class="text-subtitle2 q-px-sm"
                      >
                        {{ props.row.onlineInfo.platform || "Pesanan Online" }}
                      </q-badge>
                      <span class="text-subtitle2 text-weight-bolder text-teal-10">
                        Informasi Pesanan Online & Ekspedisi
                      </span>
                    </div>
                    <q-badge color="grey-3" text-color="grey-9" class="text-caption">
                      Sumber: {{ props.row.onlineInfo.source === 'desty' ? 'Desty Omnichannel Sync' : 'Input Kasir' }}
                    </q-badge>
                  </div>

                  <q-separator class="q-my-sm" />

                  <div class="row q-col-gutter-md text-caption">
                    <div class="col-12 col-sm-4">
                      <span class="text-grey-7">Nomor Pesanan / Order SN:</span>
                      <div class="row items-center q-gutter-x-xs q-mt-xs">
                        <strong class="text-subtitle2 font-mono text-teal-10">
                          {{ props.row.onlineInfo.orderNo || "-" }}
                        </strong>
                        <q-btn
                          v-if="props.row.onlineInfo.orderNo"
                          size="xs"
                          flat
                          dense
                          round
                          icon="content_copy"
                          color="teal"
                          @click="copyText(props.row.onlineInfo.orderNo, 'No. Pesanan')"
                        >
                          <q-tooltip>Salin Nomor Pesanan</q-tooltip>
                        </q-btn>
                      </div>
                    </div>

                    <div class="col-12 col-sm-4">
                      <span class="text-grey-7">Nomor Resi / AWB:</span>
                      <div class="row items-center q-gutter-x-xs q-mt-xs">
                        <strong class="text-subtitle2 font-mono text-grey-9">
                          {{ props.row.onlineInfo.resi || "-" }}
                        </strong>
                        <q-btn
                          v-if="props.row.onlineInfo.resi"
                          size="xs"
                          flat
                          dense
                          round
                          icon="content_copy"
                          color="teal"
                          @click="copyText(props.row.onlineInfo.resi, 'Nomor Resi')"
                        >
                          <q-tooltip>Salin Nomor Resi</q-tooltip>
                        </q-btn>
                      </div>
                    </div>

                    <div class="col-12 col-sm-4">
                      <span class="text-grey-7">Nomor Booking / Kode Unik:</span>
                      <div class="q-mt-xs font-mono text-weight-medium">
                        {{ props.row.onlineInfo.bookingNo || "-" }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Transaction Overview Summary -->
                <div class="row q-col-gutter-sm q-mb-md">
                  <div class="col-12 col-sm-6 col-md-3">
                    <div class="bg-white q-pa-sm rounded-borders border-light">
                      <div class="text-caption text-grey-7">Waktu & Shift</div>
                      <div class="text-weight-bold text-grey-9">{{ props.row.dateStr }} • {{ props.row.time }}</div>
                      <div class="text-caption text-teal font-weight-bold">Shift {{ props.row.shift }}</div>
                    </div>
                  </div>

                  <div class="col-12 col-sm-6 col-md-3">
                    <div class="bg-white q-pa-sm rounded-borders border-light">
                      <div class="text-caption text-grey-7">Pasien & Kasir</div>
                      <div class="text-weight-bold text-grey-9">{{ props.row.patientName }}</div>
                      <div class="text-caption text-grey-7">Kasir: {{ props.row.createdName }}</div>
                    </div>
                  </div>

                  <div class="col-12 col-sm-6 col-md-3">
                    <div class="bg-white q-pa-sm rounded-borders border-light">
                      <div class="text-caption text-grey-7">Metode Pembayaran</div>
                      <div class="text-weight-bold text-teal-9">{{ props.row.paymentMethod }}</div>
                      <div class="text-caption text-grey-7">Total Bayar: {{ formatRupiah(props.row.paidFee) }}</div>
                    </div>
                  </div>

                  <div class="col-12 col-sm-6 col-md-3">
                    <div class="bg-white q-pa-sm rounded-borders border-light">
                      <div class="text-caption text-grey-7">Margin & Laba Kotor</div>
                      <div class="text-weight-bold text-positive">
                        {{ formatRupiah(props.row.grossProfit) }} ({{ props.row.marginPercent.toFixed(1) }}%)
                      </div>
                      <div class="text-caption text-grey-7">HPP: {{ formatRupiah(props.row.hpp) }}</div>
                    </div>
                  </div>
                </div>

                <!-- Notes / Catatan Tambahan (if any) -->
                <div v-if="props.row.otherNotes && props.row.otherNotes.length" class="q-mb-md bg-amber-1 q-pa-sm rounded-borders border-amber">
                  <div class="text-caption text-weight-bold text-amber-10">Catatan Transaksi:</div>
                  <div v-for="(note, nIdx) in props.row.otherNotes" :key="nIdx" class="text-caption text-grey-9 font-mono">
                    • {{ note }}
                  </div>
                </div>

                <!-- Items Table Breakdown -->
                <div class="bg-white rounded-borders border-light overflow-hidden">
                  <div class="row items-center justify-between q-pa-sm bg-grey-2 border-bottom">
                    <span class="text-subtitle2 text-weight-bold text-teal-9">
                      Daftar Item Transaksi ({{ props.row.items.length }} item)
                    </span>
                    <span class="text-caption text-grey-7">
                      Total Omset: <strong>{{ formatRupiah(props.row.totalFee) }}</strong> •
                      Total HPP: <strong>{{ formatRupiah(props.row.hpp) }}</strong>
                    </span>
                  </div>

                  <q-markup-table dense flat bordered separator="cell" class="item-detail-table">
                    <thead>
                      <tr class="bg-grey-1 text-grey-9 text-caption">
                        <th style="width: 40px;" class="text-center">No</th>
                        <th class="text-left">Nama Obat / Tindakan / AKHP</th>
                        <th class="text-left">Kategori / Jenis</th>
                        <th class="text-right" style="width: 70px;">Qty</th>
                        <th class="text-left" style="width: 80px;">Satuan</th>
                        <th class="text-right">Harga Jual Satuan</th>
                        <th class="text-right">Total Jual (Omset)</th>
                        <th class="text-right">HPP Satuan</th>
                        <th class="text-right">Total HPP</th>
                        <th class="text-right">Laba Kotor</th>
                        <th class="text-right" style="width: 80px;">Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(item, idx) in props.row.items" :key="item.id || idx">
                        <td class="text-center text-caption text-grey-6">{{ idx + 1 }}</td>
                        <td class="text-weight-medium">
                          {{ item.name }}
                          <q-badge
                            dense
                            size="xs"
                            :color="item.incomeType === 'klinik' ? 'purple-2' : 'teal-1'"
                            :text-color="item.incomeType === 'klinik' ? 'purple-9' : 'teal-9'"
                            class="q-ml-xs"
                          >
                            {{ item.incomeType || item.type }}
                          </q-badge>
                        </td>
                        <td class="text-caption text-grey-7">{{ item.category || "-" }}</td>
                        <td class="text-right font-mono text-weight-bold">{{ item.quantity }}</td>
                        <td class="text-caption text-grey-8">{{ item.unit || "-" }}</td>
                        <td class="text-right font-mono">{{ formatRupiah(item.baseFee || (item.quantity > 0 ? item.totalFee / item.quantity : 0)) }}</td>
                        <td class="text-right font-mono text-weight-bold text-grey-9">{{ formatRupiah(item.totalFee) }}</td>
                        <td class="text-right font-mono text-orange-9">{{ formatRupiah(item.unitHpp) }}</td>
                        <td class="text-right font-mono text-orange-9">{{ formatRupiah(item.totalHpp) }}</td>
                        <td class="text-right font-mono text-positive text-weight-bold">{{ formatRupiah(item.grossProfit || 0) }}</td>
                        <td
                          class="text-right font-mono text-weight-bold"
                          :class="(item.marginPercent || 0) >= 20 ? 'text-positive' : (item.marginPercent || 0) > 0 ? 'text-orange-9' : 'text-negative'"
                        >
                          {{ (item.marginPercent || 0).toFixed(1) }}%
                        </td>
                      </tr>
                      <tr v-if="!props.row.items.length">
                        <td colspan="11" class="text-center text-grey-5 text-italic q-pa-md">
                          Tidak ada rincian item transaksi.
                        </td>
                      </tr>
                    </tbody>
                    <tfoot v-if="props.row.items.length">
                      <tr class="bg-grey-1 text-weight-bold">
                        <td colspan="6" class="text-right">TOTAL TRANSAKSI:</td>
                        <td class="text-right font-mono text-teal-10">{{ formatRupiah(props.row.totalFee) }}</td>
                        <td></td>
                        <td class="text-right font-mono text-orange-9">{{ formatRupiah(props.row.hpp) }}</td>
                        <td class="text-right font-mono text-positive">{{ formatRupiah(props.row.grossProfit) }}</td>
                        <td class="text-right font-mono text-positive">{{ props.row.marginPercent.toFixed(1) }}%</td>
                      </tr>
                    </tfoot>
                  </q-markup-table>
                </div>
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </div>
    </q-card>
  </div>
</template>

<script lang="ts" setup>
import * as XLSX from "xlsx";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useQuasar } from "quasar";
import { enrichPemasukanData } from "@/utils/enrichPemasukanData";
import {
  calculateShiftSummaries,
  type ShiftDetailItem,
  type ShiftDetailRow,
  type ShiftSummaryRow,
} from "@/utils/hitunganHarianCalculations";
import { formatRupiah } from "@/utils/rupiahUtils";
import type { PemasukanData } from "@/types/PemasukanData";
import {
  fetchHppCatalogData,
  fetchPemasukanData,
} from "@/components/hitungan-harian/pemasukan";

type StatusVariant = "muted" | "error";

const $q = useQuasar();

const activeTab = ref<"shift" | "transaksi">("shift");
const startDate = ref(formatDateForInput(new Date()));
const endDate = ref(formatDateForInput(new Date()));
const loading = ref(false);
const exporting = ref(false);
const statusMessage = ref("");
const statusVariant = ref<StatusVariant>("muted");
const summaries = ref<ShiftSummaryRow[]>([]);
const rawData = ref<PemasukanData[]>([]);

// Filters for Transactions Tab
const searchFilter = ref("");
const shiftFilter = ref<"all" | "Pagi" | "Siang">("all");
const sourceFilter = ref<"all" | "online" | "offline" | "apotek" | "klinik">("all");
const platformFilter = ref<string>("all");

const paginationShift = { rowsPerPage: 15 };
const paginationTransaksi = { rowsPerPage: 20 };

const shiftFilterOptions = [
  { label: "Semua Shift", value: "all" },
  { label: "Pagi", value: "Pagi" },
  { label: "Siang", value: "Siang" },
];

const sourceFilterOptions = [
  { label: "Semua Saluran", value: "all" },
  { label: "Pesanan Online (Marketplace)", value: "online" },
  { label: "Transaksi Offline (Kasir)", value: "offline" },
  { label: "Khusus Apotek", value: "apotek" },
  { label: "Khusus Klinik", value: "klinik" },
];

const platformFilterOptions = [
  { label: "Semua Platform", value: "all" },
  { label: "Shopee", value: "Shopee" },
  { label: "TikTok", value: "TikTok" },
  { label: "Blibli", value: "Blibli" },
  { label: "GoApotik", value: "GoApotik" },
  { label: "Tokopedia", value: "Tokopedia" },
  { label: "Lazada", value: "Lazada" },
  { label: "Desty Sync", value: "Desty" },
];

const shiftColumns = [
  { name: "displayDate", label: "Tanggal", align: "left" as const, field: "displayDate", sortable: true },
  { name: "shift", label: "Shift", align: "left" as const, field: "shift", sortable: true },
  { name: "transactionCount", label: "Jml Tx", align: "right" as const, field: "transactionCount", sortable: true },
  { name: "apotekCash", label: "Apotek Cash", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.cash), sortable: true },
  { name: "apotekMandiri", label: "Apotek Mandiri", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.mandiri), sortable: true },
  { name: "apotekQris", label: "Apotek QRIS", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.qris), sortable: true },
  { name: "apotekShopee", label: "Shopee", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.shopee), sortable: true },
  { name: "apotekTiktok", label: "TikTok", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.tiktok), sortable: true },
  { name: "apotekBlibli", label: "Blibli", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.blibli), sortable: true },
  { name: "apotekGoApotik", label: "GoApotik", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.goApotik), sortable: true },
  { name: "apotekTotal", label: "Total Apotek", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.apotek.total), sortable: true },
  { name: "klinikCash", label: "Klinik Cash", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.klinik.cash), sortable: true },
  { name: "klinikDebit", label: "Klinik Debit", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.klinik.debit), sortable: true },
  { name: "klinikTotal", label: "Total Klinik", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.klinik.total), sortable: true },
  { name: "totalOmset", label: "Total Omset", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.totalOmset), sortable: true },
  { name: "hpp", label: "HPP (Harga Beli)", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.hpp), sortable: true },
  { name: "grossProfit", label: "Laba Kotor Apotek", align: "right" as const, field: (row: ShiftSummaryRow) => formatRupiah(row.grossProfit), sortable: true },
  { name: "marginPercent", label: "Margin Apotek", align: "right" as const, field: (row: ShiftSummaryRow) => `${row.marginPercent.toFixed(1)}%`, sortable: true },
  { name: "marginOffline", label: "Margin Offline", align: "right" as const, field: (row: ShiftSummaryRow) => `${row.marginPercentOffline.toFixed(1)}%`, sortable: true },
  { name: "marginOnline", label: "Margin Online", align: "right" as const, field: (row: ShiftSummaryRow) => `${row.marginPercentOnline.toFixed(1)}%`, sortable: true },
  { name: "action", label: "Detail", align: "center" as const, sortable: false },
];

const transactionColumns = [
  { name: "index", label: "No", align: "center" as const, field: "index", sortable: false },
  { name: "time", label: "Waktu / Tanggal", align: "left" as const, field: "time", sortable: true },
  { name: "shift", label: "Shift", align: "center" as const, field: "shift", sortable: true },
  { name: "code", label: "No. Invoice", align: "left" as const, field: "code", sortable: true },
  { name: "onlineOrder", label: "Pesanan Online / Ref", align: "left" as const, field: (row: ShiftDetailRow) => row.onlineInfo.orderNo, sortable: true },
  { name: "patientName", label: "Pasien / Pelanggan", align: "left" as const, field: "patientName", sortable: true },
  { name: "paymentMethod", label: "Metode Bayar", align: "left" as const, field: "paymentMethod", sortable: true },
  { name: "incomeType", label: "Kategori", align: "center" as const, field: "incomeType", sortable: true },
  { name: "totalFee", label: "Omset (Rp)", align: "right" as const, field: "totalFee", sortable: true },
  { name: "hpp", label: "HPP (Rp)", align: "right" as const, field: "hpp", sortable: true },
  { name: "grossProfit", label: "Laba Kotor Apotek", align: "right" as const, field: "grossProfit", sortable: true },
  { name: "action", label: "Detail", align: "center" as const, sortable: false },
];

const allTransactions = computed<ShiftDetailRow[]>(() => {
  return summaries.value.flatMap((s) => s.details);
});

const globalMetrics = computed(() => {
  let totalOmset = 0;
  let totalApotek = 0;
  let totalKlinik = 0;
  let totalHpp = 0;
  let totalOnlineTransactions = 0;
  let offlineOmset = 0;
  let hppOffline = 0;
  let onlineOmset = 0;
  let hppOnline = 0;

  for (const s of summaries.value) {
    totalOmset += s.totalOmset;
    totalApotek += s.apotek.total;
    totalKlinik += s.klinik.total;
    totalHpp += s.hpp;
    offlineOmset += s.offlineOmset;
    hppOffline += s.hppOffline;
    onlineOmset += s.onlineOmset;
    hppOnline += s.hppOnline;
  }

  for (const tx of allTransactions.value) {
    if (tx.onlineInfo.isOnline) {
      totalOnlineTransactions++;
    }
  }

  const totalGrossProfit = totalApotek - totalHpp;
  const marginPercent = totalApotek > 0 ? (totalGrossProfit / totalApotek) * 100 : 0;

  const grossProfitOffline = offlineOmset - hppOffline;
  const marginPercentOffline = offlineOmset > 0 ? (grossProfitOffline / offlineOmset) * 100 : 0;

  const grossProfitOnline = onlineOmset - hppOnline;
  const marginPercentOnline = onlineOmset > 0 ? (grossProfitOnline / onlineOmset) * 100 : 0;

  return {
    totalOmset,
    totalApotek,
    totalKlinik,
    totalHpp,
    totalGrossProfit,
    marginPercent,
    offlineOmset,
    hppOffline,
    grossProfitOffline,
    marginPercentOffline,
    onlineOmset,
    hppOnline,
    grossProfitOnline,
    marginPercentOnline,
    totalShift: summaries.value.length,
    totalTransactions: allTransactions.value.length,
    totalOnlineTransactions,
  };
});

const shiftTotals = computed(() => {
  const totals = {
    apotekCash: 0,
    apotekMandiri: 0,
    apotekQris: 0,
    apotekShopee: 0,
    apotekTiktok: 0,
    apotekBlibli: 0,
    apotekGoApotik: 0,
    apotekTotal: 0,
    klinikCash: 0,
    klinikDebit: 0,
    klinikTotal: 0,
    offlineOmset: 0,
    hppOffline: 0,
    grossProfitOffline: 0,
    onlineOmset: 0,
    hppOnline: 0,
    grossProfitOnline: 0,
  };
  for (const s of summaries.value) {
    totals.apotekCash += s.apotek.cash;
    totals.apotekMandiri += s.apotek.mandiri;
    totals.apotekQris += s.apotek.qris;
    totals.apotekShopee += s.apotek.shopee;
    totals.apotekTiktok += s.apotek.tiktok;
    totals.apotekBlibli += s.apotek.blibli;
    totals.apotekGoApotik += s.apotek.goApotik;
    totals.apotekTotal += s.apotek.total;
    totals.klinikCash += s.klinik.cash;
    totals.klinikDebit += s.klinik.debit;
    totals.klinikTotal += s.klinik.total;
    totals.offlineOmset += s.offlineOmset;
    totals.hppOffline += s.hppOffline;
    totals.grossProfitOffline += s.grossProfitOffline;
    totals.onlineOmset += s.onlineOmset;
    totals.hppOnline += s.hppOnline;
    totals.grossProfitOnline += s.grossProfitOnline;
  }
  return totals;
});

const filteredTransactions = computed<ShiftDetailRow[]>(() => {
  const query = String(searchFilter.value || "").trim().toLowerCase();
  const shift = shiftFilter.value;
  const source = sourceFilter.value;
  const platform = platformFilter.value;

  return allTransactions.value.filter((tx) => {
    // 1. Shift filter
    if (shift !== "all" && tx.shift !== shift) {
      return false;
    }

    // 2. Source filter
    if (source === "online" && !tx.onlineInfo.isOnline) {
      return false;
    }
    if (source === "offline" && tx.onlineInfo.isOnline) {
      return false;
    }
    if (source === "apotek" && tx.incomeType === "klinik") {
      return false;
    }
    if (source === "klinik" && tx.incomeType === "apotek") {
      return false;
    }

    // 3. Platform filter
    if (platform !== "all") {
      if (platform === "Desty" && tx.onlineInfo.source !== "desty") {
        return false;
      }
      if (platform !== "Desty" && tx.onlineInfo.platform.toLowerCase() !== platform.toLowerCase()) {
        return false;
      }
    }

    // 4. Search query
    if (query) {
      const matchCode = (tx.code || "").toLowerCase().includes(query);
      const matchPatient = (tx.patientName || "").toLowerCase().includes(query);
      const matchKasir = (tx.createdName || "").toLowerCase().includes(query);
      const matchDoctor = (tx.doctorName || "").toLowerCase().includes(query);
      const matchOrderNo = (tx.onlineInfo.orderNo || "").toLowerCase().includes(query);
      const matchResi = (tx.onlineInfo.resi || "").toLowerCase().includes(query);
      const matchPlatform = (tx.onlineInfo.platform || "").toLowerCase().includes(query);
      const matchItems = tx.items.some((it) => (it.name || "").toLowerCase().includes(query));

      return (
        matchCode ||
        matchPatient ||
        matchKasir ||
        matchDoctor ||
        matchOrderNo ||
        matchResi ||
        matchPlatform ||
        matchItems
      );
    }

    return true;
  });
});

const filteredMetrics = computed(() => {
  let omset = 0;
  let apotekOmset = 0;
  let hpp = 0;
  for (const tx of filteredTransactions.value) {
    omset += tx.totalFee;
    apotekOmset += tx.apotek.total;
    hpp += tx.hpp;
  }
  const grossProfit = apotekOmset - hpp;
  const marginPercent = apotekOmset > 0 ? (grossProfit / apotekOmset) * 100 : 0;
  return { omset, hpp, grossProfit, marginPercent };
});

function resetTransactionFilters() {
  searchFilter.value = "";
  shiftFilter.value = "all";
  sourceFilter.value = "all";
  platformFilter.value = "all";
}

function filterToShift(shiftRow: ShiftSummaryRow) {
  shiftFilter.value = shiftRow.shift;
  activeTab.value = "transaksi";
}

function getPlatformBadgeStyle(platform: string): Record<string, string> {
  const p = (platform || "").toLowerCase();
  if (p.includes("shopee")) {
    return { backgroundColor: "#ee4d2d", color: "#fff" };
  }
  if (p.includes("tiktok")) {
    return { backgroundColor: "#000000", color: "#fe2c55" };
  }
  if (p.includes("blibli")) {
    return { backgroundColor: "#0095da", color: "#fff" };
  }
  if (p.includes("goapotik") || p.includes("go apotik")) {
    return { backgroundColor: "#00a859", color: "#fff" };
  }
  if (p.includes("tokopedia")) {
    return { backgroundColor: "#03ac0e", color: "#fff" };
  }
  if (p.includes("desty")) {
    return { backgroundColor: "#0d47a1", color: "#fff" };
  }
  return { backgroundColor: "#26a69a", color: "#fff" };
}

async function copyText(text: string, label: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    $q.notify({
      type: "positive",
      message: `${label} disalin ke clipboard: ${text}`,
      timeout: 1500,
    });
  } catch (err) {
    console.warn("Gagal menyalin teks", err);
  }
}

async function loadSummaries() {
  if (loading.value) return;
  loading.value = true;
  statusVariant.value = "muted";
  statusMessage.value = "Memuat transaksi dan HPP...";
  summaries.value = [];
  rawData.value = [];
  try {
    const [pemasukanRaw, hppCatalog] = await Promise.all([
      fetchPemasukanData({
        tanggalMin: startDate.value,
        tanggalMax: endDate.value,
      }),
      fetchHppCatalogData(),
    ]);
    const enriched = enrichPemasukanData(pemasukanRaw);
    rawData.value = enriched;
    const result = calculateShiftSummaries(enriched, hppCatalog);
    summaries.value = result;
    statusMessage.value = result.length
      ? ""
      : "Tidak ada data untuk rentang tanggal ini.";
  } catch (error) {
    console.error("Gagal memuat hitungan harian", error);
    statusVariant.value = "error";
    statusMessage.value = "Terjadi kesalahan saat memuat data.";
    summaries.value = [];
    rawData.value = [];
  } finally {
    loading.value = false;
  }
}

const statusText = computed(() => {
  if (loading.value) {
    return "Memuat data...";
  }
  return statusMessage.value;
});

const canExport = computed(() => {
  if (loading.value || exporting.value) {
    return false;
  }
  return summaries.value.length > 0 && rawData.value.length > 0;
});

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function exportToExcel() {
  if (!summaries.value.length || !rawData.value.length || exporting.value) {
    return;
  }

  exporting.value = true;
  try {
    const wb = XLSX.utils.book_new();

    // 1. SHEET: SUMMARY PER SHIFT
    const summaryHeaders = [
      "Tanggal",
      "Shift",
      "Jumlah Transaksi",
      "Cash Apotek",
      "Mandiri Apotek",
      "QRIS Apotek",
      "Shopee",
      "TikTok",
      "Blibli",
      "GoApotik",
      "Total Apotek",
      "Cash Klinik",
      "Debit Klinik",
      "Total Klinik",
      "Total Omset",
      "HPP Total",
      "Laba Kotor Apotek",
      "Margin % Apotek",
      "Omset Offline",
      "HPP Offline",
      "Laba Offline",
      "Margin % Offline",
      "Omset Online",
      "HPP Online",
      "Laba Online",
      "Margin % Online",
    ];
    const summaryRows = summaries.value.map((summary) => [
      summary.displayDate,
      summary.shift,
      summary.transactionCount,
      summary.apotek.cash,
      summary.apotek.mandiri,
      summary.apotek.qris,
      summary.apotek.shopee,
      summary.apotek.tiktok,
      summary.apotek.blibli,
      summary.apotek.goApotik,
      summary.apotek.total,
      summary.klinik.cash,
      summary.klinik.debit,
      summary.klinik.total,
      summary.totalOmset,
      summary.hpp,
      summary.grossProfit,
      Number(summary.marginPercent.toFixed(2)),
      summary.offlineOmset,
      summary.hppOffline,
      summary.grossProfitOffline,
      Number(summary.marginPercentOffline.toFixed(2)),
      summary.onlineOmset,
      summary.hppOnline,
      summary.grossProfitOnline,
      Number(summary.marginPercentOnline.toFixed(2)),
    ]);
    const summaryWS = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    XLSX.utils.book_append_sheet(wb, summaryWS, "Summary_Shift");

    // 2. SHEET: DAFTAR TRANSAKSI (SEMUA)
    const txHeaders = [
      "Tanggal",
      "Waktu",
      "Shift",
      "No Invoice",
      "Saluran",
      "Platform Online",
      "No Pesanan Online",
      "No Resi",
      "No Booking",
      "Pasien",
      "Kasir",
      "Dokter",
      "Kategori",
      "Metode Bayar",
      "Total Omset",
      "Total HPP",
      "Laba Kotor (Apotek)",
      "Margin % (Apotek)",
      "Catatan",
    ];
    const mapTxToRow = (tx: ShiftDetailRow) => [
      tx.dateStr,
      tx.time,
      tx.shift,
      tx.code,
      tx.onlineInfo.isOnline ? "Online" : "Offline",
      tx.onlineInfo.platform || (tx.onlineInfo.isOnline ? "Online" : "Offline POS"),
      tx.onlineInfo.orderNo || "",
      tx.onlineInfo.resi || "",
      tx.onlineInfo.bookingNo || "",
      tx.patientName,
      tx.createdName,
      tx.doctorName || "",
      tx.incomeType,
      tx.paymentMethod,
      tx.totalFee,
      tx.hpp,
      tx.grossProfit,
      Number(tx.marginPercent.toFixed(2)),
      tx.otherNotes.join(" | "),
    ];

    const txRows = allTransactions.value.map(mapTxToRow);
    const txWS = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);
    XLSX.utils.book_append_sheet(wb, txWS, "Semua_Transaksi");

    // 3. SHEET: TRANSAKSI OFFLINE (KASIR)
    const offlineRows = allTransactions.value.filter((tx) => !tx.onlineInfo.isOnline).map(mapTxToRow);
    const offlineWS = XLSX.utils.aoa_to_sheet([txHeaders, ...offlineRows]);
    XLSX.utils.book_append_sheet(wb, offlineWS, "Transaksi_Offline");

    // 4. SHEET: TRANSAKSI ONLINE (MARKETPLACE)
    const onlineRows = allTransactions.value.filter((tx) => tx.onlineInfo.isOnline).map(mapTxToRow);
    const onlineWS = XLSX.utils.aoa_to_sheet([txHeaders, ...onlineRows]);
    XLSX.utils.book_append_sheet(wb, onlineWS, "Transaksi_Online");

    // 3. SHEET: RAW DATA DETAIL ITEM
    const rawHeaders = [
      "transaction_id",
      "transaction_status",
      "transaction_totalFee",
      "transaction_creditFee",
      "transaction_isOnlyPOS",
      "transaction_createdAt",
      "transaction_code",
      "online_platform",
      "online_order_sn",
      "online_resi",
      "patient_nama",
      "practices_Dokters_nama",
      "payment_name",
      "payment_type",
      "payment_paidName",
      "item_id",
      "item_name",
      "item_type",
      "item_category",
      "item_quantity",
      "item_unit",
      "item_baseFee",
      "item_totalFee",
      "item_createdName",
    ];

    const rawRows: any[] = [];
    for (const tx of rawData.value) {
      const firstPayment = (
        tx.Payments && tx.Payments.length ? tx.Payments[0] : null
      ) as any | null;
      const practices = (tx.Practices || {}) as any;
      const patients = (tx.Patients || {}) as any;

      const items =
        Array.isArray(tx.Items) && tx.Items.length ? tx.Items : [undefined];
      for (const item of items) {
        const itm = item ?? ({} as any);
        rawRows.push([
          tx._id,
          tx.status,
          tx.totalFee,
          tx.creditFee,
          tx.isOnlyPOS,
          tx.createdAt,
          tx.code,
          firstPayment?.name ?? "",
          firstPayment?.paidName ?? "",
          "",
          patients.nama ?? "",
          practices.Dokters?.nama ?? "",
          firstPayment?.name ?? "",
          firstPayment?.type ?? "",
          firstPayment?.paidName ?? "",
          itm.id ?? "",
          itm.name ?? "",
          itm.type ?? "",
          itm.category ?? "",
          itm.quantity ?? "",
          itm.unit ?? "",
          itm.baseFee ?? "",
          itm.totalFee ?? "",
          itm.createdName ?? "",
        ]);
      }
    }

    const rawWS = XLSX.utils.aoa_to_sheet([rawHeaders, ...rawRows]);
    XLSX.utils.book_append_sheet(wb, rawWS, "RawData_Items");

    XLSX.writeFile(
      wb,
      `hitungan-harian-shift-${startDate.value}-to-${endDate.value}.xlsx`,
    );
  } catch (error) {
    console.error("Gagal mengekspor data", error);
  } finally {
    exporting.value = false;
  }
}

const route = useRoute();

function applyRouteParams(): boolean {
  let dateChanged = false;
  if (route.query.date) {
    startDate.value = String(route.query.date);
    endDate.value = String(route.query.endDate || route.query.date);
    dateChanged = true;
  }
  if (route.query.tab === "transaksi" || route.query.tab === "shift") {
    activeTab.value = route.query.tab as "transaksi" | "shift";
  }
  if (route.query.search) {
    searchFilter.value = String(route.query.search);
  }
  return dateChanged;
}

onMounted(() => {
  applyRouteParams();
  void loadSummaries();
});

watch(
  () => [route.query.date, route.query.endDate, route.query.tab, route.query.search],
  () => {
    const dateChanged = applyRouteParams();
    if (dateChanged) {
      void loadSummaries();
    }
  }
);
</script>

<style>
.hitungan-harian-page .font-mono {
  font-family: monospace;
}
.hitungan-harian-page .border-bottom {
  border-bottom: 1px solid #e0e0e0;
}
.hitungan-harian-page .border-bottom-light {
  border-bottom: 1px dashed #e8e8e8;
}
.hitungan-harian-page .border-light {
  border: 1px solid #e0e0e0;
}
.hitungan-harian-page .border-teal-light {
  border: 1px solid #b2dfdb;
}
.hitungan-harian-page .border-amber {
  border: 1px solid #ffe082;
}

/* Sticky action column on the right for Shift Table */
.hitungan-harian-page .shift-table th:last-child,
.hitungan-harian-page .shift-table td:last-child,
.hitungan-harian-page .transaction-table th:last-child,
.hitungan-harian-page .transaction-table td:last-child {
  position: sticky;
  right: 0;
  background-color: #fff !important;
  z-index: 2;
  border-left: 1px solid rgba(0, 0, 0, 0.12) !important;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.05);
}

.hitungan-harian-page .shift-table th:last-child,
.hitungan-harian-page .transaction-table th:last-child {
  z-index: 3;
}

/* Maintained table styling */
.hitungan-harian-page .expanded-detail-row,
.hitungan-harian-page .expanded-detail-row td {
  background-color: #fafafa !important;
}

.hitungan-harian-page .item-detail-table th {
  font-weight: bold;
}
</style>
