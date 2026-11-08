import { execFile } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Only for fixed command lines that need the Windows `.cmd` shims, such as npm. */
  shell?: boolean;
}

export type Exec = (command: string, args: readonly string[], options?: ExecOptions) => Promise<ExecResult>;

/** Runs a program and always resolves: a failure to start is exit code 1 with the reason on stderr. */
export const exec: Exec = (command, args, { cwd, timeoutMs = 120_000, shell = false } = {}) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd, timeout: timeoutMs, shell, windowsHide: true, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        const exitCode = error && typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : error ? 1 : 0;
        resolve({ code: exitCode, stdout: String(stdout), stderr: error && exitCode === 1 && !stderr ? error.message : String(stderr) });
      },
    );
  });
