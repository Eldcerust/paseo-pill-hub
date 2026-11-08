import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { PROVIDER_IDS } from "./ai";

export const forkState = z.enum([
  "own", // your own plugin, nothing upstream
  "unknown", // not checked yet, or its folder was not found
  "up-to-date",
  "update-available",
  "working", // checking or staging right now
  "staged", // merged and checked on a separate branch, waiting for you to apply it
  "conflict",
  "check-failed",
  "error",
]);
export type ForkState = z.infer<typeof forkState>;

export const forkStatus = z.object({
  toolId: z.string(),
  pluginId: z.string(),
  kind: z.enum(["git", "npm", "own"]),
  state: forkState,
  /** What the fork is built on: a version for npm forks, a short commit for git forks. */
  base: z.string().optional(),
  /** The newest upstream version or commit seen by the last check. */
  latest: z.string().optional(),
  /** One plain line saying what happened or what to do next. */
  detail: z.string().optional(),
  stagedBranch: z.string().optional(),
  aiAssisted: z.boolean().optional(),
  checkedAt: z.string().optional(),
});
export type ForkStatus = z.infer<typeof forkStatus>;

const statusOut = z.object({ forks: z.array(forkStatus), aiConfigured: z.boolean() });

export const syncStatus = defineRpc({ name: "sync.status", input: z.object({}), output: statusOut });
/** Looks at every upstream (fetch / registry) and then reports. */
export const syncCheck = defineRpc({ name: "sync.check", input: z.object({}), output: statusOut });
/** Starts staging in the background; poll `sync.status` for the outcome. */
export const syncStage = defineRpc({ name: "sync.stage", input: z.object({ toolId: z.string() }), output: statusOut });
/** The model ids a provider lists, using the key saved for it. */
export const syncModels = defineRpc({
  name: "sync.models",
  input: z.object({ provider: z.enum(PROVIDER_IDS) }),
  output: z.object({ models: z.array(z.string()) }),
});
export const syncApply = defineRpc({
  name: "sync.apply",
  input: z.object({ toolId: z.string() }),
  output: z.object({ message: z.string(), status: statusOut }),
});
