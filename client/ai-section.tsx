import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { z } from "zod";
import { DEFAULT_AI_MODEL, type hubSettings } from "../shared/config";
import { syncModels } from "../shared/sync";
import { pickModels, type ModelEntry } from "./model-pick";

type HubValues = z.output<typeof hubSettings.schema>;

/**
 * Whether the OpenCode agent in the Paseo daemon may adapt a fork, and which of its models to use.
 * The model list is read from the daemon on request; it can run to a thousand entries, so it is
 * searched rather than scrolled.
 */
export function AiSection({ values, saving, save }: { values: HubValues; saving: boolean; save(next: HubValues): Promise<boolean> }) {
  const toast = useToast();
  const listModels = useRpc(syncModels);
  const [all, setAll] = useState<ModelEntry[]>();
  const [query, setQuery] = useState("");
  const loading = useMutation({
    mutationFn: () => listModels({}),
    onSuccess: (result) => setAll(result.models),
    onError: (error: Error) => toast.error(error.message),
  });
  const set = (patch: Partial<HubValues["ai"]>) => void save({ ...values, ai: { ...values.ai, ...patch } });
  const model = values.ai.model || DEFAULT_AI_MODEL;
  const options = all ? pickModels(all, query, model) : [];

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
          hint="Lists the models the OpenCode provider in your daemon offers, including its own deepseek-v4.1-flash."
          actionLabel={loading.isPending ? "Loading…" : all ? "Reload list" : "Load models"}
          disabled={loading.isPending}
          onPress={() => loading.mutate()}
        />
        {all ? (
          <>
            <SettingsInput
              label="Search models"
              hint={query.trim() ? `${options.length} shown of ${all.length}.` : `OpenCode's own ${options.length} shown of ${all.length}. Search to see the rest.`}
              initialValue=""
              placeholder="deepseek flash"
              onChangeText={setQuery}
            />
            <SettingsSelect
              label="Model"
              value={model}
              options={options.map((entry) => ({ label: entry.label === entry.id ? entry.id : `${entry.label} (${entry.id})`, value: entry.id }))}
              disabled={saving}
              onValueChange={(id) => set({ model: id })}
            />
          </>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}
