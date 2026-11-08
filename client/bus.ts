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

/** The shared bus, or a private throwaway when another version already owns the slot. */
export function getBus(): Bus {
  const places = carriers();
  const existing = places.map((place) => (place as Record<string, Bus | undefined>)[BUS_KEY]).find(Boolean);
  if (existing) {
    if (existing.version === BUS_VERSION) return existing;
    return { version: BUS_VERSION, tools: new Map(), listeners: new Set() };
  }
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

export function notify(bus: Bus): void {
  for (const listener of [...bus.listeners]) {
    try {
      listener();
    } catch (error) {
      console.error("[pill-hub] bus listener failed", error);
    }
  }
}
