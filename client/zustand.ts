/**
 * The vanilla zustand store, vendored.
 *
 * Why a copy rather than a dependency: Paseo compiles a plugin's client bundle with esbuild and keeps
 * only `@getpaseo/plugin*`, `react`, `react-native`, `@tanstack/react-query` and `zod` external. Every
 * other package is bundled from the plugin's own `node_modules`, and an installed plugin checkout has
 * none, so a bare `import { createStore } from "zustand"` fails to compile on install.
 *
 * This is zustand 5 `vanilla.ts` and `react.ts`'s `useStore`, unchanged apart from types and taking
 * `useSyncExternalStore` from react (18+, which the host provides). MIT, (c) Paul Henschel.
 */
import { useSyncExternalStore } from "react";

export type SetStateInternal<T> = {
  _(partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: false): void;
  _(state: T | ((state: T) => T), replace: true): void;
}["_"];

export interface StoreApi<T> {
  setState: SetStateInternal<T>;
  getState(): T;
  getInitialState(): T;
  subscribe(listener: (state: T, previous: T) => void): () => void;
}

type Listener<T> = (state: T, previous: T) => void;

export function createStore<T>(createState: (set: SetStateInternal<T>, get: () => T, api: StoreApi<T>) => T): StoreApi<T> {
  let state: T;
  const listeners = new Set<Listener<T>>();

  const setState: SetStateInternal<T> = (partial, replace) => {
    const next = typeof partial === "function" ? (partial as (state: T) => T | Partial<T>)(state) : partial;
    if (next === undefined) return;
    if (!Object.is(next, state)) {
      const previous = state;
      state = (replace ?? (typeof next !== "object" || next === null) ? next : Object.assign({}, state, next)) as T;
      for (const listener of [...listeners]) listener(state, previous);
    }
  };

  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener: Listener<T>) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };

  const initialState = (state = createState(setState, getState, { setState, getState, getInitialState, subscribe }));
  return { setState, getState, getInitialState, subscribe };
}

/** Reads a slice of the store and re-renders when that slice changes. */
export function useStore<T, U>(api: StoreApi<T>, selector: (state: T) => U): U {
  return useSyncExternalStore(
    api.subscribe,
    () => selector(api.getState()),
    () => selector(api.getInitialState()),
  );
}
