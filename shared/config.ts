import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export interface KnownTool {
  /** The pill id the plugin used; also the key of its switch. */
  toolId: string;
  /** The tab label. */
  title: string;
  glyph: string;
  /** The plugin's own name, as in its manifest. */
  plugin: string;
  /** The id it must be installed under to be the hub-aware one. */
  pluginId: string;
  /** Where it came from, shown next to its switch. */
  origin: string;
}

/** Tools that have a hub-aware plugin. The hub lists them even when that plugin is not installed. */
export const KNOWN_TOOLS: readonly KnownTool[] = [
  {
    toolId: "run",
    title: "Run",
    glyph: "SquareTerminal",
    plugin: "Shell Yeah",
    pluginId: "shell-yeah",
    origin: "Your own repo, Eldcerust/shell-yeah (on GitHub and your Forgejo), which a daily GitHub Action keeps in step with Steve Castaneda's Shell Yeah",
  },
  {
    toolId: "skills",
    title: "Skills",
    glyph: "Sparkles",
    plugin: "Skills (fork)",
    pluginId: "skills-fork",
    origin: "Your fork of gpambrozio's Skills 0.4.0 (plugins.paseo.sh/gpambrozio/skills)",
  },
  {
    toolId: "switch",
    title: "Switch",
    glyph: "Play",
    plugin: "Switchboard",
    pluginId: "switchboard",
    origin: "Your own plugin (Eldcerust/paseo-provider-switch)",
  },
  {
    toolId: "export",
    title: "Export",
    glyph: "FileDown",
    plugin: "Conversation exporter (fork)",
    pluginId: "paseo-exporter-fork",
    origin: "Your fork of sgoley's Conversation exporter (plugins.paseo.sh/sgoley/exporter)",
  },
  {
    toolId: "workspace-links",
    title: "Links",
    glyph: "Link2",
    plugin: "Workspace links (fork)",
    pluginId: "workspace-links-fork",
    origin: "Your fork of Steve Castaneda's Workspace links 1.1.2 (plugins.paseo.sh/stevecastaneda/workspace-links)",
  },
];

/** The agent that "Fix with an agent" starts, as provider/model. */
export const FIX_AGENT = "claude/claude-sonnet-5-5";

export const syncDefaults = { autoCheck: true, checkEveryHours: 6, autoStage: true };
/**
 * The model an update is adapted with when none is chosen. It is an id from the daemon's OpenCode
 * provider, so it is run as `opencode/opencode/deepseek-v4.1-flash`.
 */
export const DEFAULT_AI_MODEL = "opencode/deepseek-v4.1-flash";
export const aiDefaults = { enabled: false, model: "" };

/**
 * `merged`: a tool missing from it follows the default, merged into the hub pill.
 * `sync`: how the forks follow their upstreams. `ai`: whether the OpenCode agent already running
 * in the Paseo daemon may adapt a fork when an update conflicts or stops type-checking, and
 * which of its models to use. No API key is involved; the daemon's own OpenCode setup is used.
 */
export const hubSettings = defineSettings({
  id: "hub",
  scope: "host",
  version: 1,
  schema: z.object({
    merged: z.record(z.string(), z.boolean()).default({}),
    sync: z
      .object({
        autoCheck: z.boolean().default(syncDefaults.autoCheck),
        checkEveryHours: z.number().int().min(1).max(168).default(syncDefaults.checkEveryHours),
        autoStage: z.boolean().default(syncDefaults.autoStage),
      })
      .default(syncDefaults),
    ai: z
      .object({
        enabled: z.boolean().default(aiDefaults.enabled),
        model: z.string().trim().max(300).default(aiDefaults.model),
      })
      .default(aiDefaults),
  }),
});

export const getConfig = defineRpc({
  name: "hub.config",
  input: z.object({}),
  output: z.object({ merged: z.record(z.string(), z.boolean()) }),
});
