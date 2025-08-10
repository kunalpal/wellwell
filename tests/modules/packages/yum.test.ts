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
    it('should be applicable on AL2 platform with YUM available', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandSuccess('')(mockExecAsync);

      const result = await yumModule.isApplicable(ctx);

      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('which yum');
    });

    it('should not be applicable on non-AL2 platforms', async () => {
      const ctx = createMockContext({ platform: 'ubuntu' });

      const result = await yumModule.isApplicable(ctx);

      expect(result).toBe(false);
    });

    it('should not be applicable when YUM is not available', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockCommandFailure('which: yum: not found')(mockExecAsync);

      const result = await yumModule.isApplicable(ctx);

      expect(result).toBe(false);
    });
  });

  describe('plan', () => {
    it('should plan package installation when packages are missing', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockResolvePackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
          { name: 'curl', manager: 'yum' },
        ],
      });
      
      // Mock yum list installed command to show git is already installed
      mockExecAsync.mockResolvedValue({
        stdout: 'git\nglibc\nvim',
        stderr: '',
      });

      const result = await yumModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Install 1 YUM packages: curl',
      });
    });

    it('should not plan anything when no packages to install', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockResolvePackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
        ],
      });
      
      // Mock yum list installed to show git is already installed
      mockExecAsync.mockResolvedValue({
        stdout: 'git\nglibc',
        stderr: '',
      });

      const result = await yumModule.plan(ctx);

      expect(result.changes).toEqual([]);
    });

    it('should not plan anything when no packages configured', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockResolvePackages.mockReturnValue({ yum: [] });

      const result = await yumModule.plan(ctx);

      expect(result.changes).toEqual([]);
    });
  });

  describe('apply', () => {
    it('should install packages successfully', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockResolvePackages.mockReturnValue({
        yum: [
          { name: 'curl', manager: 'yum' },
          { name: 'wget', manager: 'yum' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'git\nglibc', stderr: '' }) // yum list installed
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // yum install

      const result = await yumModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 2/2 packages');
      expect(mockExecAsync).toHaveBeenCalledWith('sudo yum install -y curl wget');
      expect(mockWriteResolvedPackages).toHaveBeenCalled();
    });

    it('should handle partial installation failures', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockResolvePackages.mockReturnValue({
        yum: [
          { name: 'curl', manager: 'yum' },
          { name: 'invalid-package', manager: 'yum' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'git', stderr: '' }) // yum list installed
        .mockRejectedValueOnce(new Error('Package not found')) // bulk install fails
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // curl install succeeds
        .mockRejectedValueOnce(new Error('Package not found')); // invalid-package fails

      const result = await yumModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Installed 1/2 packages');
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        { failed: ['invalid-package'] },
        'Some packages failed to install'
      );
    });

    it('should handle no packages to install', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockResolvePackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
        ],
      });
      
      mockExecAsync.mockResolvedValue({ stdout: 'git\nglibc', stderr: '' }); // yum list shows git installed

      const result = await yumModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.message).toBe('YUM packages up to date');
    });

    it('should handle general errors', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockResolvePackages.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await yumModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('Network error'));
    });
  });

  describe('status', () => {
    it('should return idle when YUM is not available', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockExecAsync.mockRejectedValue(new Error('which: yum: not found'));

      const result = await yumModule.status!(ctx);

      expect(result.status).toBe('idle');
      expect(result.message).toBe('YUM not available');
    });

    it('should return applied when no packages configured', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockReadResolvedPackages.mockReturnValue({ yum: [] });

      const result = await yumModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('YUM available, no packages');
    });

    it('should return applied when all packages installed', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockReadResolvedPackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
          { name: 'curl', manager: 'yum' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum
        .mockResolvedValueOnce({ stdout: 'git\ncurl\nglibc', stderr: '' }); // yum list installed

      const result = await yumModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('All packages installed');
    });

    it('should return idle when packages are missing', async () => {
      const ctx = createMockContext({ platform: 'al2' });
      mockReadResolvedPackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
          { name: 'missing-package', manager: 'yum' },
        ],
      });
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // which yum
        .mockResolvedValueOnce({ stdout: 'git\nglibc', stderr: '' }); // yum list installed

      const result = await yumModule.status!(ctx);

      expect(result.status).toBe('idle');
      expect(result.message).toBe('1 packages missing');
    });
  });

  describe('getDetails', () => {
    it('should return package details when packages are configured', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({
        yum: [
          { name: 'git', manager: 'yum' },
          { name: 'python', manager: 'yum', language: 'python', version: '3.9' },
        ],
      });

      const result = yumModule.getDetails!(ctx);

      expect(result).toEqual([
        'Managing 2 packages:',
        '  • git',
        '  • python@3.9',
      ]);
    });

    it('should return no packages message when none configured', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({ yum: [] });

      const result = yumModule.getDetails!(ctx);

      expect(result).toEqual(['No packages configured']);
    });

    it('should handle undefined resolved packages', () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue(undefined);

      const result = yumModule.getDetails!(ctx);

      expect(result).toEqual(['No packages configured']);
    });
  });
});
