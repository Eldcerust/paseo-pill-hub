import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Tools that have a compat fork. The hub lists them even when the fork is not installed. */
export const KNOWN_TOOLS = [
  { toolId: "run", title: "Run", glyph: "SquareTerminal" },
  { toolId: "skills", title: "Skills", glyph: "Sparkles" },
  { toolId: "switch", title: "Switch", glyph: "Play" },
  { toolId: "export", title: "Export", glyph: "FileDown" },
] as const;

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
