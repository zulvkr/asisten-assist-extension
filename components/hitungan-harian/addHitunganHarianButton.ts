import { createIntegratedUi } from "wxt/utils/content-script-ui/integrated";
import { createApp, type App as VueApp } from "vue";
import HitunganHarianApp from "./HitunganHarianApp.vue";

export function mountHitunganHarianButtonUi(ctx: any) {
  let app: VueApp<Element> | null = null;

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
      return result.singleNodeValue as HTMLElement | null;
    },
    onMount: (container) => {
      console.log("Mounting Hitungan Harian Button UI");
      app = createApp(HitunganHarianApp);
      app.mount(container);
      return app;
    },
    onRemove: (mountedApp) => {
      mountedApp?.unmount();
      app = null;
    },
  });
  return ui;
}
