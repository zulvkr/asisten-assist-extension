import { createIntegratedUi } from "wxt/utils/content-script-ui/integrated";
// import "../assets/tailwind.css";

export default defineContentScript({
  matches: ["https://clinica.assist.id/*"],
  main(ctx) {
    const withXPath = (xpath: string, callback: (el: HTMLElement) => void) => {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue as HTMLElement | null;
      if (element) {
        callback(element);
      }
    };

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
        const button = document.createElement("button");
        button.textContent = "Sembunyikan Panel Samping";
        button.style.marginLeft = "16px";
        container.append(button);

        button.addEventListener("click", () => {
          withXPath(
            '//*[@id="kamarmedis-content"]/div/div/div[1]',
            (element) => {
              if (isHidden) {
                element.style.display = "";
                button.textContent = "Sembunyikan Panel Samping";
              } else {
                element.style.display = "none";
                button.textContent = "Show Sidebar";
              }
            }
          );
          withXPath(
            '//*[@id="kamarmedis-content"]/div/div/div[2]',
            (element) => {
              if (isHidden) {
                element.style.maxWidth = "";
                element.style.flexBasis = "";
              } else {
                element.style.maxWidth = "100%";
                element.style.flexBasis = "100%";
              }
            }
          );
          isHidden = !isHidden;
        });
      },
    });
    ui.autoMount();
  },
});
