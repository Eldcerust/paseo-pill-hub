# paseo-pill-hub

Collapses composer pills from cooperating Paseo plugins into one **Tools** pill with a tab per tool. See `OVERVIEW.md` for what it does for a user.

## Requirements

Paseo 0.15.3 or later, on the daemon and on every client that should show the Tools pill.

## Install

From GitHub:

```bash
paseo plugin add git:Eldcerust/paseo-pill-hub
```

Or from a local checkout on the daemon machine:

```bash
paseo plugin add /absolute/path/to/paseo-pill-hub
```

Reload the hub-aware plugins after installing so they register with the hub:

```bash
paseo plugin reload shell-yeah
paseo plugin reload switchboard
paseo plugin reload paseo-exporter-fork
paseo plugin reload skills-fork
paseo plugin reload workspace-links-fork
```

## Use

Open a chat composer and tap **Tools**. Each enabled tool gets a tab:

- **Run** — Shell Yeah
- **Skills**
- **Switch** — Switchboard
- **Export**
- **Links** — Workspace links

Above the tool there is one header row: a magnifier, the tabs between a left and a right arrow, and an **A–Z / Z–A** button. The tabs scroll sideways instead of wrapping, and the selected tab is kept in view. Tabs are sorted by name; the sort button flips the order, and the hub remembers it until the app reloads. Tap the magnifier to open a search field in the same row, and the tabs narrow to the tools whose name, title or id contains every word you typed. The tool the search lands on stays selected after you close the field with the **X**. With nothing chosen yet, the hub opens its first tool (Run), whatever the sort order.

The header is deliberately a single row. Paseo caps a plugin popover on a computer at 440px and scrolls anything taller, and a tool sizes its own body (Switch asks for up to 340px). A second header line would push the tool past the cap and make the whole popover scroll, so the hub never adds one.

### Tool height

**Settings → Pill hub → Tool height** sets the tallest the tool under the tabs may get, in px, separately for **PC** (the desktop app and the browser), **iOS** and **Android**. A taller tool scrolls inside that height, under the pinned tab row, so the popover itself does not. A tool shorter than the limit keeps its own height. Leave a field blank for no limit; otherwise use 120 to 2000.

| Platform | Default | Why |
| --- | --- | --- |
| PC | 350 px | The 440px popover cap, minus about 32px of padding and the 44px tab row, leaves room for Switch's 340px picker. |
| iOS | No limit | A phone shows a bottom sheet, which has no 440px cap and scrolls by itself. Tools size themselves to the screen there (Switch fills it, up to 560pt), so a limit only clips them and can hide their buttons. |
| Android | No limit | Same as iOS. |

A narrow desktop or browser window also shows a bottom sheet, so the PC value does not apply there either.

The values are stored on the host, so every device of a platform shares one, and a change applies to open popovers without a reload. **Reset** puts the defaults back.

A tool that is switched off, or whose plugin is not running, keeps its own composer pill. The switches are in **Settings → Pill hub**, in the sidebar's **Pill hub** row, and in the Command Center.

### If the Tools pill says "No tools detected"

The Tools pill is there for every chat, but a tool only appears in it once its plugin has attached to the hub. That can fail while the plugins stay "running" on the daemon, because the attaching happens in the app, not on the daemon. The usual cause is a hub that was replaced while the app stayed open (a plugin update, or the app reconnecting): the tools only ever compare "hub or own pill", so they stayed attached to the old hub. A hub that takes over now makes every tool attach to it again, and a hub that stops after being replaced no longer empties its replacement.

When the popover opens empty it also asks the tools to reconnect by itself, says which plugins have reported in, and has a **Reconnect tools** button to ask again. It writes the same facts to the app's log as `[pill-hub] the Tools popover opened with no tools for this chat`, which is what to look at on a phone. "No tool plugin has reported in" means the plugins' app code never reached the hub: reload the app. "Reported in: … None has attached" means they were there but not attached to this chat.

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
| Shell Yeah | Your fork's `origin/main` | A daily GitHub Action on `Eldcerust/shell-yeah` (`scripts/sync-upstream.mjs`) already merges Steve Castaneda's original into `main`. The hub fetches `origin` and merges `origin/main` into what the plugin runs from. |
| Conversation exporter | Your fork's `origin/main` | A GitHub Action on the fork merges `sgoley/paseo-exporter` into `main` every 12 hours. A managed checkout has no `upstream` remote, so the hub follows `origin/main` like Shell Yeah. |
| Workspace links | Your standalone repo's `origin/main` | The repo is not a GitHub fork. Its Action (`scripts/sync-upstream.mjs`) splits the `workspace-links` folder out of `stevecastaneda/paseo-plugins` with `git subtree split` and merges it into `main` daily. The npm tarball ships no tests or lockfile, so merging it would conflict with the fork; the hub follows `origin/main` instead. |
| Skills | The published npm package | A vendor branch named `upstream` holds one commit per published version, created from the fork's import commit the first time. A new version is added to it and `upstream` is merged, so each update is a real three-way merge against the previous version. |
| Switchboard | Yours | Nothing to follow. |

An update is merged on its own branch (`pill-hub-sync/<tool>`) in a separate worktree next to the fork, installed with `npm install --ignore-scripts`, and type-checked by starting `tsc` directly. No script from the upstream is run, and npm tarballs are verified against their published checksum. The live folder is untouched until you press Apply, which fast-forwards it and needs a clean tree. Reload the plugin afterwards.

"What the plugin runs from" is read from the installed folder at call time: its branch, or `HEAD` for the detached checkout that `paseo plugin install git:...` makes. There is no configured branch name. A detached checkout is replaced from the GitHub fork on the next `paseo plugin update`, so Apply only fast-forwards to a commit a remote already has; a merge that exists only locally (every npm update) has to be pushed to the fork first, then installed with `paseo plugin update <plugin id> --yes`.

Outcomes per fork: up to date, update available, staged, conflict, check failed, error. A conflict or a failed check leaves no branch behind.

The hub checks every few hours and, if you leave it on, stages each update it finds. Both are switches on the Pill hub screen.

### AI adaptation

Optional, off by default, and no API key: it uses the OpenCode agent that already runs in your Paseo daemon (`paseo providers` lists it as `opencode`). When an update conflicts or stops type-checking, the hub creates a read-only (plan mode) agent in an empty scratch folder, sends it the conflicting or failing files plus a short description of what the fork changes on purpose, reads its reply, and archives the agent and its workspace. The model may only return files it was sent, whole, with no conflict markers. The result is type-checked again, marked AI-assisted, and still waits for you to apply it. The affected files go to whichever model you choose.

Choose the model on the Pill hub screen: **Load models** lists what the daemon's OpenCode offers, which can be over a thousand across many providers. A picker shows the providers down the left with their model counts (OpenCode's own first, then the rest A to Z), a search field above, and the chosen provider's models on the right, sorted A to Z and scrolling inside a fixed-height box. It opens on the provider of the model already chosen. Search matches every word you type against the model's name and id, within the chosen provider; pick **All providers** to search everything. A list of more than 100 matches shows the first 100, so search to narrow it. Tap a model to select it. The default is `opencode/deepseek-v4.1-flash`. The daemon connection reaches the plugin with each request and lifecycle event, so a background check before any has been seen reports the model as unavailable; open the Pill hub screen once and press Retry.

The adapter is an ordinary top-level agent in the daemon while it runs, so a plugin that notifies on every agent turn (for example Telegram notifications) may report it as running and finished. The hub does not mute those notices. Archiving the agent when the reply arrives does not retract a notice already sent.

To follow a new fork, add a row to `FORKS` in `shared/forks.ts`. For an npm fork, its repository needs a commit whose subject starts with `Import `, which is where the vendor branch begins.

## Development

```
npm install
npm run typecheck
npm test
```

## License

MIT. See [LICENSE](LICENSE).
