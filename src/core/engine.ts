import path from 'node:path';
import os from 'node:os';

import { detectPlatform } from './platform.js';
import { createLogger } from './logger.js';
import { JsonFileStateStore } from './state.js';
import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  ConfigurationStatus,
  PlanResult,
} from './types.js';

export interface EngineOptions {
  verbose?: boolean;
  prettyLogs?: boolean;
  stateFilePath?: string;
  hooks?: EngineHooks;
}

export interface EngineHooks {
  onModuleStatusChange?: (payload: { id: string; status: ConfigurationStatus }) => void;
  onModuleMessage?: (payload: { id: string; message: string }) => void;
}

export class Engine {
  private readonly modules: Map<string, ConfigurationModule> = new Map();
  private readonly options: Required<Omit<EngineOptions, 'hooks'>> & Pick<EngineOptions, 'hooks'>;
  private readonly hooks?: EngineHooks;

  constructor(options?: EngineOptions) {
    this.options = {
      verbose: options?.verbose ?? false,
      prettyLogs: options?.prettyLogs ?? true,
      stateFilePath:
        options?.stateFilePath ?? path.join(os.homedir(), '.wellwell', 'state.json'),
      hooks: options?.hooks,
    };
    this.hooks = this.options.hooks;
  }

  register(module: ConfigurationModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module with id ${module.id} already registered`);
    }
    this.modules.set(module.id, module);
  }

  private buildContext(): ConfigurationContext {
    const logger = createLogger({ pretty: this.options.prettyLogs, verbose: this.options.verbose });
    const state = new JsonFileStateStore(this.options.stateFilePath);
    return {
      platform: detectPlatform(),
      homeDir: os.homedir(),
      cwd: process.cwd(),
      isCI: Boolean(process.env.CI),
      logger,
      state,
    };
  }

  private topoSortModules(): ConfigurationModule[] {
    const modules = Array.from(this.modules.values());
    const idToModule = new Map(modules.map((m) => [m.id, m]));
    const tempMark = new Set<string>();
    const permMark = new Set<string>();
    const result: ConfigurationModule[] = [];

    const visit = (module: ConfigurationModule): void => {
      if (permMark.has(module.id)) return;
      if (tempMark.has(module.id)) {
        throw new Error(`Circular dependency detected at ${module.id}`);
      }
      tempMark.add(module.id);
      const deps = module.dependsOn ?? [];
      for (const depId of deps) {
        const dep = idToModule.get(depId);
        if (!dep) throw new Error(`Missing dependency ${depId} for ${module.id}`);
        visit(dep);
      }
      permMark.add(module.id);
      tempMark.delete(module.id);
      result.push(module);
    };

    // sort by priority, then id for determinism before DFS to encourage stable order
    modules
      .slice()
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.id.localeCompare(b.id))
      .forEach(visit);

    return result;
  }

  async plan(selectedIds?: string[]): Promise<Record<string, PlanResult>> {
    const ctx = this.buildContext();
    const graph = this.topoSortModules();
    const results: Record<string, PlanResult> = {};

    for (const mod of graph) {
      if (selectedIds && !selectedIds.includes(mod.id)) continue;
      if (!(await mod.isApplicable(ctx))) continue;
      const plan = await mod.plan(ctx);
      results[mod.id] = plan;
    }

    await ctx.state.flush();
    return results;
  }

  async apply(selectedIds?: string[]): Promise<Record<string, ApplyResult>> {
    const ctx = this.buildContext();
    const graph = this.topoSortModules();
    const results: Record<string, ApplyResult> = {};
    const failedIds = new Set<string>();

    for (const mod of graph) {
      if (selectedIds && !selectedIds.includes(mod.id)) continue;
      // Skip if any dependency failed in this run
      if ((mod.dependsOn ?? []).some((dep) => failedIds.has(dep))) {
        mod.onStatusChange?.('skipped');
        ctx.logger.warn({ module: mod.id }, 'Skipped due to failed dependency');
        results[mod.id] = { success: true, changed: false, message: 'skipped' };
        continue;
      }
      if (!(await mod.isApplicable(ctx))) {
        ctx.logger.debug({ module: mod.id }, 'Skipping: not applicable');
        continue;
      }
      this.hooks?.onModuleStatusChange?.({ id: mod.id, status: 'pending' });
      const prevOnStatus = mod.onStatusChange;
      mod.onStatusChange = (status) => {
        this.hooks?.onModuleStatusChange?.({ id: mod.id, status });
        prevOnStatus?.(status);
      };
      try {
        const res = await mod.apply(ctx);
        results[mod.id] = res;
        mod.onStatusChange?.(res.success ? 'applied' : 'failed');
      } catch (error) {
        results[mod.id] = { success: false, error, message: 'exception' };
        failedIds.add(mod.id);
        mod.onStatusChange?.('failed');
        ctx.logger.error({ module: mod.id, error }, 'Apply failed');
        // continue to allow non-dependent modules to proceed
      }
    }

    await ctx.state.flush();
    return results;
  }

  async statuses(selectedIds?: string[]): Promise<Record<string, ConfigurationStatus>> {
    const ctx = this.buildContext();
    const graph = this.topoSortModules();
    const result: Record<string, ConfigurationStatus> = {};
    for (const mod of graph) {
      if (selectedIds && !selectedIds.includes(mod.id)) continue;
      if (!(await mod.isApplicable(ctx))) continue;
      const status = await mod.status?.(ctx);
      result[mod.id] = status?.status ?? 'idle';
    }
    return result;
  }
}


