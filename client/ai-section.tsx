import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSwitch, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { z } from "zod";
import { DEFAULT_AI_MODEL, type hubSettings } from "../shared/config";
import { syncModels } from "../shared/sync";
import type { ModelEntry } from "./model-pick";
import { ModelPicker } from "./model-picker";

type HubValues = z.output<typeof hubSettings.schema>;

/**
 * Whether the OpenCode agent in the Paseo daemon may adapt a fork, and which of its models to use.
 * The model list is read from the daemon on request. It can run to a thousand entries across many
 * providers, so it is chosen from a provider list with a search field, not from a dropdown.
 */
export function AiSection({ values, saving, save }: { values: HubValues; saving: boolean; save(next: HubValues): Promise<boolean> }) {
  const toast = useToast();
  const listModels = useRpc(syncModels);
  const [all, setAll] = useState<ModelEntry[]>();
  const loading = useMutation({
    mutationFn: () => listModels({}),
    onSuccess: (result) => setAll(result.models),
    onError: (error: Error) => toast.error(error.message),
  });
  const set = (patch: Partial<HubValues["ai"]>) => void save({ ...values, ai: { ...values.ai, ...patch } });
  const model = values.ai.model || DEFAULT_AI_MODEL;

  return (
    <SettingsSection title="AI adaptation">
      <SettingsCard>
        <SettingsSwitch
          label="Adapt with AI"
          hint="When an update conflicts or stops type-checking, the OpenCode agent already running in your Paseo daemon proposes the fix, so no API key is needed. It runs read-only, the result is checked again and marked AI-assisted, and you still apply it. The affected files go to whichever model you choose."
          value={values.ai.enabled}
          disabled={saving}
          onValueChange={(enabled) => set({ enabled })}
        />
        <SettingsRow label="Model" hint={`${model}${values.ai.model ? "" : " (default)"}`} />
        <SettingsAction
          label="Choose a model"
          hint="Lists the models the OpenCode provider in your daemon offers, including its own deepseek-v4.1-flash. Pick a provider, search, then tap a model."
          actionLabel={loading.isPending ? "Loading…" : all ? "Reload list" : "Load models"}
          disabled={loading.isPending}
          onPress={() => loading.mutate()}
        />
        {all ? <ModelPicker all={all} value={model} disabled={saving} onSelect={(id) => set({ model: id })} /> : null}
      </SettingsCard>
    </SettingsSection>
  );
}
