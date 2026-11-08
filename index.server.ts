import { randomUUID } from "node:crypto";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { z } from "zod";
import { resolveAi, resolveModelsTarget } from "./shared/ai";
import { aiDefaults, getConfig, hubSettings, syncDefaults } from "./shared/config";
import { FORKS } from "./shared/forks";
import { syncApply, syncCheck, syncModels, syncStage, syncStatus } from "./shared/sync";
import { chatLlm, listModels } from "./server/sync/ai";
import { createEngine } from "./server/sync/engine";
import { exec } from "./server/sync/exec";
import { defaultChecks, fetchBytes, fetchJson, pluginDirFromConfig } from "./server/sync/runtime";

type HubValues = z.output<typeof hubSettings.schema>;

const HOUR = 3_600_000;
const FIRST_CHECK_DELAY = 30_000;
/** OpenCode asks for one stable id per conversation, which helps its routing and prompt caching. */
const SESSION = `pill-hub-${randomUUID()}`;

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(hubSettings);
  let current: HubValues = { merged: {}, sync: syncDefaults, ai: aiDefaults };
  let scheduleKey = "";
  let first: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  /** The configured model, or undefined when AI adaptation is off or not fully set up. */
  function llm() {
    const resolved = current.ai.enabled ? resolveAi(current.ai, SESSION) : undefined;
    if (!resolved) return undefined;
    try {
      return chatLlm(resolved);
    } catch (error) {
      console.error("[pill-hub] AI adaptation is off:", error instanceof Error ? error.message : error);
      return undefined;
    }
  }

  const engine = createEngine({ exec, pluginDir: pluginDirFromConfig(), fetchJson, fetchBytes, checks: defaultChecks(), llm });
  const report = async () => ({ forks: await engine.status(), aiConfigured: llm() !== undefined });

  /** Looks at every upstream and, when asked to, stages each update it finds, one at a time. */
  async function tick() {
    if (!current.sync.autoCheck) return;
    const forks = await engine.check();
    if (!current.sync.autoStage) return;
    for (const fork of forks) if (fork.state === "update-available") await engine.stage(fork.toolId);
  }

  function reschedule() {
    const key = JSON.stringify(current.sync);
    if (key === scheduleKey) return;
    scheduleKey = key;
    clearTimeout(first);
    clearInterval(timer);
    if (!current.sync.autoCheck) return;
    first = setTimeout(() => void tick().catch((error) => console.error("[pill-hub] sync check failed", error)), FIRST_CHECK_DELAY);
    timer = setInterval(() => void tick().catch((error) => console.error("[pill-hub] sync check failed", error)), current.sync.checkEveryHours * HOUR);
  }

  const applySettings = (state: Awaited<ReturnType<typeof settings.read>>) => {
    if (state.status !== "ready") return;
    current = state.values;
    reschedule();
  };
  void settings.read().then(applySettings, (error) => console.error("[pill-hub] could not read settings", error));
  const stopWatching = settings.subscribe(applySettings);

  // The client entry cannot read settings outside React, so it asks the daemon for the switches.
  server.handle(getConfig, async () => {
    const state = await settings.read();
    return { merged: state.status === "ready" ? state.values.merged : {} };
  });
  server.handle(syncStatus, report);
  server.handle(syncCheck, async () => {
    await engine.check();
    return report();
  });
  server.handle(syncStage, async ({ toolId }) => {
    if (!FORKS.some((fork) => fork.toolId === toolId && fork.source.kind !== "own")) throw new Error(`${toolId} has no upstream to follow.`);
    // Staging installs packages, so it runs in the background; the screen polls for the outcome.
    void engine.stage(toolId).catch((error) => console.error("[pill-hub] staging failed", error));
    return report();
  });
  server.handle(syncModels, async ({ provider }) => {
    // Read the settings fresh: the key may have been saved a moment ago.
    const state = await settings.read();
    const target = resolveModelsTarget(state.status === "ready" ? state.values.ai : current.ai, provider, SESSION);
    if (!target) throw new Error("Save an API key for this provider first, and an address too for a custom one.");
    const models = await listModels(target);
    if (models.length === 0) throw new Error("This provider listed no models.");
    return { models };
  });
  server.handle(syncApply, async ({ toolId }) => {
    const message = await engine.apply(toolId);
    return { message, status: await report() };
  });

  return () => {
    stopWatching();
    clearTimeout(first);
    clearInterval(timer);
  };
}
