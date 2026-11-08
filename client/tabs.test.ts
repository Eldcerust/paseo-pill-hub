import { describe, expect, it } from "vitest";
import type { HubEntry } from "./bus";
import { activeTool } from "./tabs";

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
