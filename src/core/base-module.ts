import type {
  ModuleResult,
  ConfigurationContext,
  Module,
  PlanResult,
  StatusResult,
  ConfigurationStatus,
  ModuleStateSnapshot,
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

  // State comparison helper methods
  protected createStateChecksum(state: any): string {
    const stateStr = typeof state === 'string' ? state : JSON.stringify(state, null, 2);
    return require('node:crypto').createHash('sha256').update(stateStr).digest('hex').substring(0, 16);
  }

  protected createStateSnapshot(state: any): ModuleStateSnapshot {
    return {
      moduleId: this.id,
      timestamp: new Date(),
      checksum: this.createStateChecksum(state),
      state,
    };
  }

  protected defaultStateComparison(beforeState: ModuleStateSnapshot, afterState: ModuleStateSnapshot): boolean {
    return beforeState.checksum !== afterState.checksum;
  }

  // Implement optional state comparison methods from Module interface
  async captureState(ctx: ConfigurationContext): Promise<ModuleStateSnapshot> {
    let state: any;
    
    try {
      // Get current plan and content that would be generated
      const plan = await this.plan(ctx);
      let content: string | undefined;
      
      // Try to get content if module has template method
      if ('template' in this) {
        content = await (this as any).template(ctx);
      }
      
      // If module has status method, include its info
      if (this.status) {
        const status = await this.status(ctx);
        state = {
          status: status.status,
          details: status.details,
          metadata: status.metadata,
          plan,
          content,
        };
      } else {
        // Fallback: capture basic module info
        state = {
          moduleId: this.id,
          applicable: await this.isApplicable(ctx),
          // Don't include timestamp as it causes unnecessary differences
          plan,
          content,
        };
      }
    } catch (error) {
      ctx.logger.warn({ module: this.id, error }, 'Failed to capture state, using fallback');
      state = {
        moduleId: this.id,
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
        // Don't include timestamp as it causes unnecessary differences
      };
    }

    return this.createStateSnapshot(state);
  }

  compareState(beforeState: ModuleStateSnapshot, afterState: ModuleStateSnapshot): boolean {
    // If both states have the same checksum, they're identical
    if (beforeState.checksum === afterState.checksum) {
      return false;
    }

    // Check if the generated content differs (if available)
    const beforeContent = beforeState.state?.content;
    const afterContent = afterState.state?.content;
    if (beforeContent !== undefined && afterContent !== undefined && beforeContent !== afterContent) {
      return true;
    }

    // Check if plan has different number of changes or different change summaries
    const beforePlan = beforeState.state?.plan;
    const afterPlan = afterState.state?.plan;
    
    if (beforePlan && afterPlan) {
      // If both plans have no changes, states are the same
      if (beforePlan.changes.length === 0 && afterPlan.changes.length === 0) {
        return false;
      }
      
      // Compare number of changes
      if (beforePlan.changes.length !== afterPlan.changes.length) {
        return true;
      }
      
      // Compare change summaries
      const beforeChanges = beforePlan.changes.map((c: { summary: string }) => c.summary).sort().join('\n');
      const afterChanges = afterPlan.changes.map((c: { summary: string }) => c.summary).sort().join('\n');
      if (beforeChanges !== afterChanges) {
        return true;
      }
    }

    // For non-content, non-plan differences, be more conservative
    // Only flag as different if there are clear material differences
    return false;
  }

  async getExpectedState(ctx: ConfigurationContext): Promise<ModuleStateSnapshot> {
    try {
      // Create expected state based on plan and current status
      const plan = await this.plan(ctx);
      const status = this.status ? await this.status(ctx) : undefined;
      
      const expectedState = {
        moduleId: this.id,
        planChanges: plan.changes.length,
        hasChanges: plan.changes.length > 0,
        changes: plan.changes.map((c: { summary: string }) => c.summary),
        // Don't include timestamp in expected state as it causes unnecessary differences
        status: status?.status ?? 'applied',
        details: status?.details,
        plan,
      };

      return this.createStateSnapshot(expectedState);
    } catch (error) {
      ctx.logger.warn({ module: this.id, error }, 'Failed to get expected state');
      return {
        moduleId: this.id,
        timestamp: new Date(),
        checksum: 'error',
        state: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}
