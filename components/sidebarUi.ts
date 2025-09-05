import { createIntegratedUi } from "wxt/utils/content-script-ui/integrated";
import { createToggleSidebarButton } from "../components/toggleSidebarButton";

export function mountSidebarControlUi(ctx: any) {
  let isHidden = false;
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
      const button = createToggleSidebarButton((btn: HTMLButtonElement) => {
        withXPath('//*[@id="kamarmedis-content"]/div/div/div[1]', (element) => {
          if (isHidden) {
            element.style.display = "";
            btn.textContent = "Sembunyikan Sidebar";
          } else {
            element.style.display = "none";
            btn.textContent = "Tampilkan Sidebar";
          }
        });
        withXPath('//*[@id="kamarmedis-content"]/div/div/div[2]', (element) => {
          if (isHidden) {
            element.style.maxWidth = "";
            element.style.flexBasis = "";
          } else {
            element.style.maxWidth = "100%";
            element.style.flexBasis = "100%";
          }
        });
        isHidden = !isHidden;
      });
      container.append(button);
    },
  });
  ui.autoMount();
}
