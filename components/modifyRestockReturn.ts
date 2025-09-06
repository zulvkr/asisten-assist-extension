const h1XPath =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div[2]/div[1]/div/div[1]/div/h1[text()="Restock dan Return Obat / Barang"]';
const obatNameInputXPath =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div[2]/div[1]/div/form/div[6]//*[@id="autocomplete"]';
const inputHargaBeliSatuanObat =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div[2]/div[1]/div/form/div[6]//input[@name="baseFee"]';
const inputHargaJualSatuanObatBaru =
  '//*[@id="kamarmedis-content"]/div/div/div[2]/div[2]/div[1]/div/form/div[6]//input[@name="sellNormalFeeNew"]';

function createOrUpdateObatNameExtraDiv(
  obatNameInput: HTMLInputElement,
  matchingData: [string, string, string] | null
) {
  const parent = obatNameInput.parentElement as HTMLElement;
  const grandParent = parent?.parentElement as HTMLElement;
  let extraDiv = grandParent?.querySelector(
    "#extraobatname"
  ) as HTMLElement | null;
  if (!extraDiv) {
    extraDiv = document.createElement("div");
    extraDiv.id = "extraobatname";
    if (parent?.nextSibling) {
      grandParent?.insertBefore(extraDiv, parent.nextSibling);
    } else {
      grandParent?.appendChild(extraDiv);
    }
  }
  setStyles(extraDiv, {
    background: "#f8f9fa",
    border: "1px solid #dee2e6",
    borderRadius: "6px",
    padding: "8px 12px",
    marginTop: "8px",
    fontFamily: "inherit",
    fontSize: "14px",
    color: "#333",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  });

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
      setStyles(extraDiv, {
        background: "#eaf7ea",
        border: "1px solid #b2d8b2",
        borderRadius: "6px",
        padding: "6px 10px",
        marginTop: "6px",
        fontFamily: "inherit",
        fontSize: "13px",
        color: "#225522",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      });
      hargaJualInput.parentElement?.parentElement?.appendChild(extraDiv);
    }

    // Remove previous listener if margin has changed
    if (
      (hargaBeliInput as any)._hargaBeliListener &&
      (hargaBeliInput as any)._hargaBeliListenerMargin !== marginPercent
    ) {
      hargaBeliInput.removeEventListener(
        "input",
        (hargaBeliInput as any)._hargaBeliListener
      );
      (hargaBeliInput as any)._hargaBeliListener = null;
      (hargaBeliInput as any)._hargaBeliListenerMargin = null;
    }
    // Add listener only if not present for current margin
    if (!(hargaBeliInput as any)._hargaBeliListener) {
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
      (hargaBeliInput as any)._hargaBeliListenerMargin = marginPercent;
      updateHargaJualExtra();
    }
  }
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

  (obatNameInput as any)._prevObatNameValue =
    (obatNameInput as any)._prevObatNameValue || "";
  const prevObatNameValue = (obatNameInput as any)._prevObatNameValue;
  const isObatNameChanged = prevObatNameValue !== obatNameValue;
  (obatNameInput as any)._prevObatNameValue = obatNameValue;

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
};
