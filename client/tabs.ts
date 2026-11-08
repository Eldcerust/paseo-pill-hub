import type { HubEntry } from "./bus";

/** The chosen tab if it is still usable, otherwise the first usable one. */
export function activeTool(entries: readonly HubEntry[], chosen: string | undefined): HubEntry | undefined {
  return entries.find((entry) => entry.toolId === chosen && !entry.disabled) ?? entries.find((entry) => !entry.disabled) ?? entries[0];
}
