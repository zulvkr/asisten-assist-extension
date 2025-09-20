const h1XPath =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div/div/div/div/div/div[1]/div[1]/h1[text()="Data Stok Bahan Habis Pakai"]';
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
  const div = document.createElement("div");
  div.style.paddingLeft = "8px";
  div.style.paddingRight = "8px";
  td.appendChild(div);
  div.textContent = text;
  if (source) copyCellStyle(source, td);
  return td;
}

function modifyNamaBhpCell(cell: HTMLTableCellElement) {
  const divNode = cell.querySelector("div");
  const divNode2 = divNode?.querySelector("div");
  if (!divNode2) return;
  if (divNode2.childNodes.length === 3) {
    const textNode = divNode2.childNodes[2];
    if (textNode.nodeType === Node.TEXT_NODE) {
      textNode.textContent = `(${textNode.textContent?.trim()})`;
    }
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

  const namaBarangColIdx = getColumnIndex(headerRow, "Nama Barang");
  if (namaBarangColIdx === -1) return;

  table.querySelectorAll("tbody tr").forEach((row) => {
    const tr = row as HTMLTableRowElement;
    console.log("Processing BHP row:", tr);
    const codeCell = tr.cells[kodeColIdx];
    if (!codeCell) return;
    const namaBarangCell = tr.cells[namaBarangColIdx];
    if (!namaBarangCell) return;
    modifyNamaBhpCell(namaBarangCell);
    const code = codeCell.textContent?.trim();
    const marginRow = marginData.find((dataRow) => dataRow[0] === code);
    const lastCell = tr.cells[tr.cells.length - 1] || null;
    tr.appendChild(createBodyCell(lastCell, marginRow ? marginRow[2] : ""));
  });
}

export const modifyTableBhp = (ctx: any) => {
  const h1 = evaluateXPath<HTMLHeadingElement>(h1XPath, document);
  if (!h1) return;

  const table = evaluateXPath<HTMLTableElement>(tableXPath, document);
  if (!table) return;

  const headerRow = table.querySelector(
    "thead tr"
  ) as HTMLTableRowElement | null;
  const bodyRows = table.querySelectorAll("tbody tr");
  if (!headerRow) return;

  // Check if currently in loading/no data state
  const firstBodyRow = bodyRows[0] as HTMLTableRowElement | null;
  const isLoadingState = !!(
    firstBodyRow &&
    firstBodyRow.cells.length === 1 &&
    firstBodyRow.cells[0].getAttribute("colspan") === "10"
  );

  console.log("Table BHP loading state:", isLoadingState);

  const hasMarginCol = Array.from(headerRow.cells).some(
    (cell) => cell.textContent?.trim() === marginColumnTitle
  );

  const prevLoadingState = (table as any)._tableBhpWasLoadingState || false;

  // Add margin column if not present, or if table just finished loading data
  const shouldAddMarginCol =
    !hasMarginCol || (prevLoadingState && !isLoadingState);
  if (shouldAddMarginCol) {
    addMarginColumn(table);
  }

  (table as any)._tableBhpWasLoadingState = isLoadingState;
};
