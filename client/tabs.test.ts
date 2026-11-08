import { describe, expect, it } from "vitest";
import type { HubEntry } from "./bus";
import { activeTool, filterTools, sortTools } from "./tabs";

const entry = (toolId: string, extra: Partial<HubEntry> = {}): HubEntry => ({
  toolId,
  title: toolId,
  label: toolId,
  agentId: "a1",
  workspaceId: "w1",
  icon: "Play",
  Content: () => null,
  ...extra,
});

describe("activeTool", () => {
  const entries = [entry("run"), entry("skills"), entry("switch")];

  it("keeps a usable choice", () => {
    expect(activeTool(entries, "skills")?.toolId).toBe("skills");
  });

  it("opens the first tab when nothing is chosen", () => {
    expect(activeTool(entries, undefined)?.toolId).toBe("run");
  });

  it("falls back to the first usable tab when the choice is gone or disabled", () => {
    expect(activeTool(entries, "export")?.toolId).toBe("run");
    expect(activeTool([entry("run"), entry("skills", { disabled: true })], "skills")?.toolId).toBe("run");
    expect(activeTool([entry("run", { disabled: true }), entry("skills")], undefined)?.toolId).toBe("skills");
  });

  it("returns the first entry when every tab is disabled, and nothing when there are none", () => {
    expect(activeTool([entry("run", { disabled: true })], undefined)?.toolId).toBe("run");
    expect(activeTool([], undefined)).toBeUndefined();
  });
});

describe("filterTools", () => {
  const entries = [
    entry("run", { label: "Run", title: "Shell Yeah" }),
    entry("skills", { label: "Skills", title: "Skills" }),
    entry("switch", { label: "Switch", title: "Switchboard" }),
    entry("workspace-links", { label: "Links", title: "Workspace links" }),
  ];
  const ids = (list: readonly HubEntry[]) => list.map((item) => item.toolId);

  it("keeps everything for an empty or blank query", () => {
    expect(filterTools(entries, "")).toBe(entries);
    expect(filterTools(entries, "   ")).toBe(entries);
  });

  it("matches the label, the title or the id, ignoring case", () => {
    expect(ids(filterTools(entries, "RUN"))).toEqual(["run"]);
    expect(ids(filterTools(entries, "shell"))).toEqual(["run"]);
    expect(ids(filterTools(entries, "workspace-"))).toEqual(["workspace-links"]);
    expect(ids(filterTools(entries, "sw"))).toEqual(["switch"]);
  });

  it("requires every word to match, in any order", () => {
    expect(ids(filterTools(entries, "links workspace"))).toEqual(["workspace-links"]);
    expect(filterTools(entries, "links shell")).toEqual([]);
  });

  it("narrows to nothing when no tool matches", () => {
    expect(filterTools(entries, "zzz")).toEqual([]);
  });
});

describe("sortTools", () => {
  const entries = [entry("switch", { label: "Switch" }), entry("export", { label: "Export" }), entry("run", { label: "run" }), entry("skills", { label: "Skills" })];
  const labels = (list: readonly HubEntry[]) => list.map((item) => item.label);

  it("sorts A to Z by label regardless of case", () => {
    expect(labels(sortTools(entries, "asc"))).toEqual(["Export", "run", "Skills", "Switch"]);
  });

  it("sorts Z to A as the exact reverse", () => {
    expect(labels(sortTools(entries, "desc"))).toEqual(["Switch", "Skills", "run", "Export"]);
  });

  it("breaks label ties by tool id and leaves the input alone", () => {
    const tied = [entry("b", { label: "Same" }), entry("a", { label: "Same" })];
    expect(sortTools(tied, "asc").map((item) => item.toolId)).toEqual(["a", "b"]);
    expect(tied.map((item) => item.toolId)).toEqual(["b", "a"]);
  });
});
