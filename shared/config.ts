import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export interface KnownTool {
  toolId: string;
  title: string;
  glyph: string;
  /** Its popover opens its own full dialog over the hub, so the hub never lands on it. */
  takesOver?: boolean;
}

/** Tools that have a compat fork. The hub lists them even when the fork is not installed. */
export const KNOWN_TOOLS: readonly KnownTool[] = [
  { toolId: "run", title: "Run", glyph: "SquareTerminal" },
  { toolId: "skills", title: "Skills", glyph: "Sparkles" },
  { toolId: "switch", title: "Switch", glyph: "Play", takesOver: true },
  { toolId: "export", title: "Export", glyph: "FileDown" },
];

/** A tool missing from `merged` follows the default: merged into the hub pill. */
export const hubSettings = defineSettings({
  id: "hub",
  scope: "host",
  version: 1,
  schema: z.object({ merged: z.record(z.string(), z.boolean()).default({}) }),
});

export const getConfig = defineRpc({
  name: "hub.config",
  input: z.object({}),
  output: z.object({ merged: z.record(z.string(), z.boolean()) }),
});
