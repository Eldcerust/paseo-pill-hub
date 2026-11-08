/**
 * How each fork follows its upstream. The right strategy differs per plugin, so it is a table.
 *
 * - `git`: the upstream is a git remote of the fork. The hub fetches it and merges
 *   `<remote>/<branch>` into the fork's live branch. For Shell Yeah the remote is the fork's own
 *   `origin`, which a daily GitHub Action keeps in step with Steve Castaneda's original.
 * - `npm`: the upstream is a published package with no git history to merge. The hub keeps a
 *   vendor branch named `upstream` holding one commit per published version, and merges that
 *   branch, so each update is a real three-way merge against the previous version.
 * - `own`: your own plugin. Nothing to sync.
 */
export type ForkSource =
  | { kind: "git"; remote: string; branch: string }
  | { kind: "npm"; packageName: string }
  | { kind: "own" };

export interface ForkSpec {
  toolId: string;
  /** The plugin id the fork is installed under; its folder is found from the daemon's config. */
  pluginId: string;
  /** The branch the installed plugin runs from. Staging never touches it; applying fast-forwards it. */
  liveBranch: string;
  source: ForkSource;
}

export const FORKS: readonly ForkSpec[] = [
  { toolId: "run", pluginId: "shell-yeah", liveBranch: "pill-hub-compat", source: { kind: "git", remote: "origin", branch: "main" } },
  { toolId: "skills", pluginId: "skills-fork", liveBranch: "main", source: { kind: "npm", packageName: "@gpambrozio/paseo-skills" } },
  { toolId: "switch", pluginId: "switchboard", liveBranch: "pill-hub-compat", source: { kind: "own" } },
  { toolId: "export", pluginId: "paseo-exporter-fork", liveBranch: "pill-hub-compat", source: { kind: "git", remote: "upstream", branch: "main" } },
  { toolId: "workspace-links", pluginId: "workspace-links-fork", liveBranch: "main", source: { kind: "npm", packageName: "@stevecastaneda/paseo-workspace-links" } },
];

/** The branch holding one commit per published version, for `npm` forks. */
export const VENDOR_BRANCH = "upstream";

/** The branch an update is staged on, per tool. */
export const stagingBranch = (toolId: string) => `pill-hub-sync/${toolId}`;
