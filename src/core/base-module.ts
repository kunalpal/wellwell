import type {
  ModuleResult,
  ConfigurationContext,
  Module,
  PlanResult,
  StatusResult,
  ConfigurationStatus,
  ModuleStateSnapshot,
} from './types.js';
import { createHash } from 'node:crypto';

export interface BaseModuleOptions {
  id: string;
  description?: string;
  dependsOn?: string[];
}

export abstract class BaseModule implements Module {
  public readonly id: string;
  public readonly description?: string;
  public readonly dependsOn?: string[];
  
  public onStatusChange?: (status: ConfigurationStatus) => void;
  public onProgress?: (message: string) => void;

  constructor(options: BaseModuleOptions) {
    this.id = options.id;
    this.description = options.description;
    this.dependsOn = options.dependsOn;
  }

  abstract isApplicable(ctx: ConfigurationContext): Promise<boolean> | boolean;
  abstract plan(ctx: ConfigurationContext): Promise<PlanResult> | PlanResult;
  abstract apply(ctx: ConfigurationContext): Promise<ModuleResult> | ModuleResult;

  status?(ctx: ConfigurationContext): Promise<StatusResult> | StatusResult;
  getDetails?(ctx: ConfigurationContext): Promise<string[]> | string[];

  // Enhanced validation methods
  validate?(ctx: ConfigurationContext): Promise<{ valid: boolean; issues: string[]; recommendations: string[] }> | { valid: boolean; issues: string[]; recommendations: string[] };
  getHealthScore?(ctx: ConfigurationContext): Promise<number> | number; // 0-100 score
  getDependencyImpact?(ctx: ConfigurationContext): Promise<string[]> | string[]; // List of modules that would be affected

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

  // Enhanced status result helpers
  protected createStatusResult(
    status: ConfigurationStatus, 
    message: string, 
    options?: {
      issues?: string[];
      recommendations?: string[];
      current?: any;
      desired?: any;
      diff?: string[];
      metadata?: any;
    }
  ): StatusResult {
    const result: StatusResult = { status, message };
    
    if (options) {
      if (options.issues || options.recommendations || options.current || options.desired || options.diff) {
        result.details = {
          current: options.current,
          desired: options.desired,
          diff: options.diff,
          issues: options.issues,
          recommendations: options.recommendations,
        };
      }
      
      if (options.metadata) {
        result.metadata = {
          lastChecked: new Date(),
          ...options.metadata,
        };
      }
    }
    
    return result;
  }

  // Enhanced plan result helpers
  protected createDetailedPlanResult(changes: Array<{
    summary: string;
    details?: string;
    impact?: string[];
    riskLevel?: 'low' | 'medium' | 'high';
    dependsOn?: string[];
    affects?: string[];
  }>): PlanResult {
    return { changes };
  }

  // Validation helpers
  protected async validateConfiguration(ctx: ConfigurationContext): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
    score: number;
  }> {
    try {
      const issues: string[] = [];
      const recommendations: string[] = [];
      
      // Check if module is applicable
      const applicable = await this.isApplicable(ctx);
      if (!applicable) {
        issues.push(`Module not applicable for platform ${ctx.platform}`);
        recommendations.push('Check platform compatibility');
        return { valid: false, issues, recommendations, score: 0 };
      }
      
      // Check dependencies
      if (this.dependsOn) {
        for (const dep of this.dependsOn) {
          // This would need to be integrated with the engine to check actual dependency status
          // For now, just note the dependency
          recommendations.push(`Ensure dependency '${dep}' is satisfied`);
        }
      }
      
      // Get current status for additional validation
      if (this.status) {
        const status = await this.status(ctx);
        if (status.status === 'failed') {
          issues.push('Module status check failed');
          if (status.details?.issues) {
            issues.push(...status.details.issues);
          }
          if (status.details?.recommendations) {
            recommendations.push(...status.details.recommendations);
          }
        }
      }
      
      // Calculate basic health score
      const score = this.calculateHealthScore(issues, recommendations);
      
      return {
        valid: issues.length === 0,
        issues,
        recommendations,
        score,
      };
    } catch (error) {
      return {
        valid: false,
        issues: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
        recommendations: ['Check module configuration and logs'],
        score: 0,
      };
    }
  }

  private calculateHealthScore(issues: string[], recommendations: string[]): number {
    // Simple scoring algorithm
    let score = 100;
    score -= issues.length * 20; // Each issue reduces score by 20
    score -= recommendations.length * 5; // Each recommendation reduces score by 5
    return Math.max(0, score);
  }

  // Diff generation helper
  protected generateDiff(current: string, desired: string): string[] {
    const currentLines = current.split('\n');
    const desiredLines = desired.split('\n');
    const diff: string[] = [];
    
    const maxLines = Math.max(currentLines.length, desiredLines.length);
    let contextLines = 0;
    const maxContextLines = 3;
    
    for (let i = 0; i < maxLines; i++) {
      const currentLine = currentLines[i] || '';
      const desiredLine = desiredLines[i] || '';
      
      if (currentLine !== desiredLine) {
        // Show some context before the difference
        if (contextLines === 0 && i > 0) {
          const contextStart = Math.max(0, i - maxContextLines);
          for (let j = contextStart; j < i; j++) {
            if (currentLines[j] !== undefined) {
              diff.push(`  ${j + 1}: ${currentLines[j]}`);
            }
          }
        }
        
        diff.push(`@@ Line ${i + 1} @@`);
        if (currentLine) diff.push(`- ${currentLine}`);
        if (desiredLine) diff.push(`+ ${desiredLine}`);
        contextLines++;
        
        // Show some context after the difference
        if (contextLines <= maxContextLines && i + 1 < maxLines) {
          const contextEnd = Math.min(maxLines, i + maxContextLines + 1);
          for (let j = i + 1; j < contextEnd && currentLines[j] === desiredLines[j]; j++) {
            if (currentLines[j] !== undefined) {
              diff.push(`  ${j + 1}: ${currentLines[j]}`);
            }
          }
        }
      }
    }
    
    return diff;
  }

  // Error handling helpers
  protected handleError(ctx: ConfigurationContext, error: unknown, operation: string): ModuleResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${operation} failed: ${errorMessage}`;
    
    this.logError(ctx, error, fullMessage);
    
    return {
      success: false,
      error,
      message: fullMessage,
    };
  }

  protected async safeExecute<T>(
    ctx: ConfigurationContext,
    operation: string,
    fn: () => Promise<T> | T
  ): Promise<{ success: true; result: T } | { success: false; error: unknown; message: string }> {
    try {
      const result = await fn();
      return { success: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const fullMessage = `${operation} failed: ${errorMessage}`;
      
      this.logError(ctx, error, fullMessage);
      
      return {
        success: false,
        error,
        message: fullMessage,
      };
    }
  }

  // State comparison helper methods
  protected createStateChecksum(state: any): string {
    const stateStr = typeof state === 'string' ? state : JSON.stringify(state, null, 2);
    return createHash('sha256').update(stateStr).digest('hex').substring(0, 16);
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
