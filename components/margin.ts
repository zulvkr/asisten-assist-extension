import { createIntegratedUi } from "wxt/utils/content-script-ui/integrated";
import { createShowMarginButton } from "./showMarginButton";

const tableXPath =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div/div/div/div/div/div[3]/div/table';

export function showMargin(ctx: any) {
  const ui = createIntegratedUi(ctx, {
    position: "inline",
    anchor: () => {
      const result = document.evaluate(
        '//*[@id="appBar"]/div/div/div[2]/div[1]',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      if (!result.singleNodeValue) {
        console.log("[showMargin] Anchor element not found");
      }
      return result.singleNodeValue as HTMLElement | null;
    },
    onMount: (container) => {
      const button = createShowMarginButton((btn: HTMLButtonElement) => {
        const table = document.evaluate(
          tableXPath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue as HTMLTableElement | null;
        if (!table) {
          console.log("[showMargin] Table not found");
          return;
        }

        const marginData = (window as any).marginData || [];
        const headerRow = table.querySelector(
          "thead tr"
        ) as HTMLTableRowElement | null;
        if (!headerRow) {
          console.log("[showMargin] Table header row not found");
          return;
        }

        // Remove existing 'Rekomendasi Margin (%)' header and cells if present
        const headerCells = Array.from(headerRow.cells);
        const marginHeaderIdx = headerCells.findIndex(
          (cell) => cell.textContent?.trim() === "Rekomendasi Margin (%)"
        );
        if (marginHeaderIdx !== -1) {
          headerRow.deleteCell(marginHeaderIdx);
          const bodyRows = table.querySelectorAll("tbody tr");
          bodyRows.forEach((row) => {
            const tr = row as HTMLTableRowElement;
            if (tr.cells.length > marginHeaderIdx) {
              tr.deleteCell(marginHeaderIdx);
            }
          });
        }

        // Add new header
        // Copy style from the last header cell (or any existing cell)
        const thStyleSource =
          headerCells.length > 0 ? headerCells[headerCells.length - 1] : null;
        const newHeader = document.createElement("th");
        newHeader.textContent = "Rekomendasi Margin (%)";
        if (thStyleSource) {
          newHeader.className = thStyleSource.className;
          newHeader.style.cssText = thStyleSource.style.cssText;
        }
        headerRow.appendChild(newHeader);
        const bodyRows = table.querySelectorAll("tbody tr");
        // Find the index of the column with header 'Kode' once
        const kodeColIdx = headerCells.findIndex(
          (cell) => cell.textContent?.trim() === "Kode"
        );
        if (kodeColIdx === -1) {
          console.log("[showMargin] 'Kode' column not found in header");
          return;
        }
        bodyRows.forEach((row, idx) => {
          const tr = row as HTMLTableRowElement;
          const codeCell = tr.cells[kodeColIdx];
          if (!codeCell) {
            console.log(`[showMargin] Row ${idx} has no 'Kode' cell`);
            return;
          }
          const code = codeCell.textContent?.trim();
          const marginRow = marginData.find(
            (dataRow: string[]) => dataRow[0] === code
          );
          if (!marginRow) {
            console.log(`[showMargin] No margin data found for code: ${code}`);
          }
          // Copy style from the last cell in the row (or any existing cell)
          const tdStyleSource =
            tr.cells.length > 0 ? tr.cells[tr.cells.length - 1] : null;
          const newCell = document.createElement("td");
          if (tdStyleSource) {
            newCell.className = tdStyleSource.className;
            newCell.style.cssText = tdStyleSource.style.cssText;
          }
          newCell.textContent = marginRow ? marginRow[2] : "";
          tr.appendChild(newCell);
        });
      });
      container.append(button);
    },
  });
  ui.autoMount();
}
