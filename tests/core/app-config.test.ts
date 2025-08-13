/**
 * Tests for AppConfig base class
 * Tests the core functionality that all app configuration modules inherit
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// Mock dependencies
const mockFs = {
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    lstat: jest.fn(),
    unlink: jest.fn(),
  },
};

const mockPath = {
  join: jest.fn((...args: string[]) => args.join('/')),
  dirname: jest.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/'),
};

jest.mock('node:fs', () => mockFs);
jest.mock('node:path', () => mockPath);

// Import after mocking
import { AppConfig } from '../../src/core/app-config.js';
import { createMockContext } from '../mocks/index.js';

// Create a concrete implementation for testing
class TestAppConfig extends AppConfig {
  constructor(options: any) {
    super(options);
  }

  async isApplicable(): Promise<boolean> {
    return true;
  }

  async plan(ctx: any): Promise<any> {
    return super.plan(ctx);
  }

  async apply(ctx: any): Promise<any> {
    return super.apply(ctx);
  }

  async status(ctx: any): Promise<any> {
    return super.status(ctx);
  }
}

describe('AppConfig', () => {
  let appConfig: TestAppConfig;
  let ctx: any;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
    
    appConfig = new TestAppConfig({
      id: 'test:config',
      configDir: '.config/test',
      configFile: 'test.conf',
      template: (ctx: any) => '# Test configuration\ncontent: test',
    });

    // Setup default mock implementations
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => p.split('/').slice(0, -1).join('/') || '/');
  });

  describe('plan method', () => {
    it('should plan to create config when file does not exist', async () => {
      // Mock file does not exist
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await appConfig.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Create test.conf configuration',
      });
      expect(result.changes).toHaveLength(1);
    });

    it('should plan to update config when file exists but content differs', async () => {
      // Mock file exists
      mockFs.promises.access.mockResolvedValue(undefined);
      // Mock current content is different from desired content
      mockFs.promises.readFile.mockResolvedValue('# Old configuration\ncontent: old');

      const result = await appConfig.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Update test.conf configuration',
      });
      expect(result.changes).toHaveLength(1);
    });

    it('should NOT plan changes when file exists and content matches', async () => {
      // Mock file exists
      mockFs.promises.access.mockResolvedValue(undefined);
      // Mock current content matches desired content
      mockFs.promises.readFile.mockResolvedValue('# Test configuration\ncontent: test');

      const result = await appConfig.plan(ctx);

      expect(result.changes).toHaveLength(0);
    });

    it('should handle theme-aware templates correctly', async () => {
      const themeAwareTemplate = (ctx: any, themeColors?: any) => {
        let config = '# Test configuration\n';
        if (themeColors) {
          config += `theme: ${themeColors.name}\n`;
        }
        return config;
      };

      const themeConfig = new TestAppConfig({
        id: 'test:theme-config',
        configDir: '.config/test',
        configFile: 'theme.conf',
        template: themeAwareTemplate,
      });

      // Mock theme colors
      jest.doMock('../../src/core/theme-context.js', () => ({
        themeContextProvider: {
          getThemeColors: jest.fn().mockResolvedValue({ name: 'default' }),
        },
      }));

      // Mock file exists with old content
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue('# Test configuration\n');

      const result = await themeConfig.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Update theme.conf configuration',
      });
    });

    it('should handle theme context errors gracefully', async () => {
      const themeConfig = new TestAppConfig({
        id: 'test:theme-config',
        configDir: '.config/test',
        configFile: 'theme.conf',
        template: (ctx: any, themeColors?: any) => '# Test configuration\n',
      });

      // Mock theme context error
      jest.doMock('../../src/core/theme-context.js', () => ({
        themeContextProvider: {
          getThemeColors: jest.fn().mockRejectedValue(new Error('Theme not found')),
        },
      }));

      // Mock file exists
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue('# Test configuration\n');

      const result = await themeConfig.plan(ctx);

      // Should not plan changes when content matches (even without theme)
      expect(result.changes).toHaveLength(0);
    });

    it('should add package dependencies to plan', async () => {
      const configWithDeps = new TestAppConfig({
        id: 'test:with-deps',
        configDir: '.config/test',
        configFile: 'test.conf',
        template: (ctx: any) => '# Test configuration',
        packageDependencies: [
          { name: 'test-pkg', manager: 'homebrew', platforms: ['macos'] },
        ],
      });

      // Mock file does not exist
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await configWithDeps.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Create test.conf configuration',
      });
    });
  });

  describe('apply method', () => {
    it('should create config file when it does not exist', async () => {
      // Mock file does not exist
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      const result = await appConfig.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/mock/home/.config/test', { recursive: true });
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/mock/home/.config/test/test.conf',
        '# Test configuration\ncontent: test',
        'utf8'
      );
    });

    it('should update existing config file', async () => {
      // Mock file exists
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue('# Old configuration');
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      const result = await appConfig.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/mock/home/.config/test/test.conf',
        '# Test configuration\ncontent: test',
        'utf8'
      );
    });

    it('should handle write errors gracefully', async () => {
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockRejectedValue(new Error('Permission denied'));

      const result = await appConfig.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('Permission denied'));
    });
  });

  describe('status method', () => {
    it('should return stale when config file does not exist', async () => {
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await appConfig.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('test.conf missing');
    });

    it('should return applied when config exists and content matches', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue('# Test configuration\ncontent: test');

      const result = await appConfig.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('test.conf is up to date');
    });

    it('should return stale when config exists but content differs', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue('# Old configuration\ncontent: old');

      const result = await appConfig.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('test.conf needs update');
    });

    it('should handle read errors gracefully', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await appConfig.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('test.conf needs update');
    });
  });

  describe('configuration file handling', () => {
    it('should handle broken symlinks', async () => {
      // Mock broken symlink
      mockFs.promises.lstat.mockResolvedValue({ isSymbolicLink: () => true });
      mockFs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.unlink.mockResolvedValue(undefined);
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      await appConfig.apply(ctx);

      expect(mockFs.promises.unlink).toHaveBeenCalledWith('/mock/home/.config/test/test.conf');
    });

    it('should create directory structure if it does not exist', async () => {
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      await appConfig.apply(ctx);

      expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/mock/home/.config/test', { recursive: true });
    });
  });
});
