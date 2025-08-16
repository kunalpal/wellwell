import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from "../../core/types.js";
import {
  addPathContribution,
  listPathContributions,
  readResolvedPaths,
  resolvePaths,
  writeResolvedPaths,
  type PathContribution,
} from "../../core/contrib.js";
import { BaseModule } from "../../core/base-module.js";
import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const commonPaths = (ctx: ConfigurationContext): PathContribution[] => {
  const contribs: PathContribution[] = [
    { path: `${ctx.homeDir}/bin`, prepend: true },
    { path: `${ctx.homeDir}/.local/bin`, prepend: true },
    {
      path: "/usr/local/bin",
      prepend: true,
      platforms: ["macos", "ubuntu", "al2"],
    },
    { path: "/opt/homebrew/bin", prepend: true, platforms: ["macos"] },
    { path: "/opt/homebrew/sbin", prepend: false, platforms: ["macos"] },
    { path: "/snap/bin", prepend: false, platforms: ["ubuntu"] },
  ];
  return contribs;
};

class PathsModule extends BaseModule {
  constructor() {
    super({
      id: "core:paths",
      description: "Collect PATH contributions and compute final order",
      dependsOn: [],
    });
  }

  async isApplicable(_ctx: ConfigurationContext): Promise<boolean> {
    return true;
  }

  async plan(ctx: ConfigurationContext): Promise<PlanResult> {
    const changes: Array<{
      summary: string;
      details?: string;
      impact?: string[];
      riskLevel?: "low" | "medium" | "high";
    }> = [];

    // Register common paths if not present
    const commons = commonPaths(ctx);
    let added = 0;
    const newPaths: string[] = [];

    for (const c of commons) {
      if (addPathContribution(ctx, c)) {
        added++;
        newPaths.push(c.path);
      }
    }

    if (added > 0) {
      changes.push({
        summary: `Register ${added} common PATH entries`,
        details: `New paths: ${newPaths.join(", ")}`,
        impact: [
          "Shell environment will be updated",
          "New binaries may be available",
        ],
        riskLevel: "low",
      });
    }

    // Check if PATH order needs recomputation
    const resolved = resolvePaths(ctx);
    const prev = readResolvedPaths(ctx) ?? [];
    const pathOrderChanged = JSON.stringify(prev) !== JSON.stringify(resolved);

    if (pathOrderChanged) {
      const addedPaths = resolved.filter((p) => !prev.includes(p));
      const removedPaths = prev.filter((p) => !resolved.includes(p));
      const reorderedPaths = resolved.filter(
        (p, i) => prev[i] && prev[i] !== p,
      );

      let details = "PATH order changes:";
      if (addedPaths.length > 0)
        details += `\n  + Added: ${addedPaths.join(", ")}`;
      if (removedPaths.length > 0)
        details += `\n  - Removed: ${removedPaths.join(", ")}`;
      if (reorderedPaths.length > 0)
        details += `\n  ~ Reordered: ${reorderedPaths.length} paths`;

      changes.push({
        summary: `Recompute PATH order (${resolved.length} total paths)`,
        details,
        impact: [
          "Command resolution order may change",
          "Different versions of tools may be used",
          "Shell initialization will be updated",
        ],
        riskLevel: addedPaths.length > removedPaths.length ? "low" : "medium",
      });
    }

    return this.createDetailedPlanResult(changes);
  }

  async apply(ctx: ConfigurationContext): Promise<ApplyResult> {
    return this.safeExecute(ctx, "PATH resolution", async () => {
      this.logProgress(ctx, "Resolving PATH contributions...");

      // Register common paths
      const commons = commonPaths(ctx);
      for (const c of commons) {
        addPathContribution(ctx, c);
      }

      // Resolve and write paths
      const resolved = resolvePaths(ctx);
      writeResolvedPaths(ctx, resolved);

      this.logProgress(ctx, `Resolved ${resolved.length} paths`);

      return this.createSuccessResult(
        true,
        `Resolved ${resolved.length} PATH entries`,
      );
    }).then((result) => (result.success ? result.result : result));
  }

  async status(ctx: ConfigurationContext): Promise<StatusResult> {
    try {
      const resolved = readResolvedPaths(ctx) ?? [];
      const contributions = listPathContributions(ctx);
      const currentPaths = await this.getCurrentSystemPaths();

      if (resolved.length === 0) {
        return this.createStatusResult("stale", "No paths configured", {
          issues: ["PATH contributions have not been resolved"],
          recommendations: ["Run apply to initialize PATH configuration"],
        });
      }

      // Validate that resolved paths exist and are accessible
      const pathValidation = await this.validatePaths(resolved);
      const issues: string[] = [];
      const recommendations: string[] = [];

      if (pathValidation.missing.length > 0) {
        issues.push(
          `${pathValidation.missing.length} paths don't exist: ${pathValidation.missing.slice(0, 3).join(", ")}${pathValidation.missing.length > 3 ? "..." : ""}`,
        );
        recommendations.push(
          "Review path contributions for invalid directories",
        );
      }

      if (pathValidation.inaccessible.length > 0) {
        issues.push(
          `${pathValidation.inaccessible.length} paths not accessible: ${pathValidation.inaccessible.slice(0, 3).join(", ")}${pathValidation.inaccessible.length > 3 ? "..." : ""}`,
        );
        recommendations.push("Check directory permissions");
      }

      // Check if any resolved path is missing from system PATH
      const systemPathDiff = this.compareSystemPath(resolved, currentPaths);
      if (systemPathDiff.diverged) {
        issues.push(
          "Some resolved PATH entries are missing from your system PATH: " +
            systemPathDiff.missingInSystem.join(", "),
        );
        recommendations.push(
          "Reload your shell or update your PATH to include all managed entries",
        );
      }

      const status = issues.length === 0 ? "applied" : "stale";

      return this.createStatusResult(
        status,
        `Managing ${resolved.length} paths`,
        {
          issues: issues.length > 0 ? issues : undefined,
          recommendations:
            recommendations.length > 0 ? recommendations : undefined,
          current: {
            resolvedPaths: resolved,
            contributions: contributions.length,
            systemPaths: currentPaths.length,
          },
          desired: {
            validPaths: pathValidation.valid,
            totalContributions: contributions.length,
          },
          metadata: {
            pathValidation,
            systemPathDiff,
            version: resolved.length.toString(),
          },
        },
      );
    } catch (error) {
      return this.createStatusResult("failed", "Error checking PATH status", {
        issues: [
          `Status check failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        recommendations: [
          "Check logs for details",
          "Verify file system access",
        ],
      });
    }
  }

  getDetails(ctx: ConfigurationContext): string[] {
    const resolvedPaths = readResolvedPaths(ctx);
    const contributions = listPathContributions(ctx);

    if (!resolvedPaths || resolvedPaths.length === 0) {
      return [
        "PATH Management:",
        "  • No paths configured yet",
        "  • Run apply to initialize PATH configuration",
      ];
    }

    const details = [
      `PATH Management (${resolvedPaths.length} paths, ${contributions.length} contributions):`,
      "",
      "Current PATH order:",
    ];

    resolvedPaths.forEach((pathStr, index) => {
      const contribution = contributions.find((c) => c.path === pathStr);
      const prefix = contribution?.prepend ? "↑" : "↓";
      const lineNumber = (index + 1).toString().padStart(2, " ");
      details.push(`  ${lineNumber}. ${prefix} ${pathStr}`);
    });

    return details;
  }

  // Helper methods for enhanced validation
  private async validatePaths(paths: string[]): Promise<{
    valid: string[];
    missing: string[];
    inaccessible: string[];
  }> {
    const valid: string[] = [];
    const missing: string[] = [];
    const inaccessible: string[] = [];

    for (const path of paths) {
      try {
        await fs.access(path, fs.constants.F_OK);
        try {
          await fs.access(path, fs.constants.R_OK);
          valid.push(path);
        } catch {
          inaccessible.push(path);
        }
      } catch {
        missing.push(path);
      }
    }

    return { valid, missing, inaccessible };
  }

  private async getCurrentSystemPaths(): Promise<string[]> {
    try {
      const { stdout } = await execAsync("echo $PATH");
      return stdout.trim().split(":").filter(Boolean);
    } catch {
      return [];
    }
  }

  private compareSystemPath(
    resolved: string[],
    systemPaths: string[],
  ): {
    diverged: boolean;
    missingInSystem: string[];
  } {
    // Only check that all resolved paths are present in systemPaths
    const missingInSystem = resolved.filter((p) => !systemPaths.includes(p));
    const diverged = missingInSystem.length > 0;
    return {
      diverged,
      missingInSystem,
    };
  }
}

export const pathsModule = new PathsModule();
