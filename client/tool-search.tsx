import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import type { SortDirection } from "./tabs";

/** Every control in the header row is this tall, so the row stays one line high. */
export const CONTROL_HEIGHT = 34;

/**
 * The search control. Closed it is a round magnifier button; open it is a field sitting in the
 * same row, so searching never adds a second line above the tool.
 */
export function ToolSearch({
  open,
  query,
  onOpen,
  onChange,
  onClose,
  theme,
}: {
  open: boolean;
  query: string;
  onOpen(): void;
  onChange(query: string): void;
  /** Clears the query and closes the field. */
  onClose(): void;
  theme: PluginTheme;
}) {
  const colors = theme.colors;
  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search tools"
        onPress={onOpen}
        style={{
          width: CONTROL_HEIGHT,
          height: CONTROL_HEIGHT,
          borderRadius: CONTROL_HEIGHT / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface1,
        }}
      >
        <Icon name="Search" size={15} color={colors.foreground} />
      </Pressable>
    );
  }
  return (
    <View
      style={{
        width: 148,
        height: CONTROL_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingStart: 10,
        paddingEnd: 8,
        borderRadius: CONTROL_HEIGHT / 2,
        backgroundColor: colors.surface1,
      }}
    >
      <Icon name="Search" size={14} color={colors.foregroundMuted} />
      <TextInput
        autoFocus
        accessibilityLabel="Search tools"
        placeholder="Search"
        placeholderTextColor={colors.foregroundMuted}
        value={query}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, minWidth: 0, paddingVertical: 0, color: colors.foreground, fontSize: 14 }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Clear and close search" hitSlop={8} onPress={onClose}>
        <Icon name="X" size={14} color={colors.foregroundMuted} />
      </Pressable>
    </View>
  );
}

/** Flips the tabs between A–Z and Z–A. */
export function SortButton({ direction, onPress, theme }: { direction: SortDirection; onPress(): void; theme: PluginTheme }) {
  const colors = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === "asc" ? "Sorted A to Z. Switch to Z to A" : "Sorted Z to A. Switch to A to Z"}
      onPress={onPress}
      style={{
        height: CONTROL_HEIGHT,
        paddingHorizontal: 11,
        borderRadius: CONTROL_HEIGHT / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface1,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{direction === "asc" ? "A–Z" : "Z–A"}</Text>
    </Pressable>
  );
}
