/**
 * Tests for Homebrew package manager module
 * Mocks all external dependencies to avoid affecting host system
 */

// Mock all functions first before any imports
const mockResolvePackages = jest.fn();
const mockWriteResolvedPackages = jest.fn();
const mockReadResolvedPackages = jest.fn();
const mockExecAsync = jest.fn();

jest.mock('../../../src/core/contrib.js', () => ({
  resolvePackages: mockResolvePackages,
  writeResolvedPackages: mockWriteResolvedPackages,
  readResolvedPackages: mockReadResolvedPackages,
}));

jest.mock('node:child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('node:util', () => ({
  promisify: jest.fn(() => mockExecAsync),
}));

import { homebrewModule } from '../../../src/modules/packages/homebrew.js';
import { createMockContext, mockCommandSuccess, mockCommandFailure, resetAllMocks } from '../../mocks/index.js';

describe('Homebrew Package Manager', () => {
  beforeEach(() => {
    resetAllMocks();
    mockResolvePackages.mockReset();
    mockWriteResolvedPackages.mockReset();
    mockReadResolvedPackages.mockReset();
    mockExecAsync.mockReset();
  });

  describe('isApplicable', () => {
    it('should be applicable on macOS platform', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      
      const result = await homebrewModule.isApplicable(ctx);
      
      expect(result).toBe(true);
    });

    it('should not be applicable on non-macOS platforms', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      
      const result = await homebrewModule.isApplicable(ctx);
      
      expect(result).toBe(false);
    });
  });

  describe('plan', () => {
    it('should plan Homebrew installation when not installed', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockCommandFailure('which: brew: not found')(mockExecAsync);
      mockResolvePackages.mockReturnValue({ homebrew: [] });

      const result = await homebrewModule.plan(ctx);

      expect(result.changes).toContainEqual({ summary: 'Install Homebrew package manager' });
    });

    it('should plan package installation when packages are missing', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockCommandSuccess('')(mockExecAsync); // Homebrew is installed
      mockResolvePackages.mockReturnValue({
        homebrew: [
          { name: 'eza', manager: 'homebrew' },
          { name: 'ripgrep', manager: 'homebrew' },
        ],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }) // brew list --formula
        .mockResolvedValueOnce({ stdout: 'visual-studio-code', stderr: '' }); // brew list --cask

      const result = await homebrewModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Install 2 Homebrew packages: eza, ripgrep',
      });
    });

    it('should not plan package installation when packages are already installed', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockCommandSuccess('')(mockExecAsync); // Homebrew is installed
      mockResolvePackages.mockReturnValue({
        homebrew: [
          { name: 'git', manager: 'homebrew' },
          { name: 'node', manager: 'homebrew' },
        ],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }) // brew list --formula
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // brew list --cask

      const result = await homebrewModule.plan(ctx);

      expect(result.changes).toEqual([]);
    });
  });

  describe('apply', () => {
    it('should install Homebrew when not present', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockResolvePackages.mockReturnValue({ homebrew: [] });
      
      // First call fails (Homebrew not installed), second succeeds (after installation)
      mockExecAsync
        .mockRejectedValueOnce(new Error('which: brew: not found'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // Install script succeeds

      const result = await homebrewModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(mockExecAsync).toHaveBeenCalledWith(
        '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
      );
    });

    it('should install packages successfully', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockResolvePackages.mockReturnValue({
        homebrew: [
          { name: 'eza', manager: 'homebrew' },
          { name: 'ripgrep', manager: 'homebrew' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: 'git', stderr: '' }) // brew list --formula
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // brew list --cask
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // brew install eza
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // brew install ripgrep

      const result = await homebrewModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 2/2 packages');
    });

    it('should handle package installation failures gracefully', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockResolvePackages.mockReturnValue({
        homebrew: [
          { name: 'eza', manager: 'homebrew' },
          { name: 'invalid-package', manager: 'homebrew' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // brew list --formula
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // brew list --cask
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // brew install eza succeeds
        .mockRejectedValueOnce(new Error('Formula not found')) // brew install --cask eza fails
        .mockRejectedValueOnce(new Error('Formula not found')) // brew install invalid-package fails
        .mockRejectedValueOnce(new Error('Cask not found')); // brew install --cask invalid-package fails

      const result = await homebrewModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 1/2 packages');
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        { failed: ['invalid-package'] },
        'Some packages failed to install'
      );
    });

    it('should try cask installation when formula fails', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockResolvePackages.mockReturnValue({
        homebrew: [{ name: 'visual-studio-code', manager: 'homebrew' }],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // brew list --formula
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // brew list --cask
        .mockRejectedValueOnce(new Error('Formula not found')) // brew install fails
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // brew install --cask succeeds

      const result = await homebrewModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('brew install visual-studio-code');
      expect(mockExecAsync).toHaveBeenCalledWith('brew install --cask visual-studio-code');
    });

    it('should handle general errors', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockExecAsync.mockRejectedValue(new Error('Network error'));

      const result = await homebrewModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('Network error'));
    });
  });

  describe('status', () => {
    it('should return stale when Homebrew is not installed', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockExecAsync.mockRejectedValue(new Error('which: brew: not found'));

      const result = await homebrewModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('Homebrew not installed');
    });

    it('should return applied when no packages configured', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockReadResolvedPackages.mockReturnValue({ homebrew: [] });

      const result = await homebrewModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('Homebrew installed, no packages');
    });

    it('should return applied when all packages installed', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockReadResolvedPackages.mockReturnValue({
        homebrew: [
          { name: 'git', manager: 'homebrew' },
          { name: 'node', manager: 'homebrew' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }) // brew list --formula
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // brew list --cask

      const result = await homebrewModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('All packages installed');
    });

    it('should return stale when packages are missing', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      mockReadResolvedPackages.mockReturnValue({
        homebrew: [
          { name: 'git', manager: 'homebrew' },
          { name: 'missing-package', manager: 'homebrew' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: 'git', stderr: '' }) // brew list --formula
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // brew list --cask

      const result = await homebrewModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('1 packages missing');
    });
  });

  describe('getDetails', () => {
    it('should return package details when packages are configured', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({
        homebrew: [
          { name: 'git', manager: 'homebrew' },
          { name: 'node', manager: 'homebrew', language: 'node', version: '20.0.0' },
        ],
      });

      const result = homebrewModule.getDetails!(ctx);

      expect(result).toEqual([
        'Managing 2 packages:',
        '  • git',
        '  • node@20.0.0',
      ]);
    });

    it('should return no packages message when none configured', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({ homebrew: [] });

      const result = homebrewModule.getDetails!(ctx);

      expect(result).toEqual(['No packages configured']);
    });

    it('should handle undefined resolved packages', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue(undefined);

      const result = homebrewModule.getDetails!(ctx);

      expect(result).toEqual(['No packages configured']);
    });
  });
});
