import { HEIGHT_MAX, HEIGHT_MIN, heightDefaults, type HeightPlatform, type Heights } from "../shared/config";

/*
 * The tool-area height limits. The settings screen and the hub's config poll feed this store, and
 * every open Tools popover reads it, so a change applies without reopening anything.
 */

let current: Heights = heightDefaults;
const listeners = new Set<() => void>();

export function currentHeights(): Heights {
  return current;
}

export function subscribeHeights(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replaces the limits; listeners hear about it only when a value actually changed. */
export function setHeights(next: Heights): void {
  if (next.web === current.web && next.ios === current.ios && next.android === current.android) return;
  current = { web: next.web, ios: next.ios, android: next.android };
  for (const listener of [...listeners]) listener();
}

/**
 * The tallest the tool area may be on this platform, in px, or undefined for no limit. A platform
 * Paseo adds later falls back to the desktop value rather than to no limit at all.
 *
 * The desktop value exists because of the anchored popover's 440px cap. A compact layout shows a
 * bottom sheet instead, which has no cap and scrolls itself, so the desktop value does not apply to
 * it. A narrow browser window would otherwise clip a tool that sizes itself to the screen.
 */
export function heightFor(heights: Heights, platform: string, compact = false): number | undefined {
  const known = platform in heights;
  if (compact && (!known || platform === "web")) return undefined;
  const value = (heights as Record<string, number | undefined>)[known ? platform : "web"] ?? heights.web;
  return value > 0 ? value : undefined;
}

/** Room a phone's bottom sheet leaves above the tool area, which Switch also reserves (its HUB_CHROME_HEIGHT). */
const SHEET_CHROME = 380;
const SHEET_TOOL_MIN = 340;
const SHEET_TOOL_MAX = 560;

/**
 * How tall the tool area is on a phone, whichever tool is showing. The sheet is as tall as its content
 * when it opens and does not re-anchor when the content grows afterwards, so a tool that appears late
 * or a tab that is taller than the last one leaves the bottom of the sheet below the screen. Holding
 * the area at one height means the sheet never has to grow. It is what Switch asks for, so Switch fits
 * exactly; a limit set in the settings wins when it is smaller.
 */
export function sheetToolHeight(windowHeight: number, limit?: number): number {
  const wanted = Math.max(SHEET_TOOL_MIN, Math.min(SHEET_TOOL_MAX, Math.round(windowHeight - SHEET_CHROME)));
  return limit !== undefined ? Math.min(wanted, limit) : wanted;
}

export type HeightDraft = { ok: true; value: number } | { ok: false; error: string };

/** What was typed in a height field: blank or 0 is no limit, otherwise whole pixels within range. */
export function parseHeightDraft(text: string): HeightDraft {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: 0 };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: "Enter a whole number of pixels, or leave it blank for no limit." };
  const value = Number(trimmed);
  if (value === 0) return { ok: true, value: 0 };
  if (value < HEIGHT_MIN || value > HEIGHT_MAX) return { ok: false, error: `Use ${HEIGHT_MIN} to ${HEIGHT_MAX} px, or leave it blank for no limit.` };
  return { ok: true, value };
}

/** A stored limit as the text shown in its field; no limit is an empty field. */
export function heightText(value: number): string {
  return value > 0 ? String(value) : "";
}

export type { HeightPlatform, Heights };
