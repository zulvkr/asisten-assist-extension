export default defineContentScript({
  matches: [
    "http://localhost/*",
    "https://localhost/*",
    "http://127.0.0.1/*",
    "https://127.0.0.1/*"
  ],
  main() {
    console.log("[ApotekIsaBridge] Bridge content script injected on", window.location.href);

    // Listen for events from the Vue page
    window.addEventListener("message", async (event) => {
      // Only process messages that are meant for us
      if (event.source !== window || !event.data || event.data.sender !== "APOTEK_ISA_PAGE") {
        return;
      }

      const { type, payload, messageId } = event.data;
      console.debug("[ApotekIsaBridge] Relay page message to extension background:", type, payload);

      try {
        const response = await browser.runtime.sendMessage({ type, payload });
        
        // Post the response back to the page
        window.postMessage({
          sender: "APOTEK_ISA_EXT",
          type: `${type}_RESPONSE`,
          messageId,
          payload: response
        }, "*");
      } catch (err) {
        console.error("[ApotekIsaBridge] Error calling extension background:", err);
        window.postMessage({
          sender: "APOTEK_ISA_EXT",
          type: `${type}_RESPONSE`,
          messageId,
          payload: { ok: false, error: err instanceof Error ? err.message : String(err) }
        }, "*");
      }
    });

    // Notify the page that the extension is ready and available
    window.postMessage({
      sender: "APOTEK_ISA_EXT",
      type: "APOTEK_ISA_BRIDGE_READY"
    }, "*");
  }
});
