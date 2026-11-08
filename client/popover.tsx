import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Component, useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { HubEntry } from "./bus";
import { groupEntries, recallSelection, rememberSelection, subscribeGroup } from "./store";
import { activeTool } from "./tabs";

/** One misbehaving tool must not take the whole pill down with it. */
class ToolBoundary extends Component<{ name: string; theme: PluginTheme; children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown) {
    console.error("[pill-hub] tool crashed", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Text accessibilityRole="alert" style={{ color: this.props.theme.colors.foreground, padding: 8 }}>
        {this.props.name} failed to load: {this.state.error}
      </Text>
    );
  }
}

function Tab({ entry, active, onPress, theme }: { entry: HubEntry; active: boolean; onPress(): void; theme: PluginTheme }) {
  const colors = theme.colors;
  const color = active ? colors.accentForeground : colors.foreground;
  const glyph = entry.glyph ?? (typeof entry.icon === "string" ? entry.icon : undefined);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={entry.title}
      accessibilityState={{ selected: active, disabled: Boolean(entry.disabled) }}
      disabled={entry.disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.accent : colors.surface1,
        opacity: entry.disabled ? 0.5 : 1,
      }}
    >
      {glyph ? <Icon name={glyph} size={14} color={color} /> : null}
      <Text style={{ color, fontSize: 13, fontWeight: "600" }}>{entry.label}</Text>
    </Pressable>
  );
}

/** The single Tools pill's popover: a tab strip, then the selected tool's own popover content. */
export function HubPopover(props: PluginButtonContentProps) {
  if (props.context !== "agent") return null;
  return <AgentTools {...props} />;
}

function AgentTools(props: PluginButtonContentProps & { context: "agent" }) {
  const { agentId, theme, layout } = props;
  const subscribe = useCallback((listener: () => void) => subscribeGroup(agentId, listener), [agentId]);
  const entries = useSyncExternalStore(subscribe, () => groupEntries(agentId));
  const [chosen, setChosen] = useState(() => recallSelection(agentId));
  const active = activeTool(entries, chosen);
  if (!active) {
    return (
      <View style={{ width: layout.compact ? "100%" : 392, gap: 6 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }}>No tools detected</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
          No hub-aware plugin has reported in for this chat. Check the Pill hub settings and reload the plugins.
        </Text>
      </View>
    );
  }
  const Body = active.Content;
  return (
    <View style={{ width: layout.compact ? "100%" : 392, gap: 12 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {entries.map((entry) => (
          <Tab
            key={entry.toolId}
            entry={entry}
            active={entry.toolId === active.toolId}
            theme={theme}
            onPress={() => {
              rememberSelection(agentId, entry.toolId);
              setChosen(entry.toolId);
            }}
          />
        ))}
      </View>
      <ToolBoundary key={active.toolId} name={active.title} theme={theme}>
        <Body {...props} />
      </ToolBoundary>
    </View>
  );
}
