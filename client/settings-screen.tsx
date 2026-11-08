import { useSettings, type PluginHostProps, type PluginScreenProps, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ScrollView, SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useEffect, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { KNOWN_TOOLS, hubSettings } from "../shared/config";
import { getBus } from "./bus";
import { activeHub } from "./hub";

/** The tool ids that forks have announced, as one string so React compares it by value. */
function useAnnounced(): Set<string> {
  const bus = getBus();
  const key = useSyncExternalStore(
    (listener) => {
      bus.listeners.add(listener);
      return () => bus.listeners.delete(listener);
    },
    () => [...bus.tools.keys()].sort().join(","),
  );
  return new Set(key ? key.split(",") : []);
}

/** The tab on Paseo's Settings page. Paseo owns the header and scrolling there. */
export function HubSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  return <HubSwitches theme={theme} layout={layout} />;
}

/** The sidebar screen, opened from the Pill hub row. It owns its own scrolling and background. */
export function HubScreen({ theme, layout }: PluginScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <ScrollView>
        <HubSwitches theme={theme} layout={layout} />
      </ScrollView>
    </View>
  );
}

function HubSwitches({ theme, layout }: Pick<PluginHostProps, "theme" | "layout">) {
  const settings = useSettings(hubSettings);
  const announced = useAnnounced();
  const merged = settings.status === "ready" ? settings.values.merged : undefined;

  // Hand the stored switches to the running hub; it ignores them when nothing changed.
  useEffect(() => {
    if (merged) activeHub()?.applyConfig(merged);
  }, [merged]);

  const text = { color: theme.colors.foreground };
  const padding = layout.compact ? 16 : 24;

  if (settings.status === "loading") {
    return <Text style={{ ...text, padding }}>Loading pill hub settings…</Text>;
  }
  if (settings.status !== "ready") {
    return (
      <View style={{ padding, gap: 8 }}>
        <Text style={text}>{settings.error}</Text>
        <Pressable accessibilityRole="button" onPress={() => void settings.reload()}>
          <Text style={text}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const tools = [
    ...KNOWN_TOOLS.map((tool) => tool.toolId as string),
    ...[...announced].filter((toolId) => !KNOWN_TOOLS.some((tool) => tool.toolId === toolId)),
  ];
  const titleOf = (toolId: string) => KNOWN_TOOLS.find((tool) => tool.toolId === toolId)?.title ?? toolId;

  async function setMerged(toolId: string, value: boolean) {
    if (settings.status !== "ready") return;
    const next = { ...settings.values.merged, [toolId]: value };
    const saved = await settings.save({ ...settings.values, merged: next }, settings.revision);
    if (saved) activeHub()?.applyConfig(next);
  }

  return (
    <View style={{ padding, gap: 16 }}>
      <SettingsSection title="Tools pill">
        <SettingsCard>
          {tools.map((toolId) => {
            const detected = announced.has(toolId);
            const on = settings.values.merged[toolId] ?? true;
            return (
              <SettingsSwitch
                key={toolId}
                label={titleOf(toolId)}
                hint={
                  !detected
                    ? "Not detected. Its plugin is missing, or it is not the hub-aware fork."
                    : on
                      ? "Shown inside the Tools pill."
                      : "Shown as its own pill."
                }
                value={on}
                disabled={!detected || settings.saving}
                onValueChange={(value) => void setMerged(toolId, value)}
              />
            );
          })}
        </SettingsCard>
      </SettingsSection>
      {settings.saveError ? <Text accessibilityRole="alert" style={text}>{settings.saveError}</Text> : null}
    </View>
  );
}
