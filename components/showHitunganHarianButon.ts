export function createShowHitunganHarianButton(
  onClick: (button: HTMLButtonElement) => void
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Show Hitungan Harian";
  button.className = "tailwind-btn";
  button.addEventListener("click", () => onClick(button));
  return button;
}
