export interface RuntimeConfig {
  assistApiBase: string;
  assistHospitalId: string;
  sheets: {
    apiKey: string;
    spreadsheetId: string;
    range: string;
  };
}

const DEFAULT_CONFIG: RuntimeConfig = {
  assistApiBase: "https://api-clinica.assist.id/api",
  assistHospitalId: "6874f9569abc98f9c645b330",
  sheets: {
    apiKey: "AIzaSyBs2KxfVTHAA8ccLG7cc4lQVqwWOzsMOTE",
    spreadsheetId: "1e1Dx9ssIJYDQYnMCygwMS2RfX3WxXF7aN9nvV9995wA",
    range: "TabelMargin",
  },
};

function pickConfigValue(
  fallback: string,
  ...candidates: Array<string | undefined>
): string {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) {
      return value;
    }
  }

  return fallback;
}

function ensureNonEmpty(name: string, value: string): string {
  if (!value.trim()) {
    throw new Error(`runtimeConfig.${name} is required but empty.`);
  }

  return value;
}

export const runtimeConfig: RuntimeConfig = Object.freeze({
  assistApiBase: ensureNonEmpty(
    "assistApiBase",
    pickConfigValue(
      DEFAULT_CONFIG.assistApiBase,
      import.meta.env.WXT_ASSIST_API_BASE,
      import.meta.env.VITE_ASSIST_API_BASE,
    ),
  ),
  assistHospitalId: ensureNonEmpty(
    "assistHospitalId",
    pickConfigValue(
      DEFAULT_CONFIG.assistHospitalId,
      import.meta.env.WXT_ASSIST_HOSPITAL_ID,
      import.meta.env.VITE_ASSIST_HOSPITAL_ID,
    ),
  ),
  sheets: {
    apiKey: ensureNonEmpty(
      "sheets.apiKey",
      pickConfigValue(
        DEFAULT_CONFIG.sheets.apiKey,
        import.meta.env.WXT_SHEET_API_KEY,
        import.meta.env.VITE_SHEET_API_KEY,
      ),
    ),
    spreadsheetId: ensureNonEmpty(
      "sheets.spreadsheetId",
      pickConfigValue(
        DEFAULT_CONFIG.sheets.spreadsheetId,
        import.meta.env.WXT_SHEET_SPREADSHEET_ID,
        import.meta.env.VITE_SHEET_SPREADSHEET_ID,
      ),
    ),
    range: ensureNonEmpty(
      "sheets.range",
      pickConfigValue(
        DEFAULT_CONFIG.sheets.range,
        import.meta.env.WXT_SHEET_RANGE,
        import.meta.env.VITE_SHEET_RANGE,
      ),
    ),
  },
});
