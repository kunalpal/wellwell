/**
 * Tests for JsonFileStateStore
 * Mocks filesystem operations to test state management without affecting host system
 */

// Mock filesystem first
const mockFs = {
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

jest.mock('node:fs', () => mockFs);
jest.mock('node:fs/promises', () => mockFs.promises);

import { JsonFileStateStore } from '../../src/core/state.js';
import { resetAllMocks } from '../mocks/index.js';

describe('JsonFileStateStore', () => {
  const testPath = '/mock/state.json';
  
  beforeEach(() => {
    resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty state when file does not exist', () => {
      mockFs.readFileSync.mockImplementation(() => {
        const error = new Error('ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      });

      const store = new JsonFileStateStore(testPath);
      
      expect(store.get('nonexistent')).toBeUndefined();
      expect(mockFs.readFileSync).toHaveBeenCalledWith(testPath, 'utf8');
    });

    it('should load existing state from file', () => {
      const existingData = { key1: 'value1', key2: { nested: 'value' } };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingData));

      const store = new JsonFileStateStore(testPath);
      
      expect(store.get('key1')).toBe('value1');
      expect(store.get('key2')).toEqual({ nested: 'value' });
    });

    it('should handle invalid JSON gracefully', () => {
      mockFs.readFileSync.mockReturnValue('invalid json');

      const store = new JsonFileStateStore(testPath);
      
      expect(store.get('key1')).toBeUndefined();
    });
  });

  describe('get/set operations', () => {
    let store: JsonFileStateStore;

    beforeEach(() => {
      mockFs.readFileSync.mockImplementation(() => {
        const error = new Error('ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      });
      store = new JsonFileStateStore(testPath);
    });

    it('should set and get string values', () => {
      store.set('test', 'value');
      expect(store.get('test')).toBe('value');
    });

    it('should set and get object values', () => {
      const obj = { foo: 'bar', nested: { value: 123 } };
      store.set('object', obj);
      expect(store.get('object')).toEqual(obj);
    });

    it('should set and get array values', () => {
      const arr = [1, 2, 3, { test: true }];
      store.set('array', arr);
      expect(store.get('array')).toEqual(arr);
    });

    it('should return undefined for non-existent keys', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      store.set('key', 'first');
      store.set('key', 'second');
      expect(store.get('key')).toBe('second');
    });
  });

  describe('has operation', () => {
    let store: JsonFileStateStore;

    beforeEach(() => {
      mockFs.readFileSync.mockImplementation(() => {
        const error = new Error('ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      });
      store = new JsonFileStateStore(testPath);
    });

    it('should return true for existing keys', () => {
      store.set('exists', 'value');
      expect(store.has('exists')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(store.has('nonexistent')).toBe(false);
    });

    it('should return true for keys with undefined values', () => {
      store.set('undefined', undefined);
      expect(store.has('undefined')).toBe(true);
    });
  });

  describe('delete operation', () => {
    let store: JsonFileStateStore;

    beforeEach(() => {
      mockFs.readFileSync.mockImplementation(() => {
        const error = new Error('ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      });
      store = new JsonFileStateStore(testPath);
    });

    it('should delete existing keys', () => {
      store.set('toDelete', 'value');
      expect(store.has('toDelete')).toBe(true);
      
      store.delete('toDelete');
      
      expect(store.has('toDelete')).toBe(false);
      expect(store.get('toDelete')).toBeUndefined();
    });

    it('should handle deletion of non-existent keys gracefully', () => {
      expect(() => store.delete('nonexistent')).not.toThrow();
    });
  });

  describe('flush operation', () => {
    let store: JsonFileStateStore;

    beforeEach(() => {
      mockFs.readFileSync.mockImplementation(() => {
        const error = new Error('ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      });
      store = new JsonFileStateStore(testPath);
    });

    it('should write state to file', async () => {
      store.set('key1', 'value1');
      store.set('key2', { nested: true });
      
      await store.flush();
      
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/mock', { recursive: true });
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        testPath,
        JSON.stringify({ key1: 'value1', key2: { nested: true } }, null, 2)
      );
    });

    it('should create directory if it does not exist', async () => {
      await store.flush();
      
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/mock', { recursive: true });
    });

    it('should handle write errors', async () => {
      const error = new Error('Write failed');
      mockFs.promises.writeFile.mockRejectedValue(error);
      
      await expect(store.flush()).rejects.toThrow('Write failed');
    });
  });

  describe('type safety', () => {
    let store: JsonFileStateStore;

    beforeEach(() => {
      mockFs.readFileSync.mockImplementation(() => {
        const error = new Error('ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      });
      store = new JsonFileStateStore(testPath);
    });

    it('should maintain type information with generics', () => {
      store.set<string>('stringKey', 'value');
      store.set<number>('numberKey', 42);
      store.set<boolean>('boolKey', true);
      
      const stringVal = store.get<string>('stringKey');
      const numberVal = store.get<number>('numberKey');
      const boolVal = store.get<boolean>('boolKey');
      
      expect(stringVal).toBe('value');
      expect(numberVal).toBe(42);
      expect(boolVal).toBe(true);
    });
  });
});
