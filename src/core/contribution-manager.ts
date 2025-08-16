import type { ConfigurationContext, Platform } from "./types.js";

export interface Contribution<T = any> {
  id: string;
  data: T;
  platforms?: Platform[];
}

export interface ContributionManager<T = any> {
  add(ctx: ConfigurationContext, contribution: Contribution<T>): boolean;
  list(ctx: ConfigurationContext): T[];
  resolve(ctx: ConfigurationContext): T[];
  write(ctx: ConfigurationContext, resolved: T[]): void;
  read(ctx: ConfigurationContext): T[] | undefined;
}

export class GenericContributionManager<T = any>
  implements ContributionManager<T>
{
  private readonly contribKey: string;
  private readonly resolvedKey: string;
  private readonly idExtractor: (item: T) => string;
  private readonly platformFilter?: (item: T) => Platform[] | undefined;

  constructor(
    contribKey: string,
    resolvedKey: string,
    idExtractor: (item: T) => string,
    platformFilter?: (item: T) => Platform[] | undefined,
  ) {
    this.contribKey = contribKey;
    this.resolvedKey = resolvedKey;
    this.idExtractor = idExtractor;
    this.platformFilter = platformFilter;
  }

  add(ctx: ConfigurationContext, contribution: Contribution<T>): boolean {
    if (
      contribution.platforms &&
      !contribution.platforms.includes(ctx.platform)
    ) {
      return false;
    }

    const current = ctx.state.get<Contribution<T>[]>(this.contribKey) ?? [];
    const exists = current.some(
      (c) => this.idExtractor(c.data) === this.idExtractor(contribution.data),
    );

    if (!exists) {
      current.push(contribution);
      ctx.state.set(this.contribKey, current);
      return true;
    }

    return false;
  }

  list(ctx: ConfigurationContext): T[] {
    const contribs = ctx.state.get<Contribution<T>[]>(this.contribKey) ?? [];
    return contribs.map((c) => c.data);
  }

  resolve(ctx: ConfigurationContext): T[] {
    const contribs = ctx.state.get<Contribution<T>[]>(this.contribKey) ?? [];
    const filtered = contribs.filter(
      (c) => !c.platforms || c.platforms.includes(ctx.platform),
    );

    if (this.platformFilter) {
      return filtered
        .filter((c) => {
          const platforms = this.platformFilter!(c.data);
          return !platforms || platforms.includes(ctx.platform);
        })
        .map((c) => c.data);
    }

    return filtered.map((c) => c.data);
  }

  write(ctx: ConfigurationContext, resolved: T[]): void {
    ctx.state.set(this.resolvedKey, resolved);
  }

  read(ctx: ConfigurationContext): T[] | undefined {
    return ctx.state.get<T[]>(this.resolvedKey);
  }
}

// Specialized managers for common contribution types
export class PathContributionManager extends GenericContributionManager<string> {
  constructor() {
    super("contrib.paths", "resolved.paths", (path) => path, undefined);
  }

  resolve(ctx: ConfigurationContext): string[] {
    const contribs =
      ctx.state.get<Contribution<string>[]>("contrib.paths") ?? [];
    const prepend = contribs
      .filter((c) => c.data.startsWith("prepend:"))
      .map((c) => c.data.slice(8));
    const append = contribs
      .filter((c) => !c.data.startsWith("prepend:"))
      .map((c) => c.data);

    const ordered = [...prepend, ...append];
    const deduped: string[] = [];
    for (const p of ordered) {
      if (!deduped.includes(p)) deduped.push(p);
    }
    return deduped;
  }
}

export class AliasContributionManager extends GenericContributionManager<{
  name: string;
  value: string;
}> {
  constructor() {
    super(
      "contrib.aliases",
      "resolved.aliases",
      (alias) => alias.name,
      undefined,
    );
  }

  resolve(ctx: ConfigurationContext): { name: string; value: string }[] {
    const contribs =
      ctx.state.get<Contribution<{ name: string; value: string }>[]>(
        "contrib.aliases",
      ) ?? [];
    const map = new Map<string, { name: string; value: string }>();

    for (const c of contribs) {
      // last writer wins
      map.set(c.data.name, c.data);
    }

    return Array.from(map.values());
  }
}

export class PackageContributionManager
  implements
    ContributionManager<{
      name: string;
      manager: "homebrew" | "apt" | "yum" | "mise";
      language?: string;
      version?: string;
    }>
{
  private readonly contribKey = "contrib.packages";
  private readonly resolvedKey = "resolved.packages";

  add(
    ctx: ConfigurationContext,
    contribution: Contribution<{
      name: string;
      manager: "homebrew" | "apt" | "yum" | "mise";
      language?: string;
      version?: string;
    }>,
  ): boolean {
    if (
      contribution.platforms &&
      !contribution.platforms.includes(ctx.platform)
    ) {
      return false;
    }

    const current =
      ctx.state.get<
        Contribution<{
          name: string;
          manager: "homebrew" | "apt" | "yum" | "mise";
          language?: string;
          version?: string;
        }>[]
      >(this.contribKey) ?? [];
    const exists = current.some(
      (c) =>
        `${c.data.manager}:${c.data.name}` ===
        `${contribution.data.manager}:${contribution.data.name}`,
    );

    if (!exists) {
      current.push(contribution);
      ctx.state.set(this.contribKey, current);
      return true;
    }

    return false;
  }

  list(ctx: ConfigurationContext): {
    name: string;
    manager: "homebrew" | "apt" | "yum" | "mise";
    language?: string;
    version?: string;
  }[] {
    let contribs = ctx.state.get<
      Contribution<{
        name: string;
        manager: "homebrew" | "apt" | "yum" | "mise";
        language?: string;
        version?: string;
      }>[]
    >(this.contribKey);

    // Migration: handle old format
    if (!contribs) {
      const oldContribs = ctx.state.get<
        Array<{
          name: string;
          manager: "homebrew" | "apt" | "yum" | "mise";
          language?: string;
          version?: string;
          platforms?: Platform[];
        }>
      >(this.contribKey);

      if (oldContribs && Array.isArray(oldContribs)) {
        // Migrate old format to new format
        contribs = oldContribs.map((contrib) => ({
          id: `${contrib.manager}:${contrib.name}`,
          data: contrib,
          platforms: contrib.platforms,
        }));
        ctx.state.set(this.contribKey, contribs);
      } else {
        contribs = [];
      }
    }

    return contribs!.map((c) => c.data);
  }

  resolve(ctx: ConfigurationContext): {
    name: string;
    manager: "homebrew" | "apt" | "yum" | "mise";
    language?: string;
    version?: string;
  }[] {
    let contribs = ctx.state.get<
      Contribution<{
        name: string;
        manager: "homebrew" | "apt" | "yum" | "mise";
        language?: string;
        version?: string;
      }>[]
    >("contrib.packages");

    // Migration: handle old format
    if (!contribs) {
      const oldContribs = ctx.state.get<
        Array<{
          name: string;
          manager: "homebrew" | "apt" | "yum" | "mise";
          language?: string;
          version?: string;
          platforms?: Platform[];
        }>
      >("contrib.packages");

      if (oldContribs && Array.isArray(oldContribs)) {
        // Migrate old format to new format
        contribs = oldContribs.map((contrib) => ({
          id: `${contrib.manager}:${contrib.name}`,
          data: contrib,
          platforms: contrib.platforms,
        }));
        ctx.state.set("contrib.packages", contribs);
      } else {
        contribs = [];
      }
    }

    return contribs!
      .filter((c) => !c.platforms || c.platforms.includes(ctx.platform))
      .map((c) => c.data);
  }

  resolveByManager(ctx: ConfigurationContext): Record<
    string,
    Array<{
      name: string;
      manager: "homebrew" | "apt" | "yum" | "mise";
      language?: string;
      version?: string;
    }>
  > {
    let contribs = ctx.state.get<
      Contribution<{
        name: string;
        manager: "homebrew" | "apt" | "yum" | "mise";
        language?: string;
        version?: string;
      }>[]
    >("contrib.packages");

    // Migration: handle old format
    if (!contribs) {
      const oldContribs = ctx.state.get<
        Array<{
          name: string;
          manager: "homebrew" | "apt" | "yum" | "mise";
          language?: string;
          version?: string;
          platforms?: Platform[];
        }>
      >("contrib.packages");

      if (oldContribs && Array.isArray(oldContribs)) {
        // Migrate old format to new format
        contribs = oldContribs.map((contrib) => ({
          id: `${contrib.manager}:${contrib.name}`,
          data: contrib,
          platforms: contrib.platforms,
        }));
        ctx.state.set("contrib.packages", contribs);
      } else {
        contribs = [];
      }
    } else {
      // Check if existing contribs are in old format (missing data property)
      if (contribs.length > 0 && !contribs[0].data) {
        const oldContribs = contribs as any[];
        contribs = oldContribs.map((contrib) => ({
          id: `${contrib.manager}:${contrib.name}`,
          data: contrib,
          platforms: contrib.platforms,
        }));
        ctx.state.set("contrib.packages", contribs);
      }
    }

    const byManager: Record<
      string,
      Array<{
        name: string;
        manager: "homebrew" | "apt" | "yum" | "mise";
        language?: string;
        version?: string;
      }>
    > = {};

    for (const c of contribs!) {
      if (!c.platforms || c.platforms.includes(ctx.platform)) {
        if (!byManager[c.data.manager]) byManager[c.data.manager] = [];
        byManager[c.data.manager].push(c.data);
      }
    }

    return byManager;
  }

  write(
    ctx: ConfigurationContext,
    resolved: {
      name: string;
      manager: "homebrew" | "apt" | "yum" | "mise";
      language?: string;
      version?: string;
    }[],
  ): void {
    ctx.state.set("resolved.packages", resolved);
  }

  read(ctx: ConfigurationContext):
    | {
        name: string;
        manager: "homebrew" | "apt" | "yum" | "mise";
        language?: string;
        version?: string;
      }[]
    | undefined {
    return ctx.state.get<
      {
        name: string;
        manager: "homebrew" | "apt" | "yum" | "mise";
        language?: string;
        version?: string;
      }[]
    >("resolved.packages");
  }

  writeByManager(
    ctx: ConfigurationContext,
    resolved: Record<
      string,
      Array<{
        name: string;
        manager: "homebrew" | "apt" | "yum" | "mise";
        language?: string;
        version?: string;
      }>
    >,
  ): void {
    ctx.state.set("resolved.packages", resolved);
  }

  readByManager(ctx: ConfigurationContext):
    | Record<
        string,
        Array<{
          name: string;
          manager: "homebrew" | "apt" | "yum" | "mise";
          language?: string;
          version?: string;
        }>
      >
    | undefined {
    return ctx.state.get<
      Record<
        string,
        Array<{
          name: string;
          manager: "homebrew" | "apt" | "yum" | "mise";
          language?: string;
          version?: string;
        }>
      >
    >("resolved.packages");
  }
}

// Global instances
export const pathManager = new PathContributionManager();
export const aliasManager = new AliasContributionManager();
export const packageManager = new PackageContributionManager();
