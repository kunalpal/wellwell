/**
 * Supported platforms for configuration modules.
 */
export type Platform = "macos" | "ubuntu" | "al2" | "unknown";

/**
 * Possible status values for configuration modules.
 */
export type ConfigurationStatus =
  | "stale"
  | "pending"
  | "applied"
  | "skipped"
  | "failed";

/**
 * Context object passed to configuration modules, containing environment, logger, and state store.
 */
export interface ConfigurationContext {
  platform: Platform;
  homeDir: string;
  cwd: string;
  isCI: boolean;
  logger: import("pino").Logger;
  state: StateStore;
}

/**
 * Interface for a persistent state store used by configuration modules.
 */
export interface StateStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  delete(key: string): void;
  has(key: string): boolean;
  flush(): Promise<void>;
}

/**
 * Result of applying a configuration module.
 */
export interface ModuleResult {
  success: boolean;
  changed?: boolean;
  message?: string;
  error?: unknown;
}

/**
 * Legacy alias for ModuleResult (deprecated, use ModuleResult instead).
 */
export type ApplyResult = ModuleResult;

/**
 * Describes a single change in a plan result.
 */
export interface PlanChange {
  summary: string;
  details?: string;
}

/**
 * Result of planning configuration changes for a module.
 */
export interface PlanResult {
  changes: PlanChange[];
}

/**
 * Result of checking the status of a configuration module, including issues and recommendations.
 */
export interface StatusResult {
  status: ConfigurationStatus;
  message?: string;
  details?: {
    current?: any;
    desired?: any;
    diff?: string[];
    issues?: string[];
    recommendations?: string[];
  };
  metadata?: {
    lastApplied?: Date;
    lastChecked?: Date;
    version?: string;
    checksum?: string;
    expectedChecksum?: string;
    actualChecksum?: string;
    stateComparison?: {
      beforeApply?: string;
      afterApply?: string;
      expectedAfterApply?: string;
      differs: boolean;
      lastValidated?: Date;
    };
  };
}

/**
 * Snapshot of a module's state for robust status and change detection.
 */
export interface ModuleStateSnapshot {
  moduleId: string;
  timestamp: Date;
  checksum: string;
  state: any;
}

/**
 * Metadata about a module apply operation, including before/after state and checksums.
 */
export interface ModuleApplyMetadata {
  moduleId: string;
  appliedAt: Date;
  beforeState?: ModuleStateSnapshot;
  afterState?: ModuleStateSnapshot;
  expectedState?: ModuleStateSnapshot;
  planChecksum?: string;
}

/**
 * Core interface for a configuration module, including lifecycle methods and optional hooks.
 */
export interface Module {
  id: string;
  description?: string;
  dependsOn?: string[];

  // Core lifecycle methods
  isApplicable(ctx: ConfigurationContext): Promise<boolean> | boolean;
  plan(ctx: ConfigurationContext): Promise<PlanResult> | PlanResult;
  apply(ctx: ConfigurationContext): Promise<ModuleResult> | ModuleResult;

  // Optional methods
  status?(ctx: ConfigurationContext): Promise<StatusResult> | StatusResult;
  getDetails?(ctx: ConfigurationContext): Promise<string[]> | string[];

  // State comparison methods for robust status checks
  captureState?(
    ctx: ConfigurationContext,
  ): Promise<ModuleStateSnapshot> | ModuleStateSnapshot;
  compareState?(
    beforeState: ModuleStateSnapshot,
    afterState: ModuleStateSnapshot,
  ): boolean;
  getExpectedState?(
    ctx: ConfigurationContext,
  ): Promise<ModuleStateSnapshot> | ModuleStateSnapshot;

  // Event hooks
  onStatusChange?(status: ConfigurationStatus): void;
  onProgress?(message: string): void;

  // Theme-specific methods (optional)
  switchTheme?(themeName: string, ctx?: ConfigurationContext): Promise<boolean>;
  getAvailableThemes?(): any[] | Promise<any[]>;
}

/**
 * Type alias for a configuration module.
 */
export type ConfigurationModule = Module;
