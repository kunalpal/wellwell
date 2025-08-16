import chalk from "chalk";
import type { ThemeColors } from "../core/theme-context.js";

/**
 * Get chalk color functions from theme colors
 */
export function getThemeChalkColors(themeColors: ThemeColors) {
  return {
    // Background colors
    bg: {
      base00: chalk.hex(themeColors.base00), // Default Background
      base01: chalk.hex(themeColors.base01), // Lighter Background
      base02: chalk.hex(themeColors.base02), // Selection Background
      base07: chalk.hex(themeColors.base07), // Light Background
    },
    // Foreground colors
    fg: {
      base03: chalk.hex(themeColors.base03), // Comments, Invisibles
      base04: chalk.hex(themeColors.base04), // Dark Foreground
      base05: chalk.hex(themeColors.base05), // Default Foreground
      base06: chalk.hex(themeColors.base06), // Light Foreground
    },
    // Semantic colors
    semantic: {
      error: chalk.hex(themeColors.base08), // Variables, XML Tags (red)
      warning: chalk.hex(themeColors.base09), // Integers, Boolean (orange)
      success: chalk.hex(themeColors.base0B), // Strings, Inherited Class (green)
      info: chalk.hex(themeColors.base0D), // Functions, Methods (blue)
      highlight: chalk.hex(themeColors.base0A), // Classes, Markup Bold (yellow)
      accent: chalk.hex(themeColors.base0E), // Keywords, Storage (magenta)
      muted: chalk.hex(themeColors.base03), // Comments, Invisibles (gray)
    },
    // Status colors
    status: {
      stale: chalk.bgHex(themeColors.base0D).black, // Blue for stale
      applied: chalk.bgHex(themeColors.base0B).black, // Green for applied
      pending: chalk.bgHex(themeColors.base0A).black, // Yellow for pending
      failed: chalk.bgHex(themeColors.base08).black, // Red for failed
      skipped: chalk.bgHex(themeColors.base0C).black, // Cyan for skipped
    },
  };
}

/**
 * Get theme-aware chalk colors with fallback to default colors
 */
export function getThemeColors(themeColors: ThemeColors | null) {
  if (!themeColors) {
    // Fallback to default colors
    return {
      bg: {
        base00: chalk.bgBlack,
        base01: chalk.bgGray,
        base02: chalk.bgGray,
        base07: chalk.bgWhite,
      },
      fg: {
        base03: chalk.gray,
        base04: chalk.gray,
        base05: chalk.white,
        base06: chalk.white,
      },
      semantic: {
        error: chalk.red,
        warning: chalk.yellow,
        success: chalk.green,
        info: chalk.blue,
        highlight: chalk.yellow,
        accent: chalk.magenta,
        muted: chalk.gray,
      },
      status: {
        stale: chalk.bgBlue.black,
        applied: chalk.bgGreen.black,
        pending: chalk.bgYellow.black,
        failed: chalk.bgRed.black,
        skipped: chalk.bgCyan.black,
      },
    };
  }

  return getThemeChalkColors(themeColors);
}
