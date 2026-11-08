Pill hub collapses the composer pills from other plugins into one Tools pill. Tapping it opens a popover with a tab for each tool, and the selected tool's own popover shows underneath. It is meant for small screens, where several pills crowd the chat.

Paseo has no way for one plugin to hide another plugin's pill, so this works by cooperation. A plugin that supports the hub checks whether it is running and whether its tool is switched on. If both are true, it hands its popover to the hub. Otherwise it adds its own pill exactly as before, so stopping or disabling the hub brings every pill back.

Plugins that have a hub-aware version: Shell Yeah (the Run tab), Skills, Switchboard (the Switch tab), Conversation exporter (the Export tab) and Workspace links (the Links tab). Plugins without one are unaffected and keep their own pills. The settings screen names each plugin and where it came from.

## Settings

Open Settings and choose Pill hub. Each detected tool has a switch: on shows it inside the Tools pill, off shows it as its own pill. New tools default to on. A tool shows as not detected until its hub-aware plugin has run. The switches are stored on the host, so they apply on every device that connects to it.

## Keeping forks up to date

The plugins above are forks, so the hub also watches their upstreams. The Pill hub screen shows where each fork came from, how far behind it is, and a button for the next step: stage an update, then apply it. An update is merged and type-checked on a separate branch first, and nothing in the running plugin changes until you press Apply. You then reload that plugin. The hub can check every few hours and stage updates by itself.

If an update conflicts or stops compiling, you can optionally let an OpenAI-compatible model adapt it. You enter the API address, model and key on the same screen. The affected files are sent to that API, the key is stored as plain text in the host's plugin settings, and the result is still checked and still waits for you.

## Limits

Changes made on another device appear within a minute. The hub needs Paseo 0.15.3 or later.
