import { describe, expect, it } from "vitest";

import { drawnWithoutAnchor, hideOwnOverlay, type Element } from "./duplicate";

/*
 * The duplicate Tools surface is the one drawn against a pill that has no layout: the host portals it
 * into its own layer under #overlay-root, and hiding that layer is the only way to remove it without
 * closing the pill (both surfaces share one open flag).
 */

function node(style: { display: string } = { display: "" }): Element {
  return { parentElement: null, style, ownerDocument: { getElementById: () => null } };
}

/** #overlay-root > layer > holder > surface > content, the shape the host builds. */
function overlay(layerStyle = { display: "" }) {
  const layer = node(layerStyle);
  const holder = node();
  const surface = node();
  const content = node();
  holder.parentElement = layer;
  surface.parentElement = holder;
  content.parentElement = surface;
  const root = node();
  layer.parentElement = root;
  root.ownerDocument.getElementById = (id) => (id === "overlay-root" ? root : null);
  content.ownerDocument = root.ownerDocument;
  return { content, layer };
}

describe("telling the duplicate surface apart", () => {
  it("counts a surface at the viewport's top-left corner as drawn without an anchor", () => {
    expect(drawnWithoutAnchor({ getBoundingClientRect: () => ({ left: 16, top: 16 }) })).toBe(true);
  });

  it("keeps a surface anchored to a pill near the bottom of the window", () => {
    expect(drawnWithoutAnchor({ getBoundingClientRect: () => ({ left: 640, top: 470 }) })).toBe(false);
  });

  it("hides nothing where there is no DOM, which is every phone", () => {
    expect(drawnWithoutAnchor({})).toBe(false);
    expect(hideOwnOverlay({})).toBeUndefined();
    expect(hideOwnOverlay(null)).toBeUndefined();
  });
});

describe("removing the duplicate's overlay layer", () => {
  it("hides the layer the surface was portalled into, not the overlay root", () => {
    const { content, layer } = overlay();
    hideOwnOverlay(content);
    expect(layer.style.display).toBe("none");
  });

  it("puts the layer back, so the same surface can be shown again", () => {
    const { content, layer } = overlay();
    const restore = hideOwnOverlay(content);
    expect(layer.style.display).toBe("none");
    restore?.();
    expect(layer.style.display).toBe("");
  });

  it("leaves a layer it does not own alone", () => {
    const other = overlay();
    hideOwnOverlay({ parentElement: null, style: { display: "" }, ownerDocument: other.layer.ownerDocument });
    expect(other.layer.style.display).toBe("");
  });
});
