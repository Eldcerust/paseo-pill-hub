/**
 * How each fork follows its upstream. The right strategy differs per plugin, so it is a table.
 *
 * - `git`: the upstream is a git remote of the fork. The hub fetches it and merges
 *   `<remote>/<branch>` into what the plugin runs from. Plugins installed from git are managed
 *   checkouts on a detached HEAD with only `origin` (the user's GitHub fork), so the remote is
 *   `origin`: a GitHub Action keeps the fork's main in step with the original.
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
  source: ForkSource;
}

export const FORKS: readonly ForkSpec[] = [
  { toolId: "run", pluginId: "shell-yeah", source: { kind: "git", remote: "origin", branch: "main" } },
  { toolId: "skills", pluginId: "skills-fork", source: { kind: "npm", packageName: "@gpambrozio/paseo-skills" } },
  { toolId: "switch", pluginId: "switchboard", source: { kind: "own" } },
  { toolId: "export", pluginId: "paseo-exporter-fork", source: { kind: "git", remote: "origin", branch: "main" } },
  // A standalone repo whose own Action merges the original's folder (git subtree split) into main. The npm
  // tarball has no tests or lockfile, so a vendor-branch merge of it conflicts with the fork.
  { toolId: "workspace-links", pluginId: "workspace-links-fork", source: { kind: "git", remote: "origin", branch: "main" } },
];

/** The branch holding one commit per published version, for `npm` forks. */
export const VENDOR_BRANCH = "upstream";

/** The branch an update is staged on, per tool. */
export const stagingBranch = (toolId: string) => `pill-hub-sync/${toolId}`;
