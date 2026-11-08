import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getConfig, hubSettings } from "./shared/config";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(hubSettings);
  // The client entry cannot read settings outside React, so it asks the daemon for them.
  server.handle(getConfig, async () => {
    const state = await settings.read();
    return { merged: state.status === "ready" ? state.values.merged : {} };
  });
  return () => {};
}
