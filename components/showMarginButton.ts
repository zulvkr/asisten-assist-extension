export function createShowMarginButton(
  onClick: (button: HTMLButtonElement) => void
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Tampilkan Margin";
  button.className = "tailwind-btn";
  button.addEventListener("click", () => onClick(button));
  return button;
}
