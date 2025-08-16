import { createHash } from "node:crypto";
import type {
  ConfigurationContext,
  Module,
  ModuleStateSnapshot,
  ModuleApplyMetadata,
  StatusResult,
  ConfigurationStatus,
} from "./types.js";

/**
 * Utility class for handling module state comparison and tracking
 * Provides robust status checking by comparing actual state before/after applying
 */
export class StateComparison {
  private static readonly STATE_KEY_PREFIX = "state_comparison:";
  private static readonly METADATA_KEY_PREFIX = "apply_metadata:";

  /**
   * Creates a checksum for the given state object
   */
  static createChecksum(state: any): string {
    const stateStr =
      typeof state === "string" ? state : JSON.stringify(state, null, 2);
    return createHash("sha256").update(stateStr).digest("hex").substring(0, 16);
  }

  /**
   * Creates a state snapshot for a module
   */
  static async createSnapshot(
    moduleId: string,
    ctx: ConfigurationContext,
    module: Module,
  ): Promise<ModuleStateSnapshot> {
    let state: any = null;

    try {
      if (module.captureState) {
        const snapshot = await module.captureState(ctx);
        state = snapshot.state;
      } else {
        // Default state capture: try to get current configuration/status
        if (module.status) {
          const status = await module.status(ctx);
          state = {
            status: status.status,
            details: status.details,
            metadata: status.metadata,
          };
        } else {
          // Fallback: capture basic module info
          state = {
            moduleId,
            applicable: await module.isApplicable(ctx),
            // Don't include timestamp as it causes unnecessary differences
          };
        }
      }
    } catch (error) {
      ctx.logger.warn(
        { module: moduleId, error },
        "Failed to capture state, using fallback",
      );
      state = {
        moduleId,
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
        // Don't include timestamp as it causes unnecessary differences
      };
    }

    return {
      moduleId,
      timestamp: new Date(),
      checksum: this.createChecksum(state),
      state,
    };
  }

  /**
   * Gets the expected state snapshot for a module based on its plan
   */
  static async getExpectedStateSnapshot(
    moduleId: string,
    ctx: ConfigurationContext,
    module: Module,
  ): Promise<ModuleStateSnapshot> {
    try {
      // First try to use the module's own getExpectedState method
      if (module.getExpectedState) {
        return await module.getExpectedState(ctx);
      }

      // Create compatible expected state that matches the current snapshot structure
      const plan = await module.plan(ctx);

      // If we're using the status-based fallback for current state,
      // make the expected state compatible
      if (!module.captureState && module.status) {
        // Create an expected status based on the plan
        const expectedStatus = plan.changes.length > 0 ? "stale" : "applied";
        const expectedState = {
          status: expectedStatus,
          details:
            plan.changes.length > 0
              ? {
                  issues: plan.changes.map((c) => c.summary),
                }
              : undefined,
          metadata: {
            planBased: true,
            changesCount: plan.changes.length,
          },
        };

        return {
          moduleId,
          timestamp: new Date(),
          checksum: this.createChecksum(expectedState),
          state: expectedState,
        };
      }

      // Default: create expected state based on plan
      const expectedState = {
        moduleId,
        planChanges: plan.changes.length,
        hasChanges: plan.changes.length > 0,
        changes: plan.changes.map((c) => c.summary),
        // Don't include timestamp as it causes unnecessary differences
      };

      return {
        moduleId,
        timestamp: new Date(),
        checksum: this.createChecksum(expectedState),
        state: expectedState,
      };
    } catch (error) {
      ctx.logger.warn(
        { module: moduleId, error },
        "Failed to get expected state",
      );
      return {
        moduleId,
        timestamp: new Date(),
        checksum: "error",
        state: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Compares two state snapshots to determine if they differ
   */
  static compareSnapshots(
    module: Module,
    beforeState: ModuleStateSnapshot,
    afterState: ModuleStateSnapshot,
  ): boolean {
    try {
      if (module.compareState) {
        return module.compareState(beforeState, afterState);
      }

      // Default comparison: use checksums
      return beforeState.checksum !== afterState.checksum;
    } catch (error) {
      // If comparison fails, assume they differ to be safe
      return true;
    }
  }

  /**
   * Stores apply metadata for a module
   */
  static storeApplyMetadata(
    ctx: ConfigurationContext,
    metadata: ModuleApplyMetadata,
  ): void {
    const key = `${this.METADATA_KEY_PREFIX}${metadata.moduleId}`;
    ctx.state.set(key, {
      ...metadata,
      appliedAt: metadata.appliedAt.toISOString(),
      beforeState: metadata.beforeState
        ? {
            ...metadata.beforeState,
            timestamp: metadata.beforeState.timestamp.toISOString(),
          }
        : undefined,
      afterState: metadata.afterState
        ? {
            ...metadata.afterState,
            timestamp: metadata.afterState.timestamp.toISOString(),
          }
        : undefined,
      expectedState: metadata.expectedState
        ? {
            ...metadata.expectedState,
            timestamp: metadata.expectedState.timestamp.toISOString(),
          }
        : undefined,
    });
  }

  /**
   * Retrieves apply metadata for a module
   */
  static getApplyMetadata(
    ctx: ConfigurationContext,
    moduleId: string,
  ): ModuleApplyMetadata | undefined {
    const key = `${this.METADATA_KEY_PREFIX}${moduleId}`;
    const stored = ctx.state.get<any>(key);

    if (!stored) return undefined;

    return {
      ...stored,
      appliedAt: new Date(stored.appliedAt),
      beforeState: stored.beforeState
        ? {
            ...stored.beforeState,
            timestamp: new Date(stored.beforeState.timestamp),
          }
        : undefined,
      afterState: stored.afterState
        ? {
            ...stored.afterState,
            timestamp: new Date(stored.afterState.timestamp),
          }
        : undefined,
      expectedState: stored.expectedState
        ? {
            ...stored.expectedState,
            timestamp: new Date(stored.expectedState.timestamp),
          }
        : undefined,
    };
  }

  /**
   * Performs robust status checking using state comparison
   */
  static async getRobustStatus(
    ctx: ConfigurationContext,
    module: Module,
  ): Promise<StatusResult> {
    const moduleId = module.id;

    try {
      // Get current plan and state snapshots
      const plan = await module.plan(ctx);
      const hasPlannedChanges = plan.changes.length > 0;
      const currentSnapshot = await this.createSnapshot(moduleId, ctx, module);
      const expectedSnapshot = await this.getExpectedStateSnapshot(
        moduleId,
        ctx,
        module,
      );

      // Get metadata from last apply
      const metadata = this.getApplyMetadata(ctx, moduleId);

      // Compare states
      const expectedDiffers = this.compareSnapshots(
        module,
        currentSnapshot,
        expectedSnapshot,
      );

      // Priority 1: If plan shows changes, definitely stale (covers dynamic content changes)
      if (hasPlannedChanges) {
        return {
          status: "stale",
          message: `Module has ${plan.changes.length} planned change${plan.changes.length === 1 ? "" : "s"}`,
          details: {
            current: currentSnapshot.state,
            desired: expectedSnapshot.state,
            diff: plan.changes.map((c) => c.summary),
            issues: ["Module has planned changes that need to be applied"],
          },
          metadata: {
            lastApplied: metadata?.appliedAt,
            lastChecked: new Date(),
            actualChecksum: currentSnapshot.checksum,
            expectedChecksum: expectedSnapshot.checksum,
            stateComparison: {
              beforeApply: metadata?.beforeState?.checksum,
              afterApply: metadata?.afterState?.checksum,
              expectedAfterApply: metadata?.expectedState?.checksum,
              differs: true,
              lastValidated: new Date(),
            },
          },
        };
      }

      // Priority 2: If current state differs from expected state, also stale
      if (expectedDiffers) {
        return {
          status: "stale",
          message: "Current state differs from expected state",
          details: {
            current: currentSnapshot.state,
            desired: expectedSnapshot.state,
            issues: ["Module state differs from expected state"],
          },
          metadata: {
            lastApplied: metadata?.appliedAt,
            lastChecked: new Date(),
            actualChecksum: currentSnapshot.checksum,
            expectedChecksum: expectedSnapshot.checksum,
            stateComparison: {
              beforeApply: metadata?.beforeState?.checksum,
              afterApply: metadata?.afterState?.checksum,
              expectedAfterApply: metadata?.expectedState?.checksum,
              differs: true,
              lastValidated: new Date(),
            },
          },
        };
      }

      // Priority 3: Check for state changes since last apply (if we have metadata)
      if (metadata) {
        const lastAppliedState = metadata.afterState;
        const lastExpectedState = metadata.expectedState;

        const stateChanged = lastAppliedState
          ? this.compareSnapshots(module, lastAppliedState, currentSnapshot)
          : false;
        const expectedChanged = lastExpectedState
          ? this.compareSnapshots(module, lastExpectedState, expectedSnapshot)
          : false;

        if (stateChanged || expectedChanged) {
          return {
            status: "stale",
            message: stateChanged
              ? "Module state has changed since last apply"
              : "Module expected state has changed",
            details: {
              current: currentSnapshot.state,
              desired: expectedSnapshot.state,
              issues: [
                ...(stateChanged
                  ? ["Actual state differs from last applied state"]
                  : []),
                ...(expectedChanged
                  ? ["Expected state differs from last planned state"]
                  : []),
              ],
            },
            metadata: {
              lastApplied: metadata.appliedAt,
              lastChecked: new Date(),
              actualChecksum: currentSnapshot.checksum,
              expectedChecksum: expectedSnapshot.checksum,
              stateComparison: {
                beforeApply: metadata.beforeState?.checksum,
                afterApply: metadata.afterState?.checksum,
                expectedAfterApply: metadata.expectedState?.checksum,
                differs: true,
                lastValidated: new Date(),
              },
            },
          };
        }
      }

      // Everything looks good - module is applied
      return {
        status: "applied",
        message: "Module state matches expectations",
        details: {
          current: currentSnapshot.state,
          desired: expectedSnapshot.state,
        },
        metadata: {
          lastApplied: metadata?.appliedAt,
          lastChecked: new Date(),
          actualChecksum: currentSnapshot.checksum,
          expectedChecksum: expectedSnapshot.checksum,
          stateComparison: {
            beforeApply: metadata?.beforeState?.checksum,
            afterApply: metadata?.afterState?.checksum,
            expectedAfterApply: metadata?.expectedState?.checksum,
            differs: false,
            lastValidated: new Date(),
          },
        },
      };
    } catch (error) {
      ctx.logger.error(
        { module: moduleId, error },
        "Failed to perform robust status check",
      );

      // Fallback to traditional status check
      if (module.status) {
        try {
          return await module.status(ctx);
        } catch (statusError) {
          ctx.logger.error(
            { module: moduleId, error: statusError },
            "Traditional status check also failed",
          );
        }
      }

      // Ultimate fallback
      return {
        status: "stale",
        message: "Unable to determine status due to errors",
        details: {
          issues: [error instanceof Error ? error.message : String(error)],
        },
        metadata: {
          lastChecked: new Date(),
        },
      };
    }
  }

  /**
   * Records state changes during apply operation
   */
  static async recordApplyExecution(
    ctx: ConfigurationContext,
    module: Module,
    applyFn: () => Promise<any>,
  ): Promise<any> {
    const moduleId = module.id;

    // Capture state before apply
    const beforeState = await this.createSnapshot(moduleId, ctx, module);
    const expectedState = await this.getExpectedStateSnapshot(
      moduleId,
      ctx,
      module,
    );

    try {
      // Execute the apply function
      const result = await applyFn();

      // Capture final state and store metadata
      const afterState = await this.createSnapshot(moduleId, ctx, module);

      // Store metadata about this apply operation
      const metadata: ModuleApplyMetadata = {
        moduleId,
        appliedAt: new Date(),
        beforeState,
        afterState,
        expectedState,
        planChecksum: expectedState.checksum,
      };

      // Store metadata before returning to ensure it's available for status checks
      this.storeApplyMetadata(ctx, metadata);

      // Ensure state is flushed to disk
      await ctx.state.flush();

      return result;
    } catch (error) {
      // Even if apply fails, we should still record what we attempted
      const afterState = await this.createSnapshot(moduleId, ctx, module).catch(
        () => beforeState,
      );

      const metadata: ModuleApplyMetadata = {
        moduleId,
        appliedAt: new Date(),
        beforeState,
        afterState,
        expectedState,
        planChecksum: expectedState.checksum,
      };

      // Store metadata even on failure
      this.storeApplyMetadata(ctx, metadata);

      // Ensure state is flushed to disk
      await ctx.state.flush();

      throw error;
    }
  }
}
