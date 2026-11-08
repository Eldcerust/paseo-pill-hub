import { describe, expect, it } from "vitest";
import { HEIGHT_MAX, HEIGHT_MIN, heightDefaults, hubSettings } from "../shared/config";
import { currentHeights, heightFor, heightText, parseHeightDraft, setHeights, subscribeHeights } from "./heights";

describe("parseHeightDraft", () => {
  it("treats blank and 0 as no limit", () => {
    expect(parseHeightDraft("")).toEqual({ ok: true, value: 0 });
    expect(parseHeightDraft("   ")).toEqual({ ok: true, value: 0 });
    expect(parseHeightDraft("0")).toEqual({ ok: true, value: 0 });
  });

  it("accepts whole pixels within range, trimmed", () => {
    expect(parseHeightDraft(" 350 ")).toEqual({ ok: true, value: 350 });
    expect(parseHeightDraft(String(HEIGHT_MIN))).toEqual({ ok: true, value: HEIGHT_MIN });
    expect(parseHeightDraft(String(HEIGHT_MAX))).toEqual({ ok: true, value: HEIGHT_MAX });
  });

  it("rejects values outside the range and says what range is allowed", () => {
    for (const text of [String(HEIGHT_MIN - 1), "5", String(HEIGHT_MAX + 1)]) {
      const result = parseHeightDraft(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(`${HEIGHT_MIN} to ${HEIGHT_MAX}`);
    }
  });

  it("rejects anything that is not a plain whole number", () => {
    for (const text of ["abc", "350px", "350.5", "-200", "3e2", "1 000"]) expect(parseHeightDraft(text).ok).toBe(false);
  });
});

describe("heightFor", () => {
  const heights = { web: 350, ios: 400, android: 0 };

  it("picks the platform's value", () => {
    expect(heightFor(heights, "web")).toBe(350);
    expect(heightFor(heights, "ios")).toBe(400);
  });

  it("returns no limit for 0", () => {
    expect(heightFor(heights, "android")).toBeUndefined();
  });

  it("falls back to the desktop value for a platform it does not know", () => {
    expect(heightFor(heights, "visionos")).toBe(350);
  });

  describe("in a compact layout, which is a bottom sheet with no 440px cap", () => {
    it("ignores the desktop value, so a narrow browser window does not clip a tool", () => {
      expect(heightFor(heights, "web", true)).toBeUndefined();
      expect(heightFor(heights, "visionos", true)).toBeUndefined();
    });

    it("still honours a limit set for a phone platform", () => {
      expect(heightFor(heights, "ios", true)).toBe(400);
      expect(heightFor(heights, "android", true)).toBeUndefined();
    });

    it("leaves a non-compact layout alone", () => {
      expect(heightFor(heights, "web", false)).toBe(350);
    });
  });
});

describe("heightText", () => {
  it("shows no limit as an empty field", () => {
    expect(heightText(0)).toBe("");
    expect(heightText(350)).toBe("350");
  });
});

describe("height store", () => {
  it("notifies only when a value changes, and stops after unsubscribe", () => {
    setHeights(heightDefaults);
    let heard = 0;
    const stop = subscribeHeights(() => (heard += 1));
    setHeights({ ...heightDefaults });
    expect(heard).toBe(0);
    setHeights({ ...heightDefaults, web: 300 });
    expect(heard).toBe(1);
    expect(currentHeights().web).toBe(300);
    stop();
    setHeights(heightDefaults);
    expect(heard).toBe(1);
    expect(currentHeights()).toEqual(heightDefaults);
  });
});

describe("heights in the stored settings", () => {
  const parse = (value: unknown) => hubSettings.schema.parse(value);

  it("fills the defaults for settings saved before heights existed", () => {
    expect(parse({ merged: { run: false } }).heights).toEqual(heightDefaults);
  });

  it("keeps a partial set and defaults the rest", () => {
    expect(parse({ heights: { web: 300 } }).heights).toEqual({ ...heightDefaults, web: 300 });
  });

  it("allows 0 for no limit", () => {
    expect(parse({ heights: { ios: 0 } }).heights.ios).toBe(0);
  });

  it("rejects a height outside the range or that is not whole", () => {
    expect(() => parse({ heights: { web: 50 } })).toThrow();
    expect(() => parse({ heights: { web: HEIGHT_MAX + 1 } })).toThrow();
    expect(() => parse({ heights: { web: 350.5 } })).toThrow();
  });
});

describe("the defaults", () => {
  it("keep the desktop popover inside Paseo's 440px cap with Switch's 340px picker", () => {
    const hostPadding = 32;
    const headerRow = 34 + 10;
    expect(heightDefaults.web).toBeGreaterThanOrEqual(340);
    expect(hostPadding + headerRow + heightDefaults.web).toBeLessThanOrEqual(440);
  });

  it("leave phones unlimited, because Switch sizes itself to the screen there (up to 560pt) and a limit hides its buttons", () => {
    expect(heightDefaults.ios).toBe(0);
    expect(heightDefaults.android).toBe(0);
    expect(heightFor(heightDefaults, "ios", true)).toBeUndefined();
    expect(heightFor(heightDefaults, "android", true)).toBeUndefined();
  });
});
