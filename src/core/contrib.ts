import type { ConfigurationContext, Platform } from './types.js';

export interface PathContribution {
  path: string;
  prepend?: boolean;
  platforms?: Platform[];
}

export interface AliasContribution {
  name: string;
  value: string;
  platforms?: Platform[];
}

const CONTRIB_PATHS_KEY = 'contrib.paths';
const CONTRIB_ALIASES_KEY = 'contrib.aliases';
const RESOLVED_PATHS_KEY = 'resolved.paths';
const RESOLVED_ALIASES_KEY = 'resolved.aliases';

export function listPathContributions(ctx: ConfigurationContext): PathContribution[] {
  return (ctx.state.get<PathContribution[]>(CONTRIB_PATHS_KEY) ?? []).slice();
}

export function listAliasContributions(ctx: ConfigurationContext): AliasContribution[] {
  return (ctx.state.get<AliasContribution[]>(CONTRIB_ALIASES_KEY) ?? []).slice();
}

export function addPathContribution(
  ctx: ConfigurationContext,
  contribution: PathContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform)) return false;
  const current = ctx.state.get<PathContribution[]>(CONTRIB_PATHS_KEY) ?? [];
  const exists = current.some((c) => c.path === contribution.path);
  if (!exists) {
    current.push(contribution);
    ctx.state.set(CONTRIB_PATHS_KEY, current);
    return true;
  }
  return false;
}

export function addAliasContribution(
  ctx: ConfigurationContext,
  contribution: AliasContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform)) return false;
  const current = ctx.state.get<AliasContribution[]>(CONTRIB_ALIASES_KEY) ?? [];
  const exists = current.some((c) => c.name === contribution.name && c.value === contribution.value);
  if (!exists) {
    current.push(contribution);
    ctx.state.set(CONTRIB_ALIASES_KEY, current);
    return true;
  }
  return false;
}

export function resolvePaths(ctx: ConfigurationContext): string[] {
  const contribs = listPathContributions(ctx);
  const prepend = contribs.filter((c) => c.prepend).map((c) => c.path);
  const append = contribs.filter((c) => !c.prepend).map((c) => c.path);
  const ordered = [...prepend, ...append];
  const deduped: string[] = [];
  for (const p of ordered) {
    if (!deduped.includes(p)) deduped.push(p);
  }
  return deduped;
}

export function resolveAliases(ctx: ConfigurationContext): AliasContribution[] {
  const contribs = listAliasContributions(ctx);
  const map = new Map<string, AliasContribution>();
  for (const c of contribs) {
    // last writer wins
    map.set(c.name, c);
  }
  return Array.from(map.values());
}

export function writeResolvedPaths(ctx: ConfigurationContext, paths: string[]): void {
  ctx.state.set(RESOLVED_PATHS_KEY, paths);
}

export function writeResolvedAliases(ctx: ConfigurationContext, aliases: AliasContribution[]): void {
  ctx.state.set(RESOLVED_ALIASES_KEY, aliases);
}

export function readResolvedPaths(ctx: ConfigurationContext): string[] | undefined {
  return ctx.state.get<string[]>(RESOLVED_PATHS_KEY);
}

export function readResolvedAliases(ctx: ConfigurationContext): AliasContribution[] | undefined {
  return ctx.state.get<AliasContribution[]>(RESOLVED_ALIASES_KEY);
}


