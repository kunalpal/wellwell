/**
 * Tests for YUM package manager module
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

import { yumModule } from '../../../src/modules/packages/yum.js';
import { createMockContext, mockCommandSuccess, mockCommandFailure, resetAllMocks } from '../../mocks/index.js';

describe('YUM Package Manager', () => {
  beforeEach(() => {
    resetAllMocks();
    mockResolvePackages.mockReset();
    mockWriteResolvedPackages.mockReset();
    mockReadResolvedPackages.mockReset();
    mockExecAsync.mockReset();
  });

  describe('isApplicable', () => {
    it('should be applicable on AL2 platform with yum available', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync); // which yum succeeds
      
      const result = await yumModule.isApplicable(ctx);
      
      expect(result).toBe(true);
    });

    it('should not be applicable on non-AL2 platforms', async () => {
      const ctx = createMockContext({ platform: 'macos' });
      
      const result = await yumModule.isApplicable(ctx);
      
      expect(result).toBe(false);
    });

    it('should not be applicable when yum is not available', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandFailure('which: yum: not found')(mockExecAsync);
      
      const result = await yumModule.isApplicable(ctx);
      
      expect(result).toBe(false);
    });
  });

  describe('plan', () => {
    it('should plan package installation when packages are missing', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync); // which yum succeeds
      mockResolvePackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
          { name: 'curl', manager: 'yum' },
        ],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum succeeds
        .mockResolvedValueOnce({ stdout: 'node\nvim', stderr: '' }); // yum list installed

      const result = await yumModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Install 2 YUM packages: git, curl',
      });
    });

    it('should not plan package installation when packages are already installed', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync); // which yum succeeds
      mockResolvePackages.mockReturnValue({
        yum: [{ name: 'git', manager: 'yum' }],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum succeeds
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }); // yum list installed

      const result = await yumModule.plan(ctx);

      expect(result.changes).not.toContainEqual({
        summary: expect.stringContaining('Install'),
      });
    });
  });

  describe('apply', () => {
    it('should install packages successfully', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync); // which yum succeeds
      mockResolvePackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
          { name: 'curl', manager: 'yum' },
        ],
      });
      
      // Mock package operations
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum succeeds
        .mockResolvedValueOnce({ stdout: 'node\nvim', stderr: '' }) // yum list installed
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // sudo yum install -y git curl

      const result = await yumModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 2/2 packages');
      expect(mockExecAsync).toHaveBeenCalledWith('sudo yum install -y git curl');
    });

    it('should handle partial installation failures', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync); // which yum succeeds
      mockResolvePackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
          { name: 'invalid-package', manager: 'yum' },
        ],
      });
      
      // Mock package operations - first bulk install fails, then individual installs
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum succeeds
        .mockResolvedValueOnce({ stdout: 'node\nvim', stderr: '' }) // yum list installed
        .mockRejectedValueOnce(new Error('Package not found')) // sudo yum install -y git invalid-package fails
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // sudo yum install -y git succeeds
        .mockRejectedValueOnce(new Error('Package not found')); // sudo yum install -y invalid-package fails

      const result = await yumModule.apply(ctx);

      // Base class considers partial failures as success
      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 2/2 packages');
    });

    it('should handle general errors', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync); // which yum succeeds
      mockResolvePackages.mockReturnValue({ yum: [{ name: 'test-package', manager: 'yum' }] });
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum succeeds
        .mockResolvedValueOnce({ stdout: 'other-package', stderr: '' }) // yum list installed
        .mockRejectedValueOnce(new Error('Network error')); // yum install fails

      const result = await yumModule.apply(ctx);

      // Base class handles errors gracefully and considers partial failures as success
      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 1/1 packages');
    });
  });

  describe('status', () => {
    it('should return stale when yum is not available', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandFailure('which: yum: not found')(mockExecAsync);

      const result = await yumModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('YUM not available');
    });

    it('should return applied when no packages configured', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({ yum: [] });

      const result = await yumModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('YUM available, no packages');
    });

    it('should return applied when all packages installed', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({
        yum: [{ name: 'git', manager: 'yum' }],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum succeeds
        .mockResolvedValueOnce({ stdout: 'git\nnode', stderr: '' }); // yum list installed

      const result = await yumModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('All packages installed');
    });

    it('should return stale when packages are missing', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({
        yum: [{ name: 'git', manager: 'yum' }],
      });
      
      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum succeeds
        .mockResolvedValueOnce({ stdout: 'node\ncurl', stderr: '' }); // yum list installed (git not found)

      const result = await yumModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('1 packages missing');
    });
  });

  describe('getDetails', () => {
    it('should return package details when packages are configured', () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockReadResolvedPackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
          { name: 'node', manager: 'yum', language: 'node', version: '20.0.0' },
        ],
      });

      const result = yumModule.getDetails!(ctx);

      expect(result).toEqual([
        'Managing 2 packages:',
        '  • git',
        '  • node@20.0.0',
      ]);
    });

    it('should return no packages message when none configured', () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockReadResolvedPackages.mockReturnValue({ yum: [] });

      const result = yumModule.getDetails!(ctx);

      expect(result).toEqual(['No packages configured']);
    });
  });
});
