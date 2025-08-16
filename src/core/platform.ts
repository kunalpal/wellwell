import os from "node:os";

import type { Platform } from "./types.js";

export function detectPlatform(): Platform {
  const platform = os.platform();
  // macOS (darwin)
  if (platform === "darwin") return "macos";
  // Many distros report linux; add env hints for ubuntu and AL2
  if (platform === "linux") {
    const idLike = process.env.ID_LIKE?.toLowerCase() ?? "";
    const distroId = process.env.ID?.toLowerCase() ?? "";
    if (idLike.includes("ubuntu") || distroId.includes("ubuntu"))
      return "ubuntu";
    if (distroId.includes("amzn") || idLike.includes("amzn")) return "al2";
  }
  return "unknown";
}
