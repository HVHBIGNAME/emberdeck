import { createContext, useContext } from "react";
import type { GameServer, User } from "./types";

export interface Workspace {
  user: User;
  servers: GameServer[];
  revision: number;
  refresh: () => void;
  navigate: (path: string) => void;
  newServer: (template?: string, modpack?: string, version?: string) => void;
  notify: (message: string, error?: boolean) => void;
  runAction: (
    server: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
  assistant: (server?: string) => void;
  can: (permission: string, server?: string) => boolean;
}
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace provider is missing");
  return value;
}
