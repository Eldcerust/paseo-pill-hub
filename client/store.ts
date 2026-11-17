import { getBus, sharedState, type HubApi, type HubEntry } from "./bus";
import type { SortDirection } from "./tabs";
import { createStore, useStore, type StoreApi } from "./zustand";

/**
 * The hub's own order, used when nothing is chosen yet: the first usable tool here opens first.
 * Tools the hub does not know sort after these, alphabetically. The tab strip shows A–Z or Z–A.
 */
const ORDER = ["run", "skills", "switch", "export", "workspace-links"];

const NONE: readonly HubEntry[] = [];

/** One chat's tools, as the popover reads them. */
interface Group {
  workspaceId: string;
  entries: readonly HubEntry[];
}

/** The popover that is on screen. There is only ever one. */
interface Popover {
  id: number;
  agentId: string;
  close(): void;
}

/** The part of the shared state a render depends on. */
interface State {
  groups: Readonly<Record<string, Group>>;
  selection: Readonly<Record<string, string>>;
  popover: Popover | null;
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
  /** The reactive state. Every copy of the hub in this app reads and writes this one store. */
  store: StoreApi<State>;
  /** Which attachment owns a chat's tool slot, so a late removal cannot take a newer attachment's place. */
  tokens: Map<string, Map<string, symbol>>;
  members: Set<HubMember>;
  /** The one api on the bus, whichever hub put it there. */
  api: HubApi;
  popoverSeq: number;
}

const SHARED_KEY = "__paseoPillHubShared";
const SHARED_VERSION = 2;

function createShared(): Shared {
  const store = createStore<State>(() => ({ groups: {}, selection: {}, popover: null }));
  const shared: Shared = {
    version: SHARED_VERSION,
    store,
    tokens: new Map(),
    members: new Set(),
    popoverSeq: 0,
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
  for (const group of Object.values(shared().store.getState().groups)) {
    if (group.entries.length === 0) continue;
    chats++;
    tools += group.entries.length;
  }
  return { chats, tools };
}

function rank(toolId: string): number {
  const index = ORDER.indexOf(toolId);
  return index === -1 ? ORDER.length : index;
}

function entriesOf(group: Group): readonly HubEntry[] {
  return [...group.entries].sort((a, b) => rank(a.toolId) - rank(b.toolId) || a.toolId.localeCompare(b.toolId));
}

function withGroup(state: State, agentId: string, group: Group): State {
  return { ...state, groups: { ...state.groups, [agentId]: group } };
}

export function setEntry(entry: HubEntry, token: symbol): void {
  const { store, tokens } = shared();
  let slots = tokens.get(entry.agentId);
  if (!slots) {
    slots = new Map();
    tokens.set(entry.agentId, slots);
  }
  slots.set(entry.toolId, token);
  const state = store.getState();
  const group = state.groups[entry.agentId] ?? { workspaceId: entry.workspaceId, entries: NONE };
  const entries = group.entries.filter((current) => current.toolId !== entry.toolId);
  store.setState(withGroup(state, entry.agentId, { workspaceId: entry.workspaceId, entries: entriesOf({ ...group, entries: [...entries, entry] }) }));
  changed(entry.agentId);
}

/** Removes the slot only if it still belongs to this attachment; a newer attachment keeps it. */
export function clearEntry(agentId: string, toolId: string, token: symbol): void {
  const { store, tokens } = shared();
  const slots = tokens.get(agentId);
  if (!slots || slots.get(toolId) !== token) return;
  slots.delete(toolId);
  const state = store.getState();
  const group = state.groups[agentId];
  if (!group) return;
  const entries = group.entries.filter((entry) => entry.toolId !== toolId);
  if (entries.length === 0) {
    if (slots.size === 0) tokens.delete(agentId);
    const groups = { ...state.groups };
    delete groups[agentId];
    store.setState({ ...state, groups });
  } else {
    store.setState(withGroup(state, agentId, { ...group, entries }));
  }
  changed(agentId);
}

function changed(agentId: string): void {
  // Every hub hears of every chat; each acts only on the chats of its own host.
  for (const member of [...shared().members]) member.syncPill(agentId);
}

/** One chat's tools. The array is stable between changes, so it is safe as a hook selector. */
export function groupEntries(agentId: string): readonly HubEntry[] {
  return shared().store.getState().groups[agentId]?.entries ?? NONE;
}

/** A chat's tools, re-rendering the caller when they change. */
export function useGroupEntries(agentId: string): readonly HubEntry[] {
  return useStore(shared().store, (state) => state.groups[agentId]?.entries ?? NONE);
}

export function rememberSelection(agentId: string, toolId: string): void {
  const state = shared().store.getState();
  shared().store.setState({ ...state, selection: { ...state.selection, [agentId]: toolId } });
}

export function recallSelection(agentId: string): string | undefined {
  return shared().store.getState().selection[agentId];
}

/**
 * Exactly one hub popover on screen at a time. The host keeps a pill mounted per composer it draws,
 * and a popover it drew stays mounted when that composer is hidden, so the same chat can end up with
 * two surfaces, one of them anchored to a composer that is no longer laid out. The newest mount takes
 * the claim and closes whatever held it, which leaves the one the user just opened.
 */
export function claimPopover(agentId: string, close: () => void): () => void {
  const { store } = shared();
  const id = ++shared().popoverSeq;
  const previous = store.getState().popover;
  store.setState({ ...store.getState(), popover: { id, agentId, close } });
  if (previous) {
    // console.error, because that is the level the desktop app keeps in its log: if a second surface is
    // still on screen after this, the older one is frozen inside a hidden tab and only the app can drop it.
    console.error("[pill-hub] a second Tools popover opened; closed the older one", { older: previous.agentId, opened: agentId });
    previous.close();
  }
  return () => {
    const state = store.getState();
    if (state.popover?.id === id) store.setState({ ...state, popover: null });
  };
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
  const { store, tokens } = shared();
  tokens.clear();
  store.setState({ groups: {}, selection: {}, popover: null });
}
