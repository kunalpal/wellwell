import os from "node:os";
import { readFileSync } from "node:fs";

import type { Platform } from "./types.js";

/**
 * Reads a value from /etc/os-release by key (e.g., ID, ID_LIKE).
 * Returns empty string if not found or file is missing.
 */
function getOsReleaseField(key: string): string {
  try {
    const content = readFileSync("/etc/os-release", "utf8");
    const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (match) {
      // Remove any surrounding quotes
      return match[1].replace(/^['\"]|['\"]$/g, "").toLowerCase();
    }
  } catch {
    // Ignore errors (file not found, etc.)
  }
  return "";
}

/**
 * Detects the current platform (macos, ubuntu, al2, or unknown) based on OS and environment variables or /etc/os-release.
 * @returns The detected platform as a string.
 */
export function detectPlatform(): Platform {
  const platform = os.platform();
  // macOS (darwin)
  if (platform === "darwin") return "macos";
  // Many distros report linux; add env hints for ubuntu and AL2
  if (platform === "linux") {
    let idLike = process.env.ID_LIKE?.toLowerCase() ?? "";
    let distroId = process.env.ID?.toLowerCase() ?? "";
    if (!idLike && !distroId) {
      idLike = getOsReleaseField("ID_LIKE");
      distroId = getOsReleaseField("ID");
    }
    if (idLike.includes("ubuntu") || distroId.includes("ubuntu"))
      return "ubuntu";
    if (distroId.includes("amzn") || idLike.includes("amzn")) return "al2";
  }
  return "unknown";
}
