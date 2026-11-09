import { getBus, sharedState, type HubApi, type HubEntry } from "./bus";
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

/** A running hub. There is one per host the app is connected to. */
export interface HubMember {
  /** Whether this hub's host wants the tool inside the hub pill. */
  merges(toolId: string): boolean;
  /** Called when a chat's tools change, so the hub can add or remove its pill for that chat. */
  syncPill(agentId: string): void;
  /** Makes every tool drop its attachment and attach again. */
  reattach(): void;
}

/*
 * Everything the hubs in this app have in common. The app runs one copy of each plugin for every host
 * it is connected to, all in one JS realm, and tools find the hub through one object on the bus. So
 * the tools' attachments are kept once for the whole app, by chat id, which is unique across hosts.
 * Each hub draws a pill only for chats of its own host and so only ever shows its own host's tools.
 * What must not happen is one host's hub taking the bus and with it the other hub's tools.
 */
interface Shared {
  version: number;
  groups: Map<string, Group>;
  selection: Map<string, string>;
  members: Set<HubMember>;
  /** The one api on the bus, whichever hub put it there. */
  api: HubApi;
}

const SHARED_KEY = "__paseoPillHubShared";
const SHARED_VERSION = 1;

function createShared(): Shared {
  const shared: Shared = {
    version: SHARED_VERSION,
    groups: new Map(),
    selection: new Map(),
    members: new Set(),
    api: {
      // Switched on for the tool by any host's hub; the bus cannot say which host is asking.
      merges: (toolId) => [...shared.members].some((member) => member.merges(toolId)),
      attach(entry) {
        const token = Symbol(entry.toolId);
        let current = entry;
        setEntry(current, token);
        return {
          update(patch) {
            current = { ...current, ...patch };
            setEntry(current, token);
          },
          remove() {
            clearEntry(current.agentId, current.toolId, token);
          },
        };
      },
    },
  };
  return shared;
}

function shared(): Shared {
  return sharedState(SHARED_KEY, SHARED_VERSION, createShared);
}

/** The api every hub puts on the bus. All hubs in this app use the same one. */
export function hubApi(): HubApi {
  return shared().api;
}

/** Registers a running hub. */
export function joinHub(member: HubMember): void {
  shared().members.add(member);
}

/** Unregisters a hub. Returns whether any hub is still running. */
export function leaveHub(member: HubMember): boolean {
  const { members } = shared();
  members.delete(member);
  return members.size > 0;
}

/** For a popover that finds no tools: asks a running hub to make every tool attach again. */
export function reattachTools(): void {
  [...shared().members][0]?.reattach();
}

export interface HubProbe {
  /** Whether a hub is running and its api is the one on the bus, which is the one tools attach to. */
  onBus: boolean;
}

export function hubProbe(): HubProbe {
  const { members, api } = shared();
  return { onBus: members.size > 0 && getBus().hub === api };
}

/** How many chats have tools attached, and how many tools in all, across every host. */
export function storeStats(): { chats: number; tools: number } {
  let chats = 0;
  let tools = 0;
  for (const group of shared().groups.values()) {
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
  // Every hub hears of every chat; each acts only on the chats of its own host.
  for (const member of [...shared().members]) member.syncPill(agentId);
}

export function setEntry(entry: HubEntry, token: symbol): void {
  const { groups } = shared();
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
  const { groups } = shared();
  const group = groups.get(agentId);
  const slot = group?.slots.get(toolId);
  if (!group || !slot || slot.token !== token) return;
  group.slots.delete(toolId);
  changed(agentId, group);
  if (group.slots.size === 0 && group.listeners.size === 0) groups.delete(agentId);
}

export function groupEntries(agentId: string): readonly HubEntry[] {
  return shared().groups.get(agentId)?.snapshot ?? NONE;
}

export function subscribeGroup(agentId: string, listener: () => void): () => void {
  const { groups } = shared();
  let group = groups.get(agentId);
  if (!group) {
    group = { workspaceId: "", slots: new Map(), snapshot: NONE, listeners: new Set() };
    groups.set(agentId, group);
  }
  group.listeners.add(listener);
  return () => {
    const current = shared().groups.get(agentId);
    current?.listeners.delete(listener);
    if (current && current.slots.size === 0 && current.listeners.size === 0) shared().groups.delete(agentId);
  };
}

export function rememberSelection(agentId: string, toolId: string): void {
  shared().selection.set(agentId, toolId);
}

export function recallSelection(agentId: string): string | undefined {
  return shared().selection.get(agentId);
}

/** The tab order the user last picked. It is a display preference, so a hub restart keeps it. */
let sortDirection: SortDirection = "asc";

export function recallSort(): SortDirection {
  return sortDirection;
}

export function rememberSort(direction: SortDirection): void {
  sortDirection = direction;
}

/** Drops every entry, for when the last hub stops and the tools fall back to their own pills. */
export function resetStore(): void {
  const { groups, selection } = shared();
  for (const [agentId, group] of [...groups]) {
    group.slots.clear();
    changed(agentId, group);
    if (group.listeners.size === 0) groups.delete(agentId);
  }
  selection.clear();
}
