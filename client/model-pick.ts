export interface ModelEntry {
  id: string;
  label: string;
}

export interface ProviderEntry {
  id: string;
  count: number;
}

/** OpenCode's own catalog, listed before the many providers it is connected to. */
const OWN_PROVIDERS = ["opencode", "opencode-go"];

/** Rows drawn at once. A provider can have hundreds of models; searching narrows them. */
export const ROW_LIMIT = 100;

/** The provider a model id belongs to: everything before the first slash. */
export function providerOf(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : "other";
}

/** Every provider in the list with its model count: OpenCode's own first, then the rest A to Z. */
export function providersOf(all: readonly ModelEntry[]): ProviderEntry[] {
  const counts = new Map<string, number>();
  for (const model of all) {
    const provider = providerOf(model.id);
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }
  const rank = (id: string) => {
    const index = OWN_PROVIDERS.indexOf(id);
    return index === -1 ? OWN_PROVIDERS.length : index;
  };
  return [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

/**
 * The models of one provider (or of all, when none is given) whose id or label holds every word
 * typed, in any order and case, sorted A to Z by label so a name is easy to find in a long list.
 */
export function modelsFor(all: readonly ModelEntry[], provider: string | undefined, query: string): ModelEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return all
    .filter((model) => (provider === undefined || providerOf(model.id) === provider) && words.every((word) => `${model.id} ${model.label}`.toLowerCase().includes(word)))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

/** The first `limit` matches to draw, and how many were left out. */
export function visibleModels(matches: readonly ModelEntry[], limit = ROW_LIMIT): { rows: ModelEntry[]; hidden: number } {
  return { rows: matches.slice(0, limit), hidden: Math.max(0, matches.length - limit) };
}
