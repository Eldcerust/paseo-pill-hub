import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { CheckResult } from "./engine";
import { exec, type Exec } from "./exec";
import { timeoutSignal } from "./timeout";

/** The folder each plugin is installed from, read from the daemon's own config. */
export function pluginDirFromConfig(home: string = process.env.PASEO_HOME ?? join(homedir(), ".paseo")): (pluginId: string) => string | undefined {
  return (pluginId) => {
    try {
      const raw = readFileSync(join(home, "config.json"), "utf8");
      const config = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as {
        plugins?: Record<string, { source?: string; path?: string }>;
      };
      const entry = config.plugins?.[pluginId];
      return entry?.source === "directory" && typeof entry.path === "string" ? entry.path : undefined;
    } catch {
      return undefined;
    }
  };
}

const tail = (text: string, lines = 15) => text.trim().split(/\r?\n/).slice(-lines).join("\n");

/**
 * Installs and type-checks a checkout. Nothing the upstream ships runs: install skips lifecycle
 * scripts, and the compiler is started directly rather than through the package's own scripts.
 */
export function defaultChecks(run: Exec = exec): (dir: string) => Promise<CheckResult> {
  return async (dir) => {
    const install = await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: dir, timeoutMs: 600_000, shell: true });
    if (install.code !== 0) return { ok: false, output: `npm install failed:\n${tail(install.stderr || install.stdout)}` };
    const compiler = join(dir, "node_modules", "typescript", "bin", "tsc");
    if (!existsSync(compiler)) return { ok: false, output: "TypeScript is not installed in this fork, so it cannot be checked." };
    const node = /^node(\.exe)?$/i.test(basename(process.execPath)) ? process.execPath : "node";
    const result = await run(node, [compiler, "--noEmit"], { cwd: dir, timeoutMs: 300_000 });
    return { ok: result.code === 0, output: `${result.stdout}${result.stderr}`.trim() };
  };
}

export async function fetchJson(url: string): Promise<unknown> {
  const limit = timeoutSignal(30_000);
  try {
    const response = await fetch(url, { signal: limit.signal });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return await response.json();
  } finally {
    limit.clear();
  }
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const limit = timeoutSignal(120_000);
  try {
    const response = await fetch(url, { signal: limit.signal });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    limit.clear();
  }
}
