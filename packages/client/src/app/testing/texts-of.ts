/** The text of each element, its whitespace collapsed, as a reader sees it. */
export const textsOf = (elements: readonly HTMLElement[]) => elements.map((element) => element.textContent.replace(/\s+/g, ' ').trim());

/**
 * What a reader hears of each element, piece by piece: each run of text and
 * each picture by its name, an image by its alternative text and a
 * `role="img"` by its label, joined by spaces, so that a resource chip reads
 * "timber 60" and a hero tile "Wren villager, level 1" though the template
 * puts no space between their parts.
 */
export const wordsOf = (elements: readonly HTMLElement[]) =>
  elements.map((element) => {
    const words: string[] = [];
    const walk = (node: Node) => {
      if (node instanceof HTMLElement && (node instanceof HTMLImageElement || node.getAttribute('role') === 'img')) {
        words.push(node.getAttribute('alt') ?? node.getAttribute('aria-label') ?? '');
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) words.push(node.textContent ?? '');
      for (const child of node.childNodes) walk(child);
    };
    walk(element);
    return words.join(' ').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
  });
