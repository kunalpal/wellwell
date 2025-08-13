/**
 * Tests for Engine functionality
 * Mocks all dependencies to test engine logic without affecting host system
 */

import { Engine } from '../../src/core/engine.js';
import { createMockContext, mockLogger, resetAllMocks } from '../mocks/index.js';
import type { ConfigurationModule, ConfigurationContext, ModuleResult, PlanResult } from '../../src/core/types.js';

// Mock all dependencies
jest.mock('../../src/core/platform.js', () => ({
  detectPlatform: jest.fn(() => 'ubuntu'),
}));

jest.mock('../../src/core/logger.js', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

jest.mock('../../src/core/state.js', () => ({
  JsonFileStateStore: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    has: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('node:os', () => ({
  homedir: jest.fn(() => '/mock/home'),
}));

jest.mock('node:path', () => ({
  join: jest.fn((...args: string[]) => args.join('/')),
}));

describe('Engine', () => {
  let engine: Engine;
  let originalCI: string | undefined;

  beforeEach(() => {
    resetAllMocks();
    originalCI = process.env.CI;
    delete process.env.CI;
    engine = new Engine();
  });

  afterEach(() => {
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  describe('module registration', () => {
    it('should register a module successfully', () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(module);

      // Should not throw and module should be stored internally
      expect(() => engine.register(module)).toThrow('Module with id test-module already registered');
    });

    it('should prevent duplicate module registration', () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(module);

      expect(() => engine.register(module)).toThrow('Module with id test-module already registered');
    });
  });

  describe('context building', () => {
    it('should build configuration context with defaults', () => {
      const context = engine.buildContext();

      expect(context.platform).toBe('ubuntu');
      expect(context.homeDir).toBe('/mock/home');
      expect(context.cwd).toBe(process.cwd());
      expect(context.isCI).toBe(false);
      expect(context.logger).toBe(mockLogger);
      expect(context.state).toBeDefined();
    });

    it('should detect CI environment', () => {
      const originalCI = process.env.CI;
      process.env.CI = 'true';

      const context = engine.buildContext();

      expect(context.isCI).toBe(true);

      process.env.CI = originalCI;
    });
  });

  describe('dependency resolution', () => {
    it('should handle modules without dependencies', async () => {
      const moduleA: ConfigurationModule = {
        id: 'module-a',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [{ summary: 'Change A' }] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      const moduleB: ConfigurationModule = {
        id: 'module-b',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [{ summary: 'Change B' }] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(moduleA);
      engine.register(moduleB);

      const results = await engine.plan();

      expect(results).toHaveProperty('module-a');
      expect(results).toHaveProperty('module-b');
    });

    it('should resolve dependencies correctly', async () => {
      const moduleA: ConfigurationModule = {
        id: 'module-a',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      const moduleB: ConfigurationModule = {
        id: 'module-b',
        dependsOn: ['module-a'],
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(moduleA);
      engine.register(moduleB);

      const results = await engine.apply();

      const moduleACalls = (moduleA.apply as jest.Mock).mock.invocationCallOrder;
      const moduleBCalls = (moduleB.apply as jest.Mock).mock.invocationCallOrder;
      expect(moduleACalls[0]).toBeLessThan(moduleBCalls[0]);
    });

    it('should detect circular dependencies', () => {
      const moduleA: ConfigurationModule = {
        id: 'module-a',
        dependsOn: ['module-b'],
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      const moduleB: ConfigurationModule = {
        id: 'module-b',
        dependsOn: ['module-a'],
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(moduleA);
      engine.register(moduleB);

      expect(() => engine.plan()).rejects.toThrow('Circular dependency detected');
    });

    it('should handle missing dependencies', () => {
      const moduleB: ConfigurationModule = {
        id: 'module-b',
        dependsOn: ['nonexistent-module'],
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(moduleB);

      expect(() => engine.plan()).rejects.toThrow('Missing dependency nonexistent-module for module-b');
    });
  });

  describe('planning', () => {
    it('should plan applicable modules', async () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [{ summary: 'Test change' }] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(module);

      const results = await engine.plan();

      expect(module.isApplicable).toHaveBeenCalled();
      expect(module.plan).toHaveBeenCalled();
      expect(results['test-module']).toEqual({ changes: [{ summary: 'Test change' }] });
    });

    it('should skip non-applicable modules', async () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(false),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(module);

      const results = await engine.plan();

      expect(module.isApplicable).toHaveBeenCalled();
      expect(module.plan).not.toHaveBeenCalled();
      expect(results).toEqual({});
    });

    it('should plan only selected modules', async () => {
      const moduleA: ConfigurationModule = {
        id: 'module-a',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      const moduleB: ConfigurationModule = {
        id: 'module-b',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(moduleA);
      engine.register(moduleB);

      const results = await engine.plan(['module-a']);

      expect(moduleA.plan).toHaveBeenCalled();
      expect(moduleB.plan).not.toHaveBeenCalled();
      expect(results).toHaveProperty('module-a');
      expect(results).not.toHaveProperty('module-b');
    });
  });

  describe('application', () => {
    it('should apply modules successfully', async () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true, changed: true }),
      };

      engine.register(module);

      const results = await engine.apply();

      expect(module.apply).toHaveBeenCalled();
      expect(results['test-module']).toEqual({ success: true, changed: true });
    });

    it('should handle module failures gracefully', async () => {
      const moduleA: ConfigurationModule = {
        id: 'module-a',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockRejectedValue(new Error('Apply failed')),
      };

      const moduleB: ConfigurationModule = {
        id: 'module-b',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(moduleA);
      engine.register(moduleB);

      const results = await engine.apply();

      expect(results['module-a']).toEqual({ success: false, error: expect.any(Error), message: 'exception' });
      expect(results['module-b']).toEqual({ success: true });
    });

    it('should skip modules with failed dependencies', async () => {
      const moduleA: ConfigurationModule = {
        id: 'module-a',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockRejectedValue(new Error('Module A failed')), // Force failure
      };

      const moduleB: ConfigurationModule = {
        id: 'module-b',
        dependsOn: ['module-a'],
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
        onStatusChange: jest.fn(),
      };

      engine.register(moduleA);
      engine.register(moduleB);

      const results = await engine.apply();

      expect(moduleB.apply).not.toHaveBeenCalled();
      expect(moduleB.onStatusChange).toHaveBeenCalledWith('skipped');
      expect(results['module-b']).toEqual({ success: true, changed: false, message: 'skipped' });
    });

    it('should call module status change hooks', async () => {
      const onStatusChange = jest.fn();
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
        onStatusChange,
      };

      engine.register(module);

      await engine.apply();

      expect(onStatusChange).toHaveBeenCalledWith('applied');
    });

    it('should call engine hooks', async () => {
      const onModuleStatusChange = jest.fn();
      const engineWithHooks = new Engine({ hooks: { onModuleStatusChange } });

      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engineWithHooks.register(module);

      await engineWithHooks.apply();

      expect(onModuleStatusChange).toHaveBeenCalledWith({ id: 'test-module', status: 'pending' });
      expect(onModuleStatusChange).toHaveBeenCalledWith({ id: 'test-module', status: 'applied' });
    });
  });

  describe('status checking', () => {
    it('should derive status from plan - applied when no changes', async () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
        status: jest.fn().mockResolvedValue({ status: 'applied', message: 'All good' }),
      };

      engine.register(module);

      const results = await engine.statuses();

      expect(module.status).toHaveBeenCalled();
      expect(results['test-module']).toBe('applied');
    });

    it('should derive status from plan - stale when changes exist', async () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ 
          changes: [{ summary: 'Install package', details: 'Need to install foo' }] 
        }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(module);

      const results = await engine.statuses();

      expect(module.plan).toHaveBeenCalled();
      expect(results['test-module']).toBe('stale');
    });

    it('should fall back to plan when status method fails', async () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
        status: jest.fn().mockRejectedValue(new Error('Status failed')),
      };

      engine.register(module);

      const results = await engine.statuses();

      expect(module.status).toHaveBeenCalled();
      expect(module.plan).toHaveBeenCalled();
      expect(results['test-module']).toBe('applied');
    });

    it('should default to stale status when plan fails and no status method', async () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockRejectedValue(new Error('Plan failed')),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(module);

      const results = await engine.statuses();

      expect(module.plan).toHaveBeenCalled();
      expect(results['test-module']).toBe('stale');
    });

    it('should skip non-applicable modules for status', async () => {
      const module: ConfigurationModule = {
        id: 'test-module',
        isApplicable: jest.fn().mockResolvedValue(false),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
        status: jest.fn().mockResolvedValue({ status: 'applied' }),
      };

      engine.register(module);

      const results = await engine.statuses();

      expect(module.plan).not.toHaveBeenCalled();
      expect(module.status).not.toHaveBeenCalled();
      expect(results).toEqual({});
    });

    it('should handle multiple modules with different statuses correctly', async () => {
      const appliedModule: ConfigurationModule = {
        id: 'applied-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ changes: [] }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      const staleModule: ConfigurationModule = {
        id: 'stale-module',
        isApplicable: jest.fn().mockResolvedValue(true),
        plan: jest.fn().mockResolvedValue({ 
          changes: [{ summary: 'Update configuration' }] 
        }),
        apply: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.register(appliedModule);
      engine.register(staleModule);

      const results = await engine.statuses();

      expect(results['applied-module']).toBe('applied');
      expect(results['stale-module']).toBe('stale');
    });
  });

  describe('engine options', () => {
    it('should respect custom state file path', () => {
      const customEngine = new Engine({ stateFilePath: '/custom/state.json' });
      
      const context = customEngine.buildContext();
      
      // This is indirectly tested via the JsonFileStateStore constructor call
      expect(context.state).toBeDefined();
    });

    it('should pass logging options to logger', () => {
      const customEngine = new Engine({ verbose: true, prettyLogs: false });
      
      const context = customEngine.buildContext();
      
      expect(context.logger).toBe(mockLogger);
    });
  });
});
