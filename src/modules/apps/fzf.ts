import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createAppModule,
  createCrossPlatformPackages,
} from "../../core/app-module-factory.js";
import {
  addShellInitContribution,
  addEnvVarContribution,
  addPackageContribution,
} from "../../core/contrib.js";
import { themeContextProvider } from "../../core/theme-context.js";
import { templateManager } from "../../core/template-manager.js";

/**
 * Configuration module for Fzf, a command-line fuzzy finder.
 * Handles planning, applying, and status checking for the fzf package and its theme-aware configuration.
 */
export const fzfModule = createAppModule({
  id: "apps:fzf",
  description: "Fzf - command-line fuzzy finder",
  dependsOn: ["apps:ripgrep", "themes:base16"], // fzf requires ripgrep as backend and theme support
  packageName: "fzf",
  packageMappings: createCrossPlatformPackages("fzf"),

  customPlan: async (ctx) => {
    // Add package contributions (same logic as base plan)
    const packageMappings = createCrossPlatformPackages("fzf");
    for (const [platform, packageInfo] of Object.entries(packageMappings)) {
      if (packageInfo && packageInfo.name && packageInfo.manager) {
        addPackageContribution(ctx, {
          name: packageInfo.name,
          manager: packageInfo.manager,
          platforms: [platform as any],
        });
      }
    }

    const changes = [];

    try {
      // Check if fzf is available in PATH
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      await execAsync("which fzf");

      // Check if theme-aware configuration exists and matches expected template
      const fzfConfigPath = path.join(process.env.HOME || "", ".fzf.zsh");
      try {
        const currentConfig = await fs.readFile(fzfConfigPath, "utf8");

        // Generate expected configuration (same logic as customApply)
        await templateManager.loadModulePartials("apps");
        const currentTheme =
          ctx.state.get<string>("themes.current") || "default";
        const themeColors =
          await themeContextProvider.getThemeColors(currentTheme);
        const context = {
          ...themeColors,
          themeName: currentTheme,
        };
        const expectedConfig = await templateManager.loadAndRender(
          "apps",
          "fzf.zsh.hbs",
          context,
        );

        if (currentConfig !== expectedConfig) {
          changes.push({
            summary: "Update fzf configuration with current theme colors",
          });
          changes.push({ summary: "Refresh shell initialization for fzf" });
          changes.push({ summary: "Update fzf environment variables" });
        }
      } catch {
        changes.push({
          summary: "Create fzf configuration file with theme colors",
        });
        changes.push({ summary: "Add shell initialization for fzf" });
        changes.push({ summary: "Set fzf environment variables" });
      }
    } catch {
      changes.push({ summary: "Configure fzf after installation" });
      changes.push({
        summary: "Create fzf configuration file with theme colors",
      });
      changes.push({ summary: "Add shell initialization for fzf" });
      changes.push({ summary: "Set fzf environment variables" });
    }

    return { changes };
  },

  customApply: async (ctx) => {
    try {
      // Load module partials
      await templateManager.loadModulePartials("apps");

      // Get current theme and generate theme-aware fzf configuration
      const currentTheme = ctx.state.get<string>("themes.current") || "default";
      const themeColors =
        await themeContextProvider.getThemeColors(currentTheme);

      // Generate context with theme colors
      const context = {
        ...themeColors,
        themeName: currentTheme,
      };

      // Load and render the template
      const fzfConfig = await templateManager.loadAndRender(
        "apps",
        "fzf.zsh.hbs",
        context,
      );

      const fzfConfigPath = path.join(process.env.HOME || "", ".fzf.zsh");
      await fs.writeFile(fzfConfigPath, fzfConfig);

      // Add shell initialization for fzf using template
      const initContext = {
        name: "fzf",
        command: "fzf",
        sourcePath: "~/.fzf.zsh",
        customInit: `# fzf key bindings and completion
  if [[ -f /opt/homebrew/opt/fzf/shell/key-bindings.zsh ]]; then
    source /opt/homebrew/opt/fzf/shell/key-bindings.zsh
    source /opt/homebrew/opt/fzf/shell/completion.zsh
  elif [[ -f /usr/share/fzf/key-bindings.zsh ]]; then
    source /usr/share/fzf/key-bindings.zsh
    source /usr/share/fzf/completion.zsh
  fi`,
      };

      const initCode = await templateManager.loadAndRender(
        "shell",
        "shell-init.zsh.hbs",
        initContext,
      );

      addShellInitContribution(ctx, {
        name: "fzf",
        initCode,
      });

      // Add fzf-specific environment variables
      addEnvVarContribution(ctx, {
        name: "FZF_DEFAULT_COMMAND",
        value: 'rg --files --hidden --follow --glob "!.git/*"',
      });

      addEnvVarContribution(ctx, {
        name: "FZF_CTRL_T_COMMAND",
        value: "$FZF_DEFAULT_COMMAND",
      });

      return {
        success: true,
        changed: true,
        message: "Fzf configured with theme-aware colors",
      };
    } catch (error) {
      return { success: false, error };
    }
  },

  customStatus: async (ctx) => {
    try {
      // Check if fzf is available in PATH
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      await execAsync("which fzf");

      // Check if theme-aware configuration exists and matches expected template
      const fzfConfigPath = path.join(process.env.HOME || "", ".fzf.zsh");
      try {
        const currentConfig = await fs.readFile(fzfConfigPath, "utf8");

        // Generate expected configuration (same logic as customApply)
        await templateManager.loadModulePartials("apps");
        const currentTheme =
          ctx.state.get<string>("themes.current") || "default";
        const themeColors =
          await themeContextProvider.getThemeColors(currentTheme);
        const context = {
          ...themeColors,
          themeName: currentTheme,
        };
        const expectedConfig = await templateManager.loadAndRender(
          "apps",
          "fzf.zsh.hbs",
          context,
        );

        if (currentConfig !== expectedConfig) {
          return { status: "stale", message: "Fzf configuration needs update" };
        }

        return {
          status: "applied",
          message: "Fzf available and configured with theme",
        };
      } catch {
        return {
          status: "stale",
          message: "Fzf configuration missing or corrupted",
        };
      }
    } catch {
      return {
        status: "stale",
        message: "Fzf not found or configuration missing",
      };
    }
  },

  getDetails: (_ctx) => [
    "Fuzzy finder configuration:",
    "  • Backend: ripgrep for file search",
    "  • Key bindings: Ctrl+T, Ctrl+R, Alt+C",
    "  • Completion: Command line completion",
  ],
});
