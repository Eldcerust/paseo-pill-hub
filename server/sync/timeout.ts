/** The signal type `fetch` accepts. Two copies of the global `AbortSignal` declaration can be in the
 * program (the node one and the DOM one, pulled in by a React types entry), and which one wins depends
 * on file order, so the signal is typed through `RequestInit` instead of the global name. */
type FetchSignal = NonNullable<RequestInit["signal"]>;

/** An abort signal that fires after `ms`; call `clear` once the request is done. */
export function timeoutSignal(ms: number): { signal: FetchSignal; clear(): void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal as FetchSignal, clear: () => clearTimeout(timer) };
}
