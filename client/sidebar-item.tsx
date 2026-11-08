import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

export const HUB_SCREEN_ID = "pills";
export const HUB_TITLE = "Pill hub";

/** One sidebar row that opens the hub's switches, the same shape as the other plugin settings rows. */
export function HubSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="LayoutGrid"
      active={currentScreen?.screenId === HUB_SCREEN_ID}
      onPress={() => openScreen({ screenId: HUB_SCREEN_ID })}
    />
  );
}
