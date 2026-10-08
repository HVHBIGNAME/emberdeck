import { publicFile } from "./assets";

export type SceneArt =
  "overworld" | "aurora" | "alpine" | "creative" | "cavern" | "end" | "nether";

export function sceneArt(scene: SceneArt, cover = false) {
  return publicFile(`scenes/${scene}${cover ? "-cover" : ""}.webp`);
}

export function serverArt(server: { id: string; template: string }): SceneArt {
  if (server.id === "workshop") return "creative";
  if (["fabric", "quilt"].includes(server.template)) return "alpine";
  if (["neoforge", "forge", "arclight"].includes(server.template))
    return "cavern";
  return "overworld";
}
