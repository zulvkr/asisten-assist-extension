export function evaluateXPath<T extends Node>(
  xpath: string,
  context: Document | Element = document
): T | null {
  return document.evaluate(
    xpath,
    context,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue as T | null;
}
