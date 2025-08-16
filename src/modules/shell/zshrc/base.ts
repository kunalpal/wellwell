import { promises as fs } from "node:fs";
import path from "node:path";
import { ZshConfig } from "../../../core/shell-config.js";
import type { ApplyResult, ConfigurationContext } from "../../../core/types.js";

class ZshrcBaseConfig extends ZshConfig {
  protected platforms: string[] = ["macos", "ubuntu", "al2"]; // All platforms

  constructor() {
    super({
      id: "shell:zshrc:base",
      description: "Base zshrc block managed by wellwell",
      dependsOn: [
        "common:homebin",
        "core:paths",
        "core:aliases",
        "core:env-vars",
        "shell:init",
      ],
      shellFile: ".zshrc",
      markerStart: "# === wellwell:begin ===",
      markerEnd: "# === wellwell:end ===",
    });
  }

  async apply(ctx: ConfigurationContext): Promise<ApplyResult> {
    // First, apply the base zshrc configuration
    const result = await super.apply(ctx);

    // Then, ensure the overrides file exists
    try {
      const overridesPath = path.join(ctx.homeDir, ".ww-overrides.zsh");

      try {
        await fs.access(overridesPath);
        // File exists, no need to create
      } catch {
        // File doesn't exist, create empty one
        const emptyOverrides = `#!/usr/bin/env zsh
# Local machine-specific overrides for wellwell
# Add your aliases, environment variables, and other shell customizations here
# This file is automatically created by wellwell and will not be committed to version control

# Example:
# alias myalias="echo 'Hello from overrides'"
# export MY_VAR="some value"
`;
        await fs.writeFile(overridesPath, emptyOverrides);
      }
    } catch (error) {
      // Don't fail the entire apply if overrides file creation fails
      console.warn(`Warning: Could not create overrides file: ${error}`);
    }

    return result;
  }

  getDetails(_ctx: any): string[] {
    return [
      "Base zsh configuration:",
      "  • PATH management",
      "  • Environment variables",
      "  • Aliases integration",
      "  • Shell initializations",
      "  • Local overrides file creation",
    ];
  }
}

export const zshrcBaseModule = new ZshrcBaseConfig();
