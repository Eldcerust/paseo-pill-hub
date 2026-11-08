import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { z } from "zod";
import { DEFAULT_AI_MODEL, FIX_AGENT, aiDefaults, getConfig, heightDefaults, hubSettings, syncDefaults } from "./shared/config";
import { FORKS } from "./shared/forks";
import { syncApply, syncCheck, syncFix, syncModels, syncStage, syncStatus } from "./shared/sync";
import { createEngine } from "./server/sync/engine";
import { fixPrompt, needsAttention } from "./server/sync/fix";
import { exec } from "./server/sync/exec";
import { listAiModels, paseoLlm, type Paseo } from "./server/sync/paseo-llm";
import { defaultChecks, fetchBytes, fetchJson, pluginDirFromConfig } from "./server/sync/runtime";

type HubValues = z.output<typeof hubSettings.schema>;

const HOUR = 3_600_000;
const FIRST_CHECK_DELAY = 30_000;

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(hubSettings);
  let current: HubValues = { merged: {}, sync: syncDefaults, ai: aiDefaults, heights: heightDefaults };
  let scheduleKey = "";
  let first: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  // The daemon connection arrives with each request and lifecycle event rather than at start, so the
  // background checks use the latest one seen. Until one has been, there is no model to ask.
  let daemon: Paseo | undefined;
  const remember = (context: { paseo: Paseo }) => {
    daemon = context.paseo;
  };
  // The folder of the last agent seen is "this workspace": the fix agent starts there.
  let workspaceFolder: string | undefined;
  const stopListening = [
    server.on("agent.created", (event, context) => {
      remember(context);
      workspaceFolder = event.agent.cwd || workspaceFolder;
    }),
    server.on("agent.turn_ended", (event, context) => {
      remember(context);
      workspaceFolder = event.agent.cwd || workspaceFolder;
    }),
  ];

  /** The model to adapt with, or undefined when AI adaptation is off or the daemon has not been seen yet. */
  function llm() {
    if (!current.ai.enabled) return undefined;
    const paseo = daemon;
    if (!paseo) return () => Promise.reject(new Error("The Paseo daemon connection is not available yet; open the Pill hub screen once and retry"));
    return paseoLlm(paseo, current.ai.model || DEFAULT_AI_MODEL);
  }

  const pluginDir = pluginDirFromConfig();
  const engine = createEngine({ exec, pluginDir, fetchJson, fetchBytes, checks: defaultChecks(), llm });
  const report = async () => ({ forks: await engine.status() });

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

  // The client entry cannot read settings outside React, so it asks the daemon for the switches
  // and the tool-area heights.
  server.handle(getConfig, async () => {
    const state = await settings.read();
    return state.status === "ready"
      ? { merged: state.values.merged, heights: state.values.heights }
      : { merged: {}, heights: heightDefaults };
  });
  server.handle(syncStatus, async (_input, context) => {
    remember(context);
    return report();
  });
  server.handle(syncCheck, async (_input, context) => {
    remember(context);
    await engine.check();
    return report();
  });
  server.handle(syncStage, async ({ toolId }, context) => {
    remember(context);
    if (!FORKS.some((fork) => fork.toolId === toolId && fork.source.kind !== "own")) throw new Error(`${toolId} has no upstream to follow.`);
    // Staging installs packages, so it runs in the background; the screen polls for the outcome.
    void engine.stage(toolId).catch((error) => console.error("[pill-hub] staging failed", error));
    return report();
  });
  server.handle(syncFix, async (_input, context) => {
    remember(context);
    const folder = workspaceFolder;
    if (!folder) throw new Error("No workspace seen yet. Send a message in an agent in the workspace you want, then try again.");
    const broken = (await engine.status()).filter(needsAttention);
    if (broken.length === 0) throw new Error("Nothing needs attention.");
    const agent = await context.paseo.agents.create({
      config: { provider: FIX_AGENT },
      cwd: folder,
      title: `[Pill hub] fix ${broken.length} plugin ${broken.length === 1 ? "fork" : "forks"}`,
      prompt: fixPrompt(broken, { pluginDir, specs: FORKS }, folder),
      labels: { "pill-hub": "fix" },
    });
    return { agentId: agent.id, covered: broken.length, folder };
  });
  server.handle(syncModels, async (_input, context) => {
    remember(context);
    return { models: await listAiModels(context.paseo) };
  });
  server.handle(syncApply, async ({ toolId }, context) => {
    remember(context);
    const message = await engine.apply(toolId);
    return { message, status: await report() };
  });

  return () => {
    for (const stop of stopListening) stop();
    stopWatching();
    clearTimeout(first);
    clearInterval(timer);
  };
}
