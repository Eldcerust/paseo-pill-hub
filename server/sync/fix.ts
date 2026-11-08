import type { ForkSpec } from "../../shared/forks";
import type { ForkStatus } from "../../shared/sync";

/** States that need a person (or an agent): everything except a healthy, finished, or busy fork. */
const NEEDS_ATTENTION: ReadonlySet<ForkStatus["state"]> = new Set(["unknown", "update-available", "staged", "conflict", "check-failed", "error"]);

export const needsAttention = (fork: ForkStatus): boolean => fork.kind !== "own" && NEEDS_ATTENTION.has(fork.state);

/** What a failing status most likely means, so the agent starts from a hypothesis rather than from nothing. */
export function hintFor(fork: ForkStatus): string | undefined {
  const text = fork.detail ?? "";
  if (/rev-parse .* failed: .*Needed a single revision/.test(text) || /not (on|\w+) .*needs to be on/.test(text) || /live folder is on/.test(text)) {
    return "The sync engine resolves what the plugin runs from at call time (its branch, or HEAD when detached) and only has the remotes of a managed checkout (origin, the GitHub fork). A message like this means some code path or a forks.ts entry still assumes a named local branch or a remote that checkout lacks. Fix the engine or the forks table, not the plugin.";
  }
  if (fork.state === "conflict") return "A merge with upstream conflicts. Resolve it in a scratch clone of the fork repo, run its checks, then push to the fork's main.";
  if (fork.state === "check-failed") return "The merge is clean but typecheck or tests fail. Adapt the fork's own changes to the new upstream code.";
  if (fork.state === "update-available" || fork.state === "staged") return "The fork repo has newer commits than the installed plugin. Update it with `paseo plugin update <plugin id> --yes` once it passes its checks.";
  return undefined;
}

export interface FixContext {
  /** The folder the plugin id is installed from, if any. */
  pluginDir(pluginId: string): string | undefined;
  specs: readonly ForkSpec[];
}

/** The task for the agent: every fork needing attention, with its captured state, and what is already known. */
export function fixPrompt(forks: readonly ForkStatus[], context: FixContext, folder: string): string {
  const lines = forks.map((fork) => {
    const spec = context.specs.find((candidate) => candidate.toolId === fork.toolId);
    const parts = [
      `- ${fork.toolId} (plugin id \`${fork.pluginId}\`, ${fork.kind} upstream): state \`${fork.state}\``,
      fork.detail ? `  detail: ${fork.detail.replace(/\r?\n/g, " / ")}` : undefined,
      fork.base || fork.latest ? `  installed ${fork.base ?? "?"}, newest upstream ${fork.latest ?? "?"}` : undefined,
      `  installed folder: ${context.pluginDir(fork.pluginId) ?? "not found"}`,
      spec?.source.kind === "git" ? `  upstream followed: ${spec.source.remote}/${spec.source.branch}` : undefined,
      spec?.source.kind === "npm" ? `  upstream followed: npm ${spec.source.packageName}` : undefined,
      hintFor(fork) ? `  likely cause: ${hintFor(fork)}` : undefined,
    ];
    return parts.filter(Boolean).join("\n");
  });
  return [
    "You were started from the Pill hub's Upstream sync screen because some plugin forks need attention.",
    `Work in ${folder}. The fork repos (paseo-pill-hub, shell-yeah, paseo-skills, paseo-exporter, paseo-workspace-links, ...) are normally sibling folders there, and each plugin runs from a Git checkout of the user's own GitHub fork under ~/.paseo/plugins, kept in step with its original by a GitHub Action.`,
    "",
    "Captured state:",
    ...lines,
    "",
    "Do this:",
    "1. Find the real cause for each item; do not just retry. Read the code that produced the message.",
    "2. Fix it at the source (usually the Pill hub's sync engine or forks table, or a fork repo's sync script), add or update tests, and run them (the hub's engine tests only pass in PowerShell, not Git Bash).",
    "3. Commit, push to the fork on GitHub, then run `paseo plugin update <plugin id> --yes` for each affected plugin and confirm the installed revision and the plugin log.",
    "4. Use placeholders, never real hostnames, IPs or emails, in anything you post publicly.",
    "5. Finish with one line per fork saying what was wrong and what you did.",
  ].join("\n");
}
