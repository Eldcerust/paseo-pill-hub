import { describe, expect, it } from "vitest";
import { describeNoTools } from "./no-tools";

describe("describeNoTools", () => {
  it("says no plugin has reported in when none has, and suggests reloading the app", () => {
    const { summary, hint } = describeNoTools([]);
    expect(summary).toContain("No tool plugin has reported in");
    expect(hint).toContain("reload the app");
  });

  it("names the plugins that reported in but did not attach", () => {
    const { summary, hint } = describeNoTools(["Run", "Switch"]);
    expect(summary).toBe("Reported in: Run, Switch. None has attached to this chat.");
    expect(hint).toContain("Reconnect");
  });

  it("shortens a long list", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    expect(describeNoTools(names).summary).toBe("Reported in: A, B, C, D, E, F and 2 more. None has attached to this chat.");
    expect(describeNoTools(names.slice(0, 6)).summary).toBe("Reported in: A, B, C, D, E, F. None has attached to this chat.");
  });
});
