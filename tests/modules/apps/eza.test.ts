/**
 * Tests for Eza app module
 * Mocks all external dependencies to avoid affecting host system
 */

// Mock contrib functions first
const mockAddPackageContribution = jest.fn();

jest.mock("../../../src/core/contrib.js", () => ({
  addPackageContribution: mockAddPackageContribution,
}));

import { ezaModule } from "../../../src/modules/apps/eza.js";
import {
  createMockContext,
  mockCommandSuccess,
  mockCommandFailure,
  resetAllMocks,
} from "../../mocks/index.js";

// Mock child_process
const mockExecAsync = jest.fn();
jest.mock("node:child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("node:util", () => ({
  promisify: jest.fn(() => mockExecAsync),
}));

describe("Eza App Module", () => {
  beforeEach(() => {
    resetAllMocks();
    mockAddPackageContribution.mockReset();
    mockExecAsync.mockReset();
  });

  describe("isApplicable", () => {
    it("should always be applicable", async () => {
      const ctx = createMockContext();

      const result = await ezaModule.isApplicable(ctx);

      expect(result).toBe(true);
    });
  });

  describe("plan", () => {
    it("should add package contributions for all platforms", async () => {
      const ctx = createMockContext({ platform: "ubuntu" });

      const result = await ezaModule.plan(ctx);

      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: "eza",
        manager: "homebrew",
        platforms: ["macos"],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: "eza",
        manager: "apt",
        platforms: ["ubuntu"],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: "eza",
        manager: "yum",
        platforms: ["al2"],
      });
      expect(result.changes).toEqual([]);
    });
  });

  describe("apply", () => {
    it("should return success without changes", async () => {
      const ctx = createMockContext();

      const result = await ezaModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.message).toBe("Package requirements contributed");
    });
  });

  describe("status", () => {
    it("should return applied when eza is available", async () => {
      const ctx = createMockContext();
      mockCommandSuccess("")(mockExecAsync);

      const result = await ezaModule.status!(ctx);

      expect(result.status).toBe("applied");
      expect(result.message).toBe("Eza available");
      expect(mockExecAsync).toHaveBeenCalledWith("which eza");
    });

    it("should return stale when eza is not found", async () => {
      const ctx = createMockContext();
      mockCommandFailure("which: eza: not found")(mockExecAsync);

      const result = await ezaModule.status!(ctx);

      expect(result.status).toBe("stale");
      expect(result.message).toBe("Eza not found in PATH");
    });
  });

  describe("getDetails", () => {
    it("should return feature details", () => {
      const ctx = createMockContext();

      const result = ezaModule.getDetails!(ctx);

      expect(result).toEqual([
        "Modern ls replacement:",
        "  • Colorized output with file type indicators",
        "  • Git integration showing file status",
        "  • Tree view and grid layout options",
        "  • Better defaults and human-readable sizes",
      ]);
    });
  });
});
