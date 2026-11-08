import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { Component, useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { Text, View } from "react-native";
import { groupEntries, recallSelection, recallSort, rememberSelection, rememberSort, subscribeGroup } from "./store";
import { activeTool, filterTools, sortTools } from "./tabs";
import { ToolSearch } from "./tool-search";
import { ToolStrip } from "./tool-strip";

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

/** The single Tools pill's popover: a search field, one scrolling row of tabs, then the selected tool's own popover content. */
export function HubPopover(props: PluginButtonContentProps) {
  if (props.context !== "agent") return null;
  return <AgentTools {...props} />;
}

function AgentTools(props: PluginButtonContentProps & { context: "agent" }) {
  const { agentId, theme, layout } = props;
  const subscribe = useCallback((listener: () => void) => subscribeGroup(agentId, listener), [agentId]);
  const entries = useSyncExternalStore(subscribe, () => groupEntries(agentId));
  const [chosen, setChosen] = useState(() => recallSelection(agentId));
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState(recallSort);

  const width = layout.compact ? "100%" : 392;
  if (entries.length === 0) {
    return (
      <View style={{ width, gap: 6 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }}>No tools detected</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
          No hub-aware plugin has reported in for this chat. Check the Pill hub settings and reload the plugins.
        </Text>
      </View>
    );
  }

  // The hub's own order decides which tool opens when none was chosen; the strip only displays it sorted.
  const matches = filterTools(entries, query);
  const active = activeTool(matches, chosen);
  const choose = (toolId: string) => {
    rememberSelection(agentId, toolId);
    setChosen(toolId);
  };
  const search = (next: string) => {
    setQuery(next);
    // A tool the search lands on stays selected once the search is cleared.
    const landed = activeTool(filterTools(entries, next), chosen);
    if (landed && landed.toolId !== chosen) choose(landed.toolId);
  };
  const toggleSort = () => {
    const next = direction === "asc" ? "desc" : "asc";
    rememberSort(next);
    setDirection(next);
  };
  const Body = active?.Content;

  return (
    <View style={{ width, gap: 12 }}>
      <View style={{ gap: 8 }}>
        <ToolSearch query={query} onChange={search} direction={direction} onToggleSort={toggleSort} theme={theme} />
        {matches.length > 0 ? (
          <ToolStrip entries={sortTools(matches, direction)} activeId={active?.toolId} theme={theme} onSelect={choose} />
        ) : (
          <Text accessibilityRole="alert" style={{ color: theme.colors.foregroundMuted, fontSize: 13, paddingVertical: 4 }}>
            No tool matches “{query.trim()}”.
          </Text>
        )}
      </View>
      {active && Body ? (
        <ToolBoundary key={active.toolId} name={active.title} theme={theme}>
          <Body {...props} />
        </ToolBoundary>
      ) : null}
    </View>
  );
}
