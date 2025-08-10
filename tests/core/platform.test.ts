/**
 * Tests for platform detection functionality
 * Mocks os operations to test platform detection without affecting host system
 */

// Mock node:os module first
const mockOs = {
  platform: jest.fn(() => 'linux' as NodeJS.Platform),
};

jest.mock('node:os', () => mockOs);

import { detectPlatform } from '../../src/core/platform.js';
import { resetAllMocks } from '../mocks/index.js';

describe('Platform Detection', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('detectPlatform', () => {
    it('should detect macOS platform', () => {
      mockOs.platform.mockReturnValue('darwin');
      
      const result = detectPlatform();
      
      expect(result).toBe('macos');
      expect(mockOs.platform).toHaveBeenCalledTimes(1);
    });

    it('should detect Ubuntu platform via ID_LIKE environment variable', () => {
      mockOs.platform.mockReturnValue('linux');
      process.env.ID_LIKE = 'ubuntu debian';
      
      const result = detectPlatform();
      
      expect(result).toBe('ubuntu');
    });

    it('should detect Ubuntu platform via ID environment variable', () => {
      mockOs.platform.mockReturnValue('linux');
      delete process.env.ID_LIKE;
      process.env.ID = 'ubuntu';
      
      const result = detectPlatform();
      
      expect(result).toBe('ubuntu');
    });

    it('should detect Amazon Linux 2 via ID environment variable', () => {
      mockOs.platform.mockReturnValue('linux');
      delete process.env.ID_LIKE;
      process.env.ID = 'amzn';
      
      const result = detectPlatform();
      
      expect(result).toBe('al2');
    });

    it('should detect Amazon Linux 2 via ID_LIKE environment variable', () => {
      mockOs.platform.mockReturnValue('linux');
      process.env.ID_LIKE = 'rhel amzn fedora';
      delete process.env.ID;
      
      const result = detectPlatform();
      
      expect(result).toBe('al2');
    });

    it('should return unknown for unsupported platforms', () => {
      mockOs.platform.mockReturnValue('win32');
      delete process.env.ID_LIKE;
      delete process.env.ID;
      
      const result = detectPlatform();
      
      expect(result).toBe('unknown');
    });

    it('should return unknown for Linux without distro identification', () => {
      mockOs.platform.mockReturnValue('linux');
      delete process.env.ID_LIKE;
      delete process.env.ID;
      
      const result = detectPlatform();
      
      expect(result).toBe('unknown');
    });

    it('should handle case-insensitive environment variables', () => {
      mockOs.platform.mockReturnValue('linux');
      process.env.ID_LIKE = 'UBUNTU';
      
      const result = detectPlatform();
      
      expect(result).toBe('ubuntu');
    });
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.ID_LIKE;
    delete process.env.ID;
  });
});
