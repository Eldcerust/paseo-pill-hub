type PluginClientContext = Parameters<typeof import("./hub").startHub>[0];
type PluginButton = Parameters<typeof import("../compat/hub-compat").registerComposerPill>[1]["button"];
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The host modules need React Native; the wiring under test does not.
vi.mock("@getpaseo/plugin/client", () => ({ useRpc: () => () => undefined, usePaseo: () => ({}) }));
vi.mock("./popover", () => ({ HubPopover: () => null }));

import { registerComposerPill } from "../compat/hub-compat";
import { describeNoTools } from "./no-tools";

/*
 * What the Tools popover reports when the app runs more than one copy of the plugin's code.
 *
 * The app runs one copy of every plugin per host it is connected to, inside one JS realm, and a plugin
 * update leaves the previous bundle's module instance behind until the app drops it. So two copies of
 * this file can be live at once, each with its own module-level constants, and both find each other
 * only through the objects they publish on `React` and `globalThis`.
 *
 * The reported symptom: the popover said "they attached to another copy of the hub" with 250 tool
 * registrations alive on the bus. `hubProbe().onBus` was false because the state object it read was
 * not the one the running hub had joined and put on the bus: a copy that declares a different shared
 * state version replaced the slot, and the copy that read it next replaced it again.
 */

const BUS_KEY = "__paseoPillHub";
const SHARED_KEY = "__paseoPillHubShared";
/** The version an installed copy declares when it was built before the store moved to zustand. */
const SHARED_VERSION_BEFORE_ZUSTAND = 1;

function resetCarriers() {
  for (const key of [BUS_KEY, SHARED_KEY]) {
    delete (globalThis as Record<string, unknown>)[key];
    delete (React as unknown as Record<string, unknown>)[key];
  }
}

/** A hub's host client: its own chats, delivered as a directory snapshot, and a record of its pills. */
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

/** A fresh copy of the plugin's modules: what a second host, or a reinstalled bundle, evaluates. */
async function loadCopy() {
  vi.resetModules();
  return { bus: await import("./bus"), hub: await import("./hub"), store: await import("./store") };
}

type Copy = Awaited<ReturnType<typeof loadCopy>>;

/** The shared state a copy declares when it was built before the store moved to zustand. */
interface BeforeZustand {
  version: number;
  groups: Map<string, { workspaceId: string; slots: Map<string, { entry: { toolId: string } }>; snapshot: readonly { toolId: string }[] }>;
  selection: Map<string, string>;
  members: Set<unknown>;
  api: unknown;
}

/**
 * One older copy reporting in. It speaks the same slot protocol with an older version and an older
 * shape, which is exactly what an installed copy built before the zustand store does at startup: its
 * own `shared()` call against the same carrier slot.
 */
function olderCopyReportsIn(bus: Copy["bus"]): BeforeZustand {
  return bus.sharedState<BeforeZustand>(SHARED_KEY, SHARED_VERSION_BEFORE_ZUSTAND, () => ({
    version: SHARED_VERSION_BEFORE_ZUSTAND,
    groups: new Map(),
    selection: new Map(),
    members: new Set(),
    api: { merges: () => true, attach: () => ({ update() {}, remove() {} }) },
  }));
}

const toolIds = (copy: Copy, agentId = "a1") => copy.store.groupEntries(agentId).map((entry) => entry.toolId);
const foreignApi = { merges: () => true, attach: () => ({ update() {}, remove() {} }) };

const stops: (() => void)[] = [];
beforeEach(resetCarriers);
afterEach(() => {
  while (stops.length) stops.pop()?.();
});

describe("copies of the plugin on one bus", () => {
  it("reports the tool it attached as attached to this hub", async () => {
    const copy = await loadCopy();
    stops.push(copy.hub.startHub(hubHostFor(["a1"]).client).stop);
    registerComposerPill(toolHost().client, spec);

    expect(toolIds(copy)).toEqual(["run"]);
    expect(copy.bus.getBus().listeners.size).toBe(1);
    expect(copy.store.hubApi()).toBe(copy.bus.getBus().hub);
    expect(copy.store.hubProbe()).toEqual({ hubs: 1, onBus: true, foreign: false });
  });

  it("keeps this hub's api on the bus when an older copy of the plugin reports in", async () => {
    const copy = await loadCopy();
    stops.push(copy.hub.startHub(hubHostFor(["a1"]).client).stop);
    registerComposerPill(toolHost().client, spec);
    expect(copy.bus.getBus().listeners.size).toBe(1);

    // The other copy starts up and asks the same slot for its state.
    olderCopyReportsIn(copy.bus);

    // The tool is still attached to the api that was on the bus, so the hub must still own it.
    expect(copy.store.hubProbe().onBus).toBe(true);
    expect(copy.bus.getBus().listeners.size).toBe(1);
    expect(copy.store.hubApi()).toBe(copy.bus.getBus().hub);
    expect(toolIds(copy)).toEqual(["run"]);
    expect(copy.store.storeStats().chats).toBe(1);
  });

  it("shares one bus with a copy that declares another bus version", async () => {
    const copy = await loadCopy();
    stops.push(copy.hub.startHub(hubHostFor(["a1"]).client).stop);
    registerComposerPill(toolHost().client, spec);

    // The bus on the slot was published by a copy that speaks another bus protocol number.
    const published = copy.bus.getBus();
    Object.defineProperty(published, "version", { value: 99, configurable: true, writable: true });

    expect(copy.bus.getBus()).toBe(published);
    expect(copy.bus.getBus().listeners.size).toBe(1);
    expect(copy.store.hubProbe().onBus).toBe(true);
  });

  it("gives every copy of the plugin the same api on the bus", async () => {
    const first = await loadCopy();
    const second = await loadCopy();
    const firstHub = first.hub.startHub(hubHostFor(["a1"]).client);
    const secondHub = second.hub.startHub(hubHostFor(["b1"]).client);
    stops.push(firstHub.stop, secondHub.stop);

    expect(first.bus.getBus()).toBe(second.bus.getBus());
    expect(first.store.hubApi()).toBe(second.store.hubApi());
    expect(second.bus.getBus().hub).toBe(second.store.hubApi());

    // A third copy declares another shared state version and reports in.
    olderCopyReportsIn(second.bus);

    expect(first.store.hubApi()).toBe(first.bus.getBus().hub);
    expect(second.store.hubApi()).toBe(second.bus.getBus().hub);

    // One hub unmounts while the other remains, and the survivor stays the owner.
    firstHub.stop();
    expect(second.store.hubProbe().onBus).toBe(true);
    expect(second.bus.getBus().hub).toBe(second.store.hubApi());
  });

  it("lets a copy built for the previous shape read this hub's tools", async () => {
    const copy = await loadCopy();
    stops.push(copy.hub.startHub(hubHostFor(["a1"]).client).stop);
    registerComposerPill(toolHost().client, spec);

    const older = olderCopyReportsIn(copy.bus);

    expect(older.version).toBe(2);
    const group = older.groups.get("a1");
    expect(group?.snapshot.map((entry) => entry.toolId)).toEqual(["run"]);
    expect([...older.groups.values()].filter((current) => current.slots.size > 0)).toHaveLength(1);
    expect(older.api).toBe(copy.bus.getBus().hub);
  });

  it("reconnect takes an empty bus, and never takes one another api holds", async () => {
    const copy = await loadCopy();
    const running = copy.hub.startHub(hubHostFor(["a1"]).client);
    stops.push(running.stop);
    registerComposerPill(toolHost().client, spec);
    expect(toolIds(copy)).toEqual(["run"]);

    copy.bus.getBus().hub = undefined;
    copy.store.resetStore();
    expect(toolIds(copy)).toEqual([]);

    running.reattach();
    expect(copy.bus.getBus().hub).toBe(copy.store.hubApi());
    expect(toolIds(copy)).toEqual(["run"]);

    copy.bus.getBus().hub = foreignApi;
    running.reattach();
    expect(copy.bus.getBus().hub).toBe(foreignApi);
  });
});

describe("what the empty popover says about the hub state", () => {
  it("reports each hub state in the words that match it", async () => {
    const copy = await loadCopy();
    registerComposerPill(toolHost().client, spec);

    // No hub is mounted in this copy of the plugin: a pill drawn by another copy, with no hub here.
    const none = describeNoTools(copy.store.popoverFacts());
    expect(none.summary).toContain("No hub is running in this copy of the plugin");
    // The pill came from a hub in another copy, and reloading is what starts one here.
    expect(none.hint).toContain("another copy of the hub");
    expect(none.hint).toContain("Reload the app");

    // A hub is mounted and its api is the one on the bus: the earlier causes are all gone.
    stops.push(copy.hub.startHub(hubHostFor(["a1", "a2"]).client).stop);
    const matching = describeNoTools(copy.store.popoverFacts());
    expect(matching.summary).toContain("1 other chat");
    expect(matching.details).toContain("attach to: yes");

    // A hub is mounted and the bus carries an api it does not publish.
    copy.bus.getBus().hub = foreignApi;
    const mismatch = describeNoTools(copy.store.popoverFacts());
    expect(mismatch.summary).toContain("another copy of the hub");
    expect(mismatch.hint).toContain("only one hub");
    expect(mismatch.details).toContain("attach to: no");

    // A hub is mounted and the bus carries no api at all.
    copy.bus.getBus().hub = undefined;
    const unclaimed = describeNoTools(copy.store.popoverFacts());
    expect(unclaimed.summary).toContain("No hub has claimed the bus");
    expect(unclaimed.hint).toContain("Reconnect");
    expect(unclaimed.summary).not.toContain("another copy");
  });

  it("keeps the pre-existing branches when the caller does not say which hub state it found", () => {
    const facts = { announced: ["Run"], registrations: 4, onBus: false, otherChats: 0 };
    expect(describeNoTools(facts).summary).toContain("another copy of the hub");
    expect(describeNoTools({ ...facts, onBus: true, registrations: 0 }).summary).toContain("running in this app any more");
    expect(describeNoTools({ ...facts, onBus: true }).summary).toBe("Reported in: Run. None has attached to any chat.");
  });
});
