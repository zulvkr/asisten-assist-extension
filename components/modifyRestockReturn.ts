function parseRupiah(str: string): number | null {
  // Remove Rp, dots, and spaces, replace comma with dot
  const cleaned = str
    .replace(/Rp\s?/i, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
function createOrUpdateObatNameExtraDiv(
  obatNameInput: HTMLInputElement,
  matchingData: [string, string, string] | null
) {
  const parent = obatNameInput.parentElement as HTMLElement;
  const grandParent = parent.parentElement as HTMLElement;
  let extraDiv = grandParent.querySelector(
    "#extraobatname"
  ) as HTMLElement | null;
  if (!extraDiv) {
    extraDiv = document.createElement("div") as HTMLElement;
    extraDiv.id = "extraobatname";
    if (parent.nextSibling) {
      grandParent.insertBefore(extraDiv, parent.nextSibling);
    } else {
      grandParent.appendChild(extraDiv);
    }
  }
  extraDiv.style.background = "#f8f9fa";
  extraDiv.style.border = "1px solid #dee2e6";
  extraDiv.style.borderRadius = "6px";
  extraDiv.style.padding = "8px 12px";
  extraDiv.style.marginTop = "8px";
  extraDiv.style.fontFamily = "inherit";
  extraDiv.style.fontSize = "14px";
  extraDiv.style.color = "#333";
  extraDiv.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
  const [kode, nama, margin] = matchingData || ["-", "-", "-"];
  extraDiv.innerHTML = `
    <div><strong>Kode Obat:</strong> ${kode}</div>
    <div><strong>Nama Obat:</strong> ${nama}</div>
    <div><strong>Margin:</strong> ${margin}</div>
  `;
  if (matchingData && margin !== undefined && margin !== "-") {
    extraDiv.setAttribute("data-margin", margin);
  } else {
    extraDiv.removeAttribute("data-margin");
  }
}

function createOrUpdateSaranHargaJual(
  hargaBeliInput: HTMLInputElement | null,
  hargaJualInput: HTMLInputElement | null,
  matchingData: [string, string, string] | null
) {
  // Use event listener for hargaBeliInput and ensure cleanup
  const extraHargaJualId = "extra-harga-jual";
  if (hargaBeliInput && hargaJualInput && matchingData) {
    let marginPercent = 0;
    if (matchingData[2] && matchingData[2] !== "-") {
      const parsedMargin = parsePercentString(matchingData[2]);
      if (parsedMargin !== null) marginPercent = parsedMargin;
    }
    // Add extra div for harga jual if not exists
    let extraDiv = hargaJualInput.parentElement?.parentElement?.querySelector(
      `#${extraHargaJualId}`
    ) as HTMLElement | null;
    if (!extraDiv) {
      extraDiv = document.createElement("div");
      extraDiv.id = extraHargaJualId;
      extraDiv.style.background = "#eaf7ea";
      extraDiv.style.border = "1px solid #b2d8b2";
      extraDiv.style.borderRadius = "6px";
      extraDiv.style.padding = "6px 10px";
      extraDiv.style.marginTop = "6px";
      extraDiv.style.fontFamily = "inherit";
      extraDiv.style.fontSize = "13px";
      extraDiv.style.color = "#225522";
      extraDiv.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)";
      hargaJualInput.parentElement?.parentElement?.appendChild(extraDiv);
    }

    // Remove previous listener if exists
    if ((hargaBeliInput as any)._hargaBeliListener) {
      return;
    }
    // Define and store the listener
    const updateHargaJualExtra = () => {
      const beliVal = hargaBeliInput.value;
      const beliNum = parseRupiah(beliVal);
      if (beliNum !== null) {
        const jualNum = Math.round(beliNum * (1 + marginPercent / 100));
        extraDiv.innerHTML = `<strong>Saran Harga Jual:</strong> Rp ${jualNum.toLocaleString(
          "id-ID"
        )}`;
      } else {
        extraDiv.innerHTML = `<strong>Saran Harga Jual:</strong> -`;
      }
    };
    hargaBeliInput.addEventListener("input", updateHargaJualExtra);
    (hargaBeliInput as any)._hargaBeliListener = updateHargaJualExtra;
    updateHargaJualExtra();
  }
}
const h1XPath =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div[2]/div[1]/div/div[1]/div/h1[text()="Restock dan Return Obat / Barang"]';
const obatNameInputXPath =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div[2]/div[1]/div/form/div[6]//*[@id="autocomplete"]';
const inputHargaBeliSatuanObat =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div[2]/div[1]/div/form/div[6]//input[@name="baseFee"]';
const inputHargaJualSatuanObatBaru =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div[2]/div[1]/div/form/div[6]//input[@name="sellNormalFeeNew"]';

function evaluateXPath<T extends Node>(
  xpath: string,
  context: Document | Element = document
): T | null {
  return document.evaluate(
    xpath,
    context,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue as T | null;
}

function normalizeNamaObat(str: string): string {
  return str
    .replace(/\s{2,}/g, " ")
    .trim()
    .toUpperCase();
}

function parsePercentString(str: string): number | null {
  const cleaned = str.replace("%", "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function findMatchingMarginData(
  marginData: any[],
  obatNameValue: string
): [string, string, string] | null {
  const match = marginData.find(
    (dataRow) =>
      normalizeNamaObat(dataRow[1]) === normalizeNamaObat(obatNameValue)
  );
  return match || null;
}

export const modifyRestockReturn = (ctx: any) => {
  const h1 = evaluateXPath<HTMLHeadingElement>(h1XPath);
  if (!h1) return;

  const obatNameInput = evaluateXPath<HTMLInputElement>(obatNameInputXPath);
  if (!obatNameInput) return;

  let obatNameValue = obatNameInput.value.trim();
  if (obatNameValue.length < 3) return;

  window._prevObatNameValue = window._prevObatNameValue || "";
  const prevObatNameValue = window._prevObatNameValue;
  const isObatNameChanged = prevObatNameValue !== obatNameValue;
  window._prevObatNameValue = obatNameValue;

  let isLoadingState = false;
  const nextNode = obatNameInput.nextSibling as HTMLElement | null;
  if (nextNode && nextNode.getAttribute("role") === "progressbar") {
    isLoadingState = true;
  }

  const marginData = window.marginData || [];
  const matchingData = findMatchingMarginData(marginData, obatNameValue);

  if (isObatNameChanged) {
    createOrUpdateObatNameExtraDiv(obatNameInput, matchingData);
  }
  const hargaBeliInput = evaluateXPath<HTMLInputElement>(
    inputHargaBeliSatuanObat
  );
  const hargaJualInput = evaluateXPath<HTMLInputElement>(
    inputHargaJualSatuanObatBaru
  );

  createOrUpdateSaranHargaJual(hargaBeliInput, hargaJualInput, matchingData);

  window.restockReturnObatWasLoadingState = isLoadingState;
};
