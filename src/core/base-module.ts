import type {
  ModuleResult,
  ConfigurationContext,
  Module,
  PlanResult,
  StatusResult,
  ConfigurationStatus,
} from './types.js';

export interface BaseModuleOptions {
  id: string;
  description?: string;
  priority?: number;
  dependsOn?: string[];
}

export abstract class BaseModule implements Module {
  public readonly id: string;
  public readonly description?: string;
  public readonly priority: number;
  public readonly dependsOn?: string[];
  
  public onStatusChange?: (status: ConfigurationStatus) => void;
  public onProgress?: (message: string) => void;

  constructor(options: BaseModuleOptions) {
    this.id = options.id;
    this.description = options.description;
    this.priority = options.priority ?? 100;
    this.dependsOn = options.dependsOn;
  }

  abstract isApplicable(ctx: ConfigurationContext): Promise<boolean> | boolean;
  abstract plan(ctx: ConfigurationContext): Promise<PlanResult> | PlanResult;
  abstract apply(ctx: ConfigurationContext): Promise<ModuleResult> | ModuleResult;

  status?(ctx: ConfigurationContext): Promise<StatusResult> | StatusResult;
  getDetails?(ctx: ConfigurationContext): Promise<string[]> | string[];

  // Helper methods for common patterns
  protected logProgress(ctx: ConfigurationContext, message: string): void {
    ctx.logger.info({ module: this.id }, message);
    this.onProgress?.(message);
  }

  protected logError(ctx: ConfigurationContext, error: unknown, message?: string): void {
    ctx.logger.error({ module: this.id, error }, message || 'Operation failed');
  }

  protected createSuccessResult(changed: boolean = false, message?: string): ModuleResult {
    return { success: true, changed, message };
  }

  protected createErrorResult(error: unknown, message?: string): ModuleResult {
    return { success: false, error, message };
  }

  protected createPlanResult(changes: Array<{ summary: string; details?: string }>): PlanResult {
    return { changes };
  }
}

