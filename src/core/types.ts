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

// Legacy types for backward compatibility
export interface ApplyResult extends ModuleResult {}
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
  };
}

// Core module interface - simplified and focused
export interface Module {
  id: string;
  description?: string;
  priority?: number;
  dependsOn?: string[];
  
  // Core lifecycle methods
  isApplicable(ctx: ConfigurationContext): Promise<boolean> | boolean;
  plan(ctx: ConfigurationContext): Promise<PlanResult> | PlanResult;
  apply(ctx: ConfigurationContext): Promise<ModuleResult> | ModuleResult;
  
  // Optional methods
  status?(ctx: ConfigurationContext): Promise<StatusResult> | StatusResult;
  getDetails?(ctx: ConfigurationContext): Promise<string[]> | string[];
  
  // Event hooks
  onStatusChange?(status: ConfigurationStatus): void;
  onProgress?(message: string): void;
  
  // Theme-specific methods (optional for backward compatibility)
  switchTheme?(themeName: string, ctx?: ConfigurationContext): Promise<boolean>;
  getAvailableThemes?(): any[] | Promise<any[]>;
}

// Specialized module types for better type safety
export interface PackageModule extends Module {
  type: 'package';
  packages: Array<{
    name: string;
    manager: 'homebrew' | 'apt' | 'yum';
    platforms?: Platform[];
  }>;
}

export interface ConfigModule extends Module {
  type: 'config';
  configPath: string;
  template: (ctx: ConfigurationContext, themeColors?: any) => string;
}

export interface ThemeModule extends Module {
  type: 'theme';
  switchTheme(themeName: string, ctx?: ConfigurationContext): Promise<boolean>;
  getAvailableThemes(): any[] | Promise<any[]>;
}

// Union type for all module types
export type ConfigurationModule = Module | PackageModule | ConfigModule | ThemeModule;


