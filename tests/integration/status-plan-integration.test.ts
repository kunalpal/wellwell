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

jest.mock('node:fs', () => mockFs);
jest.mock('node:path', () => mockPath);

// Mock logger to avoid pino issues
jest.mock('../../src/core/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Import after mocking
import { Engine } from '../../src/core/engine.js';
import { AppConfig } from '../../src/core/app-config.js';
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
      // Mock file exists with old content
      mockFileContents['/Users/kunalpal/.config/test/integration.conf'] = '# Old Configuration\nversion: 0.9';

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
      // Mock file exists with matching content
      mockFileContents['/Users/kunalpal/.config/test/integration.conf'] = '# Integration Test Configuration\nversion: 1.0';

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

      // Mock theme context
      jest.doMock('../../src/core/theme-context.js', () => ({
        themeContextProvider: {
          getThemeColors: jest.fn().mockResolvedValue({ name: 'dracula' }),
        },
      }));

      // Mock file exists with old theme
      mockFileContents['/Users/kunalpal/.config/test/theme.conf'] = '# Theme Integration Test\ntheme: gruvbox';

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

      // Mock file exists
      mockFileContents['/Users/kunalpal/.config/test/theme-error.conf'] = '# Theme Error Test\n';

      engine.register(themeConfig);

      // Should still work without theme colors, but content might differ
      const statuses = await engine.statuses();
      expect(statuses['test:theme-error']).toBe('stale');

      const plans = await engine.plan();
      expect(plans['test:theme-error'].changes).toHaveLength(1);
    });
  });
});
