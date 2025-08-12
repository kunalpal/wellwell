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

export interface ConfigurationHookEvents {
  onStatusChange?: (status: ConfigurationStatus) => void;
  onProgress?: (message: string) => void;
}

export interface ConfigurationModule extends ConfigurationHookEvents {
  id: string;
  description?: string;
  /** Lower number runs earlier. Default 100. */
  priority?: number;
  /** Other configuration ids that must run before this one. */
  dependsOn?: string[];
  /** Return true to indicate this configuration is applicable on this system. */
  isApplicable(ctx: ConfigurationContext): Promise<boolean> | boolean;
  /** Perform a dry-run to compute planned changes. */
  plan(ctx: ConfigurationContext): Promise<PlanResult> | PlanResult;
  /** Apply the configuration; must be idempotent. */
  apply(ctx: ConfigurationContext): Promise<ApplyResult> | ApplyResult;
  /** Inspect current status. */
  status?(ctx: ConfigurationContext): Promise<StatusResult> | StatusResult;
  /** Get detailed information about this module for display in UI. */
  getDetails?(ctx: ConfigurationContext): Promise<string[]> | string[];
  /** Custom methods for theme modules */
  switchTheme?(themeName: string, ctx?: ConfigurationContext): Promise<boolean>;
  getAvailableThemes?(): any[] | Promise<any[]>;
}

export interface PlanChange {
  summary: string;
  details?: string;
}

export interface PlanResult {
  changes: PlanChange[];
}

export interface ApplyResult {
  success: boolean;
  changed?: boolean;
  message?: string;
  error?: unknown;
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
  };
}


