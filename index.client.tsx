import type { PluginClientContext } from "@getpaseo/plugin/client";
import { startHub } from "./client/hub";
import { HubSettingsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  const hub = startHub(client);
  const removeSettings = client.addSettingsScreen({
    id: "pill-hub",
    title: "Pill hub",
    icon: "LayoutGrid",
    Component: HubSettingsScreen,
  });
  return () => {
    void removeSettings();
    hub.stop();
  };
}
