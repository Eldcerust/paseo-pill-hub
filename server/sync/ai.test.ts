import { describe, expect, it } from "vitest";
import { chatLlm, parseEdits, validateEdits } from "./ai";

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

describe("chatLlm", () => {
  const reply = (body: unknown, ok = true): typeof fetch => (async () => ({ ok, status: ok ? 200 : 401, json: async () => body })) as unknown as typeof fetch;

  it("posts to the chat endpoint with the key and returns the text", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const doFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "hi" } }] }) };
    }) as unknown as typeof fetch;
    const llm = chatLlm({ baseUrl: "https://models.example.invalid/v1/", model: "m", apiKey: "secret" }, doFetch);
    expect(await llm([{ role: "user", content: "x" }])).toBe("hi");
    expect(seen?.url).toBe("https://models.example.invalid/v1/chat/completions");
    expect((seen?.init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(JSON.parse(String(seen?.init.body))).toMatchObject({ model: "m", temperature: 0 });
  });

  it("will not send the key over plain http to another computer", () => {
    expect(() => chatLlm({ baseUrl: "http://models.example.invalid/v1", model: "m", apiKey: "k" })).toThrow(/https/);
    expect(() => chatLlm({ baseUrl: "http://127.0.0.1:8090/v1", model: "m", apiKey: "k" })).not.toThrow();
  });

  it("reports a failing API by status, without echoing its answer", async () => {
    const llm = chatLlm({ baseUrl: "https://models.example.invalid/v1", model: "m", apiKey: "k" }, reply({ error: "key sk-123 rejected" }, false));
    await expect(llm([])).rejects.toThrow("The model API answered 401.");
  });

  it("fails clearly when the answer has no text", async () => {
    const llm = chatLlm({ baseUrl: "https://models.example.invalid/v1", model: "m", apiKey: "k" }, reply({ choices: [] }));
    await expect(llm([])).rejects.toThrow(/no text/);
  });
});
