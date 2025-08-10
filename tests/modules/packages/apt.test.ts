/**
 * Tests for APT package manager module
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

import { aptModule } from '../../../src/modules/packages/apt.js';
import { createMockContext, mockCommandSuccess, mockCommandFailure, resetAllMocks } from '../../mocks/index.js';

describe('APT Package Manager', () => {
  beforeEach(() => {
    resetAllMocks();
    mockResolvePackages.mockReset();
    mockWriteResolvedPackages.mockReset();
    mockReadResolvedPackages.mockReset();
    mockExecAsync.mockReset();
  });

  describe('isApplicable', () => {
    it('should be applicable on Ubuntu platform with APT available', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync);

      const result = await aptModule.isApplicable(ctx);

      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('which apt');
    });

    it('should not be applicable on non-Ubuntu platforms', async () => {
      const ctx = createMockContext({ platform: 'macos' });

      const result = await aptModule.isApplicable(ctx);

      expect(result).toBe(false);
    });

    it('should not be applicable when APT is not available', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandFailure('which: apt: not found')(mockExecAsync);

      const result = await aptModule.isApplicable(ctx);

      expect(result).toBe(false);
    });
  });

  describe('plan', () => {
    it('should plan package cache update and installation', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockResolvePackages.mockReturnValue({
        apt: [
          { name: 'curl', manager: 'apt' },
          { name: 'git', manager: 'apt' },
        ],
      });
      
      // Mock dpkg command to show git is already installed
      mockExecAsync.mockResolvedValue({
        stdout: 'git\nlibc6\nvim',
        stderr: '',
      });

      const result = await aptModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Update package cache and install 1 APT packages: curl',
      });
    });

    it('should plan only cache update when no packages to install', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockResolvePackages.mockReturnValue({
        apt: [
          { name: 'git', manager: 'apt' },
        ],
      });
      
      // Mock dpkg command to show git is already installed
      mockExecAsync.mockResolvedValue({
        stdout: 'git\nlibc6',
        stderr: '',
      });

      const result = await aptModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Update package cache',
      });
    });

    it('should not plan anything when no packages configured', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockResolvePackages.mockReturnValue({ apt: [] });

      const result = await aptModule.plan(ctx);

      expect(result.changes).toEqual([]);
    });
  });

  describe('apply', () => {
    it('should update cache and install packages successfully', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockResolvePackages.mockReturnValue({
        apt: [
          { name: 'curl', manager: 'apt' },
          { name: 'wget', manager: 'apt' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // apt update
        .mockResolvedValueOnce({ stdout: 'git\nlibc6', stderr: '' }) // dpkg -l
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // apt install

      const result = await aptModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 2/2 packages');
      expect(mockExecAsync).toHaveBeenCalledWith('sudo apt update');
      expect(mockExecAsync).toHaveBeenCalledWith('sudo apt install -y curl wget');
      expect(mockWriteResolvedPackages).toHaveBeenCalled();
    });

    it('should handle partial installation failures', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockResolvePackages.mockReturnValue({
        apt: [
          { name: 'curl', manager: 'apt' },
          { name: 'invalid-package', manager: 'apt' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // apt update
        .mockResolvedValueOnce({ stdout: 'git', stderr: '' }) // dpkg -l
        .mockRejectedValueOnce(new Error('Package not found')) // bulk install fails
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // curl install succeeds
        .mockRejectedValueOnce(new Error('Package not found')); // invalid-package fails

      const result = await aptModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 1/2 packages');
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        { failed: ['invalid-package'] },
        'Some packages failed to install'
      );
    });

    it('should handle no packages to install', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockResolvePackages.mockReturnValue({
        apt: [
          { name: 'git', manager: 'apt' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // apt update
        .mockResolvedValueOnce({ stdout: 'git\nlibc6', stderr: '' }); // dpkg -l shows git installed

      const result = await aptModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.message).toBe('APT packages up to date');
    });

    it('should handle general errors', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockExecAsync.mockRejectedValue(new Error('Network error'));

      const result = await aptModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('Network error'));
    });
  });

  describe('status', () => {
    it('should return idle when APT is not available', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockExecAsync.mockRejectedValue(new Error('which: apt: not found'));

      const result = await aptModule.status!(ctx);

      expect(result.status).toBe('idle');
      expect(result.message).toBe('APT not available');
    });

    it('should return applied when no packages configured', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockReadResolvedPackages.mockReturnValue({ apt: [] });

      const result = await aptModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('APT available, no packages');
    });

    it('should return applied when all packages installed', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockReadResolvedPackages.mockReturnValue({
        apt: [
          { name: 'git', manager: 'apt' },
          { name: 'curl', manager: 'apt' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which apt
        .mockResolvedValueOnce({ stdout: 'git\ncurl\nlibc6', stderr: '' }); // dpkg -l

      const result = await aptModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('All packages installed');
    });

    it('should return idle when packages are missing', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockReadResolvedPackages.mockReturnValue({
        apt: [
          { name: 'git', manager: 'apt' },
          { name: 'missing-package', manager: 'apt' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which apt
        .mockResolvedValueOnce({ stdout: 'git\nlibc6', stderr: '' }); // dpkg -l

      const result = await aptModule.status!(ctx);

      expect(result.status).toBe('idle');
      expect(result.message).toBe('1 packages missing');
    });
  });

  describe('getDetails', () => {
    it('should return package details when packages are configured', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({
        apt: [
          { name: 'git', manager: 'apt' },
          { name: 'python', manager: 'apt', language: 'python', version: '3.11' },
        ],
      });

      const result = aptModule.getDetails!(ctx);

      expect(result).toEqual([
        'Managing 2 packages:',
        '  • git',
        '  • python@3.11',
      ]);
    });

    it('should return no packages message when none configured', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({ apt: [] });

      const result = aptModule.getDetails!(ctx);

      expect(result).toEqual(['No packages configured']);
    });

    it('should handle undefined resolved packages', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue(undefined);

      const result = aptModule.getDetails!(ctx);

      expect(result).toEqual(['No packages configured']);
    });
  });
});
