import { SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import type { z } from "zod";
import { HEIGHT_MAX, HEIGHT_MIN, HEIGHT_PLATFORMS, heightDefaults, type HeightPlatform, type Heights, type hubSettings } from "../shared/config";
import { activeHub } from "./hub";
import { heightText, parseHeightDraft } from "./heights";

type HubValues = z.output<typeof hubSettings.schema>;

const LABELS: Record<HeightPlatform, { label: string; where: string }> = {
  web: { label: "PC", where: "The desktop app and the browser" },
  ios: { label: "iOS", where: "iPhone and iPad" },
  android: { label: "Android", where: "Android phones and tablets" },
};

const textsOf = (heights: Heights): Record<HeightPlatform, string> => ({
  web: heightText(heights.web),
  ios: heightText(heights.ios),
  android: heightText(heights.android),
});

/**
 * How tall the tool area under the tab row may get on each platform. A taller tool scrolls inside
 * it, so the popover itself does not. The values are stored on the host, so every device of a
 * platform shares one.
 */
export function HeightSection({ values, saving, save }: { values: HubValues; saving: boolean; save(next: HubValues): Promise<boolean> }) {
  const stored = values.heights;
  // A field only reads its initial value once, so the text it starts with stays fixed while the
  // drafts follow every keystroke. Reset starts the fields over under new keys.
  const [initials, setInitials] = useState(() => textsOf(stored));
  const [drafts, setDrafts] = useState(initials);
  const [generation, setGeneration] = useState(0);

  const parsed = HEIGHT_PLATFORMS.map((platform) => [platform, parseHeightDraft(drafts[platform])] as const);
  const invalid = parsed.some(([, result]) => !result.ok);
  const next = Object.fromEntries(parsed.map(([platform, result]) => [platform, result.ok ? result.value : stored[platform]])) as Heights;
  const dirty = HEIGHT_PLATFORMS.some((platform) => next[platform] !== stored[platform]);

  async function commit(heights: Heights) {
    const saved = await save({ ...values, heights });
    if (saved) activeHub()?.applyHeights(heights);
    return saved;
  }

  async function reset() {
    if (!(await commit(heightDefaults))) return;
    const fresh = textsOf(heightDefaults);
    setInitials(fresh);
    setDrafts(fresh);
    setGeneration((count) => count + 1);
  }

  return (
    <SettingsSection title="Tool height">
      <SettingsCard>
        <SettingsRow
          label="Height of the tool under the tabs"
          hint={`In px, from ${HEIGHT_MIN} to ${HEIGHT_MAX}. A tool taller than this scrolls inside it, under the tabs, instead of making the whole popover scroll. Leave a field blank for no limit. Paseo caps a popover on a computer at 440px, which is why PC starts lower than the phones.`}
        />
        {HEIGHT_PLATFORMS.map((platform) => {
          const result = parsed.find(([key]) => key === platform)?.[1];
          return (
            <SettingsInput
              key={`${platform}-${generation}`}
              label={LABELS[platform].label}
              hint={`${LABELS[platform].where}. Default ${heightDefaults[platform]} px.`}
              error={result && !result.ok ? result.error : null}
              initialValue={initials[platform]}
              placeholder="No limit"
              disabled={saving}
              onChangeText={(text) => setDrafts((previous) => ({ ...previous, [platform]: text }))}
            />
          );
        })}
        <SettingsAction
          label="Save heights"
          hint={invalid ? "Fix the highlighted field first." : dirty ? "Applies to open and new popovers on that platform." : "Nothing changed."}
          actionLabel={saving ? "Saving…" : "Save"}
          disabled={saving || invalid || !dirty}
          onPress={() => void commit(next)}
        />
        <SettingsAction
          label="Reset to defaults"
          hint={`PC ${heightDefaults.web} px, iOS ${heightDefaults.ios} px, Android ${heightDefaults.android} px.`}
          actionLabel="Reset"
          disabled={saving}
          onPress={() => void reset()}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
