import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ForkSpec } from "../../shared/forks";
import type { Llm } from "./ai";
import { compareVersions, createEngine, type CheckResult } from "./engine";
import { exec } from "./exec";

const roots: string[] = [];
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const commitAll = (cwd: string, message: string) => {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
};

beforeAll(() => {
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "Test";
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "test@example.invalid";
});
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const okChecks = async (): Promise<CheckResult> => ({ ok: true, output: "" });

function engineFor(spec: ForkSpec, dir: string, extra: { llm?: Llm; checks?: (dir: string) => Promise<CheckResult>; json?: unknown; bytes?: Uint8Array } = {}) {
  return createEngine({
    exec,
    forks: [spec],
    pluginDir: () => dir,
    fetchJson: async () => extra.json,
    fetchBytes: async () => extra.bytes ?? new Uint8Array(),
    checks: extra.checks ?? okChecks,
    llm: () => extra.llm,
  });
}

/** An upstream repo, and a fork of it whose compat commit changes the last line. */
function gitCase() {
  const root = mkdtempSync(join(tmpdir(), "pill-hub-git-"));
  roots.push(root);
  const origin = join(root, "origin");
  mkdirSync(origin);
  git(origin, "init", "-q", "-b", "main");
  write(join(origin, "plugin.txt"), "line1\nline2\nline3\n");
  commitAll(origin, "Upstream start");
  const fork = join(root, "fork");
  git(root, "clone", "-q", origin, fork);
  git(fork, "config", "core.autocrlf", "false");
  git(fork, "remote", "rename", "origin", "upstream");
  git(fork, "switch", "-q", "-c", "pill-hub-compat");
  write(join(fork, "plugin.txt"), "line1\nline2\nline3 compat\n");
  commitAll(fork, "Compat change");
  const spec: ForkSpec = { toolId: "export", pluginId: "fork", liveBranch: "pill-hub-compat", source: { kind: "git", remote: "upstream", branch: "main" } };
  const upstreamCommit = (text: string) => {
    write(join(origin, "plugin.txt"), text);
    commitAll(origin, "Upstream change");
  };
  return { root, origin, fork, spec, upstreamCommit, worktree: join(root, ".pill-hub-sync", "fork") };
}

const one = async (engine: ReturnType<typeof engineFor>) => (await engine.status())[0]!;

describe("git upstream", () => {
  it("sees an update only after a check, and stages it without touching the live folder", async () => {
    const c = gitCase();
    const engine = engineFor(c.spec, c.fork);
    expect((await one(engine)).state).toBe("up-to-date");

    c.upstreamCommit("line1 upstream\nline2\nline3\n");
    expect((await one(engine)).state).toBe("up-to-date");
    await engine.check();
    const found = await one(engine);
    expect(found.state).toBe("update-available");
    expect(found.base).not.toBe(found.latest);

    const liveBefore = git(c.fork, "rev-parse", "HEAD");
    await engine.stage("export");
    const staged = await one(engine);
    expect(staged).toMatchObject({ state: "staged", stagedBranch: "pill-hub-sync/export", aiAssisted: false });
    expect(git(c.fork, "rev-parse", "HEAD")).toBe(liveBefore);
    expect(readFileSync(join(c.fork, "plugin.txt"), "utf8")).toBe("line1\nline2\nline3 compat\n");
    expect(existsSync(c.worktree)).toBe(false);
  });

  it("applies a staged update by fast-forward and then reports up to date", async () => {
    const c = gitCase();
    const engine = engineFor(c.spec, c.fork);
    c.upstreamCommit("line1 upstream\nline2\nline3\n");
    await engine.check();
    await engine.stage("export");
    const message = await engine.apply("export");
    expect(message).toContain("paseo plugin reload fork");
    expect(readFileSync(join(c.fork, "plugin.txt"), "utf8")).toBe("line1 upstream\nline2\nline3 compat\n");
    expect(git(c.fork, "branch", "--list", "pill-hub-sync/export")).toBe("");
    await engine.check();
    expect((await one(engine)).state).toBe("up-to-date");
  });

  it("reports a conflict, names the file, and leaves nothing behind", async () => {
    const c = gitCase();
    const engine = engineFor(c.spec, c.fork);
    c.upstreamCommit("line1\nline2\nline3 upstream\n");
    await engine.check();
    const liveBefore = git(c.fork, "rev-parse", "HEAD");
    await engine.stage("export");
    const status = await one(engine);
    expect(status.state).toBe("conflict");
    expect(status.detail).toContain("plugin.txt");
    expect(status.detail).toContain("turn on AI adaptation");
    expect(git(c.fork, "rev-parse", "HEAD")).toBe(liveBefore);
    expect(git(c.fork, "status", "--porcelain")).toBe("");
    expect(git(c.fork, "branch", "--list", "pill-hub-sync/export")).toBe("");
    expect(existsSync(c.worktree)).toBe(false);
  });

  it("lets a model resolve a conflict, and marks the result as AI-assisted", async () => {
    const c = gitCase();
    const sent: string[] = [];
    const llm: Llm = async (messages) => {
      sent.push(messages.map((message) => message.content).join("\n"));
      return "```json\n" + JSON.stringify({ files: [{ path: "plugin.txt", content: "line1\nline2\nline3 upstream compat\n" }] }) + "\n```";
    };
    const engine = engineFor(c.spec, c.fork, { llm });
    c.upstreamCommit("line1\nline2\nline3 upstream\n");
    await engine.check();
    await engine.stage("export");
    const status = await one(engine);
    expect(status).toMatchObject({ state: "staged", aiAssisted: true });
    expect(sent[0]).toContain("<<<<<<<");
    await engine.apply("export");
    expect(readFileSync(join(c.fork, "plugin.txt"), "utf8")).toBe("line1\nline2\nline3 upstream compat\n");
  });

  it("rejects a model answer that leaves conflict markers, and falls back to a conflict", async () => {
    const c = gitCase();
    const llm: Llm = async () => JSON.stringify({ files: [{ path: "plugin.txt", content: "<<<<<<< ours\nx\n=======\ny\n>>>>>>> theirs\n" }] });
    const engine = engineFor(c.spec, c.fork, { llm });
    c.upstreamCommit("line1\nline2\nline3 upstream\n");
    await engine.check();
    await engine.stage("export");
    const status = await one(engine);
    expect(status.state).toBe("conflict");
    expect(status.detail).toContain("conflict markers remain");
    expect(git(c.fork, "branch", "--list", "pill-hub-sync/export")).toBe("");
  });

  it("fails a clean merge whose checks fail, with the output, and removes the branch", async () => {
    const c = gitCase();
    const checks = async (): Promise<CheckResult> => ({ ok: false, output: "plugin.txt(1,1): error TS2304: Cannot find name 'x'." });
    const engine = engineFor(c.spec, c.fork, { checks });
    c.upstreamCommit("line1 upstream\nline2\nline3\n");
    await engine.check();
    await engine.stage("export");
    const status = await one(engine);
    expect(status.state).toBe("check-failed");
    expect(status.detail).toContain("TS2304");
    expect(git(c.fork, "branch", "--list", "pill-hub-sync/export")).toBe("");
  });

  it("lets a model adapt a file the failing check names, then re-checks", async () => {
    const c = gitCase();
    const checks = async (dir: string): Promise<CheckResult> =>
      readFileSync(join(dir, "plugin.txt"), "utf8").includes("adapted")
        ? { ok: true, output: "" }
        : { ok: false, output: "plugin.txt(1,1): error TS2304: Cannot find name 'x'." };
    const llm: Llm = async () => JSON.stringify({ files: [{ path: "plugin.txt", content: "line1 adapted\nline2\nline3 compat\n" }] });
    const engine = engineFor(c.spec, c.fork, { checks, llm });
    c.upstreamCommit("line1 upstream\nline2\nline3\n");
    await engine.check();
    await engine.stage("export");
    expect(await one(engine)).toMatchObject({ state: "staged", aiAssisted: true });
    await engine.apply("export");
    expect(readFileSync(join(c.fork, "plugin.txt"), "utf8")).toContain("adapted");
  });

  it("refuses a file a model was not sent", async () => {
    const c = gitCase();
    const checks = async (): Promise<CheckResult> => ({ ok: false, output: "plugin.txt(1,1): error TS1: bad" });
    const llm: Llm = async () => JSON.stringify({ files: [{ path: "../outside.txt", content: "x\n" }] });
    const engine = engineFor(c.spec, c.fork, { checks, llm });
    c.upstreamCommit("line1 upstream\nline2\nline3\n");
    await engine.check();
    await engine.stage("export");
    expect((await one(engine)).state).toBe("check-failed");
    expect(existsSync(join(c.root, "outside.txt"))).toBe(false);
  });

  it("will not apply over uncommitted changes in the live folder", async () => {
    const c = gitCase();
    const engine = engineFor(c.spec, c.fork);
    c.upstreamCommit("line1 upstream\nline2\nline3\n");
    await engine.check();
    await engine.stage("export");
    write(join(c.fork, "plugin.txt"), "line1\nline2\nedited by hand\n");
    await expect(engine.apply("export")).rejects.toThrow(/uncommitted/);
  });

  it("will not stage while the live folder is on another branch", async () => {
    const c = gitCase();
    const engine = engineFor(c.spec, c.fork);
    git(c.fork, "switch", "-q", "-c", "elsewhere");
    c.upstreamCommit("line1 upstream\nline2\nline3\n");
    await engine.check();
    await engine.stage("export");
    const status = await one(engine);
    expect(status.state).toBe("error");
    expect(status.detail).toContain("pill-hub-compat");
  });
});

/** A fork imported from npm, with a compat commit, and a registry that has a newer version. */
function npmCase(options: { corruptDownload?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "pill-hub-npm-test-"));
  roots.push(root);
  const fork = join(root, "fork");
  mkdirSync(fork);
  git(fork, "init", "-q", "-b", "main");
  git(fork, "config", "core.autocrlf", "false");
  const source = (version: string, firstLine: string) => {
    write(join(fork, "package.json"), JSON.stringify({ name: "@acme/plugin", version }) + "\n");
    write(join(fork, "index.ts"), `${firstLine}\nmiddle\nlast\n`);
  };
  source("1.0.0", "first");
  commitAll(fork, "Import @acme/plugin 1.0.0 as published");
  write(join(fork, "index.ts"), "first\nmiddle\nlast compat\n");
  commitAll(fork, "Compat change");

  const pack = join(root, "pack", "package");
  write(join(pack, "package.json"), JSON.stringify({ name: "@acme/plugin", version: "1.1.0" }) + "\n");
  write(join(pack, "index.ts"), "first upstream\nmiddle\nlast\n");
  const archive = join(root, "plugin.tgz");
  execFileSync("tar", ["-czf", archive, "-C", join(root, "pack"), "package"]);
  const bytes = new Uint8Array(readFileSync(archive));
  const integrity = `sha512-${createHash("sha512").update(options.corruptDownload ? new Uint8Array([1, 2, 3]) : bytes).digest("base64")}`;
  const json = { version: "1.1.0", dist: { tarball: "https://registry.example.invalid/plugin.tgz", integrity } };
  const spec: ForkSpec = { toolId: "skills", pluginId: "fork", liveBranch: "main", source: { kind: "npm", packageName: "@acme/plugin" } };
  return { fork, spec, json, bytes };
}

describe("npm upstream", () => {
  it("starts the vendor branch at the import commit and reports the base version", async () => {
    const c = npmCase();
    const engine = engineFor(c.spec, c.fork, { json: c.json, bytes: c.bytes });
    const status = await one(engine);
    expect(status).toMatchObject({ state: "unknown", base: "1.0.0", detail: "Not checked yet." });
    expect(git(c.fork, "log", "--format=%s", "upstream")).toBe("Import @acme/plugin 1.0.0 as published");
  });

  it("stages a newer published version as a real merge with the compat change, then applies it", async () => {
    const c = npmCase();
    const engine = engineFor(c.spec, c.fork, { json: c.json, bytes: c.bytes });
    await engine.check();
    expect(await one(engine)).toMatchObject({ state: "update-available", base: "1.0.0", latest: "1.1.0" });
    await engine.stage("skills");
    expect(await one(engine)).toMatchObject({ state: "staged", stagedBranch: "pill-hub-sync/skills" });
    expect(readFileSync(join(c.fork, "index.ts"), "utf8")).toBe("first\nmiddle\nlast compat\n");
    await engine.apply("skills");
    expect(readFileSync(join(c.fork, "index.ts"), "utf8")).toBe("first upstream\nmiddle\nlast compat\n");
    expect(git(c.fork, "log", "--format=%s", "upstream", "-1")).toBe("Import @acme/plugin 1.1.0 as published");
    await engine.check();
    expect(await one(engine)).toMatchObject({ state: "up-to-date", base: "1.1.0" });
  });

  it("refuses a download that does not match its published checksum", async () => {
    const c = npmCase({ corruptDownload: true });
    const engine = engineFor(c.spec, c.fork, { json: c.json, bytes: c.bytes });
    await engine.check();
    await engine.stage("skills");
    const status = await one(engine);
    expect(status.state).toBe("error");
    expect(status.detail).toContain("checksum");
    expect(git(c.fork, "log", "--format=%s", "upstream")).toBe("Import @acme/plugin 1.0.0 as published");
  });
});

describe("own plugins and missing folders", () => {
  it("has nothing to follow for your own plugin", async () => {
    const engine = createEngine({
      exec,
      forks: [{ toolId: "switch", pluginId: "own", liveBranch: "main", source: { kind: "own" } }],
      pluginDir: () => undefined,
      fetchJson: async () => undefined,
      fetchBytes: async () => new Uint8Array(),
      checks: okChecks,
      llm: () => undefined,
    });
    expect((await engine.status())[0]).toMatchObject({ state: "own" });
    await expect(engine.stage("switch")).rejects.toThrow(/no upstream/);
  });

  it("says so when a fork's folder is not found", async () => {
    const c = gitCase();
    const engine = createEngine({
      exec,
      forks: [c.spec],
      pluginDir: () => undefined,
      fetchJson: async () => undefined,
      fetchBytes: async () => new Uint8Array(),
      checks: okChecks,
      llm: () => undefined,
    });
    expect((await engine.status())[0]).toMatchObject({ state: "unknown", detail: expect.stringContaining("not found") });
  });
});

describe("compareVersions", () => {
  it("orders numerically, and a pre-release below its release", () => {
    expect(compareVersions("1.10.0", "1.2.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.4.0", "0.4.1")).toBe(-1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareVersions("v2.0.0", "1.9.9")).toBe(1);
  });
});
