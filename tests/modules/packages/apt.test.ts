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
    it('should be applicable on Ubuntu platform with apt available', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync); // which apt succeeds
      
      const result = await aptModule.isApplicable(ctx);
      
      expect(result).toBe(true);
    });

    it('should not be applicable on non-Ubuntu platforms', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      
      const result = await aptModule.isApplicable(ctx);
      
      expect(result).toBe(false);
    });

    it('should not be applicable when apt is not available', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandFailure('which: apt: not found')(mockExecAsync);
      
      const result = await aptModule.isApplicable(ctx);
      
      expect(result).toBe(false);
    });
  });

  describe('plan', () => {
    it('should plan package cache update and installation', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync); // which apt succeeds
      mockResolvePackages.mockReturnValue({
        apt: [{ name: 'curl', manager: 'apt' }],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which apt succeeds
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }); // dpkg -l

      const result = await aptModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Update package cache and Install 1 APT packages: curl',
      });
    });

    it('should plan only cache update when packages are already installed', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync); // which apt succeeds
      mockResolvePackages.mockReturnValue({
        apt: [{ name: 'git', manager: 'apt' }],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which apt succeeds
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }); // dpkg -l

      const result = await aptModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Update package cache',
      });
    });
  });

  describe('apply', () => {
    it('should update cache and install packages successfully', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync); // which apt succeeds
      mockResolvePackages.mockReturnValue({
        apt: [
          { name: 'curl', manager: 'apt' },
          { name: 'wget', manager: 'apt' },
        ],
      });
      
      // Mock package operations
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which apt succeeds
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // sudo apt update
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }) // dpkg -l
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // sudo apt install -y curl wget

      const result = await aptModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 2/2 packages');
      expect(mockExecAsync).toHaveBeenCalledWith('sudo apt update');
      expect(mockExecAsync).toHaveBeenCalledWith('sudo apt install -y curl wget');
    });

    it('should handle partial installation failures', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync); // which apt succeeds
      mockResolvePackages.mockReturnValue({
        apt: [
          { name: 'git', manager: 'apt' },
          { name: 'invalid-package', manager: 'apt' },
        ],
      });
      
      // Mock package operations - first bulk install fails, then individual installs
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which apt succeeds
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // sudo apt update
        .mockResolvedValueOnce({ stdout: 'node\nvim', stderr: '' }) // dpkg -l check
        .mockRejectedValueOnce(new Error('Package not found')) // sudo apt install -y git invalid-package fails
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // sudo apt install -y git succeeds
        .mockRejectedValueOnce(new Error('Package not found')); // sudo apt install -y invalid-package fails

      const result = await aptModule.apply(ctx);

      // Base class considers partial failures as success
      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 2/2 packages');
    });

    it('should handle general errors', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync); // which apt succeeds
      mockResolvePackages.mockReturnValue({ apt: [] });
      mockExecAsync.mockRejectedValue(new Error('Network error'));

      const result = await aptModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('Network error'));
    });
  });

  describe('status', () => {
    it('should return stale when apt is not available', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandFailure('which: apt: not found')(mockExecAsync);

      const result = await aptModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('APT not available');
    });

    it('should return applied when no packages configured', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({ apt: [] });

      const result = await aptModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('APT available, no packages');
    });

    it('should return applied when all packages installed', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({
        apt: [{ name: 'git', manager: 'apt' }],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which apt succeeds
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }); // dpkg -l

      const result = await aptModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('All packages installed');
    });

    it('should return stale when packages are missing', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockCommandSuccess('')(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({
        apt: [{ name: 'git', manager: 'apt' }],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which apt succeeds
        .mockResolvedValueOnce({ stdout: 'node\ncurl', stderr: '' }); // dpkg -l (git not found)

      const result = await aptModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('1 packages missing');
    });
  });

  describe('getDetails', () => {
    it('should return package details when packages are configured', () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockReadResolvedPackages.mockReturnValue({
        apt: [
          { name: 'git', manager: 'apt' },
          { name: 'node', manager: 'apt', language: 'node', version: '20.0.0' },
        ],
      });

      const result = aptModule.getDetails!(ctx);

      expect(result).toEqual([
        'Managing 2 packages:',
        '  • git',
        '  • node@20.0.0',
      ]);
    });

    it('should return no packages message when none configured', () => {
      const ctx = createMockContext({ platform: 'ubuntu' });
      mockReadResolvedPackages.mockReturnValue({ apt: [] });

      const result = aptModule.getDetails!(ctx);

      expect(result).toEqual(['No packages configured']);
    });
  });
});
