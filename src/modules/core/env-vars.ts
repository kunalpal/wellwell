import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from "../../core/types.js";
import {
  addEnvVarContribution,
  listEnvVarContributions,
  readResolvedEnvVars,
  resolveEnvVars,
  writeResolvedEnvVars,
  type EnvVarContribution,
} from "../../core/contrib.js";

/**
 * Returns the common environment variable contributions for the given configuration context.
 * Used to ensure standard environment variables are set for the user.
 * @param ctx The configuration context.
 * @returns Array of environment variable contributions.
 */
export const commonEnvVars = (
  ctx: ConfigurationContext,
): EnvVarContribution[] => {
  const contribs: EnvVarContribution[] = [
    // Common environment variables that most users want
    { name: "EDITOR", value: "nvim", platforms: ["macos", "ubuntu", "al2"] },
    { name: "VISUAL", value: "nvim", platforms: ["macos", "ubuntu", "al2"] },
    { name: "PAGER", value: "less", platforms: ["macos", "ubuntu", "al2"] },
    {
      name: "LANG",
      value: "en_US.UTF-8",
      platforms: ["macos", "ubuntu", "al2"],
    },
    {
      name: "LC_ALL",
      value: "en_US.UTF-8",
      platforms: ["macos", "ubuntu", "al2"],
    },
  ];
  return contribs;
};

/**
 * Configuration module for collecting and managing environment variable contributions.
 * Computes the final set of environment variables for the user's shell.
 */
export const envVarsModule: ConfigurationModule = {
  id: "core:env-vars",
  description:
    "Collect environment variable contributions and compute final values",

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    // register common env vars if not present
    const commons = commonEnvVars(ctx);
    let added = 0;
    for (const c of commons) {
      added += addEnvVarContribution(ctx, c) ? 1 : 0;
    }
    const current = listEnvVarContributions(ctx);
    const resolved = resolveEnvVars(ctx);
    const prev = readResolvedEnvVars(ctx) ?? [];
    const changed = JSON.stringify(prev) !== JSON.stringify(resolved);
    const changes = [] as { summary: string }[];
    if (added > 0)
      changes.push({
        summary: `Register ${added} common environment variables`,
      });
    if (changed) changes.push({ summary: "Recompute environment variables" });
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const resolved = resolveEnvVars(ctx);
      writeResolvedEnvVars(ctx, resolved);
      return {
        success: true,
        changed: true,
        message: "Environment variables resolved",
      };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const resolved = readResolvedEnvVars(ctx) ?? [];
    return { status: resolved.length > 0 ? "applied" : "stale" };
  },

  getDetails(ctx): string[] {
    const resolvedEnvVars = readResolvedEnvVars(ctx);
    if (resolvedEnvVars && resolvedEnvVars.length > 0) {
      const details = [
        `Managing ${resolvedEnvVars.length} environment variables:`,
      ];
      resolvedEnvVars.forEach((envVar) => {
        details.push(`  • ${envVar.name}=${envVar.value}`);
      });
      return details;
    } else {
      return ["No environment variables configured"];
    }
  },
};
