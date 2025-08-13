export type Platform = 'macos' | 'ubuntu' | 'al2' | 'unknown';

export type ConfigurationStatus =
  | 'stale'
  | 'pending'
  | 'applied'
  | 'skipped'
  | 'failed';

export interface ConfigurationContext {
  platform: Platform;
  homeDir: string;
  cwd: string;
  isCI: boolean;
  logger: import('pino').Logger;
  state: StateStore;
}

export interface StateStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  delete(key: string): void;
  has(key: string): boolean;
  flush(): Promise<void>;
}

// Simplified result types
export interface ModuleResult {
  success: boolean;
  changed?: boolean;
  message?: string;
  error?: unknown;
}

// Legacy alias - deprecated, use ModuleResult instead
export type ApplyResult = ModuleResult;

export interface PlanChange {
  summary: string;
  details?: string;
}

export interface PlanResult {
  changes: PlanChange[];
}

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

export interface ModuleStateSnapshot {
  moduleId: string;
  timestamp: Date;
  checksum: string;
  state: any;
}

export interface ModuleApplyMetadata {
  moduleId: string;
  appliedAt: Date;
  beforeState?: ModuleStateSnapshot;
  afterState?: ModuleStateSnapshot;
  expectedState?: ModuleStateSnapshot;
  planChecksum?: string;
}

// Core module interface - simplified and focused
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
  captureState?(ctx: ConfigurationContext): Promise<ModuleStateSnapshot> | ModuleStateSnapshot;
  compareState?(beforeState: ModuleStateSnapshot, afterState: ModuleStateSnapshot): boolean;
  getExpectedState?(ctx: ConfigurationContext): Promise<ModuleStateSnapshot> | ModuleStateSnapshot;
  
  // Event hooks
  onStatusChange?(status: ConfigurationStatus): void;
  onProgress?(message: string): void;
  
  // Theme-specific methods (optional)
  switchTheme?(themeName: string, ctx?: ConfigurationContext): Promise<boolean>;
  getAvailableThemes?(): any[] | Promise<any[]>;
}

// Simplified type alias
export type ConfigurationModule = Module;
