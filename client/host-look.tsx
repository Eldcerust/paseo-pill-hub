import type { PluginHostProps } from "@getpaseo/plugin/client";
import { createContext, useContext } from "react";

/** The theme and layout of the screen a section is drawn in, for sections that draw their own controls. */
export type HostLook = Pick<PluginHostProps, "theme" | "layout">;

const HostLookContext = createContext<HostLook | undefined>(undefined);

export const HostLookProvider = HostLookContext.Provider;

export function useHostLook(): HostLook {
  const look = useContext(HostLookContext);
  if (!look) throw new Error("useHostLook must be used inside a HostLookProvider");
  return look;
}
