import { describe, expect, it } from "vitest";
import { canScroll, revealOffset, stepOffset, type StripMetrics } from "./strip";

const at = (offset: number, viewport = 300, content = 800): StripMetrics => ({ offset, viewport, content });

describe("canScroll", () => {
  it("is false both ways until the strip has been measured", () => {
    expect(canScroll(at(0, 0, 0), "forward")).toBe(false);
    expect(canScroll(at(0, 300, 0), "forward")).toBe(false);
    expect(canScroll(at(0, 0, 800), "forward")).toBe(false);
  });

  it("only allows forward at the start and only back at the end", () => {
    expect(canScroll(at(0), "back")).toBe(false);
    expect(canScroll(at(0), "forward")).toBe(true);
    expect(canScroll(at(500), "back")).toBe(true);
    expect(canScroll(at(500), "forward")).toBe(false);
  });

  it("allows both ways in the middle", () => {
    expect(canScroll(at(200), "back")).toBe(true);
    expect(canScroll(at(200), "forward")).toBe(true);
  });

  it("allows neither way when everything fits", () => {
    expect(canScroll(at(0, 300, 280), "back")).toBe(false);
    expect(canScroll(at(0, 300, 280), "forward")).toBe(false);
  });

  it("ignores sub-pixel rounding at the edges", () => {
    expect(canScroll(at(0.5), "back")).toBe(false);
    expect(canScroll(at(499.5), "forward")).toBe(false);
  });
});

describe("stepOffset", () => {
  it("moves almost a viewport, keeping some overlap", () => {
    expect(stepOffset(at(0), "forward")).toBe(252);
    expect(stepOffset(at(252), "back")).toBe(0);
  });

  it("never goes past either end", () => {
    expect(stepOffset(at(400), "forward")).toBe(500);
    expect(stepOffset(at(100), "back")).toBe(0);
  });

  it("stays at zero when everything fits", () => {
    expect(stepOffset(at(0, 300, 280), "forward")).toBe(0);
  });

  it("still moves when the viewport is narrower than the overlap", () => {
    expect(stepOffset(at(0, 20, 400), "forward")).toBe(1);
  });
});

describe("revealOffset", () => {
  it("leaves the strip alone when the tab is already fully visible", () => {
    expect(revealOffset(at(100), { x: 150, width: 80 })).toBe(100);
  });

  it("scrolls left to a tab that is cut off on the left, with padding", () => {
    expect(revealOffset(at(200), { x: 120, width: 80 })).toBe(112);
  });

  it("scrolls right to a tab that is cut off on the right, with padding", () => {
    expect(revealOffset(at(0), { x: 400, width: 100 })).toBe(208);
  });

  it("clamps to the ends of the strip", () => {
    expect(revealOffset(at(200), { x: 0, width: 60 })).toBe(0);
    expect(revealOffset(at(0), { x: 740, width: 60 })).toBe(500);
  });

  it("does nothing before the strip has been measured", () => {
    expect(revealOffset(at(0, 0, 0), { x: 400, width: 100 })).toBe(0);
  });
});
