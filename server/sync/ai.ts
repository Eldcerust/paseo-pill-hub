import { z } from "zod";
import { timeoutSignal } from "./timeout";

export type ChatMessage = { role: "system" | "user"; content: string };
export type Llm = (messages: ChatMessage[]) => Promise<string>;
export interface FileText {
  path: string;
  content: string;
}

export interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Extra request headers, such as OpenCode's session id and user agent. */
  headers?: Record<string, string>;
}

/** The key is only ever sent over https, or to this computer. */
function assertSafeUrl(address: string): void {
  const url = new URL(address);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) throw new Error("The model API address must be https, or on this computer.");
}

/** What the fork changed on purpose, so a model keeps it while taking upstream's changes. */
const BRIEF = [
  "This repository is a fork of a Paseo plugin. Its deliberate changes are small:",
  "1. client/hub-compat.tsx was added. Never edit it and never return it.",
  "2. Where the plugin called client.addComposerPill({ id, ... }) it calls registerComposerPill(client, { toolId: id, ... }), imported from ./hub-compat.",
  "3. Popover code imports useRpc, usePaseo and useHostedClient from ./hub-compat instead of @getpaseo/plugin/client.",
  "4. paseo-plugin.json has a different id, name and description. Keep them.",
  "Some forks also add a small RPC or settings screen. Keep every one of these changes, adopt upstream's changes, and change as little else as you can.",
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

/** A chat model reached through the chat-completions format, which OpenCode accepts for every text model. */
export function chatLlm(config: AiConfig, doFetch: typeof fetch = fetch): Llm {
  assertSafeUrl(config.baseUrl);
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return async (messages) => {
    const limit = timeoutSignal(180_000);
    try {
      const response = await doFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}`, ...config.headers },
        body: JSON.stringify({ model: config.model, messages, temperature: 0 }),
        signal: limit.signal,
      });
      if (!response.ok) throw new Error(`The model API answered ${response.status}.`);
      const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("The model API sent no text.");
      return content;
    } finally {
      limit.clear();
    }
  };
}

/** The model ids a provider lists, sorted. Understands `{ data: [{ id }] }`, `{ models: [...] }` and a bare array. */
export async function listModels(
  target: { modelsUrl: string; apiKey: string; headers?: Record<string, string> },
  doFetch: typeof fetch = fetch,
): Promise<string[]> {
  assertSafeUrl(target.modelsUrl);
  const limit = timeoutSignal(30_000);
  try {
    const response = await doFetch(target.modelsUrl, { headers: { authorization: `Bearer ${target.apiKey}`, ...target.headers }, signal: limit.signal });
    if (!response.ok) throw new Error(`The model API answered ${response.status}.`);
    const body = (await response.json()) as unknown;
    const wrapped = body as { data?: unknown; models?: unknown };
    const list = Array.isArray(body) ? body : (wrapped.data ?? wrapped.models);
    const ids = (Array.isArray(list) ? list : [])
      .map((entry: unknown) => (typeof entry === "string" ? entry : (entry as { id?: unknown } | null)?.id))
      .filter((id): id is string => typeof id === "string" && id !== "");
    return [...new Set(ids)].sort().slice(0, 500);
  } finally {
    limit.clear();
  }
}
