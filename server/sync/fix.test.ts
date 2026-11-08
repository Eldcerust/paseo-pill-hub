import { describe, expect, it } from "vitest";
import type { ForkSpec } from "../../shared/forks";
import type { ForkStatus } from "../../shared/sync";
import { fixPrompt, hintFor, needsAttention } from "./fix";

const status = (patch: Partial<ForkStatus>): ForkStatus => ({ toolId: "run", pluginId: "shell-yeah", kind: "git", state: "error", ...patch });
const specs: ForkSpec[] = [{ toolId: "run", pluginId: "shell-yeah", source: { kind: "git", remote: "origin", branch: "main" } }];

describe("needsAttention", () => {
  it("picks up failing and out-of-date forks but not healthy, busy or own ones", () => {
    for (const state of ["error", "conflict", "check-failed", "update-available", "staged", "unknown"] as const) {
      expect(needsAttention(status({ state }))).toBe(true);
    }
    for (const state of ["up-to-date", "working", "own"] as const) expect(needsAttention(status({ state }))).toBe(false);
    expect(needsAttention(status({ kind: "own", state: "error" }))).toBe(false);
  });
});

describe("fixPrompt", () => {
  const broken = status({ detail: "git rev-parse --short pill-hub-compat failed: fatal: Needed a single revision", base: "abc1234" });

  it("names the plugin, its state, the captured detail, its folder and the upstream it follows", () => {
    const prompt = fixPrompt([broken], { pluginDir: () => "C:/plugins/shell-yeah/checkout", specs }, "C:/work");
    expect(prompt).toContain("`shell-yeah`");
    expect(prompt).toContain("state `error`");
    expect(prompt).toContain("Needed a single revision");
    expect(prompt).toContain("installed folder: C:/plugins/shell-yeah/checkout");
    expect(prompt).toContain("upstream followed: origin/main");
    expect(prompt).toContain("Work in C:/work");
  });

  it("gives the stale-branch hypothesis for a rev-parse failure, and says when a folder is missing", () => {
    expect(hintFor(broken)).toContain("named local branch");
    expect(fixPrompt([broken], { pluginDir: () => undefined, specs }, "C:/work")).toContain("installed folder: not found");
  });

  it("covers every fork it is given", () => {
    const prompt = fixPrompt([broken, status({ toolId: "export", pluginId: "paseo-exporter-fork", state: "conflict" })], { pluginDir: () => undefined, specs }, "C:/work");
    expect(prompt).toContain("`paseo-exporter-fork`");
    expect(prompt).toContain("Resolve it in a scratch clone");
  });
});
