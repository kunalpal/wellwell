/**
 * Central mocking utilities for testing
 * Provides safe mocks that don't affect the host system
 */

import type { ConfigurationContext, Platform, StateStore } from '../../src/core/types.js';

// Mock file system operations
export const mockFs = {
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    chmod: jest.fn(),
  },
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
  chmodSync: jest.fn(),
};

// Mock child_process operations
export const mockExec = jest.fn();
export const mockSpawn = jest.fn();

// Mock process operations
export const mockProcess = {
  cwd: jest.fn(() => '/mock/cwd'),
  chdir: jest.fn(),
  env: { ...process.env, NODE_ENV: 'test' } as any,
  platform: 'linux' as NodeJS.Platform,
  exit: jest.fn(),
};

// Mock os operations
export const mockOs = {
  homedir: jest.fn(() => '/mock/home'),
  platform: jest.fn(() => 'linux' as NodeJS.Platform),
  tmpdir: jest.fn(() => '/mock/tmp'),
  userInfo: jest.fn(() => ({ username: 'testuser', uid: 1000, gid: 1000, shell: '/bin/bash', homedir: '/mock/home' })),
};

// Mock path operations
export const mockPath = {
  join: jest.fn((...args: string[]) => args.join('/')),
  resolve: jest.fn((...args: string[]) => '/' + args.filter(Boolean).join('/')),
  dirname: jest.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/'),
  basename: jest.fn((p: string) => p.split('/').pop() || ''),
  extname: jest.fn((p: string) => {
    const base = p.split('/').pop() || '';
    const lastDot = base.lastIndexOf('.');
    return lastDot > 0 ? base.slice(lastDot) : '';
  }),
  isAbsolute: jest.fn((p: string) => p.startsWith('/')),
  relative: jest.fn((from: string, to: string) => to),
  sep: '/',
  delimiter: ':',
};

// Mock logger
export const mockLogger: any = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: jest.fn(() => mockLogger),
};

// Mock state store
export const createMockStateStore = (initialData: Record<string, unknown> = {}): StateStore => {
  const data = { ...initialData };
  
  return {
    get: jest.fn((key: string) => data[key]) as any,
    set: jest.fn((key: string, value: unknown) => { data[key] = value; }),
    delete: jest.fn((key: string) => { delete data[key]; }),
    has: jest.fn((key: string) => key in data),
    flush: jest.fn().mockResolvedValue(undefined),
  };
};

// Create mock configuration context
export const createMockContext = (overrides: Partial<ConfigurationContext> = {}): ConfigurationContext => ({
  platform: 'ubuntu' as Platform,
  homeDir: '/mock/home',
  cwd: '/mock/cwd',
  isCI: false,
  logger: mockLogger,
  state: createMockStateStore(),
  ...overrides,
});

// Mock network operations
export const mockFetch = jest.fn();
export const mockHttps = {
  get: jest.fn(),
  request: jest.fn(),
};

// Reset all mocks
export const resetAllMocks = () => {
  jest.clearAllMocks();
  Object.values(mockFs.promises).forEach(mock => mock.mockReset());
  Object.values(mockFs).filter(v => typeof v === 'function').forEach(mock => (mock as any).mockReset());
  mockExec.mockReset();
  mockSpawn.mockReset();
  Object.values(mockProcess).filter(v => typeof v === 'function').forEach(mock => (mock as any).mockReset());
  Object.values(mockOs).forEach(mock => mock.mockReset());
  Object.values(mockPath).filter(v => typeof v === 'function').forEach(mock => (mock as any).mockReset());
  Object.values(mockLogger).forEach(mock => (mock as any).mockReset());
  mockFetch.mockReset();
  Object.values(mockHttps).forEach(mock => mock.mockReset());
};

// Command execution mocking helpers
export const mockCommandSuccess = (stdout = '', stderr = '') => (mockExec: any) => {
  mockExec.mockResolvedValue({ stdout, stderr });
};

export const mockCommandFailure = (error: Error | string = 'Command failed') => (mockExec: any) => {
  const err = typeof error === 'string' ? new Error(error) : error;
  mockExec.mockRejectedValue(err);
};

// File system mocking helpers
export const mockFileExists = (path: string, exists = true) => {
  if (exists) {
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.existsSync.mockReturnValue(true);
  } else {
    const error = new Error('ENOENT: no such file or directory') as any;
    error.code = 'ENOENT';
    mockFs.promises.access.mockRejectedValue(error);
    mockFs.existsSync.mockReturnValue(false);
  }
};

export const mockFileContent = (path: string, content: string) => {
  mockFs.promises.readFile.mockResolvedValue(content);
  mockFs.readFileSync.mockReturnValue(content);
};

// Platform detection mocking
export const mockPlatform = (platform: Platform) => {
  switch (platform) {
    case 'macos':
      mockOs.platform.mockReturnValue('darwin');
      mockProcess.platform = 'darwin';
      break;
    case 'ubuntu':
      mockOs.platform.mockReturnValue('linux');
      mockProcess.platform = 'linux';
      mockProcess.env.ID_LIKE = 'ubuntu';
      break;
    case 'al2':
      mockOs.platform.mockReturnValue('linux');
      mockProcess.platform = 'linux';
      mockProcess.env.ID = 'amzn';
      break;
    default:
      mockOs.platform.mockReturnValue('win32');
      mockProcess.platform = 'win32';
  }
};
