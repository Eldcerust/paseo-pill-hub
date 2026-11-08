import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { getConfig } from "../shared/config";
import { getBus, notify, type HubApi } from "./bus";
import { observeDirectory } from "./directory";
import { HubPopover } from "./popover";
import { clearEntry, groupEntries, groupWorkspace, resetStore, setEntry, setGroupChangeHandler } from "./store";

const CONFIG_POLL_MS = 60_000;
const CONFIG_RETRY_MS = 3_000;

export interface HubController {
  /** Applies a merge map locally, as soon as the settings screen saves it. */
  applyConfig(merged: Record<string, boolean>): void;
  stop(): void;
}

let active: HubController | undefined;

export function activeHub(): HubController | undefined {
  return active;
}

function sameMap(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

export function startHub(client: PluginClientContext): HubController {
  const bus = getBus();
  const pills = new Map<string, { workspaceId: string; registration: PluginButtonRegistration }>();
  const agentWorkspaces = new Map<string, string>();
  let merged: Record<string, boolean> = {};
  let stopped = false;

  const api: HubApi = {
    // A tool the settings never mentioned follows the default: merged.
    merges: (toolId) => merged[toolId] ?? true,
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
  };

  // One pill per live chat. It stays even when no tool has attached, so a failed
  // plugin cannot leave the composer with no pill and no explanation.
  function syncPill(agentId: string) {
    if (stopped) return;
    const workspaceId = groupWorkspace(agentId) ?? agentWorkspaces.get(agentId);
    const current = pills.get(agentId);
    if (!workspaceId) {
      current?.registration.remove();
      pills.delete(agentId);
      return;
    }
    if (current?.workspaceId === workspaceId) return;
    current?.registration.remove();
    pills.set(agentId, {
      workspaceId,
      registration: client.addComposerPill({
        id: "tools",
        workspaceId,
        agentId,
        button: { title: "Tools", label: "Tools", icon: "LayoutGrid", behavior: { kind: "popover", Content: HubPopover } },
      }),
    });
  }

  function applyConfig(next: Record<string, boolean>) {
    if (stopped || sameMap(merged, next)) return;
    merged = { ...next };
    notify(bus);
  }

  async function loadConfig(retry: boolean) {
    try {
      applyConfig((await client.rpc(getConfig, {})).merged);
    } catch (error) {
      if (stopped) return;
      console.error("[pill-hub] could not read the merge settings", error);
      if (retry) setTimeout(() => void loadConfig(false), CONFIG_RETRY_MS);
    }
  }

  setGroupChangeHandler(syncPill);
  bus.hub = api;
  notify(bus);
  // The hub owns the Tools pill. Watching agents directly means the pill is present
  // even before a tool reports in, or when one of them fails to load.
  const stopAgents = observeDirectory({
    list: (options) => client.paseo.agents.list({ ...options, filter: { includeArchived: false } }),
    select: (message) => (message.type === "agent_update" ? message.payload : undefined),
    snapshot: (entries) => {
      const seen = new Set<string>();
      for (const { agent } of entries) {
        seen.add(agent.id);
        if (agent.workspaceId) {
          agentWorkspaces.set(agent.id, agent.workspaceId);
          syncPill(agent.id);
        }
      }
      for (const id of [...agentWorkspaces.keys()]) {
        if (seen.has(id)) continue;
        agentWorkspaces.delete(id);
        syncPill(id);
      }
    },
    update: (update) => {
      if (update.kind === "remove") {
        agentWorkspaces.delete(update.agentId);
        syncPill(update.agentId);
        return;
      }
      if (update.agent.workspaceId) {
        agentWorkspaces.set(update.agent.id, update.agent.workspaceId);
        syncPill(update.agent.id);
      } else {
        agentWorkspaces.delete(update.agent.id);
        syncPill(update.agent.id);
      }
    },
  });
  void loadConfig(true);
  // Another device may have changed the host-scoped switches; pick that up without a reload.
  const poll = setInterval(() => void loadConfig(false), CONFIG_POLL_MS);

  const controller: HubController = {
    applyConfig,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(poll);
      stopAgents();
      // Forks watch the bus: with no hub they move back to pills of their own.
      if (bus.hub === api) bus.hub = undefined;
      notify(bus);
      resetStore();
      setGroupChangeHandler(() => {});
      for (const pill of pills.values()) pill.registration.remove();
      pills.clear();
      if (active === controller) active = undefined;
    },
  };
  active = controller;
  return controller;
}
