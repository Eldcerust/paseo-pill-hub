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

The Export and Skills forks have their own ids so the official plugins (`paseo-exporter`, `skills`) stay installed, disabled, and can be re-enabled to roll back. Do not enable a fork and its official plugin together: both would add the same pill and slash command.

## Development

```
npm install
npm run typecheck
npm test
```
