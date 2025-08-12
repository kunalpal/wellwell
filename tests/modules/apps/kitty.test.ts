/**
 * Tests for Kitty app module
 * Mocks all external dependencies to avoid affecting host system
 */

// Mock all functions first before any imports
const mockAddPackageContribution = jest.fn();
const mockExecAsync = jest.fn();
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

jest.mock('node:child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('node:util', () => ({
  promisify: jest.fn(() => mockExecAsync),
}));

jest.mock('node:path', () => mockPath);

import { kittyModule } from '../../../src/modules/apps/kitty.js';
import { createMockContext, mockCommandSuccess, mockCommandFailure, resetAllMocks, mockFileExists, mockFileContent } from '../../mocks/index.js';

describe('Kitty App Module', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAddPackageContribution.mockReset();
    mockExecAsync.mockReset();
    Object.values(mockFs.promises).forEach(mock => mock.mockReset());
    Object.values(mockPath).forEach(mock => mock.mockReset());
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => p.split('/').slice(0, -1).join('/') || '/');
  });

  describe('isApplicable', () => {
    it('should be applicable only on macOS', async () => {
      const macCtx = createMockContext({ platform: 'macos' });
      const ubuntuCtx = createMockContext({ platform: 'ubuntu' });

      expect(await kittyModule.isApplicable(macCtx)).toBe(true);
      expect(await kittyModule.isApplicable(ubuntuCtx)).toBe(false);
    });
  });

  describe('plan', () => {
    it('should plan installation when kitty is not installed', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      // Mock kitty not installed
      mockExecAsync
        .mockRejectedValueOnce(new Error('which: kitty: not found')) // which kitty
        .mockRejectedValueOnce(new Error('No such package')) // brew list --cask kitty
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // /Applications/kitty.app
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // kitty.conf doesn't exist

      const result = await kittyModule.plan(ctx);

      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: 'kitty',
        manager: 'homebrew',
        platforms: ['macos'],
      });
      expect(result.changes).toContainEqual({
        summary: 'Create kitty.conf configuration',
      });
    });

    it('should plan config creation when config is missing', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      // Mock kitty installed
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' }); // which kitty succeeds
      // Mock config missing
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // kitty.conf doesn't exist

      const result = await kittyModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Create kitty.conf configuration',
      });
    });

    it('should not plan anything when kitty is installed and configured', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      // Mock kitty installed
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' }); // which kitty succeeds
      // Mock config exists
      mockFs.promises.access.mockResolvedValue(undefined); // kitty.conf exists

      const result = await kittyModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Update kitty.conf configuration',
      });
    });

    it('should detect kitty via homebrew cask when which fails', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync
        .mockRejectedValueOnce(new Error('which: kitty: not found')) // which kitty fails
        .mockResolvedValueOnce({ stdout: 'kitty', stderr: '' }); // brew list --cask kitty succeeds
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // kitty.conf doesn't exist

      const result = await kittyModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Create kitty.conf configuration',
      });
      expect(result.changes).not.toContainEqual(
        expect.objectContaining({ summary: expect.stringContaining('Install Kitty') })
      );
    });

    it('should detect kitty via Applications folder when other methods fail', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync
        .mockRejectedValueOnce(new Error('which: kitty: not found')) // which kitty fails
        .mockRejectedValueOnce(new Error('No such package')); // brew list --cask kitty fails
      mockFs.promises.access.mockResolvedValue(undefined); // /Applications/kitty.app exists
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // kitty.conf doesn't exist

      const result = await kittyModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: 'Create kitty.conf configuration',
      });
      expect(result.changes).not.toContainEqual(
        expect.objectContaining({ summary: expect.stringContaining('Install Kitty') })
      );
    });
  });

  describe('apply', () => {
    it('should install kitty and create config', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      // Mock kitty not installed initially
      mockExecAsync
        .mockRejectedValueOnce(new Error('which: kitty: not found')) // initial check
        .mockRejectedValueOnce(new Error('No such package')) // brew list check
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // brew install --cask kitty
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT')); // /Applications/kitty.app
      mockFs.promises.readFile.mockRejectedValue(new Error('ENOENT')); // config file doesn't exist
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      const result = await kittyModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toContain('Kitty detected (already installed) and Configuration created/updated');
      expect(mockExecAsync).toHaveBeenCalledWith('brew install --cask kitty');
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/mock/home/.config/kitty/kitty.conf',
        expect.stringContaining('# Kitty Configuration by wellwell'),
        'utf8'
      );
    });

    it('should handle kitty already installed', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      // Mock kitty already installed
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' }); // which kitty succeeds
      mockFs.promises.readFile.mockRejectedValue(new Error('ENOENT')); // config doesn't exist
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      const result = await kittyModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Kitty already installed and Configuration created/updated');
    });

    it('should update existing config', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' }); // which kitty succeeds
      mockFs.promises.readFile.mockResolvedValue('# Kitty Configuration by wellwell\nold_config');
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      const result = await kittyModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Kitty already installed and Configuration created/updated');
    });

    it('should handle installation errors gracefully', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync
        .mockRejectedValueOnce(new Error('which: kitty: not found')) // initial check
        .mockRejectedValueOnce(new Error('No such package')) // brew list check
        .mockRejectedValueOnce(new Error('No such package')) // brew install fails
        .mockRejectedValueOnce(new Error('which: kitty: not found')); // second which check fails
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await kittyModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error('No such package'));
    });

    it('should continue if installation fails but kitty becomes available', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync
        .mockRejectedValueOnce(new Error('No such package')) // brew list --cask kitty fails
        .mockRejectedValueOnce(new Error('Already installed')) // brew install --cask kitty fails
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // which kitty succeeds
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      const result = await kittyModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe('Kitty detected (already installed) and Configuration created/updated');
    });
  });

  describe('status', () => {
    it('should return stale when kitty is not installed', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync
        .mockRejectedValueOnce(new Error('which: kitty: not found'))
        .mockRejectedValueOnce(new Error('No such package'));
      mockFs.promises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await kittyModule.status!(ctx);

      expect(result.status).toBe('stale');
      expect(result.message).toBe('Kitty not installed');
    });

    it('should return stale when config is missing', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' }); // kitty installed
      mockFs.promises.readFile.mockRejectedValue(new Error('ENOENT')); // config missing

      const result = await kittyModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('Kitty installed and configured');
    });

    it('should return applied when kitty is installed and configured', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' }); // kitty installed
      mockFs.promises.readFile.mockResolvedValue('# Kitty Configuration by wellwell\nconfig'); // config exists

      const result = await kittyModule.status!(ctx);

      expect(result.status).toBe('applied');
      expect(result.message).toBe('Kitty installed and configured');
    });
  });

  describe('getDetails', () => {
    it('should return feature details', () => {
      const ctx = createMockContext();

      const result = kittyModule.getDetails!(ctx);

      expect(result).toEqual([
        'Modern GPU-accelerated terminal:',
        '  • Tokyo Night color scheme',
        '  • SF Mono font with optimized settings',
        '  • Powerline tab bar with slanted style',
        '  • macOS-specific optimizations',
        '  • Custom key mappings (cmd+c/v, tab navigation)',
        '  • Performance-tuned rendering',
      ]);
    });
  });

  describe('configuration content', () => {
    it('should contain Tokyo Night color scheme', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      await kittyModule.apply(ctx);

      const writeCall = mockFs.promises.writeFile.mock.calls[0];
      const config = writeCall[1];
      
      expect(config).toContain('# Kitty Configuration by wellwell');
      expect(config).toContain('foreground            #c0caf5');
      expect(config).toContain('background            #1a1b26');
      expect(config).toContain('font_family      Cascadia Code PL');
    });

    it('should contain macOS-specific settings', async () => {
      const ctx = createMockContext({ platform: 'macos', homeDir: '/mock/home' });
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);

      await kittyModule.apply(ctx);

      const writeCall = mockFs.promises.writeFile.mock.calls[0];
      const config = writeCall[1];
      
      expect(config).toContain('macos_option_as_alt yes');
      expect(config).toContain('macos_quit_when_last_window_closed yes');
      expect(config).toContain('map cmd+c copy_to_clipboard');
      expect(config).toContain('map cmd+v paste_from_clipboard');
    });
  });
});
