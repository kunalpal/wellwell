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

export interface PackageContribution {
  name: string;
  manager: 'homebrew' | 'apt' | 'yum' | 'mise';
  platforms?: Platform[];
  /** For mise: language like 'node', 'python' */
  language?: string;
  /** For mise: version like '20.0.0', 'latest' */
  version?: string;
}

export interface ShellInitContribution {
  name: string;
  initCode: string;
  platforms?: Platform[];
}

const CONTRIB_PATHS_KEY = 'contrib.paths';
const CONTRIB_ALIASES_KEY = 'contrib.aliases';
const CONTRIB_PACKAGES_KEY = 'contrib.packages';
const CONTRIB_SHELL_INIT_KEY = 'contrib.shell.init';
const RESOLVED_PATHS_KEY = 'resolved.paths';
const RESOLVED_ALIASES_KEY = 'resolved.aliases';
const RESOLVED_PACKAGES_KEY = 'resolved.packages';
const RESOLVED_SHELL_INIT_KEY = 'resolved.shell.init';

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

// Package contribution functions
export function listPackageContributions(ctx: ConfigurationContext): PackageContribution[] {
  return (ctx.state.get<PackageContribution[]>(CONTRIB_PACKAGES_KEY) ?? []).slice();
}

export function addPackageContribution(
  ctx: ConfigurationContext,
  contribution: PackageContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform)) return false;
  const current = ctx.state.get<PackageContribution[]>(CONTRIB_PACKAGES_KEY) ?? [];
  const exists = current.some((c) => 
    c.name === contribution.name && 
    c.manager === contribution.manager &&
    c.language === contribution.language &&
    c.version === contribution.version
  );
  if (!exists) {
    current.push(contribution);
    ctx.state.set(CONTRIB_PACKAGES_KEY, current);
    return true;
  }
  return false;
}

export function resolvePackages(ctx: ConfigurationContext): Record<string, PackageContribution[]> {
  const contribs = listPackageContributions(ctx);
  const byManager: Record<string, PackageContribution[]> = {};
  for (const c of contribs) {
    if (!byManager[c.manager]) byManager[c.manager] = [];
    byManager[c.manager].push(c);
  }
  return byManager;
}

export function writeResolvedPackages(ctx: ConfigurationContext, packages: Record<string, PackageContribution[]>): void {
  ctx.state.set(RESOLVED_PACKAGES_KEY, packages);
}

export function readResolvedPackages(ctx: ConfigurationContext): Record<string, PackageContribution[]> | undefined {
  return ctx.state.get<Record<string, PackageContribution[]>>(RESOLVED_PACKAGES_KEY);
}

// Shell init contribution functions
export function listShellInitContributions(ctx: ConfigurationContext): ShellInitContribution[] {
  return (ctx.state.get<ShellInitContribution[]>(CONTRIB_SHELL_INIT_KEY) ?? []).slice();
}

export function addShellInitContribution(
  ctx: ConfigurationContext,
  contribution: ShellInitContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform)) return false;
  const current = ctx.state.get<ShellInitContribution[]>(CONTRIB_SHELL_INIT_KEY) ?? [];
  const exists = current.some((c) => c.name === contribution.name);
  if (!exists) {
    current.push(contribution);
    ctx.state.set(CONTRIB_SHELL_INIT_KEY, current);
    return true;
  }
  return false;
}

export function resolveShellInit(ctx: ConfigurationContext): ShellInitContribution[] {
  return listShellInitContributions(ctx);
}

export function writeResolvedShellInit(ctx: ConfigurationContext, shellInit: ShellInitContribution[]): void {
  ctx.state.set(RESOLVED_SHELL_INIT_KEY, shellInit);
}

export function readResolvedShellInit(ctx: ConfigurationContext): ShellInitContribution[] | undefined {
  return ctx.state.get<ShellInitContribution[]>(RESOLVED_SHELL_INIT_KEY);
}


