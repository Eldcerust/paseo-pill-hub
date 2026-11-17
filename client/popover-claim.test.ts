import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@getpaseo/plugin/client", () => ({ useRpc: () => () => undefined, usePaseo: () => ({}) }));

import { claimPopover } from "./store";

/*
 * The host draws a pill for every composer it keeps mounted, and a popover it drew stays mounted when
 * that composer is hidden. So opening Tools again can leave two surfaces on screen, one of them
 * anchored to a composer that is no longer laid out. Only the newest mount may stay.
 */

const SHARED_KEY = "__paseoPillHubShared";

beforeEach(() => {
  for (const key of [SHARED_KEY, "__paseoPillHub"]) {
    delete (globalThis as Record<string, unknown>)[key];
    delete (React as unknown as Record<string, unknown>)[key];
  }
});

describe("one Tools popover at a time", () => {
  it("closes the popover that was already open", () => {
    const older = vi.fn();
    claimPopover(older);
    const newer = vi.fn();

    claimPopover(newer);

    expect(older).toHaveBeenCalledTimes(1);
    expect(newer).not.toHaveBeenCalled();
  });

  it("leaves the newer popover alone when the older one unmounts", () => {
    const older = vi.fn();
    const releaseOlder = claimPopover(older);
    const newer = vi.fn();
    claimPopover(newer);

    releaseOlder();

    expect(older).toHaveBeenCalledTimes(1);
    expect(newer).not.toHaveBeenCalled();
  });

  it("lets the next popover open after the current one unmounts", () => {
    const first = vi.fn();
    const releaseFirst = claimPopover(first);
    releaseFirst();
    const second = vi.fn();

    claimPopover(second);

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
