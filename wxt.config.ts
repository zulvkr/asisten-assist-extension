import { defineConfig } from "wxt";
import { resolve } from "node:path";

// See https://wxt.dev/api/config.html
export default defineConfig({
  webExt: {
    chromiumProfile: resolve(".wxt/chrome-data"),
    keepProfileChanges: true,
  },
  manifest: {
    host_permissions: ["https://api-clinica.assist.id/*"],
  },
});
