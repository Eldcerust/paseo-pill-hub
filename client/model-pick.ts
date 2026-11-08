export interface ModelEntry {
  id: string;
  label: string;
}

/** OpenCode's own catalog, as opposed to the many models its connected providers add. */
const OWN = /^(opencode|opencode-go)\//;

/**
 * The models to offer in a list a phone can scroll: with no search, OpenCode's own; with one, every
 * model whose id or label holds all the words. The chosen model is always first so the list can
 * show it, even when it falls outside the search.
 */
export function pickModels(all: readonly ModelEntry[], query: string, current: string, limit = 60): ModelEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = words.length > 0 ? all.filter((model) => words.every((word) => `${model.id} ${model.label}`.toLowerCase().includes(word))) : all.filter((model) => OWN.test(model.id));
  const shown = pool.slice(0, limit);
  if (shown.some((model) => model.id === current)) return shown;
  const chosen = all.find((model) => model.id === current) ?? { id: current, label: current };
  return [chosen, ...shown.slice(0, limit - 1)];
}
