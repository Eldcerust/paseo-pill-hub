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
 */

const BUS_KEY = "__paseoPillHub";

function resetBus() {
  delete (globalThis as Record<string, unknown>)[BUS_KEY];
  delete (React as unknown as Record<string, unknown>)[BUS_KEY];
}

/** The hub's host client: one chat, `a1`, in workspace `w1`, delivered as a directory snapshot. */
function hubHost(): PluginClientContext {
  return {
    addComposerPill: () => ({ update() {}, remove() {} }),
    rpc: async () => ({ merged: {} }),
    paseo: {
      agents: {
        list: async () => ({
          entries: [],
          pageInfo: { hasMore: false },
          subscription: {
            subscribe(observer: { snapshot(page: unknown): void }) {
              queueMicrotask(() => observer.snapshot({ entries: [{ agent: { id: "a1", workspaceId: "w1" } }], pageInfo: { hasMore: false } }));
            },
            release: async () => {},
          },
        }),
      },
    },
  } as unknown as PluginClientContext;
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

/** A fresh copy of the hub's modules, with their own store: what re-evaluating a plugin's bundle gives. */
async function loadHub() {
  vi.resetModules();
  return { hub: await import("../client/hub"), store: await import("../client/store") };
}

const toolIds = (store: Awaited<ReturnType<typeof loadHub>>["store"]) => store.groupEntries("a1").map((entry) => entry.toolId);

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
    expect(store.groupEntries("a1").map((entry) => entry.toolId)).toEqual(["run"]);
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
    expect(store.groupEntries("a1").map((entry) => entry.toolId)).toEqual(["run"]);
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
