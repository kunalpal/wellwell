import { promises as fs } from "node:fs";
import path from "node:path";
import type { Platform } from "./types.js";
import { BaseModule, type BaseModuleOptions } from "./base-module.js";
import type {
  ApplyResult,
  ConfigurationContext,
  PlanResult,
  StatusResult,
  ModuleStateSnapshot,
} from "./types.js";
import { addPackageContribution } from "./contrib.js";

/**
 * Options for configuring an AppConfig module, including config file location, supported platforms, dependencies, and template function.
 */
export interface AppConfigOptions extends BaseModuleOptions {
  configDir: string;
  configFile: string;
  platforms?: Platform[];
  packageDependencies?: Array<{
    name: string;
    manager: "homebrew" | "apt" | "yum";
    platforms?: Platform[];
  }>;
  template?: (ctx: ConfigurationContext, themeColors?: any) => string;
}

/**
 * Abstract base class for application configuration modules.
 * Handles config file management, platform support, package dependencies, and template-based content generation.
 */
export abstract class AppConfig extends BaseModule {
  protected configDir: string;
  protected configFile: string;
  protected platforms?: Platform[];
  protected packageDependencies?: Array<{
    name: string;
    manager: "homebrew" | "apt" | "yum";
    platforms?: Platform[];
  }>;
  protected template?: (ctx: ConfigurationContext, themeColors?: any) => string;

  constructor(options: AppConfigOptions) {
    super(options);
    this.configDir = options.configDir;
    this.configFile = options.configFile;
    this.platforms = options.platforms;
    this.packageDependencies = options.packageDependencies;
    this.template = options.template;
  }

  /**
   * Checks if the module is applicable for the current platform.
   * @param ctx The configuration context.
   * @returns True if applicable, false otherwise.
   */
  async isApplicable(ctx: ConfigurationContext): Promise<boolean> {
    if (this.platforms && !this.platforms.includes(ctx.platform)) {
      return false;
    }
    return true;
  }

  /**
   * Gets the absolute path to the configuration file for the current context.
   * @param ctx The configuration context.
   * @returns The absolute config file path.
   */
  protected getConfigPath(ctx: ConfigurationContext): string {
    return path.join(ctx.homeDir, this.configDir, this.configFile);
  }

  /**
   * Ensures the configuration file and its directory exist, handling broken symlinks.
   * @param ctx The configuration context.
   */
  protected async ensureConfigExists(ctx: ConfigurationContext): Promise<void> {
    const configPath = this.getConfigPath(ctx);
    const configDir = path.dirname(configPath);

    await fs.mkdir(configDir, { recursive: true });

    // Handle broken symlinks
    try {
      const st = await fs.lstat(configPath);
      if (st.isSymbolicLink()) {
        try {
          await fs.readFile(configPath);
        } catch {
          await fs.unlink(configPath);
        }
      }
    } catch {
      // File doesn't exist, which is fine
    }
  }

  /**
   * Writes the provided content to the configuration file.
   * @param ctx The configuration context.
   * @param content The content to write.
   */
  protected async writeConfig(
    ctx: ConfigurationContext,
    content: string,
  ): Promise<void> {
    const configPath = this.getConfigPath(ctx);
    await this.ensureConfigExists(ctx);
    await fs.writeFile(configPath, content, "utf8");
  }

  /**
   * Reads the configuration file content if it exists.
   * @param ctx The configuration context.
   * @returns The file content as a string, or null if not found.
   */
  protected async readConfig(
    ctx: ConfigurationContext,
  ): Promise<string | null> {
    try {
      const configPath = this.getConfigPath(ctx);
      return await fs.readFile(configPath, "utf8");
    } catch {
      return null;
    }
  }

  /**
   * Checks if the configuration file exists.
   * @param ctx The configuration context.
   * @returns True if the file exists, false otherwise.
   */
  protected async configExists(ctx: ConfigurationContext): Promise<boolean> {
    try {
      const configPath = this.getConfigPath(ctx);
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Plans configuration changes for the module, including package dependencies and config file updates.
   * @param ctx The configuration context.
   * @returns The plan result with a list of changes.
   */
  async plan(ctx: ConfigurationContext): Promise<PlanResult> {
    const changes = [];

    // Add package dependencies
    if (this.packageDependencies) {
      for (const dep of this.packageDependencies) {
        if (!dep.platforms || dep.platforms.includes(ctx.platform)) {
          addPackageContribution(ctx, dep);
        }
      }
    }

    // Check if config needs to be created/updated
    if (this.template) {
      const exists = await this.configExists(ctx);
      if (!exists) {
        changes.push({ summary: `Create ${this.configFile} configuration` });
      } else {
        // Compare current content with desired content
        const currentContent = await this.readConfig(ctx);

        // Get theme colors if available
        let themeColors: any = undefined;
        try {
          const currentTheme =
            ctx.state.get<string>("themes.current") || "default";
          const { themeContextProvider } = await import("./theme-context.js");
          themeColors = await themeContextProvider.getThemeColors(currentTheme);
        } catch {
          // Theme colors not available, continue without them
        }

        const desiredContent = this.template(ctx, themeColors);

        if (currentContent !== desiredContent) {
          changes.push({ summary: `Update ${this.configFile} configuration` });
        }
      }
    }

    return this.createPlanResult(changes);
  }

  /**
   * Applies configuration changes, writing the config file if needed.
   * @param ctx The configuration context.
   * @returns The apply result indicating success or error.
   */
  async apply(ctx: ConfigurationContext): Promise<ApplyResult> {
    try {
      if (this.template) {
        // Get theme colors if available
        let themeColors: any = undefined;
        try {
          const currentTheme =
            ctx.state.get<string>("themes.current") || "default";
          const { themeContextProvider } = await import("./theme-context.js");
          themeColors = await themeContextProvider.getThemeColors(currentTheme);
        } catch {
          // Theme colors not available, continue without them
        }

        const content = this.template(ctx, themeColors);
        await this.writeConfig(ctx, content);

        return this.createSuccessResult(true, `Configuration created/updated`);
      }

      return this.createSuccessResult(false, "No configuration template");
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  /**
   * Gets the status of the configuration file, including content comparison and recommendations.
   * @param ctx The configuration context.
   * @returns The status result with issues, recommendations, and metadata.
   */
  async status(ctx: ConfigurationContext): Promise<StatusResult> {
    const exists = await this.configExists(ctx);
    if (!exists) {
      return {
        status: "stale",
        message: `${this.configFile} missing`,
        details: {
          issues: [`Configuration file ${this.configFile} does not exist`],
          recommendations: ["Run apply to create the configuration"],
        },
      };
    }

    if (!this.template) {
      return {
        status: "applied",
        message: `${this.configFile} exists`,
        metadata: {
          lastChecked: new Date(),
        },
      };
    }

    // For dynamic content, we need to check if the plan would show changes
    // This ensures that status is consistent with plan-based checking
    try {
      const plan = await this.plan(ctx);
      if (plan.changes.length > 0) {
        // Get current and desired content for detailed reporting
        const currentContent = await this.readConfig(ctx);

        // Get desired content
        let themeColors: any = undefined;
        try {
          const currentTheme =
            ctx.state.get<string>("themes.current") || "default";
          const { themeContextProvider } = await import("./theme-context.js");
          themeColors = await themeContextProvider.getThemeColors(currentTheme);
        } catch {
          // Theme colors not available, continue without them
        }

        const desiredContent = this.template(ctx, themeColors);

        // Generate diff
        const diff = this.generateDiff(currentContent || "", desiredContent);

        return {
          status: "stale",
          message: `${this.configFile} needs update`,
          details: {
            current: currentContent,
            desired: desiredContent,
            diff: diff,
            issues: ["Configuration content differs from expected"],
            recommendations: ["Run apply to update the configuration"],
          },
        };
      }
    } catch (error) {
      // If plan fails, fall back to content comparison
      ctx.logger.warn(
        { module: this.id, error },
        "Plan-based status check failed, falling back to content comparison",
      );
    }

    // Fallback: Get current content and compare with desired content
    const currentContent = await this.readConfig(ctx);

    // Get desired content
    let themeColors: any = undefined;
    try {
      const currentTheme = ctx.state.get<string>("themes.current") || "default";
      const { themeContextProvider } = await import("./theme-context.js");
      themeColors = await themeContextProvider.getThemeColors(currentTheme);
    } catch {
      // Theme colors not available, continue without them
    }

    const desiredContent = this.template(ctx, themeColors);

    // Compare content
    if (currentContent === desiredContent) {
      return {
        status: "applied",
        message: `${this.configFile} is up to date`,
        metadata: {
          lastChecked: new Date(),
          checksum: await this.generateChecksum(desiredContent),
        },
      };
    }

    // Generate diff
    const diff = this.generateDiff(currentContent || "", desiredContent);

    return {
      status: "stale",
      message: `${this.configFile} needs update`,
      details: {
        current: currentContent,
        desired: desiredContent,
        diff: diff,
        issues: ["Configuration content differs from expected"],
        recommendations: ["Run apply to update the configuration"],
      },
    };
  }

  /**
   * Generates a simple line-by-line diff between current and desired config content.
   * @param current The current file content.
   * @param desired The desired file content.
   * @returns An array of diff lines.
   */
  protected generateDiff(current: string, desired: string): string[] {
    // Simple line-by-line diff
    const currentLines = current.split("\n");
    const desiredLines = desired.split("\n");
    const diff: string[] = [];

    const maxLines = Math.max(currentLines.length, desiredLines.length);

    for (let i = 0; i < maxLines; i++) {
      const currentLine = currentLines[i] || "";
      const desiredLine = desiredLines[i] || "";

      if (currentLine !== desiredLine) {
        diff.push(`Line ${i + 1}:`);
        if (currentLine) diff.push(`- ${currentLine}`);
        if (desiredLine) diff.push(`+ ${desiredLine}`);
      }
    }

    return diff;
  }

  /**
   * Generates a checksum for the given content using MD5.
   * @param content The content to hash.
   * @returns The checksum string.
   */
  private async generateChecksum(content: string): Promise<string> {
    // Simple hash for content validation
    const crypto = await import("crypto");
    return crypto.createHash("md5").update(content).digest("hex");
  }

  /**
   * Returns details about the app configuration for display in the UI.
   * @param _ctx The configuration context.
   * @returns An array of detail strings.
   */
  getDetails(_ctx: ConfigurationContext): string[] {
    return [
      `App configuration:`,
      `  • Config file: ${this.configFile}`,
      `  • Config directory: ${this.configDir}`,
      ...(this.packageDependencies
        ? [`  • Package dependencies: ${this.packageDependencies.length}`]
        : []),
    ];
  }

  /**
   * Captures the current state of the configuration file for robust status checks.
   * @param ctx The configuration context.
   * @returns The module state snapshot.
   */
  async captureState(ctx: ConfigurationContext): Promise<ModuleStateSnapshot> {
    const configPath = this.getConfigPath(ctx);
    const exists = await this.configExists(ctx);

    let state: any = {
      configFile: this.configFile,
      configPath,
      exists,
      content: null,
      fileStats: null,
    };

    if (exists) {
      try {
        state.content = await this.readConfig(ctx);
        const stats = await fs.stat(configPath);
        state.fileStats = {
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          mode: stats.mode,
        };
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
      }
    }

    return this.createStateSnapshot(state);
  }

  /**
   * Gets the expected state of the configuration file for robust status checks.
   * @param ctx The configuration context.
   * @returns The expected module state snapshot.
   */
  async getExpectedState(
    ctx: ConfigurationContext,
  ): Promise<ModuleStateSnapshot> {
    const configPath = this.getConfigPath(ctx);
    let expectedContent: string | null = null;

    if (this.template) {
      try {
        // Get theme colors if available
        let themeColors: any = undefined;
        try {
          const currentTheme =
            ctx.state.get<string>("themes.current") || "default";
          const { themeContextProvider } = await import("./theme-context.js");
          themeColors = await themeContextProvider.getThemeColors(currentTheme);
        } catch {
          // Theme colors not available, continue without them
        }

        expectedContent = this.template(ctx, themeColors);
      } catch (error) {
        // If template fails, we can't determine expected state
      }
    }

    const expectedState = {
      configFile: this.configFile,
      configPath,
      exists: expectedContent !== null,
      content: expectedContent,
      templateAvailable: this.template !== undefined,
      // Include theme context if available for state change detection
      themeContext: ctx.state.get<string>("themes.current"),
    };

    return this.createStateSnapshot(expectedState);
  }

  /**
   * Compares two module state snapshots to determine if they differ.
   * @param beforeState The state before applying changes.
   * @param afterState The state after applying changes.
   * @returns True if the states differ, false otherwise.
   */
  compareState(
    beforeState: ModuleStateSnapshot,
    afterState: ModuleStateSnapshot,
  ): boolean {
    try {
      const before = beforeState.state;
      const after = afterState.state;

      // Compare file existence
      if (before.exists !== after.exists) {
        return true;
      }

      // Compare expected content (this is key for theme changes)
      if (before.content !== after.content) {
        return true;
      }

      // Compare theme context
      if (before.themeContext !== after.themeContext) {
        return true;
      }

      // Compare file stats for additional validation if file exists
      if (
        before.exists &&
        after.exists &&
        before.fileStats &&
        after.fileStats
      ) {
        if (
          before.fileStats.size !== after.fileStats.size ||
          before.fileStats.mtime !== after.fileStats.mtime
        ) {
          return true;
        }
      }

      return false;
    } catch (error) {
      // If comparison fails, assume they differ to be safe
      return true;
    }
  }
}
