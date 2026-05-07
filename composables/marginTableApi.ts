import { runtimeConfig } from "@/config/runtimeConfig";

export async function fetchMarginTable() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${runtimeConfig.sheets.spreadsheetId}/values/${encodeURIComponent(
    runtimeConfig.sheets.range,
  )}?key=${runtimeConfig.sheets.apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  window.marginData = data.values;
  console.log("Fetched margin data:", window.marginData);
}
