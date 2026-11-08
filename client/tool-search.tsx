import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import type { SortDirection } from "./tabs";

/** A search field that narrows the tabs, and the button that flips them between A–Z and Z–A. */
export function ToolSearch({
  query,
  onChange,
  direction,
  onToggleSort,
  theme,
}: {
  query: string;
  onChange(query: string): void;
  direction: SortDirection;
  onToggleSort(): void;
  theme: PluginTheme;
}) {
  const colors = theme.colors;
  const label = direction === "asc" ? "A–Z" : "Z–A";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 10,
          borderRadius: 8,
          backgroundColor: colors.surface1,
        }}
      >
        <Icon name="Search" size={14} color={colors.foregroundMuted} />
        <TextInput
          accessibilityLabel="Search tools"
          placeholder="Search tools"
          placeholderTextColor={colors.foregroundMuted}
          value={query}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, minWidth: 0, paddingVertical: 8, color: colors.foreground, fontSize: 14 }}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => onChange("")}>
            <Icon name="X" size={14} color={colors.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={direction === "asc" ? "Sorted A to Z. Switch to Z to A" : "Sorted Z to A. Switch to A to Z"}
        onPress={onToggleSort}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: colors.surface1,
        }}
      >
        <Icon name="ArrowUpDown" size={14} color={colors.foregroundMuted} />
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      </Pressable>
    </View>
  );
}
