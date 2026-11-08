import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView as NativeScrollView,
} from "react-native";
import type { HubEntry } from "./bus";
import { canScroll, revealOffset, stepOffset, type Direction, type Slot, type StripMetrics } from "./strip";
import { CONTROL_HEIGHT } from "./tool-search";

function Tab({
  entry,
  active,
  onPress,
  onLayout,
  theme,
}: {
  entry: HubEntry;
  active: boolean;
  onPress(): void;
  onLayout(event: LayoutChangeEvent): void;
  theme: PluginTheme;
}) {
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
      onLayout={onLayout}
      style={{
        height: CONTROL_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? colors.accent : colors.surface1,
        opacity: entry.disabled ? 0.5 : 1,
      }}
    >
      {glyph ? <Icon name={glyph} size={14} color={color} /> : null}
      <Text numberOfLines={1} style={{ color, fontSize: 13, fontWeight: "600" }}>
        {entry.label}
      </Text>
    </Pressable>
  );
}

function Arrow({ direction, enabled, onPress, theme }: { direction: Direction; enabled: boolean; onPress(): void; theme: PluginTheme }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === "back" ? "Scroll tools left" : "Scroll tools right"}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.surface1,
        opacity: enabled ? 1 : 0.35,
      }}
    >
      <Icon name={direction === "back" ? "ChevronLeft" : "ChevronRight"} size={16} color={theme.colors.foreground} />
    </Pressable>
  );
}

/**
 * One row of tool tabs between a left and a right arrow. The row scrolls sideways instead of
 * wrapping, and the selected tab is kept in view whenever the selection, the order or the
 * filter changes.
 */
export function ToolStrip({
  entries,
  activeId,
  theme,
  onSelect,
}: {
  entries: readonly HubEntry[];
  activeId: string | undefined;
  theme: PluginTheme;
  onSelect(toolId: string): void;
}) {
  const scroller = useRef<NativeScrollView>(null);
  const metrics = useRef<StripMetrics>({ offset: 0, viewport: 0, content: 0 });
  const slots = useRef(new Map<string, Slot>());
  const [edges, setEdges] = useState({ back: false, forward: false });
  // Bumped whenever something is measured, so the "keep the active tab in view" effect runs again.
  const [measured, setMeasured] = useState(0);
  const orderKey = entries.map((entry) => entry.toolId).join("|");

  const refresh = useCallback(() => {
    const back = canScroll(metrics.current, "back");
    const forward = canScroll(metrics.current, "forward");
    setEdges((previous) => (previous.back === back && previous.forward === forward ? previous : { back, forward }));
  }, []);

  useEffect(() => {
    const slot = activeId ? slots.current.get(activeId) : undefined;
    if (!slot) return;
    const target = revealOffset(metrics.current, slot);
    if (target !== metrics.current.offset) scroller.current?.scrollTo({ x: target, animated: false });
  }, [activeId, orderKey, measured]);

  const step = (direction: Direction) => scroller.current?.scrollTo({ x: stepOffset(metrics.current, direction), animated: true });

  return (
    <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Arrow direction="back" enabled={edges.back} onPress={() => step("back")} theme={theme} />
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        style={{ flex: 1 }}
        onLayout={(event: LayoutChangeEvent) => {
          metrics.current = { ...metrics.current, viewport: event.nativeEvent.layout.width };
          refresh();
          setMeasured((count) => count + 1);
        }}
        onContentSizeChange={(width: number) => {
          metrics.current = { ...metrics.current, content: width };
          refresh();
          setMeasured((count) => count + 1);
        }}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          metrics.current = { ...metrics.current, offset: event.nativeEvent.contentOffset.x };
          refresh();
        }}
      >
        <View accessibilityRole="tablist" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {entries.map((entry) => (
            <Tab
              key={entry.toolId}
              entry={entry}
              active={entry.toolId === activeId}
              theme={theme}
              onPress={() => onSelect(entry.toolId)}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                slots.current.set(entry.toolId, { x, width });
                setMeasured((count) => count + 1);
              }}
            />
          ))}
        </View>
      </ScrollView>
      <Arrow direction="forward" enabled={edges.forward} onPress={() => step("forward")} theme={theme} />
    </View>
  );
}
