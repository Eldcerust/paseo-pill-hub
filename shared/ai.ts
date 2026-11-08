/**
 * The AI providers the sync can use to adapt a fork. Every one is spoken to through the
 * chat-completions format, which OpenCode also accepts for every text model, so a provider is
 * only an address, a model list address, a default model and any extra headers.
 *
 * OpenCode's addresses and model ids are from https://opencode.ai/docs/zen and /docs/go. The
 * default model, deepseek-v4.1-flash, is listed there on the chat-completions endpoint. On
 * OpenCode Go the DeepSeek models are blocked until an owner enables the Global region.
 */
export const PROVIDER_IDS = ["opencode", "opencode-go", "openai", "custom"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  /** Empty for `custom`, where the address is typed. */
  baseUrl: string;
  /** Where the model ids are listed; empty for `custom`, which appends /models to its address. */
  modelsUrl: string;
  defaultModel: string;
  /** Sends the headers OpenCode asks for: a stable session id and the caller's own user agent. */
  opencode: boolean;
  hint: string;
}

export const AI_PROVIDERS: readonly ProviderSpec[] = [
  {
    id: "opencode",
    label: "OpenCode",
    baseUrl: "https://opencode.ai/inference/openai/v1",
    modelsUrl: "https://opencode.ai/inference/v1/models",
    defaultModel: "deepseek-v4.1-flash",
    opencode: true,
    hint: "OpenCode's pay-as-you-go API. Use a key from the OpenCode console and a paid model; the free models are for OpenCode itself.",
  },
  {
    id: "opencode-go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    modelsUrl: "https://opencode.ai/inference/go/v1/models",
    defaultModel: "deepseek-v4.1-flash",
    opencode: true,
    hint: "The OpenCode Go plan. Its DeepSeek models stay blocked until an owner selects the Global region under Settings, Privacy, Regions in the OpenCode console.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelsUrl: "https://api.openai.com/v1/models",
    defaultModel: "",
    opencode: false,
    hint: "OpenAI's API. Pick a model from the list once the key is saved.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    modelsUrl: "",
    defaultModel: "",
    opencode: false,
    hint: "Any server that speaks the OpenAI chat-completions format, such as a local llama.cpp. Its address must be https, or on this computer.",
  },
];

export const providerSpec = (id: string): ProviderSpec => AI_PROVIDERS.find((spec) => spec.id === id) ?? AI_PROVIDERS[0]!;

/** The stored AI settings, one key and one model per provider so switching does not mix them up. */
export interface AiSettings {
  enabled: boolean;
  provider: ProviderId;
  /** Only used by the custom provider. */
  customUrl: string;
  models: Record<string, string>;
  keys: Record<string, string>;
}

export interface ResolvedAi {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  headers: Record<string, string>;
}

export interface ModelsTarget {
  modelsUrl: string;
  apiKey: string;
  headers: Record<string, string>;
}

const USER_AGENT = "paseo-pill-hub/1.0";

const extraHeaders = (spec: ProviderSpec, session: string): Record<string, string> =>
  spec.opencode ? { "x-opencode-session": session, "user-agent": USER_AGENT } : {};

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** Everything needed to chat, or undefined when the provider lacks a key, a model or an address. */
export function resolveAi(ai: AiSettings, session: string): ResolvedAi | undefined {
  const spec = providerSpec(ai.provider);
  const apiKey = ai.keys[spec.id] ?? "";
  const model = ai.models[spec.id] || spec.defaultModel;
  const baseUrl = spec.id === "custom" ? ai.customUrl : spec.baseUrl;
  if (!apiKey || !model || !baseUrl) return undefined;
  return { provider: spec.id, baseUrl, model, apiKey, headers: extraHeaders(spec, session) };
}

/** Where to list a provider's models, which needs only its key and address. */
export function resolveModelsTarget(ai: AiSettings, provider: ProviderId, session: string): ModelsTarget | undefined {
  const spec = providerSpec(provider);
  const apiKey = ai.keys[spec.id] ?? "";
  const modelsUrl = spec.id === "custom" ? (ai.customUrl ? `${trimSlash(ai.customUrl)}/models` : "") : spec.modelsUrl;
  if (!apiKey || !modelsUrl) return undefined;
  return { modelsUrl, apiKey, headers: extraHeaders(spec, session) };
}
