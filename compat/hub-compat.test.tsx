import type { PluginButton, PluginClientContext } from "@getpaseo/plugin/client";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The host modules need React Native; the placement logic under test does not.
vi.mock("@getpaseo/plugin/client", () => ({ useRpc: () => () => undefined, usePaseo: () => ({}) }));

import { registerComposerPill } from "./hub-compat";

const BUS_KEY = "__paseoPillHub";

type Fn = (...args: never[]) => unknown;

function fakeClient() {
  const pills: { id: string; agentId: string; button: PluginButton; removed: boolean; updates: unknown[] }[] = [];
  const client = {
    addComposerPill(contribution: { id: string; agentId: string; button: PluginButton }) {
      const entry = { ...contribution, removed: false, updates: [] as unknown[] };
      pills.push(entry);
      return {
        update: (patch: unknown) => void entry.updates.push(patch),
        remove: () => void (entry.removed = true),
      };
    },
  } as unknown as PluginClientContext;
  const live = () => pills.filter((pill) => !pill.removed);
  return { client, pills, live };
}

function fakeHub(merges: Record<string, boolean> = {}) {
  const attached: { entry: { toolId: string; label: string; title: string }; removed: boolean; updates: unknown[] }[] = [];
  const state = { merges };
  const api = {
    merges: (toolId: string) => state.merges[toolId] ?? true,
    attach(entry: { toolId: string; label: string; title: string }) {
      const record = { entry, removed: false, updates: [] as unknown[] };
      attached.push(record);
      return { update: (patch: unknown) => void record.updates.push(patch), remove: () => void (record.removed = true) };
    },
  };
  const live = () => attached.filter((item) => !item.removed);
  return { api, state, attached, live };
}

function bus() {
  return (globalThis as unknown as Record<string, { hub?: unknown; listeners: Set<() => void>; tools: Map<string, unknown> }>)[BUS_KEY]!;
}

function setHub(hub: unknown) {
  bus().hub = hub;
  for (const listener of [...bus().listeners]) listener();
}

const Popover: Fn = () => null;
const popoverButton = (): PluginButton => ({
  title: "Run a command",
  label: "Run",
  icon: "SquareTerminal",
  behavior: { kind: "popover", Content: Popover as never },
});
const spec = (button: PluginButton = popoverButton()) => ({ toolId: "run", agentId: "a1", workspaceId: "w1", button });

function resetBus() {
  delete (globalThis as Record<string, unknown>)[BUS_KEY];
  delete (React as unknown as Record<string, unknown>)[BUS_KEY];
}

beforeEach(resetBus);

describe("registerComposerPill", () => {
  it("meets the hub through the react module when each plugin has its own globalThis", () => {
    const { client, live } = fakeClient();
    const hub = fakeHub();
    // The hub published on react only, as it would if this plugin's global were isolated.
    Object.defineProperty(React, BUS_KEY, {
      value: { version: 1, hub: hub.api, tools: new Map(), listeners: new Set() },
      configurable: true,
      writable: true,
    });
    registerComposerPill(client, spec());
    expect(live()).toHaveLength(0);
    expect(hub.live()).toHaveLength(1);
  });

  it("registers the plugin's own pill when no hub is running", () => {
    const { client, live } = fakeClient();
    registerComposerPill(client, spec());
    expect(live()).toHaveLength(1);
    expect(live()[0]).toMatchObject({ id: "run", agentId: "a1" });
  });

  it("hands the popover to the hub instead of adding its own pill", () => {
    const { client, live } = fakeClient();
    const hub = fakeHub();
    registerComposerPill(client, spec());
    setHub(hub.api);
    expect(live()).toHaveLength(0);
    expect(hub.live()).toHaveLength(1);
    expect(hub.live()[0].entry).toMatchObject({ toolId: "run", label: "Run", title: "Run a command" });
  });

  it("attaches immediately when the hub started first", () => {
    const hub = fakeHub();
    const { client, live } = fakeClient();
    // Seed the bus the way the hub does before any fork has run.
    (globalThis as Record<string, unknown>)[BUS_KEY] = { version: 1, hub: hub.api, tools: new Map(), listeners: new Set() };
    registerComposerPill(client, spec());
    expect(live()).toHaveLength(0);
    expect(hub.live()).toHaveLength(1);
  });

  it("keeps its own pill when the hub's switch for the tool is off", () => {
    const { client, live } = fakeClient();
    const hub = fakeHub({ run: false });
    registerComposerPill(client, spec());
    setHub(hub.api);
    expect(live()).toHaveLength(1);
    expect(hub.live()).toHaveLength(0);
  });

  it("moves between the hub and its own pill as the switch flips", () => {
    const { client, live } = fakeClient();
    const hub = fakeHub();
    registerComposerPill(client, spec());
    setHub(hub.api);
    hub.state.merges = { run: false };
    setHub(hub.api);
    expect(live()).toHaveLength(1);
    expect(hub.live()).toHaveLength(0);
    hub.state.merges = { run: true };
    setHub(hub.api);
    expect(live()).toHaveLength(0);
    expect(hub.live()).toHaveLength(1);
  });

  it("falls back to its own pill when the hub stops", () => {
    const { client, live } = fakeClient();
    const hub = fakeHub();
    registerComposerPill(client, spec());
    setHub(hub.api);
    setHub(undefined);
    expect(hub.live()).toHaveLength(0);
    expect(live()).toHaveLength(1);
  });

  it("never gives a menu or action pill to the hub", () => {
    const { client, live } = fakeClient();
    const hub = fakeHub();
    (globalThis as Record<string, unknown>)[BUS_KEY] = { version: 1, hub: hub.api, tools: new Map(), listeners: new Set() };
    registerComposerPill(client, spec({ title: "Switch", icon: "Play", behavior: { kind: "action", onPress() {} } }));
    expect(live()).toHaveLength(1);
    expect(hub.live()).toHaveLength(0);
  });

  it("forwards updates to wherever the pill currently lives", () => {
    const { client, pills } = fakeClient();
    const hub = fakeHub();
    const registration = registerComposerPill(client, spec());
    registration.update({ label: "Run 2" });
    expect(pills[0].updates).toEqual([{ label: "Run 2" }]);
    setHub(hub.api);
    registration.update({ label: "Run 3" });
    expect(hub.attached[0].updates).toMatchObject([{ label: "Run 3", title: "Run a command" }]);
  });

  it("removes cleanly from either place and ignores later bus changes", () => {
    const { client, live } = fakeClient();
    const hub = fakeHub();
    const registration = registerComposerPill(client, spec());
    setHub(hub.api);
    registration.remove();
    registration.remove();
    expect(hub.live()).toHaveLength(0);
    setHub(undefined);
    expect(live()).toHaveLength(0);
  });

  it("announces the tool so the hub can list it", () => {
    const { client } = fakeClient();
    registerComposerPill(client, { ...spec(), glyph: "Sparkles" });
    expect(bus().tools.get("run")).toMatchObject({ toolId: "run", title: "Run a command", glyph: "Sparkles" });
  });
});
