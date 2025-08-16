/**
 * Tests for logger creation functionality
 * Tests logger configuration without side effects
 */

// Mock pino first
const mockPino = jest.fn();
jest.mock("pino", () => mockPino);

import { createLogger } from "../../src/core/logger.js";

describe("Logger Creation", () => {
  beforeEach(() => {
    mockPino.mockReset();
    mockPino.mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });
  });

  describe("createLogger", () => {
    it("should create logger with default options", () => {
      createLogger();

      expect(mockPino).toHaveBeenCalledWith({
        level: "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
          },
        },
      });
    });

    it("should create logger with verbose logging enabled", () => {
      createLogger({ verbose: true });

      expect(mockPino).toHaveBeenCalledWith({
        level: "debug",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
          },
        },
      });
    });

    it("should create logger without pretty formatting", () => {
      createLogger({ pretty: false });

      expect(mockPino).toHaveBeenCalledWith({
        level: "info",
        transport: undefined,
      });
    });

    it("should create logger with custom pino options", () => {
      const customOptions = {
        name: "test-logger",
        redact: ["password"],
        verbose: true,
        pretty: false,
      };

      createLogger(customOptions);

      expect(mockPino).toHaveBeenCalledWith({
        level: "debug",
        transport: undefined,
        name: "test-logger",
        redact: ["password"],
      });
    });

    it("should handle empty options object", () => {
      createLogger({});

      expect(mockPino).toHaveBeenCalledWith({
        level: "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
          },
        },
      });
    });

    it("should override verbose when explicitly set to false", () => {
      createLogger({ verbose: false });

      expect(mockPino).toHaveBeenCalledWith({
        level: "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
          },
        },
      });
    });

    it("should combine custom options with computed level and transport", () => {
      const customOptions = {
        serializers: { req: jest.fn() },
        base: { pid: false },
        verbose: true,
        pretty: true,
      };

      createLogger(customOptions);

      expect(mockPino).toHaveBeenCalledWith({
        level: "debug",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
          },
        },
        serializers: { req: expect.any(Function) },
        base: { pid: false },
      });
    });
  });
});
