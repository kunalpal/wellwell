import type { ModuleResult, PlanResult } from './types.js';

/**
 * Utility functions for module implementations to reduce inheritance dependency
 */
export const ModuleHelpers = {
  /**
   * Create a successful result
   */
  createSuccessResult: (changed = false, message?: string): ModuleResult => ({
    success: true,
    changed,
    message,
  }),

  /**
   * Create an error result
   */
  createErrorResult: (error: unknown, message?: string): ModuleResult => ({
    success: false,
    error,
    message,
  }),

  /**
   * Create a plan result with changes
   */
  createPlanResult: (changes: Array<{ summary: string; details?: string }>): PlanResult => ({
    changes,
  }),

  /**
   * Create an empty plan (no changes needed)
   */
  createEmptyPlan: (): PlanResult => ({
    changes: [],
  }),

  /**
   * Log progress for a module
   */
  logProgress: (ctx: any, moduleId: string, message: string, onProgress?: (msg: string) => void): void => {
    ctx.logger.info({ module: moduleId }, message);
    onProgress?.(message);
  },

  /**
   * Log error for a module
   */
  logError: (ctx: any, moduleId: string, error: unknown, message?: string): void => {
    ctx.logger.error({ module: moduleId, error }, message || 'Operation failed');
  },
};

/**
 * Get the wellwell project root directory
 * First checks for WELLWELL_PROJECT_ROOT environment variable,
 * then falls back to current working directory
 */
export function getProjectRoot(): string {
  // First check if WELLWELL_PROJECT_ROOT environment variable is set
  if (process.env.WELLWELL_PROJECT_ROOT) {
    return process.env.WELLWELL_PROJECT_ROOT;
  }
  
  // Fallback to current working directory (for development)
  return process.cwd();
}
