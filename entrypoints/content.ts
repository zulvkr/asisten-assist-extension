import "../assets/main.css";
import { mountSidebarControlUi } from "../components/sidebarUi";

export default defineContentScript({
  matches: ["https://clinica.assist.id/*"],
  main(ctx) {
    mountSidebarControlUi(ctx);
    console.log("Content script loaded on", window.location.href);
    fetchMarginTable();

    const observer = new MutationObserver(() => {
      modifyTableObat(ctx);
      modifyRestockReturn(ctx);
    });

    function waitForTargetAndObserve() {
      const target = document.querySelector("#kamarmedis-content");
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      } else {
        setTimeout(waitForTargetAndObserve, 500);
      }
    }
    waitForTargetAndObserve();
  },
});
