/** What the tab strip needs to know about its scroll position. All values are in pixels. */
export interface StripMetrics {
  offset: number;
  viewport: number;
  content: number;
}

export interface Slot {
  x: number;
  width: number;
}

export type Direction = "back" | "forward";

/** Part of the previous or next tab stays visible after an arrow press, so the user keeps their place. */
const OVERLAP = 24;
/** Breathing room kept around a tab that is scrolled into view. */
const REVEAL_PAD = 8;

function maxOffset({ viewport, content }: StripMetrics): number {
  return Math.max(0, content - viewport);
}

function clamp(value: number, metrics: StripMetrics): number {
  return Math.min(Math.max(value, 0), maxOffset(metrics));
}

/** Whether there is more strip to scroll to in that direction. Nothing is scrollable before the strip has been measured. */
export function canScroll(metrics: StripMetrics, direction: Direction): boolean {
  if (metrics.viewport <= 0 || metrics.content <= 0) return false;
  return direction === "back" ? metrics.offset > 1 : metrics.offset < maxOffset(metrics) - 1;
}

/** Where one arrow press lands: almost a full viewport over, never past either end. */
export function stepOffset(metrics: StripMetrics, direction: Direction): number {
  const step = Math.max(1, metrics.viewport - OVERLAP * 2);
  return clamp(metrics.offset + (direction === "back" ? -step : step), metrics);
}

/** The smallest scroll that brings a tab fully into view; the current offset when it already is. */
export function revealOffset(metrics: StripMetrics, slot: Slot): number {
  if (metrics.viewport <= 0 || metrics.content <= 0) return metrics.offset;
  const left = slot.x - REVEAL_PAD;
  const right = slot.x + slot.width + REVEAL_PAD;
  if (left < metrics.offset) return clamp(left, metrics);
  if (right > metrics.offset + metrics.viewport) return clamp(right - metrics.viewport, metrics);
  return metrics.offset;
}
