import "../assets/main.css";

export default defineContentScript({
  matches: ["https://clinica.assist.id/*"],
  async main(ctx) {
    console.log("Content script loaded on", window.location.href);
    await fetchMarginTable();

    const observer = new MutationObserver(() => {
      modifyTableObat(ctx);
      modifyRestockReturn(ctx);
      modifyTableBhp(ctx);
    });

    function waitForTargetAndObserve() {
      const target = document.querySelector("#kamarmedis-content");
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      } else {
        setTimeout(waitForTargetAndObserve, 500);
      }
    }

    function waitButtonAndListen() {
      const button = evaluateXPath(
        '//*[@id="appBar"]/div/div/div[2]/div[2]/div/div[2]/button'
      );
      if (button) {
        button.addEventListener("click", async () => {
          await fetchMarginTable();
          modifyTableObat(ctx);
          modifyRestockReturn(ctx);
          modifyTableBhp(ctx);
        });
      } else {
        setTimeout(waitButtonAndListen, 500);
      }
    }

    waitButtonAndListen();
    waitForTargetAndObserve();
  },
});
