import { describe, expect, it } from "vitest";
import { conflictPrompt, fixPrompt, parseEdits, validateEdits } from "./ai";

describe("parseEdits", () => {
  const body = { files: [{ path: "a.ts", content: "x\n" }] };

  it("reads bare and fenced JSON", () => {
    expect(parseEdits(JSON.stringify(body))).toEqual(body.files);
    expect(parseEdits("Here you go:\n```json\n" + JSON.stringify(body) + "\n```")).toEqual(body.files);
  });

  it("returns undefined for anything else", () => {
    expect(parseEdits("I resolved it.")).toBeUndefined();
    expect(parseEdits(JSON.stringify({ files: [] }))).toBeUndefined();
    expect(parseEdits(JSON.stringify({ files: [{ path: "", content: "x" }] }))).toBeUndefined();
  });
});

describe("validateEdits", () => {
  const edit = (path: string, content = "ok\n") => ({ path, content });

  it("accepts edits for files that were sent", () => {
    expect(validateEdits([edit("a.ts")], ["a.ts", "b.ts"], { requireAll: false })).toMatchObject({ ok: true });
  });

  it("refuses files that were not sent, repeats, empties and leftover markers", () => {
    expect(validateEdits([edit("../x")], ["a.ts"], { requireAll: false })).toMatchObject({ ok: false });
    expect(validateEdits([edit("a.ts"), edit("a.ts")], ["a.ts"], { requireAll: false })).toMatchObject({ ok: false });
    expect(validateEdits([edit("a.ts", "  \n")], ["a.ts"], { requireAll: false })).toMatchObject({ ok: false });
    expect(validateEdits([edit("a.ts", "a\n<<<<<<< ours\nb\n")], ["a.ts"], { requireAll: false })).toMatchObject({ ok: false });
  });

  it("can require every sent file back", () => {
    const result = validateEdits([edit("a.ts")], ["a.ts", "b.ts"], { requireAll: true });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("b.ts") });
  });
});

describe("prompts", () => {
  it("tell the model to keep the compat changes and to use no tools", () => {
    const [system, user] = conflictPrompt("1.2.0", [{ path: "a.ts", content: "x" }]);
    expect(system?.content).toContain("hub-compat");
    expect(system?.content).toContain("do not edit any files yourself");
    expect(user?.content).toContain("===== a.ts =====");
    expect(fixPrompt("a.ts(1,1): error TS1", [{ path: "a.ts", content: "x" }])[1]?.content).toContain("error TS1");
  });
});
