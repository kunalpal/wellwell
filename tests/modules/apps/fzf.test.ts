/**
 * Tests for Fzf app module
 * Mocks all external dependencies to avoid affecting host system
 */

// Mock contrib functions first
const mockAddPackageContribution = jest.fn();
const mockAddShellInitContribution = jest.fn();

jest.mock('../../../src/core/contrib.js', () => ({
  addPackageContribution: mockAddPackageContribution,
  addShellInitContribution: mockAddShellInitContribution,
}));

// Mock theme context
const mockGetThemeColors = jest.fn();
jest.mock('../../../src/core/theme-context.js', () => ({
  themeContextProvider: {
    getThemeColors: mockGetThemeColors,
  },
}));

import { fzfModule } from '../../../src/modules/apps/fzf.js';
import { createMockContext, mockCommandSuccess, mockCommandFailure, resetAllMocks } from '../../mocks/index.js';

// Get the mocked fs
const mockFs = require('node:fs');

// Mock fs
jest.mock('node:fs', () => ({
  promises: {
    writeFile: jest.fn(),
    access: jest.fn(),
  },
}));

// Mock child_process
const mockExecAsync = jest.fn();
jest.mock('node:child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('node:util', () => ({
  promisify: jest.fn(() => mockExecAsync),
}));

describe('Fzf App Module', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAddPackageContribution.mockReset();
    mockAddShellInitContribution.mockReset();
    mockExecAsync.mockReset();
    mockFs.promises.writeFile.mockReset();
    mockFs.promises.access.mockReset();
    mockGetThemeColors.mockReset();
    
    // Default theme colors
    mockGetThemeColors.mockResolvedValue({
      base00: '#282a36',
      base02: '#44475a',
      base04: '#6272a4',
      base05: '#f8f8f2',
      base07: '#f8f8f2',
      base08: '#ff5555',
      base0A: '#f1fa8c',
      base0B: '#50fa7b',
      base0C: '#8be9fd',
      base0D: '#bd93f9',
      base0E: '#ff79c6',
    });
  });

  describe('isApplicable', () => {
    it('should always be applicable', async () => {
      const ctx = createMockContext();

      const result = await fzfModule.isApplicable(ctx);

      expect(result).toBe(true);
    });
  });

  describe('plan', () => {
    it('should add package contributions for all platforms', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });

      const result = await fzfModule.plan(ctx);

      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'fzf',
        manager: 'homebrew',
        platforms: ['macos'],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'fzf',
        manager: 'apt',
        platforms: ['ubuntu'],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'fzf',
        manager: 'yum',
        platforms: ['al2'],
      });
      expect(result.changes).toEqual([]);
    });
  });

  describe('apply', () => {
    it('should create theme-aware configuration and add shell init', async () => {
      const ctx = createMockContext();

      const result = await fzfModule.apply(ctx);

      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.fzf.zsh'),
        expect.stringContaining('FZF_DEFAULT_OPTS')
      );
      expect(mockAddShellInitContribution).toHaveBeenCalledWith(ctx, {
        name: 'fzf',
        initCode: expect.stringContaining('FZF_DEFAULT_COMMAND'),
      });
      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Fzf configured with theme-aware colors');
    });

    it('should configure fzf with ripgrep integration', async () => {
      const ctx = createMockContext();

      await fzfModule.apply(ctx);

      const shellInitCall = mockAddShellInitContribution.mock.calls[0];
      const initCode = shellInitCall[1].initCode;
      
      expect(initCode).toContain('FZF_DEFAULT_COMMAND=\'rg --files --hidden --follow --glob "!.git/*"\'');
      expect(initCode).toContain('FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"');
      expect(initCode).toContain('command -v fzf > /dev/null 2>&1');
    });

    it('should include multiple shell integration paths', async () => {
      const ctx = createMockContext();

      await fzfModule.apply(ctx);

      const shellInitCall = mockAddShellInitContribution.mock.calls[0];
      const initCode = shellInitCall[1].initCode;
      
      expect(initCode).toContain('/opt/homebrew/opt/fzf/shell/key-bindings.zsh');
      expect(initCode).toContain('/usr/share/fzf/key-bindings.zsh');
    });

    it('should handle errors gracefully', async () => {
      const ctx = createMockContext();
      mockFs.promises.writeFile.mockRejectedValue(new Error('Write failed'));

      const result = await fzfModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('Write failed'));
    });
  });

  describe('status', () => {
    it('should return applied when fzf is available and config exists', async () => {
      const ctx = createMockContext();
      mockCommandSuccess('')(mockExecAsync);
      mockFs.promises.access.mockResolvedValue(undefined);

      const result = await fzfModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('Fzf available and configured with theme');
      expect(mockExecAsync).toHaveBeenCalledWith('which fzf');
    });

    it('should return stale when fzf is not found', async () => {
      const ctx = createMockContext();
      mockCommandFailure('which: fzf: not found')(mockExecAsync);

      const result = await fzfModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('Fzf not found or configuration missing');
    });

    it('should return stale when config file is missing', async () => {
      const ctx = createMockContext();
      mockCommandSuccess('')(mockExecAsync);
      mockFs.promises.access.mockRejectedValue(new Error('File not found'));

      const result = await fzfModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('Fzf not found or configuration missing');
    });
  });

  describe('getDetails', () => {
    it('should return fzf configuration details', () => {
      const ctx = createMockContext();

      const result = fzfModule.getDetails!(ctx);

      expect(result).toEqual([
        'Fuzzy finder configuration:',
        '  • Backend: ripgrep for file search',
        '  • Key bindings: Ctrl+T, Ctrl+R, Alt+C',
        '  • Completion: Command line completion',
      ]);
    });
  });
});
