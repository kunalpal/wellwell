import os from "node:os";

import type { Platform } from "./types.js";

/**
 * Detects the current platform (macos, ubuntu, al2, or unknown) based on OS and environment variables.
 * @returns The detected platform as a string.
 */
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
