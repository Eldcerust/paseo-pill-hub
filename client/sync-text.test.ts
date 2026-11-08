import { describe, expect, it } from "vitest";
import type { ForkStatus } from "../shared/sync";
import { actionFor, ago, describeFork } from "./sync-text";

const fork = (extra: Partial<ForkStatus>): ForkStatus => ({ toolId: "run", pluginId: "shell-yeah", kind: "git", state: "up-to-date", ...extra });
const now = new Date("2026-11-08T12:00:00Z");

describe("actionFor", () => {
  it("offers the next step for each state, and none when there is nothing to do", () => {
    expect(actionFor(fork({ state: "update-available" }))).toEqual({ label: "Stage update", kind: "stage" });
    expect(actionFor(fork({ state: "staged" }))).toEqual({ label: "Apply", kind: "apply" });
    expect(actionFor(fork({ state: "conflict" }))).toEqual({ label: "Retry", kind: "stage" });
    expect(actionFor(fork({ state: "check-failed" }))?.kind).toBe("stage");
    for (const state of ["up-to-date", "unknown", "own", "working"] as const) expect(actionFor(fork({ state }))).toBeUndefined();
  });
});

describe("ago", () => {
  it("reads naturally at each scale", () => {
    expect(ago("2026-11-08T11:59:40Z", now)).toBe("just now");
    expect(ago("2026-11-08T11:30:00Z", now)).toBe("30 min ago");
    expect(ago("2026-11-08T06:00:00Z", now)).toBe("6 h ago");
    expect(ago("2026-11-04T12:00:00Z", now)).toBe("4 days ago");
    expect(ago(undefined, now)).toBeUndefined();
  });
});

describe("describeFork", () => {
  it("puts the origin first, then the state, then when it was checked", () => {
    const text = describeFork(fork({ detail: "Up to date. Built on abc1234.", checkedAt: "2026-11-08T11:00:00Z" }), "Your fork of X", now);
    expect(text.split("\n")).toEqual(["Your fork of X.", "Up to date. Built on abc1234.", "Checked 60 min ago."]);
  });

  it("does not claim a check while it is working", () => {
    const text = describeFork(fork({ state: "working", detail: "Merging…", checkedAt: "2026-11-08T11:00:00Z" }), "Your fork of X", now);
    expect(text).not.toContain("Checked");
  });
});
