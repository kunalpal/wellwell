import chalk from "chalk";
import type { ConfigurationStatus } from "../core/types.js";
import type { ThemeColors } from "../core/theme-context.js";
import { getThemeColors } from "./theme-utils.js";

/**
 * Formats a configuration status with background colors for better visual distinction.
 * Similar to Jest's test result format with consistent width and capitalization.
 * @param status The configuration status string.
 * @param isUnsupported Whether the status is for an unsupported configuration.
 * @param themeColors Optional theme colors for formatting.
 * @returns The formatted status string with color and padding.
 */
export function formatStatus(
  status: ConfigurationStatus,
  isUnsupported?: boolean,
  themeColors?: ThemeColors | null,
): string {
  const colors = getThemeColors(themeColors || null);

  if (isUnsupported) {
    // Use ANSI escape codes for strikethrough since chalk may not work properly
    return `\u001b[9m\u001b[2m${status.toUpperCase()}\u001b[0m`.padEnd(16);
  }

  // Calculate the visual width of the status badge (without ANSI codes)
  const getStatusText = (text: string) => ` ${text} `;
  const statusText = getStatusText(status.toUpperCase());
  const visualWidth = statusText.length;

  // Calculate padding needed to reach 16 characters visual width
  const paddingNeeded = 9 - visualWidth;

  switch (status) {
    case "stale":
      return colors.status
        .stale(statusText + " ".repeat(paddingNeeded))
        .padEnd(10);
    case "pending":
      return colors.status
        .pending(statusText + " ".repeat(paddingNeeded))
        .padEnd(10);
    case "applied":
      return colors.status
        .applied(statusText + " ".repeat(paddingNeeded))
        .padEnd(10);
    case "failed":
      return colors.status
        .failed(statusText + " ".repeat(paddingNeeded))
        .padEnd(10);
    case "skipped":
      return colors.status
        .skipped(statusText + " ".repeat(paddingNeeded))
        .padEnd(10);
    default:
      return colors.semantic
        .muted(statusText + " ".repeat(paddingNeeded))
        .padEnd(10);
  }
}
