const API_KEY = "AIzaSyBs2KxfVTHAA8ccLG7cc4lQVqwWOzsMOTE";
const SPREADSHEET_ID = "1e1Dx9ssIJYDQYnMCygwMS2RfX3WxXF7aN9nvV9995wA";
const RANGE = "TabelMargin";

export async function fetchMarginTable() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    RANGE
  )}?key=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  window.marginData = data.values;
  console.log("Fetched margin data:", window.marginData);
}
