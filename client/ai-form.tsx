import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsInput, SettingsSelect, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { z } from "zod";
import { providerSpec, type ProviderId } from "../shared/ai";
import type { hubSettings } from "../shared/config";
import { syncModels } from "../shared/sync";

type HubValues = z.output<typeof hubSettings.schema>;

/**
 * The rows for the chosen provider: its address (custom only), model and key. It is remounted when
 * the provider changes, so the drafts always belong to the provider on screen. Keys and models are
 * kept per provider.
 */
export function AiForm({ provider, values, saving, save }: { provider: ProviderId; values: HubValues; saving: boolean; save(next: HubValues): Promise<boolean> }) {
  const spec = providerSpec(provider);
  const toast = useToast();
  const listModels = useRpc(syncModels);
  const saved = { model: values.ai.models[provider] ?? "", key: values.ai.keys[provider] ?? "" };
  const [draft, setDraft] = useState({ model: saved.model, customUrl: values.ai.customUrl, apiKey: "" });
  const [list, setList] = useState<string[]>();
  const loading = useMutation({
    mutationFn: () => listModels({ provider }),
    onSuccess: (result) => setList(result.models),
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = async () => {
    const ok = await save({
      ...values,
      ai: {
        ...values.ai,
        customUrl: draft.customUrl.trim(),
        models: { ...values.ai.models, [provider]: draft.model.trim() },
        keys: { ...values.ai.keys, [provider]: draft.apiKey.trim() || saved.key },
      },
    });
    if (ok) toast.show(`${spec.label} settings saved.`);
  };

  const chosen = draft.model || spec.defaultModel;
  const options = list ? [...new Set([...(chosen ? [chosen] : []), ...list])].map((id) => ({ label: id, value: id })) : [];

  return (
    <>
      {provider === "custom" ? (
        <SettingsInput
          label="API address"
          hint="An OpenAI-compatible base URL, ending in /v1. Must be https, or on this computer."
          initialValue={values.ai.customUrl}
          placeholder="https://…/v1"
          onChangeText={(customUrl) => setDraft((current) => ({ ...current, customUrl }))}
        />
      ) : null}
      {list ? (
        <SettingsSelect label="Model" hint={`${list.length} models listed by ${spec.label}.`} value={chosen} options={options} onValueChange={(model) => setDraft((current) => ({ ...current, model }))} />
      ) : (
        <SettingsInput
          label="Model"
          hint={spec.defaultModel ? `Leave empty to use ${spec.defaultModel}.` : "The model id exactly as the provider names it, or load the list below."}
          initialValue={saved.model}
          placeholder={spec.defaultModel || "Model id"}
          onChangeText={(model) => setDraft((current) => ({ ...current, model }))}
        />
      )}
      <SettingsInput
        label="API key"
        hint={`For ${spec.label} only. Stored as plain text in this host's plugin settings, not in a credential vault.`}
        placeholder={saved.key ? "Saved. Type to replace it." : "Paste the key"}
        secureTextEntry
        onChangeText={(apiKey) => setDraft((current) => ({ ...current, apiKey }))}
      />
      <SettingsAction label="Save" actionLabel="Save" hint={`Saves the ${spec.label} address, model and key.`} disabled={saving} onPress={() => void submit()} />
      <SettingsAction
        label="Choose from the provider's models"
        hint="Loads the list with the key you have saved for this provider."
        actionLabel={loading.isPending ? "Loading…" : list ? "Reload list" : "Load list"}
        disabled={loading.isPending || !saved.key}
        onPress={() => loading.mutate()}
      />
    </>
  );
}
