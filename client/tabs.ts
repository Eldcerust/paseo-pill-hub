import type { HubEntry } from "./bus";

export type SortDirection = "asc" | "desc";

/** The chosen tab if it is still usable, otherwise the first usable one. */
export function activeTool(entries: readonly HubEntry[], chosen: string | undefined): HubEntry | undefined {
  return entries.find((entry) => entry.toolId === chosen && !entry.disabled) ?? entries.find((entry) => !entry.disabled) ?? entries[0];
}

/** Tools whose label, title or id contains every word typed. An empty query keeps them all. */
export function filterTools(entries: readonly HubEntry[], query: string): readonly HubEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((entry) => {
    const haystack = `${entry.label} ${entry.title} ${entry.toolId}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Tabs ordered by their visible label, A to Z or Z to A. Ties fall back to the tool id so the order is stable. */
export function sortTools(entries: readonly HubEntry[], direction: SortDirection): HubEntry[] {
  const ascending = [...entries].sort(
    (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) || a.toolId.localeCompare(b.toolId),
  );
  return direction === "asc" ? ascending : ascending.reverse();
}
