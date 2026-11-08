import { describe, expect, it } from "vitest";
import { AI_PROVIDERS, providerSpec, resolveAi, resolveModelsTarget, type AiSettings } from "../../shared/ai";
import { chatLlm, listModels } from "./ai";

const ai = (extra: Partial<AiSettings> = {}): AiSettings => ({ enabled: true, provider: "opencode", customUrl: "", models: {}, keys: {}, ...extra });

describe("providers", () => {
  it("starts with OpenCode and OpenAI, with OpenCode Go and a custom address after them", () => {
    expect(AI_PROVIDERS.map((spec) => spec.id)).toEqual(["opencode", "opencode-go", "openai", "custom"]);
  });

  it("falls back to the first provider for an unknown id", () => {
    expect(providerSpec("nope").id).toBe("opencode");
  });
});

describe("resolveAi", () => {
  it("uses OpenCode's own address, its flash model by default, and its session headers", () => {
    const resolved = resolveAi(ai({ keys: { opencode: "k" } }), "session-1");
    expect(resolved).toEqual({
      provider: "opencode",
      baseUrl: "https://opencode.ai/inference/openai/v1",
      model: "deepseek-v4.1-flash",
      apiKey: "k",
      headers: { "x-opencode-session": "session-1", "user-agent": "paseo-pill-hub/1.0" },
    });
  });

  it("points OpenCode Go at its own endpoint", () => {
    expect(resolveAi(ai({ provider: "opencode-go", keys: { "opencode-go": "k" } }), "s")?.baseUrl).toBe("https://opencode.ai/inference/go/openai/v1");
  });

  it("keeps a key and a model per provider, so switching never borrows another's", () => {
    const both = ai({ keys: { opencode: "oc", openai: "oa" }, models: { opencode: "kimi-k3", openai: "gpt-x" } });
    expect(resolveAi({ ...both, provider: "opencode" }, "s")).toMatchObject({ apiKey: "oc", model: "kimi-k3" });
    expect(resolveAi({ ...both, provider: "openai" }, "s")).toMatchObject({ apiKey: "oa", model: "gpt-x", headers: {} });
  });

  it("is undefined without a key, and OpenAI also needs a model since it has no default", () => {
    expect(resolveAi(ai(), "s")).toBeUndefined();
    expect(resolveAi(ai({ provider: "openai", keys: { openai: "k" } }), "s")).toBeUndefined();
    expect(resolveAi(ai({ provider: "openai", keys: { openai: "k" }, models: { openai: "m" } }), "s")?.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("needs an address for the custom provider", () => {
    const base = ai({ provider: "custom", keys: { custom: "k" }, models: { custom: "m" } });
    expect(resolveAi(base, "s")).toBeUndefined();
    expect(resolveAi({ ...base, customUrl: "http://127.0.0.1:8090/v1" }, "s")?.baseUrl).toBe("http://127.0.0.1:8090/v1");
  });
});

describe("resolveModelsTarget", () => {
  it("lists from OpenCode's models address, and OpenCode Go's own", () => {
    expect(resolveModelsTarget(ai({ keys: { opencode: "k" } }), "opencode", "s")?.modelsUrl).toBe("https://opencode.ai/inference/v1/models");
    expect(resolveModelsTarget(ai({ keys: { "opencode-go": "k" } }), "opencode-go", "s")?.modelsUrl).toBe("https://opencode.ai/inference/go/v1/models");
  });

  it("needs only a key, not a model, and appends /models to a custom address", () => {
    expect(resolveModelsTarget(ai({ provider: "openai", keys: { openai: "k" } }), "openai", "s")?.modelsUrl).toBe("https://api.openai.com/v1/models");
    expect(resolveModelsTarget(ai({ customUrl: "https://x.example.invalid/v1/", keys: { custom: "k" } }), "custom", "s")?.modelsUrl).toBe("https://x.example.invalid/v1/models");
    expect(resolveModelsTarget(ai(), "opencode", "s")).toBeUndefined();
  });
});

describe("OpenCode requests", () => {
  const capture = () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const doFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok" } }], data: [{ id: "b" }, { id: "a" }, { id: "a" }, {}] }) };
    }) as unknown as typeof fetch;
    return { seen, doFetch };
  };

  it("sends the session id and its own user agent to the chat-completions endpoint", async () => {
    const { seen, doFetch } = capture();
    const resolved = resolveAi(ai({ keys: { opencode: "k" } }), "session-9")!;
    await chatLlm(resolved, doFetch)([{ role: "user", content: "x" }]);
    expect(seen[0]?.url).toBe("https://opencode.ai/inference/openai/v1/chat/completions");
    expect(seen[0]?.headers).toMatchObject({ authorization: "Bearer k", "x-opencode-session": "session-9", "user-agent": "paseo-pill-hub/1.0" });
  });

  it("sends no OpenCode headers to OpenAI", async () => {
    const { seen, doFetch } = capture();
    const resolved = resolveAi(ai({ provider: "openai", keys: { openai: "k" }, models: { openai: "m" } }), "s")!;
    await chatLlm(resolved, doFetch)([]);
    expect(Object.keys(seen[0]?.headers ?? {})).not.toContain("x-opencode-session");
  });
});

describe("listModels", () => {
  const reply = (body: unknown): typeof fetch => (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
  const target = { modelsUrl: "https://models.example.invalid/v1/models", apiKey: "k" };

  it("reads an OpenAI-style list, once each and sorted, skipping entries with no id", async () => {
    expect(await listModels(target, reply({ data: [{ id: "b" }, { id: "a" }, { id: "a" }, {}] }))).toEqual(["a", "b"]);
  });

  it("also understands a bare array and a models field", async () => {
    expect(await listModels(target, reply(["z", "y"]))).toEqual(["y", "z"]);
    expect(await listModels(target, reply({ models: [{ id: "m" }] }))).toEqual(["m"]);
    expect(await listModels(target, reply({ nothing: true }))).toEqual([]);
  });

  it("will not send the key over plain http to another computer", async () => {
    await expect(listModels({ modelsUrl: "http://models.example.invalid/v1/models", apiKey: "k" }, reply([]))).rejects.toThrow(/https/);
  });

  it("reports a failing API by status only", async () => {
    const failing = (async () => ({ ok: false, status: 401, json: async () => ({ error: "key sk-1 bad" }) })) as unknown as typeof fetch;
    await expect(listModels(target, failing)).rejects.toThrow("The model API answered 401.");
  });
});
