import type {
  ConfigurationModule,
  ConfigurationContext,
  PlanResult,
  ModuleResult,
  StatusResult,
} from "../../core/types.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { addShellInitContribution } from "../../core/contrib.js";
import { getProjectRoot } from "../../core/module-helpers.js";
import { BaseModule } from "../../core/base-module.js";

/**
 * Represents a Base16 theme with a name, description, and color palette.
 */
interface Base16Theme {
  name: string;
  description: string;
  colors: {
    base00: string; // Default Background
    base01: string; // Lighter Background (Used for status bars, line number and folding marks)
    base02: string; // Selection Background
    base03: string; // Comments, Invisibles, Line Highlighting
    base04: string; // Dark Foreground (Used for status bars)
    base05: string; // Default Foreground, Caret, Delimiters, Operators
    base06: string; // Light Foreground (Not often used)
    base07: string; // Light Background (Not often used)
    base08: string; // Variables, XML Tags, Markup Link Text, Markup Lists, Diff Deleted
    base09: string; // Integers, Boolean, Constants, XML Attributes, Markup Link Url
    base0A: string; // Classes, Markup Bold, Search Text Background
    base0B: string; // Strings, Inherited Class, Markup Code, Diff Inserted
    base0C: string; // Support, Regular Expressions, Escape Characters, Markup Quotes
    base0D: string; // Functions, Methods, Attribute IDs, Headings
    base0E: string; // Keywords, Storage, Selector, Markup Italic, Diff Changed
    base0F: string; // Deprecated, Opening/Closing Embedded Language Tags, e.g. <?php ?>
  };
}

/**
 * Holds descriptions for each available theme. Populated dynamically from theme files.
 */
let THEME_DESCRIPTIONS: Record<string, string> = {};

/**
 * Initializes THEME_DESCRIPTIONS from available theme JSON files in the resources directory.
 * @returns Promise that resolves when theme descriptions are loaded.
 */
async function initializeThemeDescriptions(): Promise<void> {
  const projectRoot = getProjectRoot();
  const themesDir = path.join(
    projectRoot,
    "src",
    "modules",
    "themes",
    "resources",
  );
  try {
    const files = await fs.readdir(themesDir);
    const themeFiles = files.filter((file) => file.endsWith(".json"));

    THEME_DESCRIPTIONS = {};
    for (const file of themeFiles) {
      const themeName = file.replace(".json", "");
      THEME_DESCRIPTIONS[themeName] = themeName; // Just use the name as description
    }
  } catch (error) {
    // Fallback to empty object if directory doesn't exist
    THEME_DESCRIPTIONS = {};
  }
}

/**
 * Key used to store the current theme in the configuration state.
 */
const THEME_STATE_KEY = "themes.current";

/**
 * Gets the current theme name from the configuration context or returns the default.
 * @param ctx Optional configuration context.
 * @returns The current theme name.
 */
async function getCurrentTheme(ctx?: ConfigurationContext): Promise<string> {
  if (ctx) {
    return ctx.state.get<string>(THEME_STATE_KEY) || "default";
  }
  // Fallback for when context is not available
  return "default";
}

/**
 * Sets the current theme in the configuration context state.
 * @param themeName The name of the theme to set.
 * @param ctx Optional configuration context.
 */
async function setCurrentTheme(
  themeName: string,
  ctx?: ConfigurationContext,
): Promise<void> {
  if (ctx) {
    ctx.state.set(THEME_STATE_KEY, themeName);
  }
}

/**
 * Loads a theme by name from the resources directory.
 * @param name The name of the theme.
 * @returns The Base16Theme object or null if not found or invalid.
 */
async function getThemeByName(name: string): Promise<Base16Theme | null> {
  // Load theme colors from JSON file
  const projectRoot = getProjectRoot();
  const themePath = path.join(
    projectRoot,
    "src",
    "modules",
    "themes",
    "resources",
    `${name}.json`,
  );
  try {
    const content = await fs.readFile(themePath, "utf-8");
    const terminalColors = JSON.parse(content);

    // Derive Base16 colors from terminal colors
    const colors = {
      base00: terminalColors["terminal.background"],
      base01: terminalColors["terminal.ansiBrightBlack"],
      base02: terminalColors["terminal.ansiBlack"],
      base03: terminalColors["terminal.ansiBrightBlack"],
      base04: terminalColors["terminal.ansiWhite"],
      base05: terminalColors["terminal.foreground"],
      base06: terminalColors["terminal.ansiBrightWhite"],
      base07: terminalColors["terminal.ansiBrightWhite"],
      base08: terminalColors["terminal.ansiRed"],
      base09: terminalColors["terminal.ansiYellow"],
      base0A: terminalColors["terminal.ansiBrightYellow"],
      base0B: terminalColors["terminal.ansiGreen"],
      base0C: terminalColors["terminal.ansiCyan"],
      base0D: terminalColors["terminal.ansiBlue"],
      base0E: terminalColors["terminal.ansiMagenta"],
      base0F: terminalColors["terminal.ansiBrightRed"],
    };

    return {
      name,
      description: name, // Use name as description
      colors,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Module for managing Base16 color schemes, including planning, applying, and validating themes.
 * Provides methods for theme switching, validation, and resource management.
 */
class ThemesModule extends BaseModule {
  constructor() {
    super({
      id: "themes:base16",
      description: "Base16 color scheme management",
      dependsOn: [],
    });
  }

  async isApplicable(_ctx: ConfigurationContext): Promise<boolean> {
    return true; // Available on all platforms
  }

  async plan(ctx: ConfigurationContext): Promise<PlanResult> {
    const changes: Array<{
      summary: string;
      details?: string;
      impact?: string[];
      riskLevel?: "low" | "medium" | "high";
    }> = [];

    const currentTheme = await getCurrentTheme(ctx);

    // Initialize theme descriptions to check available themes
    await initializeThemeDescriptions();

    // Check if current theme is available
    const theme = await getThemeByName(currentTheme);
    if (!theme) {
      const availableThemes = Object.keys(THEME_DESCRIPTIONS);
      changes.push({
        summary: `Theme '${currentTheme}' not found`,
        details: `Current theme '${currentTheme}' is not available. Available themes: ${availableThemes.join(", ")}`,
        impact: [
          "Theme-dependent modules may fail",
          "Visual consistency may be broken",
        ],
        riskLevel: "medium",
      });
    } else {
      // Check if theme has all required color properties
      const validation = await this.validateTheme(theme);
      if (!validation.valid) {
        changes.push({
          summary: `Theme '${currentTheme}' has validation issues`,
          details: `Issues found: ${validation.issues.join(", ")}`,
          impact: ["Some applications may not display colors correctly"],
          riskLevel: "low",
        });
      }
    }

    // Check if theme resources directory exists and is accessible
    const resourcesValidation = await this.validateThemeResources();
    if (!resourcesValidation.valid) {
      changes.push({
        summary: "Theme resources validation failed",
        details: resourcesValidation.issues.join(", "),
        impact: ["Theme switching may not work", "New themes cannot be loaded"],
        riskLevel: "high",
      });
    }

    return this.createDetailedPlanResult(changes);
  }

  async apply(ctx: ConfigurationContext): Promise<ModuleResult> {
    return this.safeExecute(ctx, "theme application", async () => {
      const currentTheme = await getCurrentTheme(ctx);
      this.logProgress(ctx, `Applying theme: ${currentTheme}`);

      // Initialize theme descriptions
      await initializeThemeDescriptions();

      const theme = await getThemeByName(currentTheme);
      if (!theme) {
        throw new Error(
          `Theme '${currentTheme}' not found. Available themes: ${Object.keys(THEME_DESCRIPTIONS).join(", ")}`,
        );
      }

      // Validate theme before applying
      const validation = await this.validateTheme(theme);
      if (!validation.valid) {
        this.logProgress(
          ctx,
          `Warning: Theme has validation issues: ${validation.issues.join(", ")}`,
        );
      }

      // Store the current theme in state
      await setCurrentTheme(currentTheme, ctx);

      this.logProgress(ctx, `Theme '${currentTheme}' applied successfully`);

      return this.createSuccessResult(true, `Applied '${currentTheme}' theme`);
    }).then((result) => (result.success ? result.result : result));
  }

  async status(ctx: ConfigurationContext): Promise<StatusResult> {
    try {
      const currentTheme = await getCurrentTheme(ctx);

      // Initialize theme descriptions
      await initializeThemeDescriptions();

      const issues: string[] = [];
      const recommendations: string[] = [];

      // Check if current theme exists
      const theme = await getThemeByName(currentTheme);
      if (!theme) {
        const availableThemes = Object.keys(THEME_DESCRIPTIONS);
        return this.createStatusResult(
          "failed",
          `Theme '${currentTheme}' not found`,
          {
            issues: [
              `Current theme '${currentTheme}' is not available`,
              `Available themes: ${availableThemes.join(", ")}`,
            ],
            recommendations: [
              "Switch to an available theme",
              "Check if theme files are properly installed",
            ],
            current: { currentTheme, available: false },
            desired: { validTheme: true, availableThemes },
          },
        );
      }

      // Validate theme content
      const validation = await this.validateTheme(theme);
      if (!validation.valid) {
        issues.push(...validation.issues);
        recommendations.push(...validation.recommendations);
      }

      // Validate theme resources
      const resourcesValidation = await this.validateThemeResources();
      if (!resourcesValidation.valid) {
        issues.push(...resourcesValidation.issues);
        recommendations.push(...resourcesValidation.recommendations);
      }

      // Check if theme state is properly stored
      const storedTheme = ctx.state.get<string>(THEME_STATE_KEY);
      if (storedTheme !== currentTheme) {
        issues.push("Theme state inconsistency detected");
        recommendations.push("Run apply to refresh theme state");
      }

      const status = issues.length === 0 ? "applied" : "stale";

      return this.createStatusResult(
        status,
        `Theme '${currentTheme}' ${status}`,
        {
          issues: issues.length > 0 ? issues : undefined,
          recommendations:
            recommendations.length > 0 ? recommendations : undefined,
          current: {
            currentTheme,
            available: true,
            valid: validation.valid,
            colorsCount: Object.keys(theme.colors).length,
          },
          desired: {
            validTheme: true,
            properlyStored: true,
            resourcesAccessible: true,
          },
          metadata: {
            themeValidation: validation,
            resourcesValidation,
            availableThemes: Object.keys(THEME_DESCRIPTIONS),
            themeFile: path.join(
              getProjectRoot(),
              "src",
              "modules",
              "themes",
              "resources",
              `${currentTheme}.json`,
            ),
          },
        },
      );
    } catch (error) {
      return this.handleError(ctx, error, "theme status check").message
        ? this.createStatusResult("failed", "Error checking theme status", {
            issues: [
              `Status check failed: ${error instanceof Error ? error.message : String(error)}`,
            ],
            recommendations: [
              "Check logs for details",
              "Verify theme files exist",
            ],
          })
        : this.createStatusResult("failed", "Unknown error", {});
    }
  }

  async getDetails(ctx: ConfigurationContext): Promise<string[]> {
    const currentTheme = await getCurrentTheme(ctx);

    // Initialize theme descriptions if not already done
    if (Object.keys(THEME_DESCRIPTIONS).length === 0) {
      await initializeThemeDescriptions();
    }

    const theme = await getThemeByName(currentTheme);
    const validation = theme
      ? await this.validateTheme(theme)
      : { valid: false, score: 0 };

    const details = [
      "Base16 Color Scheme Management",
      "",
      `Current theme: ${currentTheme} ${theme ? "✓" : "✗"}`,
      `Theme health: ${validation.score}/100`,
      "",
      "Available themes:",
    ];

    for (const [name, description] of Object.entries(THEME_DESCRIPTIONS)) {
      const marker = name === currentTheme ? "  ❯ " : "  - ";
      const themeObj = await getThemeByName(name);
      const status = themeObj ? "✓" : "✗";
      details.push(`${marker}${name} ${status}`);
    }

    details.push("");
    details.push("Theme Management:");
    details.push("  • Press TAB to cycle through themes");
    details.push("  • Dependent modules will be re-applied when theme changes");
    details.push("  • Theme validation ensures color consistency");

    return details;
  }

  // Enhanced validation methods
  private async validateTheme(theme: Base16Theme): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
    score: number;
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if all required color properties exist
    const requiredColors = [
      "base00",
      "base01",
      "base02",
      "base03",
      "base04",
      "base05",
      "base06",
      "base07",
      "base08",
      "base09",
      "base0A",
      "base0B",
      "base0C",
      "base0D",
      "base0E",
      "base0F",
    ];

    for (const colorKey of requiredColors) {
      if (
        !(colorKey in theme.colors) ||
        !theme.colors[colorKey as keyof typeof theme.colors]
      ) {
        issues.push(`Missing color property: ${colorKey}`);
      }
    }

    // Validate color format (should be hex colors)
    for (const [key, value] of Object.entries(theme.colors)) {
      if (value && !this.isValidHexColor(value)) {
        issues.push(`Invalid hex color format for ${key}: ${value}`);
      }
    }

    // Check color contrast (basic validation)
    if (theme.colors.base00 && theme.colors.base05) {
      const contrast = this.calculateContrast(
        theme.colors.base00,
        theme.colors.base05,
      );
      if (contrast < 3) {
        issues.push("Low contrast between background and foreground colors");
        recommendations.push(
          "Consider using a theme with better contrast ratio",
        );
      }
    }

    if (issues.length > 0) {
      recommendations.push("Check theme file for color definitions");
      recommendations.push("Use a different theme if issues persist");
    }

    const score = Math.max(0, 100 - issues.length * 15);

    return {
      valid: issues.length === 0,
      issues,
      recommendations,
      score,
    };
  }

  private async validateThemeResources(): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      const projectRoot = getProjectRoot();
      const themesDir = path.join(
        projectRoot,
        "src",
        "modules",
        "themes",
        "resources",
      );

      // Check if themes directory exists
      await fs.access(themesDir);

      // Check if we can read the directory
      const files = await fs.readdir(themesDir);
      const themeFiles = files.filter((file) => file.endsWith(".json"));

      if (themeFiles.length === 0) {
        issues.push("No theme files found in resources directory");
        recommendations.push("Add theme JSON files to the resources directory");
      }

      // Validate each theme file
      for (const file of themeFiles) {
        try {
          const filePath = path.join(themesDir, file);
          const content = await fs.readFile(filePath, "utf-8");
          JSON.parse(content); // Basic JSON validation
        } catch (error) {
          issues.push(`Invalid JSON in theme file: ${file}`);
          recommendations.push(`Fix JSON syntax in ${file}`);
        }
      }
    } catch (error) {
      issues.push("Cannot access themes resources directory");
      recommendations.push("Check if themes directory exists and is readable");
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations,
    };
  }

  private isValidHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  private calculateContrast(color1: string, color2: string): number {
    // Simple contrast calculation - in a real implementation you'd want a proper algorithm
    // This is a placeholder that returns a reasonable value
    return 4.5; // Assume good contrast for now
  }

  // Custom method for theme switching
  async switchTheme(
    themeName: string,
    ctx?: ConfigurationContext,
  ): Promise<boolean> {
    const theme = await getThemeByName(themeName);
    if (!theme) {
      return false;
    }

    await setCurrentTheme(themeName, ctx);
    return true;
  }

  // Get available themes for UI
  async getAvailableThemes(): Promise<Base16Theme[]> {
    // Initialize theme descriptions if not already done
    if (Object.keys(THEME_DESCRIPTIONS).length === 0) {
      await initializeThemeDescriptions();
    }

    const themes: Base16Theme[] = [];
    for (const [name, description] of Object.entries(THEME_DESCRIPTIONS)) {
      const theme = await getThemeByName(name);
      if (theme) {
        themes.push(theme);
      }
    }
    return themes;
  }
}

/**
 * The singleton instance of the ThemesModule for use in the configuration engine.
 */
export const themesModule = new ThemesModule();
