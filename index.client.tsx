import type { PluginClientContext } from "@getpaseo/plugin/client";
import { startHub } from "./client/hub";
import { HubScreen, HubSettingsScreen } from "./client/settings-screen";
import { HUB_SCREEN_ID, HUB_TITLE, HubSidebarItem } from "./client/sidebar-item";

export default function contribute(client: PluginClientContext) {
  const hub = startHub(client);
  const removers = [
    // The switches are reachable three ways: the sidebar row, the Command Center, and Settings.
    client.addScreen({ id: HUB_SCREEN_ID, title: HUB_TITLE, Component: HubScreen }),
    client.addSidebarHeaderItem({ id: HUB_SCREEN_ID, title: HUB_TITLE, Component: HubSidebarItem }),
    client.addCommandCenterItem({
      id: "open-pill-hub",
      title: "Open Pill hub",
      icon: "LayoutGrid",
      context: "global",
      onSelect({ openScreen }) {
        openScreen({ screenId: HUB_SCREEN_ID });
      },
    }),
    client.addSettingsScreen({ id: "pill-hub", title: HUB_TITLE, icon: "LayoutGrid", Component: HubSettingsScreen }),
  ];
  return () => {
    for (const remove of removers) void remove();
    hub.stop();
  };
}
