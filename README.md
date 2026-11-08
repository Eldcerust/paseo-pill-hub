# paseo-pill-hub

Collapses composer pills from cooperating Paseo plugins into one **Tools** pill with a tab per tool. See `OVERVIEW.md` for what it does for a user.

Paseo cannot hide one plugin's pill from another, so this works by cooperation:

- The hub publishes a small versioned bus (`client/bus.ts`) on the `react` module object and on `globalThis`.
- A hub-aware plugin registers its popover pill through `registerComposerPill` (`compat/hub-compat.tsx`). With the hub running and the tool switched on, the popover goes into the hub's Tools pill. Otherwise the plugin adds its own pill exactly as before, and moves back and forth as the hub starts, stops or flips a switch.
- A popover hosted by the hub is mounted under the hub's providers, so `useRpc` and `usePaseo` come from the compat file and call through the owning plugin's `client`. Plugin-scoped settings cannot be bridged; use `useHostedClient()` to read them through an RPC or link to the plugin's own settings screen.

## Making another plugin hub-aware

1. Copy `compat/hub-compat.tsx` unchanged to the plugin's `client/`.
2. Replace `client.addComposerPill({ id, ... })` with `registerComposerPill(client, { toolId: id, ... })`. Only popover pills can move into the hub.
3. Import `useRpc` and `usePaseo` in popover code from the compat file.
4. Add a row for the tool to `KNOWN_TOOLS` in `shared/config.ts` and, if you want a fixed tab position, to `ORDER` in `client/store.ts`.

The bus protocol section of `hub-compat.tsx` must stay identical to `client/bus.ts`. If you change the protocol, bump `BUS_VERSION` in both and re-copy the file into every fork.

## Forks in this setup

| Tab | Plugin name | Plugin id | Folder | Where it came from | Branch |
| --- | --- | --- | --- | --- | --- |
| Run | Shell Yeah | `shell-yeah` | `shell-yeah` | Your fork (`Eldcerust/shell-yeah` on GitHub) of Steve Castaneda's Shell Yeah | `pill-hub-compat` |
| Switch | Switchboard | `switchboard` | `paseo-switchboard` | Your own plugin (`Eldcerust/paseo-provider-switch` on your Forgejo) | `pill-hub-compat` |
| Export | Conversation exporter (fork) | `paseo-exporter-fork` | `paseo-exporter-fork` | Your fork of sgoley's Conversation exporter (`sgoley/paseo-exporter`, listed at `plugins.paseo.sh/sgoley/exporter`); the official repo is the `upstream` remote | `pill-hub-compat` |
| Skills | Skills (fork) | `skills-fork` | `paseo-skills-fork` | Your fork of gpambrozio's Skills, imported as published in `@gpambrozio/paseo-skills` 0.4.0 (listed at `plugins.paseo.sh/gpambrozio/skills`) | `main` |
| Links | Workspace links (fork) | `workspace-links-fork` | `paseo-workspace-links-fork` | Your fork of Steve Castaneda's Workspace links, imported as published in `@stevecastaneda/paseo-workspace-links` 1.1.2 (listed at `plugins.paseo.sh/stevecastaneda/workspace-links`; source in `stevecastaneda/paseo-plugins`) | `main` |

The Export, Skills and Links forks have their own ids so the official plugins (`paseo-exporter`, `skills`, `workspace-links`) stay installed, disabled, and can be re-enabled to roll back. Workspace links can also place its button in the workspace header; only its composer pill moves into the hub. Do not enable a fork and its official plugin together: both would add the same pill and slash command.

## Keeping the forks in step with their upstreams

The hub's server follows each fork's upstream by the strategy that suits it (`shared/forks.ts`):

| Fork | Upstream | How it is followed |
| --- | --- | --- |
| Shell Yeah | Your fork's `origin/main` | A daily GitHub Action on `Eldcerust/shell-yeah` (`scripts/sync-upstream.mjs`) already merges Steve Castaneda's original into `main`. The hub fetches `origin` and merges `origin/main` into `pill-hub-compat`. |
| Conversation exporter | `upstream` remote (`sgoley/paseo-exporter`) | Fetch, then merge `upstream/main` into `pill-hub-compat`. |
| Skills, Workspace links | The published npm package | A vendor branch named `upstream` holds one commit per published version, created from the fork's import commit the first time. A new version is added to it and `upstream` is merged, so each update is a real three-way merge against the previous version. |
| Switchboard | Yours | Nothing to follow. |

An update is merged on its own branch (`pill-hub-sync/<tool>`) in a separate worktree next to the fork, installed with `npm install --ignore-scripts`, and type-checked by starting `tsc` directly. No script from the upstream is run, and npm tarballs are verified against their published checksum. The live folder is untouched until you press Apply, which fast-forwards the live branch and needs a clean tree. Reload the plugin afterwards.

Outcomes per fork: up to date, update available, staged, conflict, check failed, error. A conflict or a failed check leaves no branch behind.

The hub checks every few hours and, if you leave it on, stages each update it finds. Both are switches on the Pill hub screen.

### AI adaptation

Optional, off by default, and no API key: it uses the OpenCode agent that already runs in your Paseo daemon (`paseo providers` lists it as `opencode`). When an update conflicts or stops type-checking, the hub creates a read-only (plan mode) agent in an empty scratch folder, sends it the conflicting or failing files plus a short description of what the fork changes on purpose, reads its reply, and archives the agent and its workspace. The model may only return files it was sent, whole, with no conflict markers. The result is type-checked again, marked AI-assisted, and still waits for you to apply it. The affected files go to whichever model you choose.

Choose the model on the Pill hub screen: Load models lists what the daemon's OpenCode offers (over a thousand, so it is searched; with no search it shows OpenCode's own). The default is `opencode/deepseek-v4.1-flash`. The daemon connection reaches the plugin with each request and lifecycle event, so a background check before any has been seen reports the model as unavailable; open the Pill hub screen once and press Retry.

The adapter is an ordinary top-level agent in the daemon while it runs, so a plugin that notifies on every agent turn (for example Telegram notifications) may report it as running and finished. The hub does not mute those notices. Archiving the agent when the reply arrives does not retract a notice already sent.

To follow a new fork, add a row to `FORKS` in `shared/forks.ts`. For an npm fork, its repository needs a commit whose subject starts with `Import `, which is where the vendor branch begins.

## Development

```
npm install
npm run typecheck
npm test
```
