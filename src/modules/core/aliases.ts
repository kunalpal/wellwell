import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../core/types.js';
import {
  addAliasContribution,
  listAliasContributions,
  readResolvedAliases,
  resolveAliases,
  writeResolvedAliases,
  type AliasContribution,
} from '../../core/contrib.js';

export const commonAliases = (ctx: ConfigurationContext): AliasContribution[] => [
  // Use eza if available, fallback to ls
  { name: 'ls', value: 'eza --color=auto' },
  { name: 'll', value: 'eza -la --git' },
  { name: 'la', value: 'eza -a' },
  { name: 'l', value: 'eza' },
  { name: 'lt', value: 'eza --tree' },
  { name: 'lg', value: 'eza -la --git --git-ignore' },
  // platform variants
  { name: 'pbcopy', value: 'tee >/dev/null | pbcopy', platforms: ['macos'] },
  { name: 'pbpaste', value: 'pbpaste', platforms: ['macos'] },
  { name: 'xclip', value: 'xclip -selection clipboard', platforms: ['ubuntu'] },
  { name: 'xsel', value: 'xsel --clipboard --input', platforms: ['ubuntu'] },
  // package managers
  { name: 'brewup', value: 'brew update && brew upgrade && brew cleanup', platforms: ['macos'] },
  { name: 'aptup', value: 'sudo apt update && sudo apt upgrade -y', platforms: ['ubuntu'] },
  { name: 'yumup', value: 'sudo yum update -y', platforms: ['al2'] },
];

export const aliasesModule: ConfigurationModule = {
  id: 'core:aliases',
  description: 'Collect alias contributions and compute final set',
  dependsOn: ['apps:eza'],

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
    if (added > 0) changes.push({ summary: `Register ${added} common aliases` });
    if (changed) changes.push({ summary: 'Recompute aliases' });
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const resolved = resolveAliases(ctx);
      writeResolvedAliases(ctx, resolved);
      return { success: true, changed: true, message: 'Aliases resolved' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const resolved = readResolvedAliases(ctx) ?? [];
    return { status: resolved.length > 0 ? 'applied' : 'stale' };
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
      aliases.forEach(alias => {
        details.push(`  - ${alias.name} → "${alias.value}"`);
      });
      return details;
    } else {
      return ['No aliases configured'];
    }
  },
};


