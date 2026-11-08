import { KNOWN_TOOLS } from "../shared/config";
import type { HubEntry } from "./bus";

export type TakesOver = (toolId: string) => boolean;

/** A tool whose popover opens a dialog that covers the tab strip, such as Switch. */
export const takesOver: TakesOver = (toolId) => KNOWN_TOOLS.some((tool) => tool.toolId === toolId && tool.takesOver === true);

/** Where the hub opens: the first usable tab that does not take the screen over. */
export function landingTool(entries: readonly HubEntry[], over: TakesOver = takesOver): HubEntry | undefined {
  return entries.find((entry) => !entry.disabled && !over(entry.toolId)) ?? entries.find((entry) => !entry.disabled) ?? entries[0];
}

/** The chosen tab if it is still usable, otherwise the landing tab. */
export function activeTool(entries: readonly HubEntry[], chosen: string | undefined, over: TakesOver = takesOver): HubEntry | undefined {
  const picked = entries.find((entry) => entry.toolId === chosen && !entry.disabled);
  return picked ?? landingTool(entries, over);
}

/** Whether there is a normal tab to fall back to when a takeover tool's dialog closes. */
export function hasLanding(entries: readonly HubEntry[], over: TakesOver = takesOver): boolean {
  return entries.some((entry) => !entry.disabled && !over(entry.toolId));
}
