import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import { FORKS, VENDOR_BRANCH, stagingBranch, type ForkSpec } from "../../shared/forks";
import type { ForkState, ForkStatus } from "../../shared/sync";
import { conflictPrompt, fixPrompt, parseEdits, validateEdits, type FileText, type Llm } from "./ai";
import type { Exec } from "./exec";

export interface CheckResult {
  ok: boolean;
  output: string;
}

export interface EngineDeps {
  exec: Exec;
  /** The folder a plugin id is installed from, or undefined when it is not installed. */
  pluginDir(pluginId: string): string | undefined;
  fetchJson(url: string): Promise<unknown>;
  fetchBytes(url: string): Promise<Uint8Array>;
  /** Installs and type-checks a checkout without running anything the upstream ships. */
  checks(dir: string): Promise<CheckResult>;
  /** The model to adapt with, read per call from the current settings; undefined when switched off. */
  llm(): Llm | undefined;
  now?(): Date;
  forks?: readonly ForkSpec[];
}

export interface Engine {
  status(): Promise<ForkStatus[]>;
  /** Looks at every upstream, then reports. */
  check(): Promise<ForkStatus[]>;
  /** Stages an update on its own branch. Resolves when done; the outcome is in `status()`. */
  stage(toolId: string): Promise<void>;
  /** Fast-forwards the live branch to the staged one. Reload the plugin afterwards. */
  apply(toolId: string): Promise<string>;
}

const npmMeta = z.object({
  version: z.string(),
  dist: z.object({ tarball: z.string().url(), integrity: z.string().optional(), shasum: z.string().optional() }),
});
type NpmMeta = z.infer<typeof npmMeta>;

interface RemoteInfo {
  checkedAt: string;
  error?: string;
  meta?: NpmMeta;
}

interface Failure {
  state: Extract<ForkState, "conflict" | "check-failed" | "error">;
  detail: string;
  /** The upstream version or commit it failed on; a newer one clears it. */
  target: string;
}

type Outcome = { state: "staged" | "up-to-date"; ai: boolean } | Failure;

const AI_MARK = "AI-assisted";

/** 1.2.3 against 1.10.0, with a pre-release below its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => {
    const [core = "", pre] = version.replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((part) => Number.parseInt(part, 10) || 0), pre };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.nums.length, right.nums.length); i++) {
    const diff = (left.nums[i] ?? 0) - (right.nums[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === undefined) return 1;
  if (right.pre === undefined) return -1;
  return left.pre < right.pre ? -1 : 1;
}

/** A path inside `root`, or an error: nothing a model or an upstream names may leave the checkout. */
function inside(root: string, relative: string): string {
  const full = resolve(root, relative);
  if (isAbsolute(relative) || (full !== resolve(root) && !full.startsWith(resolve(root) + sep))) {
    throw new Error(`Refusing a path outside the checkout: ${relative}`);
  }
  return full;
}

function verifyIntegrity(bytes: Uint8Array, dist: NpmMeta["dist"]): void {
  if (dist.integrity) {
    const entry = dist.integrity.split(/\s+/).find((candidate) => candidate.startsWith("sha512-"));
    if (entry) {
      const actual = createHash("sha512").update(bytes).digest("base64");
      if (`sha512-${actual}` !== entry) throw new Error("The downloaded package does not match its published checksum.");
      return;
    }
  }
  if (dist.shasum) {
    if (createHash("sha1").update(bytes).digest("hex") !== dist.shasum) throw new Error("The downloaded package does not match its published checksum.");
    return;
  }
  throw new Error("The registry published no checksum for this package.");
}

const firstLines = (text: string, count = 12) => text.trim().split(/\r?\n/).slice(0, count).join("\n");

export function createEngine(deps: EngineDeps): Engine {
  const forks = deps.forks ?? FORKS;
  const now = deps.now ?? (() => new Date());
  const remote = new Map<string, RemoteInfo>();
  const failures = new Map<string, Failure>();
  const working = new Map<string, string>();
  let queue: Promise<unknown> = Promise.resolve();

  const git = (dir: string, args: readonly string[], timeoutMs = 120_000) => deps.exec("git", args, { cwd: dir, timeoutMs });
  async function gitOut(dir: string, args: readonly string[], timeoutMs?: number): Promise<string> {
    const result = await git(dir, args, timeoutMs);
    if (result.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
    return result.stdout.trim();
  }
  const branchExists = async (dir: string, name: string) => (await git(dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`])).code === 0;
  const refExists = async (dir: string, ref: string) => (await git(dir, ["rev-parse", "--verify", "--quiet", ref])).code === 0;
  const ahead = async (dir: string, from: string, to: string) => Number.parseInt(await gitOut(dir, ["rev-list", "--count", `${from}..${to}`]), 10) || 0;
  const short = (dir: string, rev: string) => gitOut(dir, ["rev-parse", "--short", rev]);

  function specOf(toolId: string): ForkSpec {
    const spec = forks.find((candidate) => candidate.toolId === toolId);
    if (!spec || spec.source.kind === "own") throw new Error(`${toolId} has no upstream to follow.`);
    return spec;
  }

  function dirOf(spec: ForkSpec): string {
    const dir = deps.pluginDir(spec.pluginId);
    if (!dir || !existsSync(dir)) throw new Error(`The folder of ${spec.pluginId} was not found. Is the plugin installed?`);
    return dir;
  }

  /** The vendor branch starts at the import commit; older forks get it created on first use. */
  async function ensureVendorBranch(dir: string): Promise<void> {
    if (await branchExists(dir, VENDOR_BRANCH)) return;
    const imports = (await gitOut(dir, ["log", "--format=%H", "--grep=^Import "])).split(/\r?\n/).filter(Boolean);
    const first = imports[imports.length - 1];
    if (!first) throw new Error("This fork has no import commit to start the upstream branch from.");
    await gitOut(dir, ["branch", VENDOR_BRANCH, first]);
  }

  async function versionAt(dir: string, rev: string): Promise<string> {
    const manifest = JSON.parse(await gitOut(dir, ["show", `${rev}:package.json`])) as { version?: string };
    return manifest.version ?? "unknown";
  }

  async function latestMeta(packageName: string): Promise<NpmMeta> {
    const url = `https://registry.npmjs.org/${packageName.replace("/", "%2F")}/latest`;
    return npmMeta.parse(await deps.fetchJson(url));
  }

  async function removeWorktree(dir: string, path: string): Promise<void> {
    await git(dir, ["worktree", "remove", "--force", path]);
    rmSync(path, { recursive: true, force: true });
    await git(dir, ["worktree", "prune"]);
  }

  async function statusOf(spec: ForkSpec): Promise<ForkStatus> {
    const head: ForkStatus = { toolId: spec.toolId, pluginId: spec.pluginId, kind: spec.source.kind, state: "unknown" };
    if (spec.source.kind === "own") return { ...head, state: "own", detail: "Your own plugin. Nothing upstream to follow." };
    const dir = deps.pluginDir(spec.pluginId);
    if (!dir || !existsSync(dir)) return { ...head, detail: "The fork's folder was not found. Is the plugin installed?" };
    const job = working.get(spec.toolId);
    if (job) return { ...head, state: "working", detail: job };
    try {
      const live = spec.liveBranch;
      const info = remote.get(spec.toolId);
      let base: string;
      let latest: string | undefined;
      let newer = false;
      if (spec.source.kind === "git") {
        const ref = `${spec.source.remote}/${spec.source.branch}`;
        if (await refExists(dir, ref)) {
          const common = await git(dir, ["merge-base", live, ref]);
          base = await short(dir, common.code === 0 ? common.stdout.trim() : live);
          latest = await short(dir, ref);
          newer = (await ahead(dir, live, ref)) > 0;
        } else {
          base = await short(dir, live);
        }
      } else {
        await ensureVendorBranch(dir);
        base = await versionAt(dir, await gitOut(dir, ["merge-base", live, VENDOR_BRANCH]));
        latest = info?.meta?.version;
        newer = latest !== undefined && compareVersions(latest, base) > 0;
      }
      const common: ForkStatus = { ...head, base, latest, checkedAt: info?.checkedAt };
      const staging = stagingBranch(spec.toolId);
      if ((await branchExists(dir, staging)) && (await ahead(dir, live, staging)) > 0) {
        const ai = (await gitOut(dir, ["log", "--format=%s", `${live}..${staging}`])).includes(AI_MARK);
        return {
          ...common,
          state: "staged",
          stagedBranch: staging,
          aiAssisted: ai,
          detail: `Update staged${ai ? " with AI-assisted changes" : ""} and checked. Review the branch, apply it, then reload ${spec.pluginId}.`,
        };
      }
      const failure = failures.get(spec.toolId);
      if (failure && (failure.state === "error" || failure.target === latest)) return { ...common, state: failure.state, detail: failure.detail };
      if (info?.error) return { ...common, state: "error", detail: info.error };
      if (newer) return { ...common, state: "update-available", detail: `Update available: ${base} to ${latest}.` };
      if (!info && spec.source.kind === "npm") return { ...common, detail: "Not checked yet." };
      return { ...common, state: "up-to-date", detail: `Up to date. Built on ${base}.` };
    } catch (error) {
      return { ...head, state: "error", detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async function check(): Promise<ForkStatus[]> {
    for (const spec of forks) {
      if (spec.source.kind === "own" || working.has(spec.toolId)) continue;
      const checkedAt = now().toISOString();
      // A fresh look is a fresh start for a stage that merely errored; conflicts stay until upstream moves.
      if (failures.get(spec.toolId)?.state === "error") failures.delete(spec.toolId);
      let dir: string;
      try {
        dir = dirOf(spec);
      } catch {
        continue;
      }
      try {
        if (spec.source.kind === "git") {
          const fetched = await git(dir, ["fetch", "--quiet", spec.source.remote], 90_000);
          remote.set(spec.toolId, {
            checkedAt,
            error: fetched.code === 0 ? undefined : `Could not fetch ${spec.source.remote}: ${firstLines(fetched.stderr || fetched.stdout, 2)}`,
          });
        } else {
          remote.set(spec.toolId, { checkedAt, meta: await latestMeta(spec.source.packageName) });
        }
      } catch (error) {
        remote.set(spec.toolId, { checkedAt, error: `Could not check upstream: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    return status();
  }

  async function status(): Promise<ForkStatus[]> {
    return Promise.all(forks.map(statusOf));
  }

  /** Adds the newest published version to the vendor branch as one commit. */
  async function importVersion(dir: string, packageName: string, meta: NpmMeta): Promise<void> {
    const scratch = mkdtempSync(join(tmpdir(), "pill-hub-npm-"));
    const vendor = join(scratch, "vendor");
    try {
      const bytes = await deps.fetchBytes(meta.dist.tarball);
      verifyIntegrity(bytes, meta.dist);
      const archive = join(scratch, "package.tgz");
      const extracted = join(scratch, "package");
      writeFileSync(archive, bytes);
      mkdirSync(extracted);
      const untar = await deps.exec("tar", ["-xzf", archive, "-C", extracted, "--strip-components=1"]);
      if (untar.code !== 0) throw new Error(`Could not unpack the package: ${firstLines(untar.stderr, 2)}`);
      await gitOut(dir, ["worktree", "add", vendor, VENDOR_BRANCH]);
      try {
        for (const entry of readdirSync(vendor)) if (entry !== ".git") rmSync(join(vendor, entry), { recursive: true, force: true });
        cpSync(extracted, vendor, { recursive: true });
        await gitOut(vendor, ["add", "-A"]);
        if ((await gitOut(vendor, ["status", "--porcelain"])) !== "") {
          await gitOut(vendor, ["commit", "-m", `Import ${packageName} ${meta.version} as published`]);
        }
      } finally {
        await removeWorktree(dir, vendor);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  async function resolveConflicts(wt: string, files: string[], llm: Llm, message: string, label: string): Promise<string | undefined> {
    const texts: FileText[] = files.map((path) => ({ path, content: readFileSync(inside(wt, path), "utf8") }));
    if (texts.reduce((total, file) => total + file.content.length, 0) > 400_000) return "the conflicting files are too large to send";
    let edits: FileText[] | undefined;
    try {
      edits = parseEdits(await llm(conflictPrompt(label, texts)));
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    if (!edits) return "the model's reply was not the JSON that was asked for";
    const valid = validateEdits(edits, files, { requireAll: true });
    if (!valid.ok) return valid.reason;
    for (const edit of valid.edits) writeFileSync(inside(wt, edit.path), edit.content);
    await gitOut(wt, ["add", ...files]);
    await gitOut(wt, ["commit", "-m", `${message} (${AI_MARK} resolution)`]);
    return undefined;
  }

  /** Asks the model to adapt the files a failing check names. True when it changed something. */
  async function fixErrors(wt: string, output: string, llm: Llm): Promise<boolean> {
    const named = [...output.matchAll(/^([^\s(][^()\r\n]*?)\(\d+,\d+\): error/gm)].map((match) => (match[1] ?? "").replace(/\\/g, "/"));
    const files: FileText[] = [];
    for (const path of [...new Set(named)]) {
      if (files.length >= 6) break;
      if (path.startsWith("node_modules/") || path === "client/hub-compat.tsx") continue;
      try {
        const full = inside(wt, path);
        if (existsSync(full)) files.push({ path, content: readFileSync(full, "utf8") });
      } catch {
        // A path outside the checkout is skipped, not sent.
      }
    }
    if (files.length === 0) return false;
    let edits: FileText[] | undefined;
    try {
      edits = parseEdits(await llm(fixPrompt(firstLines(output, 40), files)));
    } catch {
      return false;
    }
    if (!edits) return false;
    const valid = validateEdits(edits, files.map((file) => file.path), { requireAll: false });
    if (!valid.ok) return false;
    for (const edit of valid.edits) writeFileSync(inside(wt, edit.path), edit.content);
    if ((await gitOut(wt, ["status", "--porcelain"])) === "") return false;
    await gitOut(wt, ["commit", "-am", `Adapt to upstream changes (${AI_MARK})`]);
    return true;
  }

  async function stageNow(spec: ForkSpec): Promise<Outcome> {
    const dir = dirOf(spec);
    const live = spec.liveBranch;
    const staging = stagingBranch(spec.toolId);
    const head = await gitOut(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (head !== live) throw new Error(`The live folder is on ${head}, not ${live}. Staging does not touch it, but it needs to be on ${live}.`);

    working.set(spec.toolId, "Fetching the newest upstream…");
    let target: string;
    let label: string;
    if (spec.source.kind === "git") {
      await gitOut(dir, ["fetch", "--quiet", spec.source.remote], 90_000);
      target = `${spec.source.remote}/${spec.source.branch}`;
      label = await short(dir, target);
    } else if (spec.source.kind === "npm") {
      await ensureVendorBranch(dir);
      const meta = await latestMeta(spec.source.packageName);
      await importVersion(dir, spec.source.packageName, meta);
      target = VENDOR_BRANCH;
      label = meta.version;
    } else {
      throw new Error(`${spec.toolId} has no upstream to follow.`);
    }
    if ((await ahead(dir, live, target)) === 0) return { state: "up-to-date", ai: false };

    working.set(spec.toolId, `Merging upstream ${label}…`);
    const wt = join(dirname(dir), ".pill-hub-sync", spec.pluginId);
    mkdirSync(dirname(wt), { recursive: true });
    await removeWorktree(dir, wt);
    await git(dir, ["branch", "-D", staging]);
    await gitOut(dir, ["worktree", "add", "-B", staging, wt, live]);

    let keep = false;
    try {
      const message = `Merge upstream ${spec.pluginId} ${label}`;
      let ai = false;
      const merged = await git(wt, ["merge", "--no-edit", "-m", message, target]);
      if (merged.code !== 0) {
        const files = (await gitOut(wt, ["diff", "--name-only", "--diff-filter=U"])).split(/\r?\n/).filter(Boolean);
        if (files.length === 0) {
          await git(wt, ["merge", "--abort"]);
          return { state: "error", target: label, detail: `Merging upstream ${label} failed: ${firstLines(merged.stderr || merged.stdout, 3)}` };
        }
        const llm = deps.llm();
        let why: string | undefined;
        if (llm) {
          working.set(spec.toolId, "Asking the model to resolve conflicts…");
          why = await resolveConflicts(wt, files, llm, message, label);
        }
        if (!llm || why !== undefined) {
          await git(wt, ["merge", "--abort"]);
          const advice = llm ? `The model could not resolve it: ${why}.` : "Resolve it by hand, or turn on AI adaptation.";
          return { state: "conflict", target: label, detail: `Merging upstream ${label} conflicts in ${files.join(", ")}. ${advice}` };
        }
        ai = true;
      }

      working.set(spec.toolId, "Installing and type-checking…");
      let result = await deps.checks(wt);
      for (let round = 0; !result.ok && round < 2; round++) {
        const llm = deps.llm();
        if (!llm) break;
        working.set(spec.toolId, "Asking the model to fix the type errors…");
        if (!(await fixErrors(wt, result.output, llm))) break;
        ai = true;
        working.set(spec.toolId, "Type-checking again…");
        result = await deps.checks(wt);
      }
      if (!result.ok) {
        return { state: "check-failed", target: label, detail: `The merge of upstream ${label} is clean but the checks fail:\n${firstLines(result.output)}` };
      }
      keep = true;
      return { state: "staged", ai };
    } finally {
      await removeWorktree(dir, wt);
      if (!keep) await git(dir, ["branch", "-D", staging]);
    }
  }

  return {
    status,
    check,

    async stage(toolId) {
      const spec = specOf(toolId);
      if (working.has(toolId)) return;
      working.set(toolId, "Waiting for another update to finish…");
      const run = queue.then(async () => {
        try {
          const outcome = await stageNow(spec);
          if ("target" in outcome) failures.set(toolId, outcome);
          else failures.delete(toolId);
        } catch (error) {
          failures.set(toolId, { state: "error", detail: error instanceof Error ? error.message : String(error), target: remote.get(toolId)?.meta?.version ?? "" });
        } finally {
          working.delete(toolId);
        }
      });
      queue = run;
      await run;
    },

    async apply(toolId) {
      const spec = specOf(toolId);
      const dir = dirOf(spec);
      const live = spec.liveBranch;
      const staging = stagingBranch(toolId);
      if (working.has(toolId)) throw new Error("An update is being staged right now.");
      if (!(await branchExists(dir, staging)) || (await ahead(dir, live, staging)) === 0) throw new Error("Nothing is staged for this plugin.");
      if ((await gitOut(dir, ["rev-parse", "--abbrev-ref", "HEAD"])) !== live) throw new Error(`The live folder is not on ${live}.`);
      if ((await gitOut(dir, ["status", "--porcelain", "--untracked-files=no"])) !== "") throw new Error("The live folder has uncommitted changes. Commit or stash them first.");
      if ((await git(dir, ["merge-base", "--is-ancestor", live, staging])).code !== 0) throw new Error(`${live} moved since this was staged. Stage the update again.`);
      await gitOut(dir, ["merge", "--ff-only", staging]);
      await git(dir, ["branch", "-D", staging]);
      failures.delete(toolId);
      return `Applied to ${spec.pluginId}. Reload it to run the new code: paseo plugin reload ${spec.pluginId}`;
    },
  };
}
