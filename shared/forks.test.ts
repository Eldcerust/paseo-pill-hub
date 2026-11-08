import { describe, expect, it } from "vitest";
import { FORKS } from "./forks";

describe("FORKS", () => {
  it("only follows origin for git upstreams, the one remote a managed checkout has", () => {
    for (const fork of FORKS) if (fork.source.kind === "git") expect({ id: fork.pluginId, remote: fork.source.remote }).toEqual({ id: fork.pluginId, remote: "origin" });
  });

  it("follows the workspace links fork through its own sync Action, not a tarball merge", () => {
    expect(FORKS.find((fork) => fork.toolId === "workspace-links")?.source).toEqual({ kind: "git", remote: "origin", branch: "main" });
  });

  it("has unique tool and plugin ids", () => {
    expect(new Set(FORKS.map((fork) => fork.toolId)).size).toBe(FORKS.length);
    expect(new Set(FORKS.map((fork) => fork.pluginId)).size).toBe(FORKS.length);
  });
});
