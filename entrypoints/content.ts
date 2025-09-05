import "../assets/main.css";
import { mountSidebarControlUi } from "../components/sidebarUi";

const watchPattern = new MatchPattern("https://clinica.assist.id/apotek");

export default defineContentScript({
  matches: ["https://clinica.assist.id/*"],
  main(ctx) {
    mountSidebarControlUi(ctx);
    console.log("Content script loaded on", window.location.href);
    fetchMarginTable();
    addMarginToTableObat(ctx);
  },
});
