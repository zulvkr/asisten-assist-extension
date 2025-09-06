export function setStyles(
  div: HTMLElement,
  styles?: Partial<CSSStyleDeclaration>
) {
  if (styles) {
    Object.assign(div.style, styles);
  }
}
