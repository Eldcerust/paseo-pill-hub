import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@getpaseo/plugin/client", () => ({ useRpc: () => () => undefined, usePaseo: () => ({}) }));

import { claimPopover } from "./store";

/*
 * The host keeps a composer mounted per open tab, so one pill can be mounted twice and both surfaces
 * share the same open flag. Closing "the other" one therefore closes the one the user just opened,
 * which is what made the pill stop opening at all. Only another chat's popover may be closed.
 */

const SHARED_KEY = "__paseoPillHubShared";

beforeEach(() => {
  for (const key of [SHARED_KEY, "__paseoPillHub"]) {
    delete (globalThis as Record<string, unknown>)[key];
    delete (React as unknown as Record<string, unknown>)[key];
  }
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("one Tools popover at a time", () => {
  it("closes the popover of another chat", () => {
    const older = vi.fn();
    claimPopover("a1", older);
    const newer = vi.fn();

    claimPopover("a2", newer);

    expect(older).toHaveBeenCalledTimes(1);
    expect(newer).not.toHaveBeenCalled();
  });

  it("leaves the other mount of the same pill open, because closing it closes this one too", () => {
    const older = vi.fn();
    claimPopover("a1", older);
    const newer = vi.fn();

    claimPopover("a1", newer);

    expect(older).not.toHaveBeenCalled();
    expect(newer).not.toHaveBeenCalled();
  });

  it("leaves the newer popover alone when the older one unmounts", () => {
    const older = vi.fn();
    const releaseOlder = claimPopover("a1", older);
    const newer = vi.fn();
    claimPopover("a2", newer);

    releaseOlder();

    expect(older).toHaveBeenCalledTimes(1);
    expect(newer).not.toHaveBeenCalled();
  });

  it("lets the next popover open after the current one unmounts", () => {
    const first = vi.fn();
    const releaseFirst = claimPopover("a1", first);
    releaseFirst();
    const second = vi.fn();

    claimPopover("a1", second);

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
