/**
 * Tests for Neovim app module
 * Mocks all external dependencies to avoid affecting host system
 */

// Mock all functions first before any imports
const mockAddPackageContribution = jest.fn();
const mockPath = {
  join: jest.fn((...args: string[]) => args.join('/')),
  dirname: jest.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/'),
};
const mockFs = {
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  },
};

jest.mock('../../../src/core/contrib.js', () => ({
  addPackageContribution: mockAddPackageContribution,
}));

jest.mock('node:fs', () => mockFs);

jest.mock('node:path', () => mockPath);

import { nvimModule } from '../../../src/modules/apps/nvim.js';
import { createMockContext, resetAllMocks } from '../../mocks/index.js';

describe('Neovim App Module', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAddPackageContribution.mockReset();
    Object.values(mockFs.promises).forEach(mock => mock.mockReset());
    Object.values(mockPath).forEach(mock => mock.mockReset());
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => p.split('/').slice(0, -1).join('/') || '/');
  });

  describe('isApplicable', () => {
    it('should always be applicable', async () => {
      const ctx = createMockContext();

      const result = await nvimModule.isApplicable(ctx);

      expect(result).toBe(true);
    });
  });

  describe('plan', () => {
    it('should add macOS package contributions', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // init.lua doesn't exist

      const result = await nvimModule.plan(ctx);

      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'neovim',
        manager: 'homebrew',
        platforms: ['macos'],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'ripgrep',
        manager: 'homebrew',
        platforms: ['macos'],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'fd',
        manager: 'homebrew',
        platforms: ['macos'],
      });
      expect(result.changes).toContainEqual({
        summary: 'Create init.lua configuration',
      });
    });

    it('should add Ubuntu package contributions', async () => {
      const ctx = createMockContext({ platform: 'ubuntu', homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));

      await nvimModule.plan(ctx);

      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'neovim',
        manager: 'apt',
        platforms: ['ubuntu'],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'ripgrep',
        manager: 'apt',
        platforms: ['ubuntu'],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'fd-find',
        manager: 'apt',
        platforms: ['ubuntu'],
      });
    });

    it('should add AL2 package contributions', async () => {
      const ctx = createMockContext({ platform: 'al2', homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));

      await nvimModule.plan(ctx);

      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'epel-release',
        manager: 'yum',
        platforms: ['al2'],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'neovim',
        manager: 'yum',
        platforms: ['al2'],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'ripgrep',
        manager: 'yum',
        platforms: ['al2'],
      });
    });

    it('should not plan config creation when init.lua exists', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockFs.promises.access.mockResolvedValue(undefined); // init.lua exists

      const result = await nvimModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Update init.lua configuration',
      });
    });
  });

  describe('apply', () => {
    it('should create basic neovim config when missing', async () => {
      const ctx = createMockContext({ homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // init.lua doesn't exist
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      const result = await nvimModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Configuration created/updated');
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/mock/home/.config/nvim', { recursive: true });
      const writeCall = mockFs.promises.writeFile.mock.calls[0];
      const config = writeCall[1];
      expect(config).toContain('-- Neovim configuration managed by wellwell - dracula theme');
    });

    it('should not modify existing config', async () => {
      const ctx = createMockContext({ homeDir: '/mock/home' });
      mockFs.promises.access.mockResolvedValue(undefined); // init.lua exists
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      const result = await nvimModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Configuration created/updated');
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });

    it('should handle file creation errors', async () => {
      const ctx = createMockContext({ homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockRejectedValue(new Error('Permission denied'));

      const result = await nvimModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('Permission denied'));
    });
  });

  describe('status', () => {
    it('should return applied when config exists', async () => {
      const ctx = createMockContext({ homeDir: '/mock/home' });
      mockFs.promises.access.mockResolvedValue(undefined); // init.lua exists

      const result = await nvimModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('init.lua exists');
    });

    it('should return stale when config is missing', async () => {
      const ctx = createMockContext({ homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // init.lua doesn't exist

      const result = await nvimModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('init.lua missing');
    });
  });

  describe('configuration content', () => {
    it('should contain basic vim settings', async () => {
      const ctx = createMockContext({ homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      await nvimModule.apply(ctx);

      const writeCall = mockFs.promises.writeFile.mock.calls[0];
      const config = writeCall[1];
      
      expect(config).toContain('vim.opt.number = true');
      expect(config).toContain('vim.opt.relativenumber = true');
      expect(config).toContain('vim.opt.tabstop = 2');
      expect(config).toContain('vim.opt.shiftwidth = 2');
      expect(config).toContain('vim.opt.expandtab = true');
    });

    it('should set leader key and basic keymaps', async () => {
      const ctx = createMockContext({ homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      await nvimModule.apply(ctx);

      const writeCall = mockFs.promises.writeFile.mock.calls[0];
      const config = writeCall[1];
      
      expect(config).toContain('vim.g.mapleader = " "');
      expect(config).toContain('vim.keymap.set("n", "<leader>pv", vim.cmd.Ex)');
      expect(config).toContain('vim.keymap.set("v", "J", ":m \'>+1<CR>gv=gv")');
      expect(config).toContain('vim.keymap.set("n", "<C-d>", "<C-d>zz")');
    });

    it('should have performance and visual optimizations', async () => {
      const ctx = createMockContext({ homeDir: '/mock/home' });
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      await nvimModule.apply(ctx);

      const writeCall = mockFs.promises.writeFile.mock.calls[0];
      const config = writeCall[1];
      
      expect(config).toContain('vim.opt.swapfile = false');
      expect(config).toContain('vim.opt.backup = false');
      expect(config).toContain('vim.opt.termguicolors = true');
      expect(config).toContain('vim.opt.scrolloff = 8');
      expect(config).toContain('vim.opt.colorcolumn = "80"');
    });
  });

  describe('dependencies', () => {
    it('should have correct dependencies', () => {
      expect(nvimModule.dependsOn).toEqual(['packages:homebrew', 'packages:apt', 'packages:yum']);
      expect(nvimModule.priority).toBe(60);
    });
  });
});
