import { describe, expect, it } from "vitest";
import { pickModels, type ModelEntry } from "./model-pick";

const model = (id: string, label = id): ModelEntry => ({ id, label });
const all = [
  model("nano-gpt/deepseek/deepseek-v4.1-flash-1017", "DeepSeek V4.1 Flash 1017"),
  model("opencode/deepseek-v4.1-flash", "DeepSeek V4.1 Flash"),
  model("opencode-go/deepseek-v4.1-flash", "DeepSeek V4.1 Flash"),
  model("openrouter/qwen/qwen3.8-flash", "Qwen3.8 Flash"),
  model("opencode/kimi-k3", "Kimi K3"),
];
const ids = (list: ModelEntry[]) => list.map((entry) => entry.id);

describe("pickModels", () => {
  it("offers OpenCode's own models when nothing is searched", () => {
    expect(ids(pickModels(all, "", "opencode/deepseek-v4.1-flash"))).toEqual(["opencode/deepseek-v4.1-flash", "opencode-go/deepseek-v4.1-flash", "opencode/kimi-k3"]);
  });

  it("searches ids and labels, every word, in any order and case", () => {
    expect(ids(pickModels(all, "FLASH deepseek", "opencode/kimi-k3"))).toEqual([
      "opencode/kimi-k3",
      "nano-gpt/deepseek/deepseek-v4.1-flash-1017",
      "opencode/deepseek-v4.1-flash",
      "opencode-go/deepseek-v4.1-flash",
    ]);
  });

  it("keeps the chosen model first even when the search excludes it, without repeating it", () => {
    expect(ids(pickModels(all, "qwen", "opencode/kimi-k3"))).toEqual(["opencode/kimi-k3", "openrouter/qwen/qwen3.8-flash"]);
    expect(ids(pickModels(all, "kimi", "opencode/kimi-k3"))).toEqual(["opencode/kimi-k3"]);
  });

  it("shows a model the daemon no longer lists, so the setting is not hidden", () => {
    expect(pickModels(all, "", "gone/model")[0]).toEqual({ id: "gone/model", label: "gone/model" });
  });

  it("caps the list", () => {
    const many = Array.from({ length: 200 }, (_, index) => model(`opencode/m${index}`));
    expect(pickModels(many, "", "opencode/m0")).toHaveLength(60);
    expect(pickModels(many, "m", "opencode/m150", 10)).toHaveLength(10);
    expect(pickModels(many, "m", "opencode/m150", 10)[0]?.id).toBe("opencode/m150");
  });
});
