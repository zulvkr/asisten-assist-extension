export function withXPath(xpath: string, callback: (el: HTMLElement) => void) {
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
}
