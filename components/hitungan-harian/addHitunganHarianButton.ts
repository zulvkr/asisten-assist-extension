import { createIntegratedUi } from "wxt/utils/content-script-ui/integrated";
import { createShowHitunganHarianButton } from "./createShowHitunganHarianButon";
import { showHitunganHarianDialog } from "./hitunganHarianDialog";

export function mountHitunganHarianButtonUi(ctx: any) {
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
      const button = createShowHitunganHarianButton(() => {
        showHitunganHarianDialog();
      });
      container.append(button);
    },
  });
  return ui;
}
