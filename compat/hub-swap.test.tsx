import type { PluginButton, PluginClientContext } from "@getpaseo/plugin/client";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The host modules need React Native; the wiring under test does not.
vi.mock("@getpaseo/plugin/client", () => ({ useRpc: () => () => undefined, usePaseo: () => ({}) }));
vi.mock("../client/popover", () => ({ HubPopover: () => null }));

import { registerComposerPill } from "./hub-compat";

/*
 * What happens to the tools when the hub is replaced while the app keeps running, which is what
 * `paseo plugin update pill-hub` and a reconnecting client both do. The tools stay loaded and only
 * ever compare "hub or own pill", so a hub that replaced another one has to bring them back itself.
 *
 * And what happens when the app is connected to two hosts: it then runs one copy of every plugin per
 * host, in one JS realm, so two hubs are live at once, each with its own host's chats and tools.
 */

const BUS_KEY = "__paseoPillHub";
const SHARED_KEY = "__paseoPillHubShared";

function resetBus() {
  for (const key of [BUS_KEY, SHARED_KEY]) {
    delete (globalThis as Record<string, unknown>)[key];
    delete (React as unknown as Record<string, unknown>)[key];
  }
}

/** A hub's host client: its own chats, delivered as a directory snapshot, and a record of the pills it draws. */
function hubHostFor(chats: string[]) {
  const pills: { agentId: string; removed: boolean }[] = [];
  const client = {
    addComposerPill(contribution: { agentId: string }) {
      const pill = { agentId: contribution.agentId, removed: false };
      pills.push(pill);
      return { update() {}, remove: () => void (pill.removed = true) };
    },
    rpc: async () => ({ merged: {} }),
    paseo: {
      agents: {
        list: async () => ({
          entries: [],
          pageInfo: { hasMore: false },
          subscription: {
            subscribe(observer: { snapshot(page: unknown): void }) {
              queueMicrotask(() =>
                observer.snapshot({ entries: chats.map((id) => ({ agent: { id, workspaceId: `w-${id}` } })), pageInfo: { hasMore: false } }),
              );
            },
            release: async () => {},
          },
        }),
      },
    },
  } as unknown as PluginClientContext;
  return { client, livePills: () => pills.filter((pill) => !pill.removed).map((pill) => pill.agentId) };
}

/** The hub's host client for the usual single host: one chat, `a1`. */
function hubHost(): PluginClientContext {
  return hubHostFor(["a1"]).client;
}

/** A tool plugin's client, with a record of the own pills it has put in the composer. */
function toolHost() {
  const pills: { removed: boolean }[] = [];
  const client = {
    addComposerPill() {
      const pill = { removed: false };
      pills.push(pill);
      return { update() {}, remove: () => void (pill.removed = true) };
    },
  } as unknown as PluginClientContext;
  return { client, ownPills: () => pills.filter((pill) => !pill.removed) };
}

const button: PluginButton = { title: "Run a command", label: "Run", icon: "SquareTerminal", behavior: { kind: "popover", Content: (() => null) as never } };
const spec = { toolId: "run", agentId: "a1", workspaceId: "w1", button };
const specFor = (agentId: string) => ({ ...spec, agentId, workspaceId: `w-${agentId}` });

/** A fresh copy of the hub's modules: what re-evaluating a plugin's bundle, or a second host's copy of it, gives. */
async function loadHub() {
  vi.resetModules();
  return { hub: await import("../client/hub"), store: await import("../client/store") };
}

const toolIds = (store: Awaited<ReturnType<typeof loadHub>>["store"], agentId = "a1") => store.groupEntries(agentId).map((entry) => entry.toolId);

const stops: (() => void)[] = [];
beforeEach(resetBus);
afterEach(() => {
  while (stops.length) stops.pop()?.();
});

describe("replacing the hub while the tools stay loaded", () => {
  it("brings the tools to a new hub that never saw the old one stop", async () => {
    const first = await loadHub();
    const oldHub = first.hub.startHub(hubHost());
    stops.push(oldHub.stop);
    registerComposerPill(toolHost().client, spec);
    expect(toolIds(first.store)).toEqual(["run"]);

    const second = await loadHub();
    stops.push(second.hub.startHub(hubHost()).stop);
    expect(toolIds(second.store)).toEqual(["run"]);
  });

  it("keeps the tools when the old hub stops after its replacement has started", async () => {
    const { hub, store } = await loadHub();
    const oldHub = hub.startHub(hubHost());
    stops.push(oldHub.stop);
    registerComposerPill(toolHost().client, spec);
    stops.push(hub.startHub(hubHost()).stop);

    oldHub.stop();
    expect(toolIds(store)).toEqual(["run"]);
  });

  it("leaves the new hub on the bus when the old one stops late", async () => {
    const first = await loadHub();
    const oldHub = first.hub.startHub(hubHost());
    registerComposerPill(toolHost().client, spec);
    const second = await loadHub();
    stops.push(second.hub.startHub(hubHost()).stop);

    oldHub.stop();
    expect(toolIds(second.store)).toEqual(["run"]);
    expect((globalThis as unknown as Record<string, { hub?: unknown }>)[BUS_KEY]?.hub).toBeDefined();
  });

  it("gives a tool its own pill back when the hub stops, as before", async () => {
    const { hub } = await loadHub();
    const tool = toolHost();
    const running = hub.startHub(hubHost());
    registerComposerPill(tool.client, spec);
    expect(tool.ownPills()).toHaveLength(0);

    running.stop();
    expect(tool.ownPills()).toHaveLength(1);
  });
});

describe("reattach", () => {
  it("brings back tools the hub lost while their plugins still believe they are attached", async () => {
    const { hub, store } = await loadHub();
    const running = hub.startHub(hubHost());
    stops.push(running.stop);
    registerComposerPill(toolHost().client, spec);

    store.resetStore();
    expect(store.groupEntries("a1")).toEqual([]);

    running.reattach();
    expect(toolIds(store)).toEqual(["run"]);
  });

  it("does nothing once the hub has stopped", async () => {
    const { hub, store } = await loadHub();
    const tool = toolHost();
    const running = hub.startHub(hubHost());
    registerComposerPill(tool.client, spec);
    running.stop();

    running.reattach();
    expect(store.groupEntries("a1")).toEqual([]);
    expect(tool.ownPills()).toHaveLength(1);
  });
});

describe("two hosts in one app", () => {
  it("keeps each host's tools in its own hub: a pill only for its own chats, and every chat's tools attached", async () => {
    const first = await loadHub();
    const hostA = hubHostFor(["a1"]);
    stops.push(first.hub.startHub(hostA.client).stop);
    // The other host's copy of the plugin: a separate module copy with its own client, on the same bus.
    const second = await loadHub();
    const hostB = hubHostFor(["b1"]);
    stops.push(second.hub.startHub(hostB.client).stop);

    registerComposerPill(toolHost().client, specFor("a1"));
    registerComposerPill(toolHost().client, specFor("b1"));
    await vi.waitFor(() => {
      expect(hostA.livePills()).toEqual(["a1"]);
      expect(hostB.livePills()).toEqual(["b1"]);
    });

    // Each chat's popover reads its tools whichever copy of the hub it belongs to.
    expect(toolIds(first.store, "a1")).toEqual(["run"]);
    expect(toolIds(second.store, "b1")).toEqual(["run"]);
    expect(toolIds(second.store, "a1")).toEqual(["run"]);
  });

  it("does not let the host whose hub started last take the other host's tools", async () => {
    const first = await loadHub();
    stops.push(first.hub.startHub(hubHostFor(["a1"]).client).stop);
    registerComposerPill(toolHost().client, specFor("a1"));
    expect(toolIds(first.store)).toEqual(["run"]);

    // The other host's hub starts later and, before this, took the bus and its tools with it.
    const second = await loadHub();
    stops.push(second.hub.startHub(hubHostFor(["b1"]).client).stop);
    expect(toolIds(first.store)).toEqual(["run"]);
    expect(toolIds(second.store)).toEqual(["run"]);
  });

  it("keeps the other host's tools when one host's hub stops", async () => {
    const first = await loadHub();
    const hostA = first.hub.startHub(hubHostFor(["a1"]).client);
    const second = await loadHub();
    stops.push(second.hub.startHub(hubHostFor(["b1"]).client).stop);
    const tool = toolHost();
    registerComposerPill(tool.client, specFor("b1"));

    hostA.stop();
    expect(toolIds(second.store, "b1")).toEqual(["run"]);
    expect(tool.ownPills()).toHaveLength(0);
  });

  it("sends the tools back to their own pills only when the last hub stops", async () => {
    const first = await loadHub();
    const hostA = first.hub.startHub(hubHostFor(["a1"]).client);
    const second = await loadHub();
    const hostB = second.hub.startHub(hubHostFor(["b1"]).client);
    const tool = toolHost();
    registerComposerPill(tool.client, specFor("b1"));

    hostA.stop();
    expect(tool.ownPills()).toHaveLength(0);
    hostB.stop();
    expect(tool.ownPills()).toHaveLength(1);
  });

  it("takes the bus from a hub of an older kind, bringing its tools to the shared api", async () => {
    const { hub, store } = await loadHub();
    const attached: { toolId: string; removed: boolean }[] = [];
    // An older hub: it holds the bus with an api of its own, and tools attach to that.
    const older = {
      merges: () => true,
      attach(entry: { toolId: string }) {
        const record = { toolId: entry.toolId, removed: false };
        attached.push(record);
        return { update() {}, remove: () => void (record.removed = true) };
      },
    };
    Object.defineProperty(globalThis, BUS_KEY, {
      value: { version: 1, hub: older, listeners: new Set(), tools: new Map() },
      configurable: true,
      writable: true,
      enumerable: false,
    });
    registerComposerPill(toolHost().client, spec);
    expect(attached.filter((item) => !item.removed)).toHaveLength(1);

    stops.push(hub.startHub(hubHost()).stop);
    expect(attached.filter((item) => !item.removed)).toHaveLength(0);
    expect(toolIds(store)).toEqual(["run"]);
  });

  it("reports whether a hub is running and on the bus", async () => {
    const { hub, store } = await loadHub();
    expect(store.hubProbe().onBus).toBe(false);
    const running = hub.startHub(hubHost());
    expect(store.hubProbe().onBus).toBe(true);
    running.stop();
    expect(store.hubProbe().onBus).toBe(false);
  });
});
