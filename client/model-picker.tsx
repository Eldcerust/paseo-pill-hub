import { Icon, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View, type ScrollView as NativeScrollView } from "react-native";
import { useHostLook } from "./host-look";
import { ROW_LIMIT, modelsFor, providerOf, providersOf, visibleModels, type ModelEntry } from "./model-pick";

/** The picker's own height. Both columns scroll inside it, so a thousand models never grow the page. */
const PICKER_HEIGHT = 300;

function Row({
  selected,
  disabled,
  onPress,
  role,
  label,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onPress(): void;
  role: "radio" | "button";
  label: string;
  children: (color: string, muted: string) => ReactNode;
}) {
  const { theme } = useHostLook();
  const colors = theme.colors;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: selected ? colors.accent : colors.surface1,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children(selected ? colors.accentForeground : colors.foreground, selected ? colors.accentForeground : colors.foregroundMuted)}
    </Pressable>
  );
}

/**
 * Chooses one model from a long list without a giant dropdown: providers down the left with their
 * counts, a search field above, and the models of the chosen provider scrolling on the right. It
 * opens on the provider of the model that is already chosen.
 */
export function ModelPicker({ all, value, disabled, onSelect }: { all: readonly ModelEntry[]; value: string; disabled: boolean; onSelect(id: string): void }) {
  const { theme, layout } = useHostLook();
  const colors = theme.colors;
  const providers = useMemo(() => providersOf(all), [all]);
  const [provider, setProvider] = useState<string | undefined>(() => {
    const own = providerOf(value);
    return providers.some((entry) => entry.id === own) ? own : undefined;
  });
  const [query, setQuery] = useState("");
  const matches = useMemo(() => modelsFor(all, provider, query), [all, provider, query]);
  const { rows, hidden } = visibleModels(matches);
  const list = useRef<NativeScrollView>(null);

  // A new provider or search is a new list, so start it from the top.
  useEffect(() => {
    list.current?.scrollTo({ y: 0, animated: false });
  }, [provider, query]);

  const typed = query.trim();
  const scope = provider ?? "all providers";
  const status = `${matches.length} ${matches.length === 1 ? "model" : "models"} in ${scope}${typed ? ` matching “${typed}”` : ""}${hidden > 0 ? `. Showing the first ${ROW_LIMIT}; search to narrow them.` : "."}`;

  return (
    <View style={{ padding: 12, gap: 10 }}>
      <View
        style={{
          height: 40,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: colors.surface1,
        }}
      >
        <Icon name="Search" size={15} color={colors.foregroundMuted} />
        <TextInput
          accessibilityLabel="Search models"
          placeholder={provider ? `Search ${provider} models` : "Search all models"}
          placeholderTextColor={colors.foregroundMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, minWidth: 0, paddingVertical: 0, color: colors.foreground, fontSize: 14 }}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
            <Icon name="X" size={15} color={colors.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 10, height: PICKER_HEIGHT }}>
        <ScrollView style={{ width: layout.compact ? 116 : 176 }} nestedScrollEnabled showsVerticalScrollIndicator>
          <View accessibilityRole="radiogroup" style={{ gap: 4 }}>
            {[{ id: undefined, label: "All providers", count: all.length }, ...providers.map((entry) => ({ id: entry.id as string | undefined, label: entry.id, count: entry.count }))].map((entry) => (
              <Row key={entry.id ?? "*"} role="radio" label={`${entry.label}, ${entry.count} models`} selected={provider === entry.id} onPress={() => setProvider(entry.id)}>
                {(color, muted) => (
                  <>
                    <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color, fontSize: 13, fontWeight: "600" }}>
                      {entry.label}
                    </Text>
                    <Text style={{ color: muted, fontSize: 12 }}>{entry.count}</Text>
                  </>
                )}
              </Row>
            ))}
          </View>
        </ScrollView>

        <ScrollView ref={list} style={{ flex: 1, minWidth: 0 }} nestedScrollEnabled showsVerticalScrollIndicator>
          <View accessibilityRole="radiogroup" style={{ gap: 4 }}>
            {rows.length === 0 ? (
              <View style={{ gap: 6, paddingVertical: 8 }}>
                <Text style={{ color: colors.foregroundMuted, fontSize: 13 }}>No model matches{typed ? ` “${typed}”` : ""} in {scope}.</Text>
                {provider ? (
                  <Pressable accessibilityRole="button" onPress={() => setProvider(undefined)}>
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>Search all providers</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              rows.map((model) => (
                <Row key={model.id} role="radio" label={model.label} selected={model.id === value} disabled={disabled} onPress={() => onSelect(model.id)}>
                  {(color, muted) => (
                    <>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color, fontSize: 14, fontWeight: model.id === value ? "700" : "500" }}>
                          {model.label}
                        </Text>
                        <Text numberOfLines={1} style={{ color: muted, fontSize: 12 }}>
                          {model.id}
                        </Text>
                      </View>
                      {model.id === value ? <Icon name="Check" size={16} color={color} /> : null}
                    </>
                  )}
                </Row>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{status}</Text>
    </View>
  );
}
