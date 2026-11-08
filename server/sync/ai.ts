import { z } from "zod";

export type ChatMessage = { role: "system" | "user"; content: string };
/** Asks a model and returns its text reply. The sync does not care how the model is reached. */
export type Llm = (messages: ChatMessage[]) => Promise<string>;
export interface FileText {
  path: string;
  content: string;
}

/** What the fork changed on purpose, so a model keeps it while taking upstream's changes. */
const BRIEF = [
  "This repository is a fork of a Paseo plugin. Its deliberate changes are small:",
  "1. client/hub-compat.tsx was added. Never edit it and never return it.",
  "2. Where the plugin called client.addComposerPill({ id, ... }) it calls registerComposerPill(client, { toolId: id, ... }), imported from ./hub-compat.",
  "3. Popover code imports useRpc, usePaseo and useHostedClient from ./hub-compat instead of @getpaseo/plugin/client.",
  "4. paseo-plugin.json has a different id, name and description. Keep them.",
  "Some forks also add a small RPC or settings screen. Keep every one of these changes, adopt upstream's changes, and change as little else as you can.",
  "Do not use any tools and do not edit any files yourself: answer in text only.",
  'Reply with only JSON, no prose: {"files":[{"path":"relative/path","content":"the complete new file"}]}. Return every file you were given, whole.',
].join("\n");

function render(files: readonly FileText[]): string {
  return files.map((file) => `===== ${file.path} =====\n${file.content}`).join("\n\n");
}

export function conflictPrompt(label: string, files: readonly FileText[]): ChatMessage[] {
  return [
    { role: "system", content: BRIEF },
    {
      role: "user",
      content: `Merging upstream ${label} into the fork left conflict markers (<<<<<<<, =======, >>>>>>>) in these files. Resolve every conflict and return each file with no markers left.\n\n${render(files)}`,
    },
  ];
}

export function fixPrompt(errors: string, files: readonly FileText[]): ChatMessage[] {
  return [
    { role: "system", content: BRIEF },
    {
      role: "user",
      content: `After merging upstream, the TypeScript check fails:\n\n${errors}\n\nFix the errors by adapting these files to upstream's new code, and return each one.\n\n${render(files)}`,
    },
  ];
}

const reply = z.object({ files: z.array(z.object({ path: z.string().min(1), content: z.string() })).min(1) });

/** The files a model returned, or undefined when the reply is not the requested JSON. */
export function parseEdits(text: string): FileText[] | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  try {
    return reply.parse(JSON.parse(body)).files;
  } catch {
    return undefined;
  }
}

const MARKER = /^(<{7}|={7}|>{7})( |$)/m;

/** Edits are accepted only for files that were sent, whole, and with no conflict markers left. */
export function validateEdits(
  edits: readonly FileText[],
  sent: readonly string[],
  { requireAll }: { requireAll: boolean },
): { ok: true; edits: FileText[] } | { ok: false; reason: string } {
  const allowed = new Set(sent);
  const seen = new Set<string>();
  for (const edit of edits) {
    if (!allowed.has(edit.path)) return { ok: false, reason: `the model returned a file that was not sent: ${edit.path}` };
    if (seen.has(edit.path)) return { ok: false, reason: `the model returned ${edit.path} twice` };
    if (edit.content.trim() === "") return { ok: false, reason: `the model returned an empty ${edit.path}` };
    if (MARKER.test(edit.content)) return { ok: false, reason: `conflict markers remain in ${edit.path}` };
    seen.add(edit.path);
  }
  if (requireAll) {
    const missing = sent.filter((path) => !seen.has(path));
    if (missing.length > 0) return { ok: false, reason: `the model did not return: ${missing.join(", ")}` };
  }
  return { ok: true, edits: [...edits] };
}
