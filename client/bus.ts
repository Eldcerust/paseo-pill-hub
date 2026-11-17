import React, { type ComponentType } from "react";
import type { PluginButtonContentProps, PluginButtonIcon } from "@getpaseo/plugin/client";

/*
 * The pill bus: how the hub and the compat forks find each other.
 *
 * Plugins cannot import each other, so both sides rendezvous on one object kept on
 * `globalThis`. A fork announces a pill to the bus; if a hub is running and has the
 * tool's merge switch on, the fork hands its popover to the hub instead of registering
 * a pill of its own. This file is copied verbatim into every fork as `hub-compat.tsx`
 * (see that file's header), so keep the protocol here small and versioned.
 */

export const BUS_KEY = "__paseoPillHub";
export const BUS_VERSION = 1;

export type HubContent = ComponentType<PluginButtonContentProps>;

/** What the settings screen and the tab strip need to know about a tool. */
export interface ToolInfo {
  toolId: string;
  title: string;
  label: string;
  /** A Lucide icon name for the hub's tab. Forks whose pill icon is a component supply one. */
  glyph?: string;
}

export interface HubEntry extends ToolInfo {
  agentId: string;
  workspaceId: string;
  icon: PluginButtonIcon;
  Content: HubContent;
  visible?: boolean;
  disabled?: boolean;
}

export type HubEntryPatch = Partial<Pick<HubEntry, "title" | "label" | "icon" | "Content" | "visible" | "disabled" | "glyph">>;

export interface HubAttachment {
  update(patch: HubEntryPatch): void;
  remove(): void;
}

export interface HubApi {
  /** Whether this tool should appear inside the hub pill rather than as its own pill. */
  merges(toolId: string): boolean;
  attach(entry: HubEntry): HubAttachment;
}

export interface Bus {
  version: number;
  hub?: HubApi;
  tools: Map<string, ToolInfo>;
  listeners: Set<() => void>;
}

/**
 * Objects every plugin can see. `globalThis` is shared when plugins run in one JS realm. When
 * the app gives each plugin its own global, the `react` module object is still the one
 * instance every plugin's hooks depend on, so the bus is published on both.
 */
function carriers(): object[] {
  const shared: unknown = React;
  const list: object[] = [];
  if (shared !== null && (typeof shared === "object" || typeof shared === "function")) list.push(shared as object);
  list.push(globalThis);
  return list.filter((carrier) => Object.isExtensible(carrier));
}

/** Whether a value on a carrier is a bus this copy can use, whatever version published it. */
function isBus(value: unknown): value is Bus {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<Bus>;
  return typeof candidate.version === "number" && typeof candidate.tools?.set === "function" && typeof candidate.listeners?.add === "function";
}

/**
 * The one bus in this realm.
 *
 * A tool is only visible to a hub when both hold the same object, so a bus another copy already
 * published is used as it is, whatever `version` it declares: a copy that speaks another version is
 * another copy of this plugin, not a different bus. Inventing a private bus here is what let a whole
 * set of tools attach to an object no hub could see, and it is why the popover could count tool
 * registrations and still find no hub on the bus it read.
 */
export function getBus(): Bus {
  const places = carriers();
  const existing = places.map((place) => (place as Record<string, unknown>)[BUS_KEY]).find(isBus);
  if (existing) return existing;
  const created: Bus = { version: BUS_VERSION, tools: new Map(), listeners: new Set() };
  for (const place of places) {
    try {
      Object.defineProperty(place, BUS_KEY, { value: created, configurable: true, writable: true, enumerable: false });
    } catch {
      // A carrier that refuses the property is skipped; the others still carry the bus.
    }
  }
  return created;
}

/** Whether a value on a carrier is a versioned state object. */
function isVersioned(value: unknown): value is { version: number } {
  return value !== null && typeof value === "object" && typeof (value as { version?: unknown }).version === "number";
}

/**
 * State every copy of the hub in this app has to share. The app runs one copy of each plugin per host
 * it is connected to, inside one JS realm, so two hubs can be live at once, each for its own host, and
 * a plugin update can leave the previous bundle's copy running beside the new one. Module-level
 * variables would be private to each copy, so all of them read this one object from the carriers.
 *
 * The slot is owned by the newest version that has ever claimed it: a copy that finds a newer state
 * uses it, and a copy that finds an older one takes the slot once, after which the older copy adopts
 * the newer shape instead of taking it back. "Replace whatever differs" cannot converge, because two
 * copies then replace each other's state on every read, and the hub and the api already on the bus are
 * left in an object nothing reads: that is the popover that said no hub was on the bus while the
 * tools were attached to one.
 */
export function sharedState<T extends { version: number }>(key: string, version: number, create: () => T): T {
  const places = carriers();
  const existing = places.map((place) => (place as Record<string, unknown>)[key]).find(isVersioned);
  if (existing && existing.version >= version) return existing as T;
  const created = create();
  for (const place of places) {
    try {
      Object.defineProperty(place, key, { value: created, configurable: true, writable: true, enumerable: false });
    } catch {
      // A carrier that refuses the property is skipped; the others still carry it.
    }
  }
  return created;
}

export function notify(bus: Bus): void {
  for (const listener of [...bus.listeners]) {
    try {
      listener();
    } catch (error) {
      console.error("[pill-hub] bus listener failed", error);
    }
  }
}
