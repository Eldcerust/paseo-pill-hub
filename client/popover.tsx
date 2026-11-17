import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { drawnWithoutAnchor, hideOwnOverlay } from "./duplicate";
import { currentHeights, heightFor, sheetToolHeight, subscribeHeights } from "./heights";
import { describeNoTools } from "./no-tools";
import { claimPopover, hubCount, popoverFacts, reattachTools, recallSelection, recallSort, releasePopover, rememberSelection, rememberSort, useGroupEntries, usePopoverClaim } from "./store";
import { activeTool, filterTools, sortTools } from "./tabs";
import { SortButton, ToolSearch } from "./tool-search";
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

/**
 * Shown when no tool has attached to this chat. Rather than waiting for the plugins to turn up, it
 * asks the hub to make them attach again, offers to do that on request, and says which plugins have
 * reported in so the cause is visible. The same facts go to the log, which is all there is to read
 * when this happens on a phone.
 */
function NoTools({ agentId, theme, width, minHeight }: { agentId: string; theme: PluginTheme; width: number | `${number}%`; minHeight?: number }) {
  const [asked, setAsked] = useState(0);
  const facts = popoverFacts();
  const { summary, hint, details } = describeNoTools(facts);
  useEffect(() => {
    // console.error, because that is the level the desktop app keeps in its log.
    console.error(`[pill-hub] the Tools popover opened with no tools for this chat ${JSON.stringify({ agentId, ...facts })}`);
    if (facts.announced.length > 0) reattachTools();
    // Once per time it opens: the tools showing up replaces this view, and asking again is the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const colors = theme.colors;
  return (
    <View style={{ width, minHeight, gap: 8 }}>
      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>No tools detected</Text>
      <Text style={{ color: colors.foreground, fontSize: 13 }}>{summary}</Text>
      <Text style={{ color: colors.foregroundMuted, fontSize: 13 }}>{hint}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reconnect tools"
        onPress={() => {
          reattachTools();
          setAsked((count) => count + 1);
        }}
        style={{ alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface1 }}
      >
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>Reconnect tools</Text>
      </Pressable>
      {asked > 0 ? (
        <Text style={{ color: colors.foreground, fontSize: 12 }}>
          Asked {asked} {asked === 1 ? "time" : "times"}. Nothing attached to this chat.
        </Text>
      ) : null}
      <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{details}</Text>
    </View>
  );
}

/** The single Tools pill's popover: one header row (search, scrolling tabs, sort), then the selected tool's own popover content. */
export function HubPopover(props: PluginButtonContentProps) {
  const close = useRef(props.close);
  close.current = props.close;
  const agentId = props.context === "agent" ? props.agentId : "";
  const root = useRef<View>(null);
  const mine = useRef(0);
  const restore = useRef<(() => void) | undefined>(undefined);
  const claim = usePopoverClaim();
  const [duplicate, setDuplicate] = useState(false);

  useEffect(() => {
    // console.error, because that is the level the desktop app keeps in its log.
    console.error(`[pill-hub] tools popover opened host=${props.host.id} agent=${agentId} hubs=${hubCount()}`);
    mine.current = claimPopover(agentId, () => close.current());
    return () => releasePopover(mine.current);
    // Once per mount: the host remounts this every time the popover opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The claim holder is the surface the user opened, so it never hides itself. Any other surface for
    // the same chat is the duplicate, and it hides only if it was drawn without an anchor.
    const holder = claim !== null && claim.id === mine.current;
    const isDuplicate = !holder && claim?.agentId === agentId && drawnWithoutAnchor(root.current);
    setDuplicate(isDuplicate);
    if (isDuplicate) {
      restore.current ??= hideOwnOverlay(root.current);
    } else {
      restore.current?.();
      restore.current = undefined;
    }
  }, [claim, agentId]);

  useEffect(
    () => () => {
      restore.current?.();
      restore.current = undefined;
    },
    [],
  );

  if (props.context !== "agent") return null;
  // The wrapper stays mounted so the duplicate can keep measuring itself; only its content hides.
  return (
    <View ref={root} collapsable={false}>
      {duplicate ? null : <AgentTools {...props} />}
    </View>
  );
}

function AgentTools(props: PluginButtonContentProps & { context: "agent" }) {
  const { agentId, theme, layout } = props;
  const entries = useGroupEntries(agentId);
  const [chosen, setChosen] = useState(() => recallSelection(agentId));
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState(recallSort);
  const limit = heightFor(useSyncExternalStore(subscribeHeights, currentHeights), layout.platform, layout.compact);
  const { height: windowHeight } = useWindowDimensions();
  // A phone's sheet does not re-anchor when its content grows, so the tool area keeps one height.
  const toolHeight = layout.compact ? sheetToolHeight(windowHeight, limit) : undefined;

  const width = layout.compact ? "100%" : 392;
  // The empty view is as tall as the full one (tool area plus the 44px header row), so tools
  // attaching to it later do not grow the sheet either.
  if (entries.length === 0) return <NoTools agentId={agentId} theme={theme} width={width} minHeight={toolHeight === undefined ? undefined : toolHeight + 44} />;

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
  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };
  const toggleSort = () => {
    const next = direction === "asc" ? "desc" : "asc";
    rememberSort(next);
    setDirection(next);
  };
  const Body = active?.Content;

  // The host caps a plugin popover at 440px and scrolls anything taller. So everything the hub adds
  // above the tool is this one row (searching expands the magnifier in place and a "no match" note
  // takes the strip's place), and the tool area has its own height limit from the Pill hub settings.
  // A taller tool scrolls inside that limit, under the pinned row, so the popover itself never does.
  const tool =
    active && Body ? (
      <ToolBoundary key={active.toolId} name={active.title} theme={theme}>
        <Body {...props} />
      </ToolBoundary>
    ) : null;

  return (
    <View style={{ width, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <ToolSearch open={searching} query={query} onOpen={() => setSearching(true)} onChange={search} onClose={closeSearch} theme={theme} />
        {matches.length > 0 ? (
          <ToolStrip entries={sortTools(matches, direction)} activeId={active?.toolId} theme={theme} onSelect={choose} />
        ) : (
          <Text
            accessibilityRole="alert"
            numberOfLines={1}
            style={{ flex: 1, minWidth: 0, color: theme.colors.foregroundMuted, fontSize: 13, paddingHorizontal: 4 }}
          >
            No tool matches “{query.trim()}”
          </Text>
        )}
        <SortButton direction={direction} onPress={toggleSort} theme={theme} />
      </View>
      {/* On a phone the area holds one height whichever tool shows, so the sheet never has to grow. */}
      <View style={toolHeight === undefined ? undefined : { minHeight: toolHeight }}>
        {tool && limit ? (
          <ScrollView style={{ maxHeight: limit }} nestedScrollEnabled showsVerticalScrollIndicator>
            {tool}
          </ScrollView>
        ) : (
          tool
        )}
      </View>
    </View>
  );
}
