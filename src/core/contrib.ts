import type { ConfigurationContext, Platform } from "./types.js";
import { packageManager, type Contribution } from "./contribution-manager.js";

/**
 * Path contribution for PATH management.
 */
export interface PathContribution {
  path: string;
  prepend?: boolean;
  platforms?: Platform[];
}

/**
 * Alias contribution for shell alias management.
 */
export interface AliasContribution {
  name: string;
  value: string;
  platforms?: Platform[];
}

/**
 * Package contribution for package manager integration.
 */
export interface PackageContribution {
  name: string;
  manager: "homebrew" | "apt" | "yum" | "mise";
  platforms?: Platform[];
  /** For mise: language like 'node', 'python' */
  language?: string;
  /** For mise: version like '20.0.0', 'latest' */
  version?: string;
}

/**
 * Shell initialization contribution for shell config management.
 */
export interface ShellInitContribution {
  name: string;
  initCode: string;
  platforms?: Platform[];
}

/**
 * Environment variable contribution for shell environment management.
 */
export interface EnvVarContribution {
  name: string;
  value: string;
  platforms?: Platform[];
}

const CONTRIB_PATHS_KEY = "contrib.paths";
const CONTRIB_ALIASES_KEY = "contrib.aliases";
const CONTRIB_PACKAGES_KEY = "contrib.packages";
const CONTRIB_SHELL_INIT_KEY = "contrib.shell.init";
const CONTRIB_ENV_VARS_KEY = "contrib.env.vars";
const RESOLVED_PATHS_KEY = "resolved.paths";
const RESOLVED_ALIASES_KEY = "resolved.aliases";
const RESOLVED_PACKAGES_KEY = "resolved.packages";
const RESOLVED_SHELL_INIT_KEY = "resolved.shell.init";
const RESOLVED_ENV_VARS_KEY = "resolved.env.vars";

/**
 * Lists all path contributions for the given context.
 * @param ctx The configuration context.
 * @returns Array of path contributions.
 */
export function listPathContributions(
  ctx: ConfigurationContext,
): PathContribution[] {
  return (ctx.state.get<PathContribution[]>(CONTRIB_PATHS_KEY) ?? []).slice();
}

/**
 * Lists all alias contributions for the given context.
 * @param ctx The configuration context.
 * @returns Array of alias contributions.
 */
export function listAliasContributions(
  ctx: ConfigurationContext,
): AliasContribution[] {
  return (
    ctx.state.get<AliasContribution[]>(CONTRIB_ALIASES_KEY) ?? []
  ).slice();
}

/**
 * Adds a path contribution to the context.
 * @param ctx The configuration context.
 * @param contribution The path contribution to add.
 * @returns True if added, false if already present or not applicable.
 */
export function addPathContribution(
  ctx: ConfigurationContext,
  contribution: PathContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform))
    return false;
  const current = ctx.state.get<PathContribution[]>(CONTRIB_PATHS_KEY) ?? [];
  const exists = current.some((c) => c.path === contribution.path);
  if (!exists) {
    current.push(contribution);
    ctx.state.set(CONTRIB_PATHS_KEY, current);
    return true;
  }
  return false;
}

/**
 * Adds an alias contribution to the context.
 * @param ctx The configuration context.
 * @param contribution The alias contribution to add.
 * @returns True if added, false if already present or not applicable.
 */
export function addAliasContribution(
  ctx: ConfigurationContext,
  contribution: AliasContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform))
    return false;
  const current = ctx.state.get<AliasContribution[]>(CONTRIB_ALIASES_KEY) ?? [];
  const exists = current.some(
    (c) => c.name === contribution.name && c.value === contribution.value,
  );
  if (!exists) {
    current.push(contribution);
    ctx.state.set(CONTRIB_ALIASES_KEY, current);
    return true;
  }
  return false;
}

/**
 * Resolves all path contributions for the given context, deduplicated and ordered.
 * @param ctx The configuration context.
 * @returns Array of resolved path strings.
 */
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

/**
 * Resolves all alias contributions for the given context, deduplicated.
 * @param ctx The configuration context.
 * @returns Array of resolved alias contributions.
 */
export function resolveAliases(ctx: ConfigurationContext): AliasContribution[] {
  const contribs = listAliasContributions(ctx);
  const map = new Map<string, AliasContribution>();
  for (const c of contribs) {
    // last writer wins
    map.set(c.name, c);
  }
  return Array.from(map.values());
}

/**
 * Writes resolved paths to the context state.
 * @param ctx The configuration context.
 * @param paths Array of resolved path strings.
 */
export function writeResolvedPaths(
  ctx: ConfigurationContext,
  paths: string[],
): void {
  ctx.state.set(RESOLVED_PATHS_KEY, paths);
}

/**
 * Writes resolved aliases to the context state.
 * @param ctx The configuration context.
 * @param aliases Array of resolved alias contributions.
 */
export function writeResolvedAliases(
  ctx: ConfigurationContext,
  aliases: AliasContribution[],
): void {
  ctx.state.set(RESOLVED_ALIASES_KEY, aliases);
}

/**
 * Reads resolved paths from the context state.
 * @param ctx The configuration context.
 * @returns Array of resolved path strings or undefined.
 */
export function readResolvedPaths(
  ctx: ConfigurationContext,
): string[] | undefined {
  return ctx.state.get<string[]>(RESOLVED_PATHS_KEY);
}

/**
 * Reads resolved aliases from the context state.
 * @param ctx The configuration context.
 * @returns Array of resolved alias contributions or undefined.
 */
export function readResolvedAliases(
  ctx: ConfigurationContext,
): AliasContribution[] | undefined {
  return ctx.state.get<AliasContribution[]>(RESOLVED_ALIASES_KEY);
}

// Package contribution functions
/**
 * Lists all package contributions for the given context.
 * @param ctx The configuration context.
 * @returns Array of package contributions.
 */
export function listPackageContributions(
  ctx: ConfigurationContext,
): PackageContribution[] {
  const contribs =
    ctx.state.get<Contribution<PackageContribution>[]>(CONTRIB_PACKAGES_KEY);
  if (contribs) {
    return contribs.map((c) => c.data);
  }

  // Migration: handle old format
  const oldContribs =
    ctx.state.get<PackageContribution[]>(CONTRIB_PACKAGES_KEY);
  if (oldContribs && Array.isArray(oldContribs)) {
    // Migrate old format to new format
    const newContribs: Contribution<PackageContribution>[] = oldContribs.map(
      (contrib) => ({
        id: `${contrib.manager}:${contrib.name}`,
        data: contrib,
        platforms: contrib.platforms,
      }),
    );
    ctx.state.set(CONTRIB_PACKAGES_KEY, newContribs);
    return oldContribs;
  }

  return [];
}

/**
 * Adds a package contribution to the context.
 * @param ctx The configuration context.
 * @param contribution The package contribution to add.
 * @returns True if added, false if already present or not applicable.
 */
export function addPackageContribution(
  ctx: ConfigurationContext,
  contribution: PackageContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform))
    return false;
  const current =
    ctx.state.get<Contribution<PackageContribution>[]>(CONTRIB_PACKAGES_KEY) ??
    [];
  const exists = current.some(
    (c) =>
      c.data &&
      c.data.name === contribution.name &&
      c.data.manager === contribution.manager &&
      c.data.language === contribution.language &&
      c.data.version === contribution.version,
  );
  if (!exists) {
    current.push({
      id: `${contribution.manager}:${contribution.name}`,
      data: contribution,
      platforms: contribution.platforms,
    });
    ctx.state.set(CONTRIB_PACKAGES_KEY, current);
    return true;
  }
  return false;
}

/**
 * Resolves all package contributions for the given context, grouped by manager.
 * @param ctx The configuration context.
 * @returns Record of manager to array of package contributions.
 */
export function resolvePackages(
  ctx: ConfigurationContext,
): Record<string, PackageContribution[]> {
  return packageManager.resolveByManager(ctx);
}

/**
 * Writes resolved packages to the context state.
 * @param ctx The configuration context.
 * @param packages Record of manager to array of package contributions.
 */
export function writeResolvedPackages(
  ctx: ConfigurationContext,
  packages: Record<string, PackageContribution[]>,
): void {
  packageManager.writeByManager(ctx, packages);
}

/**
 * Reads resolved packages from the context state.
 * @param ctx The configuration context.
 * @returns Record of manager to array of package contributions or undefined.
 */
export function readResolvedPackages(
  ctx: ConfigurationContext,
): Record<string, PackageContribution[]> | undefined {
  return packageManager.readByManager(ctx);
}

// Shell init contribution functions
/**
 * Lists all shell init contributions for the given context.
 * @param ctx The configuration context.
 * @returns Array of shell init contributions.
 */
export function listShellInitContributions(
  ctx: ConfigurationContext,
): ShellInitContribution[] {
  return (
    ctx.state.get<ShellInitContribution[]>(CONTRIB_SHELL_INIT_KEY) ?? []
  ).slice();
}

/**
 * Adds a shell init contribution to the context.
 * @param ctx The configuration context.
 * @param contribution The shell init contribution to add.
 * @returns True if added, false if already present or not applicable.
 */
export function addShellInitContribution(
  ctx: ConfigurationContext,
  contribution: ShellInitContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform))
    return false;
  const current =
    ctx.state.get<ShellInitContribution[]>(CONTRIB_SHELL_INIT_KEY) ?? [];
  const exists = current.some((c) => c.name === contribution.name);
  if (!exists) {
    current.push(contribution);
    ctx.state.set(CONTRIB_SHELL_INIT_KEY, current);
    return true;
  }
  return false;
}

/**
 * Resolves all shell init contributions for the given context.
 * @param ctx The configuration context.
 * @returns Array of shell init contributions.
 */
export function resolveShellInit(
  ctx: ConfigurationContext,
): ShellInitContribution[] {
  return listShellInitContributions(ctx);
}

/**
 * Writes resolved shell init contributions to the context state.
 * @param ctx The configuration context.
 * @param shellInit Array of shell init contributions.
 */
export function writeResolvedShellInit(
  ctx: ConfigurationContext,
  shellInit: ShellInitContribution[],
): void {
  ctx.state.set(RESOLVED_SHELL_INIT_KEY, shellInit);
}

/**
 * Reads resolved shell init contributions from the context state.
 * @param ctx The configuration context.
 * @returns Array of resolved shell init contributions or undefined.
 */
export function readResolvedShellInit(
  ctx: ConfigurationContext,
): ShellInitContribution[] | undefined {
  return ctx.state.get<ShellInitContribution[]>(RESOLVED_SHELL_INIT_KEY);
}

// Environment variable contribution functions
/**
 * Lists all environment variable contributions for the given context.
 * @param ctx The configuration context.
 * @returns Array of environment variable contributions.
 */
export function listEnvVarContributions(
  ctx: ConfigurationContext,
): EnvVarContribution[] {
  return (
    ctx.state.get<EnvVarContribution[]>(CONTRIB_ENV_VARS_KEY) ?? []
  ).slice();
}

/**
 * Adds an environment variable contribution to the context.
 * @param ctx The configuration context.
 * @param contribution The environment variable contribution to add.
 * @returns True if added, false if already present or not applicable.
 */
export function addEnvVarContribution(
  ctx: ConfigurationContext,
  contribution: EnvVarContribution,
): boolean {
  if (contribution.platforms && !contribution.platforms.includes(ctx.platform))
    return false;
  const current =
    ctx.state.get<EnvVarContribution[]>(CONTRIB_ENV_VARS_KEY) ?? [];
  const exists = current.some((c) => c.name === contribution.name);
  if (!exists) {
    current.push(contribution);
    ctx.state.set(CONTRIB_ENV_VARS_KEY, current);
    return true;
  }
  return false;
}

/**
 * Resolves all environment variable contributions for the given context, deduplicated.
 * @param ctx The configuration context.
 * @returns Array of resolved environment variable contributions.
 */
export function resolveEnvVars(
  ctx: ConfigurationContext,
): EnvVarContribution[] {
  const contribs = listEnvVarContributions(ctx);
  const map = new Map<string, EnvVarContribution>();
  for (const c of contribs) {
    // last writer wins
    map.set(c.name, c);
  }
  return Array.from(map.values());
}

/**
 * Writes resolved environment variables to the context state.
 * @param ctx The configuration context.
 * @param envVars Array of resolved environment variable contributions.
 */
export function writeResolvedEnvVars(
  ctx: ConfigurationContext,
  envVars: EnvVarContribution[],
): void {
  ctx.state.set(RESOLVED_ENV_VARS_KEY, envVars);
}

/**
 * Reads resolved environment variables from the context state.
 * @param ctx The configuration context.
 * @returns Array of resolved environment variable contributions or undefined.
 */
export function readResolvedEnvVars(
  ctx: ConfigurationContext,
): EnvVarContribution[] | undefined {
  return ctx.state.get<EnvVarContribution[]>(RESOLVED_ENV_VARS_KEY);
}
