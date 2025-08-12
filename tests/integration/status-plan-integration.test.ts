/**
 * Integration tests for plan, status, and apply workflow
 * Tests that the status is correctly derived from plan and that changes are properly detected
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// Mock dependencies
const mockFileContents: Record<string, string> = {};

const mockFs = {
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  },
};

const mockPath = {
  join: jest.fn((...args: string[]) => args.join('/')),
  dirname: jest.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/'),
  isAbsolute: jest.fn((p: string) => p.startsWith('/')),
};

// Mock os module to ensure consistent home directory
const mockOs = {
  homedir: jest.fn(() => '/mock/home'),
};

jest.mock('node:fs', () => mockFs);
jest.mock('node:path', () => mockPath);
jest.mock('node:os', () => mockOs);

// Mock logger to avoid pino issues
jest.mock('../../src/core/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock theme context to avoid machine dependencies
jest.mock('../../src/core/theme-context.js', () => ({
  themeContextProvider: {
    getThemeColors: jest.fn().mockResolvedValue({ name: 'dracula' }),
  },
}));

// Mock platform detection to avoid machine dependencies
jest.mock('../../src/core/platform.js', () => ({
  detectPlatform: jest.fn(() => 'macos'),
}));

// Mock process to ensure consistent cwd
const originalProcess = process;
const mockProcess = {
  ...originalProcess,
  cwd: jest.fn(() => '/mock/cwd'),
  env: { ...originalProcess.env },
};
Object.defineProperty(global, 'process', {
  value: mockProcess,
  writable: true,
});

// Import after mocking
import { Engine } from '../../src/core/engine.js';
import { AppConfig } from '../../src/core/app-config.js';
import { StateComparison } from '../../src/core/state-comparison.js';
import { createMockContext } from '../mocks/index.js';

// Create a test app config for integration testing
class TestIntegrationConfig extends AppConfig {
  constructor(options: any) {
    super(options);
  }

  async isApplicable(): Promise<boolean> {
    return true;
  }

  // Override the template to return a simple, predictable value
  protected template = (ctx: any, themeColors?: any): string => {
    return '# Integration Test Configuration\nversion: 1.0';
  };
}

describe('Plan-Status-Apply Integration', () => {
  let engine: Engine;
  let ctx: any;
  let testConfig: TestIntegrationConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockFileContents).forEach(key => delete mockFileContents[key]);
    ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
    
    engine = new Engine();
    
    testConfig = new TestIntegrationConfig({
      id: 'test:integration',
      configDir: '.config/test',
      configFile: 'integration.conf',
      template: (ctx: any) => '# Integration Test Configuration\nversion: 1.0',
    });

    // Setup default mock implementations
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => p.split('/').slice(0, -1).join('/') || '/');
    
    // Setup file system mocks that track content per file
    mockFs.promises.access.mockImplementation((path: string) => {
      if (mockFileContents[path] !== undefined) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('ENOENT'));
    });
    
    mockFs.promises.readFile.mockImplementation((path: string) => {
      if (mockFileContents[path] === undefined) {
        return Promise.reject(new Error('ENOENT'));
      }
      return Promise.resolve(mockFileContents[path]);
    });
    
    mockFs.promises.writeFile.mockImplementation((path: string, content: string) => {
      mockFileContents[path] = content;
      return Promise.resolve();
    });
    
    mockFs.promises.mkdir.mockResolvedValue(undefined);
  });

  describe('Full workflow: file does not exist', () => {
    it('should show stale status, plan creation, and apply successfully', async () => {
      // Mock file does not exist initially (no content in mockFileContents)
      // The mock will automatically handle this since the path won't be in mockFileContents

      engine.register(testConfig);

      // Step 1: Check status (should be stale)
      const statuses = await engine.statuses();
      expect(statuses['test:integration']).toBe('stale');

      // Step 2: Check plan (should show creation)
      const plans = await engine.plan();
      expect(plans['test:integration'].changes).toContainEqual({
        summary: 'Create integration.conf configuration',
      });

      // Step 3: Apply (should succeed)
      const results = await engine.apply();
      expect(results['test:integration'].success).toBe(true);
      expect(results['test:integration'].changed).toBe(true);

      // Step 4: Check status again (should now be applied)
      // The mock automatically tracks the file content after writeFile
      const statusesAfter = await engine.statuses();
      expect(statusesAfter['test:integration']).toBe('applied');

      // Step 5: Check plan again (should show no changes)
      const plansAfter = await engine.plan();
      expect(plansAfter['test:integration'].changes).toHaveLength(0);
    });
  });

  describe('Full workflow: file exists with different content', () => {
    it('should show stale status, plan update, and apply successfully', async () => {
      // Mock file exists with old content - use the mock home directory path
      const configPath = '/mock/home/.config/test/integration.conf';
      mockFileContents[configPath] = '# Old Configuration\nversion: 0.9';

      engine.register(testConfig);

      // Step 1: Check status (should be stale)
      const statuses = await engine.statuses();
      expect(statuses['test:integration']).toBe('stale');

      // Step 2: Check plan (should show update)
      const plans = await engine.plan();
      expect(plans['test:integration'].changes).toContainEqual({
        summary: 'Update integration.conf configuration',
      });

      // Step 3: Apply (should succeed)
      const results = await engine.apply();
      expect(results['test:integration'].success).toBe(true);
      expect(results['test:integration'].changed).toBe(true);

      // Step 4: Check status again (should now be applied)
      // The mock automatically tracks the file content after writeFile
      const statusesAfter = await engine.statuses();
      expect(statusesAfter['test:integration']).toBe('applied');

      // Step 5: Check plan again (should show no changes)
      const plansAfter = await engine.plan();
      expect(plansAfter['test:integration'].changes).toHaveLength(0);
    });
  });

  describe('Full workflow: file exists with matching content', () => {
    it('should show applied status and no changes in plan', async () => {
      // Mock file exists with matching content - use the mock home directory path
      const configPath = '/mock/home/.config/test/integration.conf';
      mockFileContents[configPath] = '# Integration Test Configuration\nversion: 1.0';

      engine.register(testConfig);

      // Step 1: Check status (should be applied)
      const statuses = await engine.statuses();
      expect(statuses['test:integration']).toBe('applied');

      // Step 2: Check plan (should show no changes)
      const plans = await engine.plan();
      expect(plans['test:integration'].changes).toHaveLength(0);

      // Step 3: Apply (should succeed but not change anything)
      const results = await engine.apply();
      expect(results['test:integration'].success).toBe(true);
      expect(results['test:integration'].changed).toBe(true); // Still writes the file

      // Step 4: Check status again (should still be applied)
      const statusesAfter = await engine.statuses();
      expect(statusesAfter['test:integration']).toBe('applied');

      // Step 5: Check plan again (should still show no changes)
      const plansAfter = await engine.plan();
      expect(plansAfter['test:integration'].changes).toHaveLength(0);
    });
  });

  describe('Theme-aware configuration workflow', () => {
    it('should handle theme changes correctly', async () => {
      const themeConfig = new TestIntegrationConfig({
        id: 'test:theme-integration',
        configDir: '.config/test',
        configFile: 'theme.conf',
        template: (ctx: any, themeColors?: any) => {
          let config = '# Theme Integration Test\n';
          if (themeColors) {
            config += `theme: ${themeColors.name}\n`;
          }
          return config;
        },
      });


      // Mock file exists with old theme - use the mock home directory path
      const themeConfigPath = '/mock/home/.config/test/theme.conf';
      mockFileContents[themeConfigPath] = '# Theme Integration Test\ntheme: gruvbox';

      engine.register(themeConfig);

      // Step 1: Check status (should be stale due to theme change)
      const statuses = await engine.statuses();
      expect(statuses['test:theme-integration']).toBe('stale');

      // Step 2: Check plan (should show update)
      const plans = await engine.plan();
      expect(plans['test:theme-integration'].changes).toContainEqual({
        summary: 'Update theme.conf configuration',
      });

      // Step 3: Apply (should succeed)
      const results = await engine.apply();
      expect(results['test:theme-integration'].success).toBe(true);

      // Step 4: Check status again (should now be applied)
      // The mock automatically tracks the file content after writeFile
      const statusesAfter = await engine.statuses();
      expect(statusesAfter['test:theme-integration']).toBe('applied');
    });
  });

  describe('Error handling in workflow', () => {
    it('should handle file system errors gracefully', async () => {
      engine.register(testConfig);

      // Mock file system error during apply
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // File doesn't exist initially
      mockFs.promises.mkdir.mockResolvedValue(undefined); // Directory creation succeeds
      
      // Only fail writeFile for the specific config file, not for state files
      mockFs.promises.writeFile.mockImplementation((path: string) => {
        if (path.includes('integration.conf')) {
          throw new Error('Permission denied');
        }
        return Promise.resolve();
      });

      // Step 1: Check status (should be stale)
      const statuses = await engine.statuses();
      expect(statuses['test:integration']).toBe('stale');

      // Step 2: Check plan (should show creation)
      const plans = await engine.plan();
      expect(plans['test:integration'].changes).toContainEqual({
        summary: 'Create integration.conf configuration',
      });

      // Step 3: Apply (should fail gracefully)
      const results = await engine.apply();
      expect(results['test:integration'].success).toBe(false);
      expect(results['test:integration'].error).toBeDefined();
    });

    it('should handle theme context errors gracefully', async () => {
      const themeConfig = new TestIntegrationConfig({
        id: 'test:theme-error',
        configDir: '.config/test',
        configFile: 'theme-error.conf',
        template: (ctx: any, themeColors?: any) => '# Theme Error Test\n',
      });

      // Mock file exists - use the mock home directory path
      const themeErrorPath = '/mock/home/.config/test/theme-error.conf';
      mockFileContents[themeErrorPath] = '# Theme Error Test\n';

      engine.register(themeConfig);

      // Should still work without theme colors, but content might differ
      const statuses = await engine.statuses();
      expect(statuses['test:theme-error']).toBe('stale');

      const plans = await engine.plan();
      expect(plans['test:theme-error'].changes).toHaveLength(1);
    });
  });

  describe('Robust status checking with state comparison', () => {
    it('should detect when file changes after apply (external modification)', async () => {
      engine.register(testConfig);

      // Step 1: Apply initial configuration
      const results = await engine.apply();
      expect(results['test:integration'].success).toBe(true);

      // Step 2: Verify status is applied
      const statusesAfter = await engine.statuses();
      expect(statusesAfter['test:integration']).toBe('applied');

      // Step 3: Simulate external modification of the file
      const configPath = '/mock/home/.config/test/integration.conf';
      mockFileContents[configPath] = '# Modified by external process\nversion: 2.0';

      // Step 4: Status should now be stale due to state change
      const statusesAfterModification = await engine.statuses();
      expect(statusesAfterModification['test:integration']).toBe('stale');

      // Step 5: Detailed status should show the difference
      const detailedStatuses = await engine.detailedStatuses();
      expect(detailedStatuses['test:integration'].status).toBe('stale');
      expect(detailedStatuses['test:integration'].message).toContain('planned change');
    });

    it('should detect when expected state changes (theme change)', async () => {
      const themeConfig = new TestIntegrationConfig({
        id: 'test:theme-change',
        configDir: '.config/test',
        configFile: 'theme-change.conf',
        template: (ctx: any, themeColors?: any) => {
          let config = '# Theme Change Test\n';
          if (themeColors) {
            config += `theme: ${themeColors.name}\n`;
          }
          return config;
        },
      });

      engine.register(themeConfig);

      // Step 1: Apply with initial theme
      const results = await engine.apply();
      expect(results['test:theme-change'].success).toBe(true);

      // Step 2: Verify status is applied
      const statusesAfter = await engine.statuses();
      expect(statusesAfter['test:theme-change']).toBe('applied');

      // Step 3: Mock theme change
      const { themeContextProvider } = await import('../../src/core/theme-context.js');
      (themeContextProvider.getThemeColors as any).mockResolvedValue({ name: 'nord' });

      // Step 4: Status should now be stale due to expected state change
      const statusesAfterThemeChange = await engine.statuses();
      expect(statusesAfterThemeChange['test:theme-change']).toBe('stale');

      // Step 5: Detailed status should show the difference
      const detailedStatuses = await engine.detailedStatuses();
      expect(detailedStatuses['test:theme-change'].status).toBe('stale');
      expect(detailedStatuses['test:theme-change'].message).toContain('planned change');
    });

    it('should provide detailed status information with state comparison metadata', async () => {
      engine.register(testConfig);

      // Step 1: Apply configuration
      await engine.apply();

      // Step 2: Get detailed status
      const detailedStatuses = await engine.detailedStatuses();
      const status = detailedStatuses['test:integration'];

      expect(status.status).toBe('applied');
      expect(status.metadata?.stateComparison).toBeDefined();
      expect(status.metadata?.stateComparison?.differs).toBe(false);
      expect(status.metadata?.stateComparison?.lastValidated).toBeDefined();
      expect(status.metadata?.actualChecksum).toBeDefined();
      expect(status.metadata?.expectedChecksum).toBeDefined();
    });

    it('should handle state comparison errors gracefully', async () => {
      // Create a config that will fail during state capture
      const errorConfig = new TestIntegrationConfig({
        id: 'test:error',
        configDir: '.config/test',
        configFile: 'error.conf',
        template: (ctx: any) => '# Error Test Configuration\nversion: 1.0',
      });

      // Override captureState to throw an error
      errorConfig.captureState = jest.fn().mockRejectedValue(new Error('State capture failed'));

      engine.register(errorConfig);

      // Status should still be determinable, falling back to plan-based checking
      const statuses = await engine.statuses();
      expect(statuses['test:error']).toBe('stale'); // Should default to stale on error

      const detailedStatuses = await engine.detailedStatuses();
      expect(detailedStatuses['test:error'].status).toBe('stale');
    });

    it('should track apply metadata and use it for status checking', async () => {
      engine.register(testConfig);

      // Step 1: Apply configuration (this should record metadata)
      await engine.apply();

      // Step 2: Get detailed status which should include metadata from robust status checking
      const detailedStatuses = await engine.detailedStatuses();
      const status = detailedStatuses['test:integration'];
      
      // The status should be applied and include metadata
      expect(status.status).toBe('applied');
      expect(status.metadata).toBeDefined();
      expect(status.metadata?.lastChecked).toBeDefined();
      expect(status.metadata?.stateComparison).toBeDefined();
    });

    it('should detect staleness when plan changes but file content remains the same', async () => {
      const dynamicConfig = new TestIntegrationConfig({
        id: 'test:dynamic',
        configDir: '.config/test',
        configFile: 'dynamic.conf',
        template: (ctx: any) => {
          // Template content changes based on current time (simulating dynamic content)
          const timestamp = (ctx.state.get as any)('dynamic.timestamp') || 'initial';
          return `# Dynamic Test Configuration\ntimestamp: ${timestamp}\nversion: 1.0`;
        },
      });

      engine.register(dynamicConfig);

      // Step 1: Apply with initial timestamp
      await engine.apply();
      const statusesAfter = await engine.statuses();
      expect(statusesAfter['test:dynamic']).toBe('applied');

      // Step 2: Change the dynamic value in state
      const ctx = engine.buildContext();
      ctx.state.set('dynamic.timestamp', 'updated');

      // Step 3: Status should now be stale because plan will show changes
      const statusesAfterStateChange = await engine.statuses();
      expect(statusesAfterStateChange['test:dynamic']).toBe('stale');

      // Step 4: Plan should show update needed
      const plans = await engine.plan();
      expect(plans['test:dynamic'].changes).toContainEqual({
        summary: 'Update dynamic.conf configuration',
      });
    });
  });
});
