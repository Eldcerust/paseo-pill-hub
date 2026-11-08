import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { KNOWN_TOOLS, type hubSettings } from "../shared/config";
import { syncApply, syncCheck, syncStage, syncStatus } from "../shared/sync";
import { AiSection } from "./ai-section";
import { actionFor, describeFork } from "./sync-text";

type HubValues = z.output<typeof hubSettings.schema>;

const KEY = ["pill-hub-sync"];
const EVERY = [
  { label: "Every hour", value: "1" },
  { label: "Every 6 hours", value: "6" },
  { label: "Every day", value: "24" },
  { label: "Every week", value: "168" },
];

/** Where each fork stands against its upstream, what to do about it, and how the syncing behaves. */
export function SyncSection({ values, saving, save }: { values: HubValues; saving: boolean; save(next: HubValues): Promise<boolean> }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const getStatus = useRpc(syncStatus);
  const check = useRpc(syncCheck);
  const stage = useRpc(syncStage);
  const apply = useRpc(syncApply);

  // Staging runs in the background, so poll quickly while anything is working and slowly otherwise.
  const status = useQuery({
    queryKey: KEY,
    queryFn: () => getStatus({}),
    refetchInterval: (query) => (query.state.data?.forks.some((fork) => fork.state === "working") ? 2_000 : 30_000),
  });
  const put = (next: Awaited<ReturnType<typeof getStatus>>) => queryClient.setQueryData(KEY, next);
  const fail = (error: Error) => toast.error(error.message);
  const checking = useMutation({ mutationFn: () => check({}), onSuccess: put, onError: fail });
  const staging = useMutation({ mutationFn: (toolId: string) => stage({ toolId }), onSuccess: put, onError: fail });
  const applying = useMutation({
    mutationFn: (toolId: string) => apply({ toolId }),
    onSuccess: (result) => {
      put(result.status);
      toast.show(result.message);
    },
    onError: fail,
  });
  const busy = checking.isPending || staging.isPending || applying.isPending;

  const set = (patch: Partial<HubValues>) => void save({ ...values, ...patch });
  const now = new Date();
  const forks = status.data?.forks ?? [];

  return (
    <>
      <SettingsSection title="Upstream sync">
        <SettingsCard>
          <SettingsAction
            label="Check for updates"
            hint="Looks at each plugin's upstream now. An update is merged and checked on a separate branch; nothing changes until you press Apply."
            actionLabel={checking.isPending ? "Checking…" : "Check now"}
            disabled={busy}
            onPress={() => checking.mutate()}
          />
          {forks.map((fork) => {
            const tool = KNOWN_TOOLS.find((candidate) => candidate.toolId === fork.toolId);
            const label = tool ? `${tool.title}: ${tool.plugin}` : fork.toolId;
            const hint = describeFork(fork, tool?.origin ?? fork.pluginId, now);
            const action = actionFor(fork);
            if (!action) return <SettingsRow key={fork.toolId} label={label} hint={hint} />;
            return (
              <SettingsAction
                key={fork.toolId}
                label={label}
                hint={hint}
                actionLabel={action.label}
                disabled={busy || fork.state === "working"}
                onPress={() => (action.kind === "apply" ? applying.mutate(fork.toolId) : staging.mutate(fork.toolId))}
              />
            );
          })}
          {status.isError ? <SettingsRow label="Could not read the sync status" hint={String(status.error)} /> : null}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Sync behaviour">
        <SettingsCard>
          <SettingsSwitch
            label="Check automatically"
            value={values.sync.autoCheck}
            disabled={saving}
            onValueChange={(autoCheck) => set({ sync: { ...values.sync, autoCheck } })}
          />
          <SettingsSelect
            label="Check"
            value={String(values.sync.checkEveryHours)}
            options={EVERY}
            disabled={saving || !values.sync.autoCheck}
            onValueChange={(hours) => set({ sync: { ...values.sync, checkEveryHours: Number(hours) } })}
          />
          <SettingsSwitch
            label="Stage updates automatically"
            hint="Merges and checks each update it finds on a separate branch. Applying is always your decision."
            value={values.sync.autoStage}
            disabled={saving || !values.sync.autoCheck}
            onValueChange={(autoStage) => set({ sync: { ...values.sync, autoStage } })}
          />
        </SettingsCard>
      </SettingsSection>

      <AiSection values={values} saving={saving} save={save} />
    </>
  );
}
