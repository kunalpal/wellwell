import path from 'node:path';
import os from 'node:os';

import { detectPlatform } from './platform.js';
import { createLogger } from './logger.js';
import { JsonFileStateStore } from './state.js';
import { StateComparison } from './state-comparison.js';
import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  ConfigurationStatus,
  PlanResult,
  StatusResult,
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

  public buildContext(): ConfigurationContext {
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
        // First capture initial state
        const beforeState = await mod.captureState?.(ctx);
        const expectedState = await mod.getExpectedState?.(ctx);

        // Use state comparison to record apply execution
        const res = await StateComparison.recordApplyExecution(ctx, mod, async () => {
          return await mod.apply(ctx);
        });

        // Capture final state and store metadata
        const afterState = await mod.captureState?.(ctx);
        
        if (beforeState && afterState && expectedState) {
          const metadata = {
            moduleId: mod.id,
            appliedAt: new Date(),
            beforeState,
            afterState,
            expectedState,
            planChecksum: expectedState.checksum,
          };
          StateComparison.storeApplyMetadata(ctx, metadata);
        }

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
      
      try {
        // Try module status method first if available
        if (mod.status) {
          try {
            const status = await mod.status(ctx);
            result[mod.id] = status.status;
          } catch (statusError) {
            // Fall back to plan-based checking when status fails
            try {
              const plan = await mod.plan(ctx);
              result[mod.id] = plan.changes.length > 0 ? 'stale' : 'applied';
            } catch (planError) {
              ctx.logger.error({ module: mod.id, error: planError }, 'Both status and plan failed');
              result[mod.id] = 'stale'; // Default to stale on error
            }
          }
        } else {
          // Fall back to plan-based checking when no status method
          const plan = await mod.plan(ctx);
          result[mod.id] = plan.changes.length > 0 ? 'stale' : 'applied';
        }
      } catch (error) {
        ctx.logger.error({ module: mod.id, error }, 'Status check failed');
        result[mod.id] = 'stale'; // Default to stale on error
      }
    }
    
    await ctx.state.flush();
    return result;
  }

  async detailedStatuses(selectedIds?: string[]): Promise<Record<string, StatusResult>> {
    const ctx = this.buildContext();
    const graph = this.topoSortModules();
    const result: Record<string, StatusResult> = {};
    
    for (const mod of graph) {
      if (selectedIds && !selectedIds.includes(mod.id)) continue;
      if (!(await mod.isApplicable(ctx))) continue;
      
      try {
        // Use robust status checking with state comparison
        result[mod.id] = await StateComparison.getRobustStatus(ctx, mod);
      } catch (error) {
        ctx.logger.error({ module: mod.id, error }, 'Detailed status check failed');
        result[mod.id] = {
          status: 'stale',
          message: 'Status check failed',
          details: {
            issues: [error instanceof Error ? error.message : String(error)],
          },
          metadata: {
            lastChecked: new Date(),
          },
        };
      }
    }
    
    await ctx.state.flush();
    return result;
  }
}
