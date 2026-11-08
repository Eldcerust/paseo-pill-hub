import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { ChatMessage, Llm } from "./ai";

export type Paseo = PluginHandlerContext["paseo"];

/** The agent provider in the Paseo daemon that the sync asks. Its models are listed by the daemon. */
export const AI_PROVIDER = "opencode";

/** The `provider/model` string the daemon wants, for a model id from its OpenCode list. */
export const aiAgentProvider = (model: string) => `${AI_PROVIDER}/${model}`;

const ANSWER_WITHIN_MS = 5 * 60_000;
const WAIT_SLICE_MS = 20_000;
const MAX_DENIALS = 20;

const flatten = (messages: readonly ChatMessage[]) =>
  messages.map((message) => (message.role === "system" ? `Instructions:\n${message.content}` : message.content)).join("\n\n");

type Agent = Awaited<ReturnType<Paseo["agents"]["create"]>>;

/** The last assistant message in the timeline, for when the run result carries no text. */
async function lastAssistantText(agent: Agent): Promise<string | undefined> {
  const page = await agent.timeline.refetch({ direction: "tail", limit: 50 });
  for (let i = page.entries.length - 1; i >= 0; i--) {
    const item = page.entries[i]?.item;
    if (item?.type === "assistant_message" && item.text.trim()) return item.text;
  }
  return undefined;
}

/** Everything the agent asks permission for is refused: it is meant to answer in text only. */
async function denyPermissions(agent: Agent): Promise<number> {
  await agent.refresh();
  const requests = agent.pendingPermissions ?? [];
  for (const request of requests) {
    await agent.respondToPermission({ requestId: request.id, response: { behavior: "deny", message: "Answer in text only. Do not use tools.", interrupt: false } });
  }
  return requests.length;
}

async function reply(agent: Agent, answerWithinMs: number): Promise<string> {
  const end = Date.now() + answerWithinMs;
  let denials = 0;
  for (;;) {
    const remaining = end - Date.now();
    if (remaining <= 0) throw new Error("The model did not answer in time.");
    const result = await agent.waitForFinish(Math.min(WAIT_SLICE_MS, remaining));
    if (result.status === "error") throw new Error(result.error ?? "The model's agent failed.");
    if (result.status === "permission") {
      denials += await denyPermissions(agent);
      if (denials > MAX_DENIALS) throw new Error("The model kept asking to use tools.");
      continue;
    }
    if (result.status === "idle") {
      const text = result.lastMessage?.trim() || (await lastAssistantText(agent));
      if (!text) throw new Error("The model sent no reply.");
      return text;
    }
    // A timeout is only this wait's slice running out; keep waiting until the overall limit.
  }
}

/**
 * Asks a model through the OpenCode agent that already runs in the Paseo daemon, so the user's own
 * OpenCode setup does the work and no API key is involved. Each question is a read-only (plan mode)
 * agent in an empty scratch folder, so it has nothing to edit; it is archived afterwards, along
 * with the workspace Paseo makes for the folder.
 *
 * `model` is an id from the daemon's OpenCode model list, such as `opencode/deepseek-v4.1-flash`.
 */
export function paseoLlm(paseo: Paseo, model: string, answerWithinMs = ANSWER_WITHIN_MS): Llm {
  return async (messages) => {
    const scratch = mkdtempSync(join(tmpdir(), "pill-hub-ai-"));
    let agent: Agent | undefined;
    try {
      agent = await paseo.agents.create({
        config: { provider: aiAgentProvider(model), modeId: "plan" },
        cwd: scratch,
        title: "[Pill hub] adapting a fork",
        prompt: flatten(messages),
        background: true,
        labels: { "pill-hub": "sync" },
      });
      return await reply(agent, answerWithinMs);
    } finally {
      if (agent) {
        const workspaceId = agent.workspaceId;
        await agent.archive().catch(() => undefined);
        if (workspaceId) await paseo.workspaces.archive(workspaceId).catch(() => undefined);
      }
      rmSync(scratch, { recursive: true, force: true });
    }
  };
}

/** The models the daemon's OpenCode provider offers, as id and label. */
export async function listAiModels(paseo: Paseo): Promise<{ id: string; label: string }[]> {
  const result = await paseo.providers.listModels(AI_PROVIDER);
  const models = (result.models ?? []).map((model) => ({ id: model.id, label: model.label || model.id }));
  if (models.length === 0) throw new Error("The OpenCode provider in the Paseo daemon lists no models. Is it set up and available?");
  return models;
}
