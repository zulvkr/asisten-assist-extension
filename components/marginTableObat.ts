const h1XPath =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div/div/div/div/div/div[1]/div[1]/h1[text()="Data Stok Obat"]';
const tableXPath =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div/div/div/div/div/div[3]/div/table';
const marginColumnTitle = "Margin (%)";
type MarginRow = [string, string, string];

function getColumnIndex(
  headerRow: HTMLTableRowElement,
  colName: string
): number {
  return Array.from(headerRow.cells).findIndex(
    (cell) => cell.textContent?.trim() === colName
  );
}

function copyCellStyle(
  source: HTMLTableCellElement,
  target: HTMLTableCellElement
) {
  target.className = source.className;
  target.style.cssText = source.style.cssText;
}

function createHeaderCell(
  source: HTMLTableCellElement | null,
  text: string
): HTMLTableCellElement {
  const th = document.createElement("th");
  th.textContent = text;
  if (source) copyCellStyle(source, th);
  return th;
}

function createBodyCell(
  source: HTMLTableCellElement | null,
  text: string
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = text;
  if (source) copyCellStyle(source, td);
  return td;
}

function removeExtraNodes(cell: HTMLTableCellElement) {
  for (let i = 1; i < cell.childNodes.length; ) {
    cell.removeChild(cell.childNodes[i]);
  }
}

function addMarginColumn(table: HTMLTableElement) {
  const marginData: MarginRow[] = (window as any).marginData || [];
  const headerRow = table.querySelector(
    "thead tr"
  ) as HTMLTableRowElement | null;
  if (!headerRow) return;

  const marginColIdx = getColumnIndex(headerRow, marginColumnTitle);
  if (marginColIdx !== -1) {
    headerRow.deleteCell(marginColIdx);
    table.querySelectorAll("tbody tr").forEach((row) => {
      const tr = row as HTMLTableRowElement;
      if (tr.cells.length > marginColIdx) tr.deleteCell(marginColIdx);
    });
  }

  const lastHeaderCell = headerRow.cells[headerRow.cells.length - 1] || null;
  headerRow.appendChild(createHeaderCell(lastHeaderCell, marginColumnTitle));

  const kodeColIdx = getColumnIndex(headerRow, "Kode");
  if (kodeColIdx === -1) return;

  const namaObatColIdx = getColumnIndex(headerRow, "Nama Obat");
  if (namaObatColIdx === -1) return;

  table.querySelectorAll("tbody tr").forEach((row) => {
    const tr = row as HTMLTableRowElement;
    const codeCell = tr.cells[kodeColIdx];
    if (!codeCell) return;
    const namaObatCell = tr.cells[namaObatColIdx];
    if (!namaObatCell) return;
    removeExtraNodes(namaObatCell);
    const code = codeCell.textContent?.trim();
    const marginRow = marginData.find((dataRow) => dataRow[0] === code);
    const lastCell = tr.cells[tr.cells.length - 1] || null;
    tr.appendChild(createBodyCell(lastCell, marginRow ? marginRow[2] : ""));
  });
}

export function addMarginToTableObat(ctx: any) {
  let lastTrCount = 0;
  let wasLoadingState = false;

  const observer = new MutationObserver(() => {
    const h1 = document.evaluate(
      h1XPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue as HTMLHeadingElement | null;
    if (!h1) return;

    const table = document.evaluate(
      tableXPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue as HTMLTableElement | null;
    if (!table) return;

    const headerRow = table.querySelector(
      "thead tr"
    ) as HTMLTableRowElement | null;
    const bodyRows = table.querySelectorAll("tbody tr");

    // Check if currently in loading/no data state
    const firstBodyRow = bodyRows[0] as HTMLTableRowElement | null;
    const isLoadingState = !!(
      firstBodyRow &&
      firstBodyRow.cells.length === 1 &&
      firstBodyRow.cells[0].getAttribute("colspan") === "12"
    );

    const hasMarginCol =
      headerRow &&
      Array.from(headerRow.cells).some(
        (cell) => cell.textContent?.trim() === marginColumnTitle
      );

    // Add margin column if not present, or if table just finished loading data
    const shouldAddMarginCol =
      headerRow && (!hasMarginCol || (wasLoadingState && !isLoadingState));
    if (shouldAddMarginCol) {
      addMarginColumn(table);
    }

    wasLoadingState = isLoadingState;
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
