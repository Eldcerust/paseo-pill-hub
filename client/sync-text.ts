import type { ForkStatus } from "../shared/sync";

export interface SyncAction {
  label: string;
  kind: "stage" | "apply";
}

/** The one button a fork row offers in its current state, if any. */
export function actionFor(fork: ForkStatus): SyncAction | undefined {
  switch (fork.state) {
    case "update-available":
      return { label: "Stage update", kind: "stage" };
    case "staged":
      return { label: "Apply", kind: "apply" };
    case "conflict":
    case "check-failed":
    case "error":
      return { label: "Retry", kind: "stage" };
    default:
      return undefined;
  }
}

export function ago(iso: string | undefined, now: Date): string | undefined {
  if (!iso) return undefined;
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (Number.isNaN(minutes)) return undefined;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/** Where the fork came from, then what its sync is doing, as the row's hint. */
export function describeFork(fork: ForkStatus, origin: string, now: Date): string {
  const lines = [`${origin}.`];
  if (fork.detail) lines.push(fork.detail);
  const checked = ago(fork.checkedAt, now);
  if (checked && fork.state !== "working") lines.push(`Checked ${checked}.`);
  return lines.join("\n");
}
