/**
 * The host draws a pill for every composer it keeps mounted, and a popover it drew outlives the composer
 * it belongs to, so one chat can end up with two Tools surfaces. One is anchored to a pill the user can
 * see; the other was drawn against a pill that has no layout and lands in the viewport's top-left corner.
 * The host has no API to close one surface of a pill without closing the pill, so that one is hidden.
 */

/** The parts of a DOM node this file needs. The project has no DOM lib, and the code runs on phones too. */
export type Element = {
  parentElement: Element | null;
  style: { display: string };
  ownerDocument: { getElementById(id: string): Element | null };
};

/** Whether a surface was drawn without an anchor, by its own position. Always false where there is no DOM. */
export function drawnWithoutAnchor(node: unknown): boolean {
  const element = node as { getBoundingClientRect?: () => { left: number; top: number } } | null;
  const rect = element?.getBoundingClientRect?.();
  // No DOM (native): nothing to measure, so nothing is hidden.
  if (!rect) return false;
  // Position only: a hidden duplicate's wrapper collapses to no size but keeps its place.
  return rect.left < 80 && rect.top < 80;
}

/**
 * Hides the overlay layer this React tree was portalled into. The host portals each popover into its own
 * layer under `#overlay-root` (a backdrop, then the surface), so hiding that one layer leaves any other
 * popover alone. Returns a function that puts the layer back, or undefined when there is nothing to hide.
 */
export function hideOwnOverlay(node: unknown): (() => void) | undefined {
  const element = node as Element | null;
  const root = element?.ownerDocument?.getElementById("overlay-root") ?? null;
  if (!element || !root) return undefined;
  let layer: Element | null = element;
  while (layer && layer.parentElement !== root) layer = layer.parentElement;
  if (!layer) return undefined;
  const previous = layer.style.display;
  layer.style.display = "none";
  return () => {
    layer!.style.display = previous;
  };
}
