Pill hub collapses the composer pills from other plugins into one Tools pill. Tapping it opens a popover with one row of tabs, a tab for each tool. Arrows at either end scroll the row, a button flips the tabs between A–Z and Z–A, and the magnifier opens a search field in the same row that narrows the tabs to the tool you want. The selected tool's own popover shows underneath, at the size it asks for. It is meant for small screens, where several pills crowd the chat.

Paseo has no way for one plugin to hide another plugin's pill, so this works by cooperation. A plugin that supports the hub checks whether it is running and whether its tool is switched on. If both are true, it hands its popover to the hub. Otherwise it adds its own pill exactly as before, so stopping or disabling the hub brings every pill back.

Plugins that have a hub-aware version: Shell Yeah (the Run tab), Skills, Switchboard (the Switch tab), Conversation exporter (the Export tab) and Workspace links (the Links tab). Plugins without one are unaffected and keep their own pills. The settings screen names each plugin and where it came from.

## Settings

Open Settings and choose Pill hub. Each detected tool has a switch: on shows it inside the Tools pill, off shows it as its own pill. New tools default to on. A tool shows as not detected until its hub-aware plugin has run. The switches are stored on the host, so they apply on every device that connects to it.

Tool height sets, in pixels and separately for PC, iOS and Android, how tall the tool under the tabs may get. A taller tool scrolls inside it under the tab row, so the popover itself never has to. It starts at 350 on a computer, where Paseo caps a popover at 440, and 400 on phones. Leave a field blank for no limit.

## Keeping forks up to date

The plugins above are forks, so the hub also watches their upstreams. The Pill hub screen shows where each fork came from, how far behind it is, and a button for the next step: stage an update, then apply it. An update is merged and type-checked on a separate branch first, and nothing in the running plugin changes until you press Apply. You then reload that plugin. The hub can check every few hours and stage updates by itself.

If an update conflicts or stops compiling, you can optionally let the OpenCode agent already running in your Paseo daemon adapt it, so no API key is needed. You choose the model on the same screen. The affected files go to that model, it runs read-only, and the result is still checked and still waits for you.

## Limits

Changes made on another device appear within a minute. The hub needs Paseo 0.15.3 or later.
