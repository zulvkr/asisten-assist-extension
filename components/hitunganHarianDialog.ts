import { enrichPemasukanData } from "@/utils/enrichPemasukanData";
import { fetchPemasukanData } from "./pemasukan";
import type { PemasukanData, Payment, Item } from "@/types/PemasukanData";
import { formatRupiah } from "@/utils/rupiahUtils";
import { setStyles } from "@/utils/setStyles";
import {
  calculateShiftSummaries,
  type ShiftSummaryRow,
} from "@/utils/hitunganHarianCalculations";

let activeOverlay: HTMLElement | null = null;

export function showHitunganHarianDialog(): void {
  if (activeOverlay) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "hitungan-harian-overlay";
  setStyles(overlay, {
    position: "fixed",
    inset: "0",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "48px 24px",
    overflowY: "auto",
  });

  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.className = "hitungan-harian-dialog";
  setStyles(dialog, {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 20px 45px rgba(15, 23, 42, 0.25)",
    maxWidth: "1080px",
    width: "100%",
    padding: "24px",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  });

  const header = document.createElement("div");
  setStyles(header, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  });

  const title = document.createElement("h2");
  title.textContent = "Hitungan Harian";
  setStyles(title, {
    margin: "0",
    fontSize: "20px",
    fontWeight: "600",
  });

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Tutup";
  closeButton.className = "tailwind-btn";

  header.append(title, closeButton);
  dialog.appendChild(header);

  const controls = document.createElement("form");
  controls.className = "hitungan-harian-controls";
  setStyles(controls, {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "20px",
  });

  const startInput = document.createElement("input");
  startInput.type = "date";
  startInput.name = "tanggalMin";
  setStyles(startInput, {
    borderRadius: "0.375rem",
    border: "1px solid #d4d4d8",
    padding: "8px 12px",
  });

  const endInput = document.createElement("input");
  endInput.type = "date";
  endInput.name = "tanggalMax";
  setStyles(endInput, {
    borderRadius: "0.375rem",
    border: "1px solid #d4d4d8",
    padding: "8px 12px",
  });

  const loadButton = document.createElement("button");
  loadButton.type = "submit";
  loadButton.textContent = "Muat Data";
  loadButton.className = "tailwind-btn";
  setStyles(loadButton, {
    alignSelf: "center",
  });

  const statusLabel = document.createElement("div");
  setStyles(statusLabel, {
    flexBasis: "100%",
    fontSize: "14px",
    color: "#4b5563",
  });

  controls.append(startInput, endInput, loadButton, statusLabel);
  dialog.appendChild(controls);

  const tableContainer = document.createElement("div");
  tableContainer.className = "hitungan-harian-table-container";
  setStyles(tableContainer, {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
  });
  dialog.appendChild(tableContainer);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  function removeOverlay() {
    overlay.remove();
    document.removeEventListener("keydown", handleKeydown);
    activeOverlay = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      removeOverlay();
    }
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      removeOverlay();
    }
  });

  closeButton.addEventListener("click", () => {
    removeOverlay();
  });

  document.addEventListener("keydown", handleKeydown);

  controls.addEventListener("submit", (event) => {
    event.preventDefault();
    loadShiftSummaries();
  });

  const today = formatDateForInput(new Date());
  startInput.value = today;
  endInput.value = today;

  let loading = false;
  async function loadShiftSummaries() {
    if (loading) return;
    loading = true;
    statusLabel.textContent = "Memuat data...";
    loadButton.disabled = true;
    try {
      const pemasukanRaw = await fetchPemasukanData({
        tanggalMin: startInput.value,
        tanggalMax: endInput.value,
      });
      const enriched = enrichPemasukanData(pemasukanRaw);
      const summaries = calculateShiftSummaries(enriched);
      renderSummaries(tableContainer, summaries);
      statusLabel.textContent = summaries.length
        ? ""
        : "Tidak ada data untuk rentang tanggal ini.";
    } catch (error) {
      console.error("Gagal memuat hitungan harian", error);
      statusLabel.textContent = "Terjadi kesalahan saat memuat data.";
      tableContainer.replaceChildren();
    } finally {
      loadButton.disabled = false;
      loading = false;
    }
  }

  loadShiftSummaries();
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderSummaries(container: HTMLElement, summaries: ShiftSummaryRow[]) {
  container.replaceChildren();

  if (!summaries.length) {
    return;
  }

  const table = document.createElement("table");
  table.className = "hitungan-harian-table";
  setStyles(table, {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "900px",
  });

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = [
    "Tanggal",
    "Shift",
    "Cash Apotek",
    "Debit Apotek",
    "Total Apotek",
    "Cash Klinik",
    "Debit Klinik",
    "Total Klinik",
    "Keterangan",
  ];

  headers.forEach((label, index) => {
    const th = document.createElement("th");
    th.textContent = label;
    setStyles(th, {
      backgroundColor: "#1d4ed8",
      color: "#ffffff",
      padding: "10px",
      border: "1px solid #1e3a8a",
      textAlign: index >= 2 && index <= 7 ? "right" : "left",
      fontWeight: "600",
      fontSize: "14px",
    });
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  summaries.forEach((summary) => {
    const row = document.createElement("tr");
    const cells: Array<string | HTMLElement> = [
      summary.displayDate,
      summary.shift,
      formatRupiah(summary.apotek.cash),
      formatRupiah(summary.apotek.debit),
      formatRupiah(summary.apotek.total),
      formatRupiah(summary.klinik.cash),
      formatRupiah(summary.klinik.debit),
      formatRupiah(summary.klinik.total),
    ];

    cells.forEach((value, index) => {
      const td = document.createElement("td");
      setStyles(td, {
        border: "1px solid #e2e8f0",
        padding: "10px",
        textAlign: index >= 2 && index <= 7 ? "right" : "left",
        fontSize: "14px",
      });
      if (value instanceof HTMLElement) {
        td.appendChild(value);
      } else {
        td.textContent = value;
      }
      row.appendChild(td);
    });

    const actionCell = document.createElement("td");
    setStyles(actionCell, {
      border: "1px solid #e2e8f0",
      padding: "10px",
      textAlign: "center",
    });

    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.textContent = "Detail";
    detailButton.className = "tailwind-btn";
    setStyles(detailButton, {
      padding: "0.35rem 0.75rem",
      fontSize: "14px",
    });

    actionCell.appendChild(detailButton);
    row.appendChild(actionCell);
    tbody.appendChild(row);

    const detailRow = document.createElement("tr");
    const detailCell = document.createElement("td");
    detailCell.colSpan = headers.length;
    setStyles(detailCell, {
      border: "1px solid #e2e8f0",
      padding: "14px",
      backgroundColor: "#f8fafc",
    });

    if (!summary.details.length) {
      const empty = document.createElement("div");
      empty.textContent = "Tidak ada transaksi pada shift ini.";
      setStyles(empty, {
        color: "#64748b",
        fontSize: "14px",
      });
      detailCell.appendChild(empty);
    } else {
      summary.details.forEach((detail) => {
        const item = document.createElement("div");
        setStyles(item, {
          border: "1px solid #cbd5f5",
          borderRadius: "8px",
          padding: "12px",
          marginBottom: "10px",
          backgroundColor: "#fff",
        });

        const headerLine = document.createElement("div");
        headerLine.textContent = `${detail.code || "-"} • ${formatTime(
          detail.createdAt
        )}`;
        setStyles(headerLine, {
          fontWeight: "600",
          marginBottom: "6px",
        });
        item.appendChild(headerLine);

        const pasienLine = document.createElement("div");
        pasienLine.textContent = `Pasien: ${detail.patientName}`;
        setStyles(pasienLine, {
          marginBottom: "6px",
          color: "#475569",
        });
        item.appendChild(pasienLine);

        item.appendChild(buildItemsSection(detail.items));

        item.appendChild(
          buildDetailLine("Apotek", detail.apotek.cash, detail.apotek.debit)
        );
        item.appendChild(
          buildDetailLine("Klinik", detail.klinik.cash, detail.klinik.debit)
        );

        detailCell.appendChild(item);
      });
    }

    detailRow.appendChild(detailCell);
    setStyles(detailRow, {
      display: "none",
    });
    tbody.appendChild(detailRow);

    detailButton.addEventListener("click", () => {
      const isVisible = detailRow.style.display === "table-row";
      detailRow.style.display = isVisible ? "none" : "table-row";
      detailButton.textContent = isVisible ? "Detail" : "Tutup";
    });
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

function buildDetailLine(
  label: string,
  cash: number,
  debit: number
): HTMLDivElement {
  const line = document.createElement("div");
  setStyles(line, {
    display: "flex",
    gap: "16px",
    fontSize: "14px",
    color: "#0f172a",
  });

  const title = document.createElement("span");
  title.textContent = `${label}:`;
  setStyles(title, {
    minWidth: "72px",
    fontWeight: "500",
  });
  line.appendChild(title);

  const cashSpan = document.createElement("span");
  cashSpan.textContent = `Cash ${formatRupiah(cash)}`;
  setStyles(cashSpan, {
    color: "#047857",
  });
  line.appendChild(cashSpan);

  const debitSpan = document.createElement("span");
  debitSpan.textContent = `Debit ${formatRupiah(debit)}`;
  setStyles(debitSpan, {
    color: "#4338ca",
  });
  line.appendChild(debitSpan);

  return line;
}

function buildItemsSection(items: ShiftDetailItem[]): HTMLDivElement {
  const container = document.createElement("div");
  setStyles(container, {
    borderTop: "1px solid #e2e8f0",
    paddingTop: "8px",
    marginTop: "6px",
  });

  const title = document.createElement("div");
  title.textContent = "Items";
  setStyles(title, {
    fontWeight: "500",
    marginBottom: "4px",
    color: "#1f2937",
  });
  container.appendChild(title);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.textContent = "Tidak ada item pada transaksi ini.";
    setStyles(empty, {
      color: "#64748b",
      fontSize: "13px",
    });
    container.appendChild(empty);
    return container;
  }

  items.forEach((detailItem) => {
    const line = document.createElement("div");
    setStyles(line, {
      display: "flex",
      justifyContent: "space-between",
      gap: "12px",
      fontSize: "14px",
      marginBottom: "4px",
      color: "#0f172a",
    });

    const label = document.createElement("span");
    const typeParts = [detailItem.type, detailItem.incomeType]
      .filter(Boolean)
      .map((value) => formatLabel(String(value)));
    label.textContent = `${detailItem.name} (${typeParts.join(" • ") || "-"})`;
    setStyles(label, {
      flex: "1",
    });
    line.appendChild(label);

    const price = document.createElement("span");
    price.textContent = formatRupiah(detailItem.totalFee);
    setStyles(price, {
      minWidth: "120px",
      textAlign: "right",
      fontWeight: "500",
      color: "#0f172a",
    });
    line.appendChild(price);

    container.appendChild(line);
  });

  return container;
}

function formatLabel(value: string): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
