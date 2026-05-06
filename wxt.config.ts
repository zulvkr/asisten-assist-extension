import { defineConfig } from "wxt";
import { resolve } from "node:path";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  webExt: {
    chromiumProfile: resolve(".wxt/chrome-data"),
    keepProfileChanges: true,
  },
  manifest: {
    permissions: ["storage"],
    host_permissions: [
      "https://clinica.assist.id/*",
      "https://api-clinica.assist.id/*",
      "https://omni.desty.app/*",
      "https://*.desty.app/*",
    ],
  },
});
