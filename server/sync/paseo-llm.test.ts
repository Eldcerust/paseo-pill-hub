import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "./ai";
import { listAiModels, paseoLlm, type Paseo } from "./paseo-llm";

type Finish = { status: "idle" | "error" | "permission" | "timeout"; final: null; error: string | null; lastMessage: string | null };

const idle = (lastMessage: string | null): Finish => ({ status: "idle", final: null, error: null, lastMessage });
const permission: Finish = { status: "permission", final: null, error: null, lastMessage: null };

const messages: ChatMessage[] = [
  { role: "system", content: "keep the compat changes" },
  { role: "user", content: "===== a.ts =====\nx" },
];

function fakeAgent(options: {
  finish?: Finish[];
  permissions?: Array<{ id: string }>;
  entries?: Array<{ item: { type: string; text: string } }>;
} = {}) {
  const finishes = [...(options.finish ?? [idle("fixed")])];
  const pending = options.permissions ?? [];
  const agent = {
    workspaceId: "wks_1",
    pendingPermissions: pending,
    refresh: vi.fn(async () => null),
    respondToPermission: vi.fn(async () => undefined),
    waitForFinish: vi.fn(async () => finishes.shift() ?? idle(null)),
    timeline: {
      refetch: vi.fn(async () => ({ entries: options.entries ?? [] })),
    },
    archive: vi.fn(async () => ({ archivedAt: "2026-11-08T00:00:00.000Z" })),
  };
  return agent;
}

function fakePaseo(agent: ReturnType<typeof fakeAgent>, created: { options?: unknown; cwdExisted?: boolean } = {}) {
  const create = vi.fn(async (options: { cwd: string }) => {
    created.options = options;
    created.cwdExisted = existsSync(options.cwd);
    return agent;
  });
  const archiveWorkspace = vi.fn(async () => ({ archivedAt: "2026-11-08T00:00:00.000Z" }));
  const listModels = vi.fn(async () => ({
    provider: "opencode",
    models: [
      { provider: "opencode", id: "opencode/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
      { provider: "opencode", id: "opencode/other", label: "" },
    ],
  }));
  const paseo = {
    agents: { create },
    workspaces: { archive: archiveWorkspace },
    providers: { listModels },
  } as unknown as Paseo;
  return { paseo, create, archiveWorkspace, listModels };
}

describe("paseoLlm", () => {
  it("asks the daemon's OpenCode provider in plan mode and cleans up", async () => {
    const agent = fakeAgent();
    const created: { options?: unknown; cwdExisted?: boolean } = {};
    const { paseo, create, archiveWorkspace } = fakePaseo(agent, created);

    await expect(paseoLlm(paseo, "opencode/deepseek-v4.1-flash")(messages)).resolves.toBe("fixed");

    expect(create).toHaveBeenCalledOnce();
    const options = created.options as {
      config: { provider: string; modeId: string };
      cwd: string;
      title: string;
      background: boolean;
      labels: Record<string, string>;
      prompt: string;
    };
    expect(options.config).toEqual({ provider: "opencode/opencode/deepseek-v4.1-flash", modeId: "plan" });
    expect(options.title).toBe("[Pill hub] adapting a fork");
    expect(options.background).toBe(true);
    expect(options.labels).toEqual({ "pill-hub": "sync" });
    expect(options.prompt).toContain("Instructions:\nkeep the compat changes");
    expect(options.prompt).toContain("===== a.ts =====\nx");
    expect(created.cwdExisted).toBe(true);
    expect(existsSync(options.cwd)).toBe(false);
    expect(agent.archive).toHaveBeenCalledOnce();
    expect(archiveWorkspace).toHaveBeenCalledWith("wks_1");
  });

  it("reads the last assistant message when the finish result carries no text", async () => {
    const agent = fakeAgent({
      finish: [idle(null)],
      entries: [
        { item: { type: "user_message", text: "the question" } },
        { item: { type: "assistant_message", text: "the older answer" } },
        { item: { type: "tool_call", text: "noise" } },
        { item: { type: "assistant_message", text: "the newest answer" } },
      ],
    });
    const { paseo } = fakePaseo(agent);

    await expect(paseoLlm(paseo, "opencode/deepseek-v4.1-flash")(messages)).resolves.toBe("the newest answer");
    expect(agent.timeline.refetch).toHaveBeenCalledWith({ direction: "tail", limit: 50 });
  });

  it("denies tool permissions and keeps waiting", async () => {
    const agent = fakeAgent({ finish: [permission, idle("fixed without tools")], permissions: [{ id: "perm_1" }] });
    const { paseo } = fakePaseo(agent);

    await expect(paseoLlm(paseo, "opencode/deepseek-v4.1-flash")(messages)).resolves.toBe("fixed without tools");
    expect(agent.refresh).toHaveBeenCalledOnce();
    expect(agent.respondToPermission).toHaveBeenCalledWith({
      requestId: "perm_1",
      response: { behavior: "deny", message: "Answer in text only. Do not use tools.", interrupt: false },
    });
  });

  it("gives up when the model keeps asking to use tools", async () => {
    const agent = fakeAgent({ finish: Array.from({ length: 30 }, () => permission), permissions: [{ id: "perm_1" }] });
    const { paseo } = fakePaseo(agent);

    await expect(paseoLlm(paseo, "opencode/deepseek-v4.1-flash")(messages)).rejects.toThrow("kept asking to use tools");
    expect(agent.respondToPermission).toHaveBeenCalledTimes(21);
  });

  it("reports an agent failure", async () => {
    const agent = fakeAgent({ finish: [{ status: "error", final: null, error: "the provider rejected the model", lastMessage: null }] });
    const { paseo, archiveWorkspace } = fakePaseo(agent);

    await expect(paseoLlm(paseo, "opencode/missing")(messages)).rejects.toThrow("the provider rejected the model");
    expect(agent.archive).toHaveBeenCalledOnce();
    expect(archiveWorkspace).toHaveBeenCalledOnce();
  });

  it("reports an empty reply", async () => {
    const agent = fakeAgent({ finish: [idle(null)], entries: [] });
    const { paseo } = fakePaseo(agent);

    await expect(paseoLlm(paseo, "opencode/deepseek-v4.1-flash")(messages)).rejects.toThrow("no reply");
  });

  it("times out when the model never finishes", async () => {
    const agent = fakeAgent();
    agent.waitForFinish.mockImplementation(async () => ({ status: "timeout", final: null, error: null, lastMessage: null }));
    const { paseo } = fakePaseo(agent);

    await expect(paseoLlm(paseo, "opencode/deepseek-v4.1-flash", 1)(messages)).rejects.toThrow("did not answer in time");
  });

  it("cleans up when creating the agent fails", async () => {
    const paseo = {
      agents: { create: vi.fn(async () => Promise.reject(new Error("no provider"))) },
      workspaces: { archive: vi.fn() },
      providers: { listModels: vi.fn() },
    } as unknown as Paseo;

    await expect(paseoLlm(paseo, "opencode/deepseek-v4.1-flash")(messages)).rejects.toThrow("no provider");
  });
});

describe("listAiModels", () => {
  it("uses the label, falling back to the id", async () => {
    const agent = fakeAgent();
    const { paseo } = fakePaseo(agent);

    await expect(listAiModels(paseo)).resolves.toEqual([
      { id: "opencode/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
      { id: "opencode/other", label: "opencode/other" },
    ]);
  });

  it("explains an empty model list", async () => {
    const paseo = {
      providers: { listModels: vi.fn(async () => ({ provider: "opencode", models: [] })) },
    } as unknown as Paseo;

    await expect(listAiModels(paseo)).rejects.toThrow("lists no models");
  });
});
