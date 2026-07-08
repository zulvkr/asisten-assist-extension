import { createApp } from "vue";
import { createPinia } from "pinia";
import * as components from "quasar";
import * as directives from "quasar";
import { Quasar, Notify, Dialog, Loading } from "quasar";

import "./style.css";

import AssistApp from "@/components/assistApp/AssistApp.vue";

const app = createApp(AssistApp);

app.use(createPinia());
app.use(Quasar, {
  components,
  directives,
  config: {
    brand: {
      primary: "#009688", // Teal
      secondary: "#26A69A",
      accent: "#9C27B0",
      dark: "#1d1d1d",
      positive: "#21BA45",
      negative: "#C10015",
      info: "#31CCEC",
      warning: "#F2C037"
    }
  },
  plugins: {
    Notify,
    Dialog,
    Loading
  },
});

app.mount("#app");
