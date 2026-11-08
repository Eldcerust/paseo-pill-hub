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

| Tool | Fork | Branch | Plugin id |
| --- | --- | --- | --- |
| Run | `shell-yeah` | `pill-hub-compat` | `shell-yeah` |
| Switch | `paseo-switchboard` | `pill-hub-compat` | `switchboard` |
| Export | `paseo-exporter-hub` (from `sgoley/paseo-exporter`, remote `upstream`) | `pill-hub-compat` | `exporter-hub` |
| Skills | `paseo-skills-hub` (from `@gpambrozio/paseo-skills` 0.4.0) | `main` | `skills-hub` |

The Export and Skills forks use their own ids so the official plugins stay installed, disabled, and can be re-enabled to roll back.

## Development

```
npm install
npm run typecheck
npm test
```
