Pill hub collapses the composer pills from other plugins into one Tools pill. Tapping it opens a popover with a tab for each tool, and the selected tool's own popover shows underneath. It is meant for small screens, where several pills crowd the chat.

Paseo has no way for one plugin to hide another plugin's pill, so this works by cooperation. A plugin that supports the hub checks whether it is running and whether its tool is switched on. If both are true, it hands its popover to the hub. Otherwise it adds its own pill exactly as before, so stopping or disabling the hub brings every pill back.

Plugins that have a hub-aware version: Run, Skills, Switch and Export. Plugins without one are unaffected and keep their own pills.

## Settings

Open Settings and choose Pill hub. Each detected tool has a switch: on shows it inside the Tools pill, off shows it as its own pill. New tools default to on. A tool shows as not detected until its hub-aware plugin has run. The switches are stored on the host, so they apply on every device that connects to it.

## Limits

Changes made on another device appear within a minute. A tool whose popover opens its own dialog, such as Switch, opens that dialog when you select its tab. The hub needs Paseo 0.15.3 or later.
