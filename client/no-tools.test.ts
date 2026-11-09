import { describe, expect, it } from "vitest";
import { describeNoTools, type NoToolsFacts } from "./no-tools";

const facts = (patch: Partial<NoToolsFacts> = {}): NoToolsFacts => ({
  announced: ["Run", "Switch"],
  registrations: 10,
  onBus: true,
  otherChats: 0,
  ...patch,
});

describe("describeNoTools", () => {
  it("says no plugin has reported in when none has, and suggests reloading the app", () => {
    const { summary, hint } = describeNoTools(facts({ announced: [] }));
    expect(summary).toContain("No tool plugin has reported in");
    expect(hint).toContain("reload the app");
  });

  it("says the tools are gone when they reported in but none is running any more", () => {
    const { summary, hint } = describeNoTools(facts({ registrations: 0 }));
    expect(summary).toBe("Reported in: Run, Switch. None of them is running in this app any more.");
    expect(hint).toContain("Reload the app");
  });

  it("says they attached to a different hub when this one is not on the bus", () => {
    const { summary, hint } = describeNoTools(facts({ onBus: false, registrations: 4 }));
    expect(summary).toContain("another copy of the hub");
    expect(hint).toContain("only one hub");
  });

  it("puts a hub that is not on the bus ahead of a count of zero, since that is the earlier cause", () => {
    expect(describeNoTools(facts({ onBus: false, registrations: 0 })).summary).toContain("another copy of the hub");
  });

  it("says which chats they did attach to when only this one is missing", () => {
    expect(describeNoTools(facts({ otherChats: 3 })).summary).toBe("Reported in: Run, Switch. They are attached to 3 other chats, but not this one.");
    expect(describeNoTools(facts({ otherChats: 1 })).summary).toContain("1 other chat,");
    expect(describeNoTools(facts({ otherChats: 3 })).hint).toContain("missing from their list of chats");
  });

  it("falls back to asking again when they are running but attached nowhere", () => {
    const { summary, hint } = describeNoTools(facts());
    expect(summary).toBe("Reported in: Run, Switch. None has attached to any chat.");
    expect(hint).toContain("Reconnect asks again");
  });

  it("shortens a long list of names", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    expect(describeNoTools(facts({ announced: names })).summary).toContain("A, B, C, D, E, F and 2 more.");
    expect(describeNoTools(facts({ announced: names.slice(0, 6) })).summary).toContain("A, B, C, D, E, F.");
  });

  it("always gives the raw numbers", () => {
    expect(describeNoTools(facts({ registrations: 7, otherChats: 2 })).details).toBe(
      "Tool registrations alive: 7. This hub is the one tools attach to: yes. Chats with tools attached: 2.",
    );
    expect(describeNoTools(facts({ onBus: false })).details).toContain("attach to: no");
  });
});
