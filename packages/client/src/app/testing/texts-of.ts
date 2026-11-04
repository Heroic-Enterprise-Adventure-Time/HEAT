/** The text of each element, its whitespace collapsed, as a reader sees it. */
export const textsOf = (elements: readonly HTMLElement[]) => elements.map((element) => element.textContent.replace(/\s+/g, ' ').trim());
