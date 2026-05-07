interface ImportMetaEnv {
  readonly WXT_ASSIST_API_BASE?: string;
  readonly WXT_ASSIST_HOSPITAL_ID?: string;
  readonly WXT_SHEET_API_KEY?: string;
  readonly WXT_SHEET_SPREADSHEET_ID?: string;
  readonly WXT_SHEET_RANGE?: string;

  readonly VITE_ASSIST_API_BASE?: string;
  readonly VITE_ASSIST_HOSPITAL_ID?: string;
  readonly VITE_SHEET_API_KEY?: string;
  readonly VITE_SHEET_SPREADSHEET_ID?: string;
  readonly VITE_SHEET_RANGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
