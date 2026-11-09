import type { HubEntry } from "./bus";
import type { SortDirection } from "./tabs";

/**
 * The hub's own order, used when nothing is chosen yet: the first usable tool here opens first.
 * Tools the hub does not know sort after these, alphabetically. The tab strip shows A–Z or Z–A.
 */
const ORDER = ["run", "skills", "switch", "export", "workspace-links"];

const NONE: readonly HubEntry[] = [];

interface Slot {
  token: symbol;
  entry: HubEntry;
}

interface Group {
  workspaceId: string;
  slots: Map<string, Slot>;
  snapshot: readonly HubEntry[];
  listeners: Set<() => void>;
}

const groups = new Map<string, Group>();
const selection = new Map<string, string>();
let onGroupChange: (agentId: string) => void = () => {};

/** The controller hears about every change so it can add or remove the hub pill. */
export function setGroupChangeHandler(handler: (agentId: string) => void): void {
  onGroupChange = handler;
}

let onReattach: () => void = () => {};

/** The running hub registers how to make every tool attach to it afresh. */
export function setReattachHandler(handler: () => void): void {
  onReattach = handler;
}

/** For a popover that finds no tools: asks the hub to make every tool attach again. */
export function reattachTools(): void {
  onReattach();
}

export interface HubProbe {
  /** Whether this hub is the one on the bus, so the one tools attach to. */
  onBus: boolean;
}

let probe: () => HubProbe = () => ({ onBus: false });

/** The running hub registers how to tell whether it is the one tools attach to. */
export function setHubProbe(next: () => HubProbe): void {
  probe = next;
}

export function hubProbe(): HubProbe {
  return probe();
}

/** How many chats have tools attached in this hub, and how many tools in all. */
export function storeStats(): { chats: number; tools: number } {
  let chats = 0;
  let tools = 0;
  for (const group of groups.values()) {
    if (group.slots.size === 0) continue;
    chats++;
    tools += group.slots.size;
  }
  return { chats, tools };
}

function rank(toolId: string): number {
  const index = ORDER.indexOf(toolId);
  return index === -1 ? ORDER.length : index;
}

function snapshotOf(group: Group): readonly HubEntry[] {
  return [...group.slots.values()]
    .map((slot) => slot.entry)
    .filter((entry) => entry.visible !== false)
    .sort((a, b) => rank(a.toolId) - rank(b.toolId) || a.toolId.localeCompare(b.toolId));
}

function changed(agentId: string, group: Group): void {
  group.snapshot = snapshotOf(group);
  for (const listener of [...group.listeners]) listener();
  onGroupChange(agentId);
}

export function setEntry(entry: HubEntry, token: symbol): void {
  let group = groups.get(entry.agentId);
  if (!group) {
    group = { workspaceId: entry.workspaceId, slots: new Map(), snapshot: NONE, listeners: new Set() };
    groups.set(entry.agentId, group);
  }
  group.workspaceId = entry.workspaceId;
  group.slots.set(entry.toolId, { token, entry });
  changed(entry.agentId, group);
}

/** Removes the slot only if it still belongs to this attachment; a newer attachment keeps it. */
export function clearEntry(agentId: string, toolId: string, token: symbol): void {
  const group = groups.get(agentId);
  const slot = group?.slots.get(toolId);
  if (!group || !slot || slot.token !== token) return;
  group.slots.delete(toolId);
  changed(agentId, group);
  if (group.slots.size === 0 && group.listeners.size === 0) groups.delete(agentId);
}

export function groupEntries(agentId: string): readonly HubEntry[] {
  return groups.get(agentId)?.snapshot ?? NONE;
}

export function groupWorkspace(agentId: string): string | undefined {
  return groups.get(agentId)?.workspaceId;
}

export function subscribeGroup(agentId: string, listener: () => void): () => void {
  let group = groups.get(agentId);
  if (!group) {
    group = { workspaceId: "", slots: new Map(), snapshot: NONE, listeners: new Set() };
    groups.set(agentId, group);
  }
  group.listeners.add(listener);
  return () => {
    const current = groups.get(agentId);
    current?.listeners.delete(listener);
    if (current && current.slots.size === 0 && current.listeners.size === 0) groups.delete(agentId);
  };
}

export function rememberSelection(agentId: string, toolId: string): void {
  selection.set(agentId, toolId);
}

export function recallSelection(agentId: string): string | undefined {
  return selection.get(agentId);
}

/** The tab order the user last picked. It is a display preference, so a hub restart keeps it. */
let sortDirection: SortDirection = "asc";

export function recallSort(): SortDirection {
  return sortDirection;
}

export function rememberSort(direction: SortDirection): void {
  sortDirection = direction;
}

/** Drops every entry, for when the hub stops and the forks fall back to their own pills. */
export function resetStore(): void {
  for (const [agentId, group] of [...groups]) {
    group.slots.clear();
    changed(agentId, group);
    if (group.listeners.size === 0) groups.delete(agentId);
  }
  selection.clear();
}
