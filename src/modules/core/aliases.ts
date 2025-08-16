import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from "../../core/types.js";
import {
  addAliasContribution,
  listAliasContributions,
  readResolvedAliases,
  resolveAliases,
  writeResolvedAliases,
  type AliasContribution,
} from "../../core/contrib.js";

export const commonAliases = (
  ctx: ConfigurationContext,
): AliasContribution[] => [
  // Use eza if available, fallback to ls
  { name: "ls", value: "eza" },
  { name: "ll", value: "eza -la --git" },
  { name: "la", value: "eza -a" },
  { name: "l", value: "eza" },
  { name: "lt", value: "eza --tree" },
  { name: "lg", value: "eza -la --git --git-ignore" },
  // platform variants
  { name: "pbcopy", value: "tee >/dev/null | pbcopy", platforms: ["macos"] },
  { name: "pbpaste", value: "pbpaste", platforms: ["macos"] },
  { name: "xclip", value: "xclip -selection clipboard", platforms: ["ubuntu"] },
  { name: "xsel", value: "xsel --clipboard --input", platforms: ["ubuntu"] },
  // package managers
  {
    name: "brewup",
    value: "brew update && brew upgrade && brew cleanup",
    platforms: ["macos"],
  },
  {
    name: "aptup",
    value: "sudo apt update && sudo apt upgrade -y",
    platforms: ["ubuntu"],
  },
  { name: "yumup", value: "sudo yum update -y", platforms: ["al2"] },
];

export const aliasesModule: ConfigurationModule = {
  id: "core:aliases",
  description: "Collect alias contributions and compute final set",
  dependsOn: ["apps:eza"],

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const commons = commonAliases(ctx);
    let added = 0;
    for (const a of commons) {
      added += addAliasContribution(ctx, a) ? 1 : 0;
    }
    const current = listAliasContributions(ctx);
    const resolved = resolveAliases(ctx);
    const prev = readResolvedAliases(ctx) ?? [];
    const changed = JSON.stringify(prev) !== JSON.stringify(resolved);
    const changes = [] as { summary: string }[];
    if (added > 0)
      changes.push({ summary: `Register ${added} common aliases` });
    if (changed) changes.push({ summary: "Recompute aliases" });
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const resolved = resolveAliases(ctx);
      writeResolvedAliases(ctx, resolved);
      return { success: true, changed: true, message: "Aliases resolved" };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    try {
      // Get current resolved aliases
      const currentResolved = readResolvedAliases(ctx) ?? [];

      // If no aliases are resolved, we need to apply
      if (currentResolved.length === 0) {
        return {
          status: "stale",
          message: "No aliases configured",
          details: {
            issues: ["No aliases have been resolved"],
            recommendations: ["Run apply to configure aliases"],
          },
        };
      }

      // Compute expected aliases from current contributions
      const expectedResolved = resolveAliases(ctx);

      // Compare current vs expected
      if (
        JSON.stringify(currentResolved) === JSON.stringify(expectedResolved)
      ) {
        return {
          status: "applied",
          message: `${currentResolved.length} aliases configured`,
          metadata: {
            lastChecked: new Date(),
          },
        };
      }

      // Generate diff for detailed reporting
      const diff = generateAliasDiff(currentResolved, expectedResolved);

      return {
        status: "stale",
        message: "Alias configuration needs update",
        details: {
          current: currentResolved,
          desired: expectedResolved,
          diff: diff,
          issues: ["Current aliases differ from expected aliases"],
          recommendations: ["Run apply to update alias configuration"],
        },
      };
    } catch (error) {
      return {
        status: "failed",
        message: "Error checking alias status",
        details: {
          issues: [`Error: ${error}`],
          recommendations: ["Check logs for details"],
        },
      };
    }
  },

  getDetails(ctx): string[] {
    // Try to get resolved aliases first, fallback to computing them
    let aliases = readResolvedAliases(ctx);
    if (!aliases || aliases.length === 0) {
      // If no resolved aliases, compute them from contributions
      aliases = resolveAliases(ctx);
    }

    if (aliases && aliases.length > 0) {
      const details = [`Managing ${aliases.length} aliases:`];
      aliases.forEach((alias) => {
        details.push(`  - ${alias.name} → "${alias.value}"`);
      });
      return details;
    } else {
      return ["No aliases configured"];
    }
  },
};

// Helper function to generate alias diff
function generateAliasDiff(
  current: AliasContribution[],
  expected: AliasContribution[],
): string[] {
  const currentMap = new Map(current.map((a) => [a.name, a.value]));
  const expectedMap = new Map(expected.map((a) => [a.name, a.value]));
  const diff: string[] = [];

  // Check for changes and additions
  for (const [name, expectedValue] of expectedMap) {
    const currentValue = currentMap.get(name);
    if (currentValue !== expectedValue) {
      diff.push(`Alias ${name}:`);
      if (currentValue) diff.push(`- "${currentValue}"`);
      diff.push(`+ "${expectedValue}"`);
    }
  }

  // Check for removals
  for (const [name, currentValue] of currentMap) {
    if (!expectedMap.has(name)) {
      diff.push(`Alias ${name}:`);
      diff.push(`- "${currentValue}"`);
      diff.push(`+ (removed)`);
    }
  }

  return diff;
}
