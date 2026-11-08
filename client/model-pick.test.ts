import { describe, expect, it } from "vitest";
import { ROW_LIMIT, modelsFor, providerOf, providersOf, visibleModels, type ModelEntry } from "./model-pick";

const model = (id: string, label = id): ModelEntry => ({ id, label });
const all = [
  model("nano-gpt/deepseek/deepseek-v4.1-flash-1017", "DeepSeek V4.1 Flash 1017"),
  model("opencode/kimi-k3", "Kimi K3"),
  model("opencode/deepseek-v4.1-flash", "DeepSeek V4.1 Flash"),
  model("opencode-go/deepseek-v4.1-flash", "DeepSeek V4.1 Flash"),
  model("openrouter/qwen/qwen3.8-flash", "Qwen3.8 Flash"),
  model("openrouter/anthropic/claude-sonnet-5", "Claude Sonnet 5"),
  model("loose-model", "Loose"),
];
const ids = (list: readonly ModelEntry[]) => list.map((entry) => entry.id);

describe("providerOf", () => {
  it("is everything before the first slash", () => {
    expect(providerOf("opencode/deepseek-v4.1-flash")).toBe("opencode");
    expect(providerOf("nano-gpt/deepseek/deepseek-v4.1-flash-1017")).toBe("nano-gpt");
  });

  it("puts an id with no provider part under 'other'", () => {
    expect(providerOf("loose-model")).toBe("other");
    expect(providerOf("/odd")).toBe("other");
  });
});

describe("providersOf", () => {
  it("counts each provider and lists OpenCode's own first, then the rest A to Z", () => {
    expect(providersOf(all)).toEqual([
      { id: "opencode", count: 2 },
      { id: "opencode-go", count: 1 },
      { id: "nano-gpt", count: 1 },
      { id: "openrouter", count: 2 },
      { id: "other", count: 1 },
    ]);
  });

  it("is empty for no models", () => {
    expect(providersOf([])).toEqual([]);
  });

  it("still lists OpenCode's own providers when only some are present", () => {
    expect(providersOf([model("zeta/a"), model("opencode-go/b")]).map((p) => p.id)).toEqual(["opencode-go", "zeta"]);
  });
});

describe("modelsFor", () => {
  it("limits to one provider", () => {
    expect(ids(modelsFor(all, "opencode", ""))).toEqual(["opencode/deepseek-v4.1-flash", "opencode/kimi-k3"]);
    expect(ids(modelsFor(all, "openrouter", ""))).toEqual(["openrouter/anthropic/claude-sonnet-5", "openrouter/qwen/qwen3.8-flash"]);
  });

  it("covers every provider when none is given", () => {
    expect(modelsFor(all, undefined, "")).toHaveLength(all.length);
  });

  it("does not mistake a provider that merely starts with another's name for it", () => {
    expect(ids(modelsFor(all, "opencode", "")).some((id) => id.startsWith("opencode-go/"))).toBe(false);
  });

  it("searches ids and labels, every word, in any order and case", () => {
    const found = ids(modelsFor(all, undefined, "FLASH deepseek"));
    expect(found).toHaveLength(3);
    // Same label first, ordered by id; the longer "Flash 1017" label sorts after them.
    expect(found.slice(0, 2).sort()).toEqual(["opencode-go/deepseek-v4.1-flash", "opencode/deepseek-v4.1-flash"]);
    expect(found[2]).toBe("nano-gpt/deepseek/deepseek-v4.1-flash-1017");
  });

  it("combines a provider with a search", () => {
    expect(ids(modelsFor(all, "openrouter", "qwen"))).toEqual(["openrouter/qwen/qwen3.8-flash"]);
    expect(modelsFor(all, "opencode", "qwen")).toEqual([]);
  });

  it("matches the provider name typed in the search too", () => {
    expect(ids(modelsFor(all, undefined, "nano-gpt"))).toEqual(["nano-gpt/deepseek/deepseek-v4.1-flash-1017"]);
  });

  it("sorts A to Z by label, ignoring case, and breaks ties by id", () => {
    const mixed = [model("p/b", "banana"), model("p/a2", "Apple"), model("p/a1", "Apple"), model("p/c", "Cherry")];
    expect(ids(modelsFor(mixed, "p", ""))).toEqual(["p/a1", "p/a2", "p/b", "p/c"]);
  });

  it("ignores blank queries and leaves its input alone", () => {
    const input = [model("p/b"), model("p/a")];
    expect(ids(modelsFor(input, undefined, "   "))).toEqual(["p/a", "p/b"]);
    expect(ids(input)).toEqual(["p/b", "p/a"]);
  });
});

describe("visibleModels", () => {
  const many = Array.from({ length: 250 }, (_, index) => model(`p/m${index}`));

  it("draws everything when it fits", () => {
    expect(visibleModels(many.slice(0, 5))).toEqual({ rows: many.slice(0, 5), hidden: 0 });
  });

  it("caps the rows and says how many were left out", () => {
    const { rows, hidden } = visibleModels(many);
    expect(rows).toHaveLength(ROW_LIMIT);
    expect(hidden).toBe(250 - ROW_LIMIT);
  });

  it("takes a custom limit", () => {
    expect(visibleModels(many, 10)).toMatchObject({ hidden: 240 });
    expect(visibleModels([], 10)).toEqual({ rows: [], hidden: 0 });
  });
});
