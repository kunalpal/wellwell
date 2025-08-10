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

import { fzfModule } from '../../../src/modules/apps/fzf.js';
import { createMockContext, mockCommandSuccess, mockCommandFailure, resetAllMocks } from '../../mocks/index.js';

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
    it('should add shell initialization and return success', async () => {
      const ctx = createMockContext();

      const result = await fzfModule.apply(ctx);

      expect(mockAddShellInitContribution).toHaveBeenCalledWith(ctx, {
        name: 'fzf',
        initCode: expect.stringContaining('FZF_DEFAULT_COMMAND'),
      });
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.message).toBe('Package requirements and shell init contributed');
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
      
      expect(initCode).toContain('~/.fzf.zsh');
      expect(initCode).toContain('/opt/homebrew/opt/fzf/shell/key-bindings.zsh');
      expect(initCode).toContain('/usr/share/fzf/key-bindings.zsh');
    });
  });

  describe('status', () => {
    it('should return applied when fzf is available', async () => {
      const ctx = createMockContext();
      mockCommandSuccess('')(mockExecAsync);

      const result = await fzfModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('Fzf available and configured');
      expect(mockExecAsync).toHaveBeenCalledWith('which fzf');
    });

    it('should return idle when fzf is not found', async () => {
      const ctx = createMockContext();
      mockCommandFailure('which: fzf: not found')(mockExecAsync);

      const result = await fzfModule.status!(ctx);

      expect(result.status).toBe('idle');
      expect(result.message).toBe('Fzf not found in PATH');
    });
  });

  describe('getDetails', () => {
    it('should return configuration details', () => {
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

  describe('dependencies', () => {
    it('should have correct dependencies', () => {
      expect(fzfModule.dependsOn).toEqual(['apps:ripgrep', 'themes:base16']);
      expect(fzfModule.priority).toBe(61);
    });
  });
});
