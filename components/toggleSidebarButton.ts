export function createToggleSidebarButton(
  onClick: (button: HTMLButtonElement) => void
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Sembunyikan Sidebar";
  button.className = "tailwind-btn";
  button.addEventListener("click", () => onClick(button));
  return button;
}
