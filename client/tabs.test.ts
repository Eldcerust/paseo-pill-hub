import { describe, expect, it } from "vitest";
import type { HubEntry } from "./bus";
import { activeTool, hasLanding, landingTool, takesOver } from "./tabs";

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

describe("takesOver", () => {
  it("is true only for tools whose popover opens a covering dialog", () => {
    expect(takesOver("switch")).toBe(true);
    expect(takesOver("run")).toBe(false);
    expect(takesOver("some-new-tool")).toBe(false);
  });
});

describe("landingTool", () => {
  it("skips a takeover tool even when it sorts first", () => {
    expect(landingTool([entry("switch"), entry("run")])?.toolId).toBe("run");
  });

  it("skips disabled tools", () => {
    expect(landingTool([entry("run", { disabled: true }), entry("skills")])?.toolId).toBe("skills");
  });

  it("falls back to a takeover tool when it is the only usable one", () => {
    expect(landingTool([entry("switch")])?.toolId).toBe("switch");
  });

  it("is undefined with no tools", () => {
    expect(landingTool([])).toBeUndefined();
  });
});

describe("activeTool", () => {
  const entries = [entry("run"), entry("skills"), entry("switch")];

  it("keeps a usable choice", () => {
    expect(activeTool(entries, "skills")?.toolId).toBe("skills");
  });

  it("lands on a normal tab when nothing is chosen", () => {
    expect(activeTool(entries, undefined)?.toolId).toBe("run");
  });

  it("lands on a normal tab when the choice is gone or disabled", () => {
    expect(activeTool(entries, "export")?.toolId).toBe("run");
    expect(activeTool([entry("run"), entry("skills", { disabled: true })], "skills")?.toolId).toBe("run");
  });
});

describe("hasLanding", () => {
  it("is false when only takeover tools are merged, so closing must close the popover", () => {
    expect(hasLanding([entry("switch")])).toBe(false);
    expect(hasLanding([entry("switch"), entry("run")])).toBe(true);
    expect(hasLanding([entry("switch"), entry("run", { disabled: true })])).toBe(false);
  });
});
