/**
 * Tests for Homebrew package manager module
 * Mocks all external dependencies to avoid affecting host system
 */

// Mock all functions first before any imports
const mockResolvePackages = jest.fn();
const mockWriteResolvedPackages = jest.fn();
const mockReadResolvedPackages = jest.fn();
const mockExecAsync = jest.fn();

jest.mock("../../../src/core/contrib.js", () => ({
  resolvePackages: mockResolvePackages,
  writeResolvedPackages: mockWriteResolvedPackages,
  readResolvedPackages: mockReadResolvedPackages,
}));

jest.mock("node:child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("node:util", () => ({
  promisify: jest.fn(() => mockExecAsync),
}));

import { homebrewModule } from "../../../src/modules/packages/homebrew.js";
import {
  createMockContext,
  mockCommandSuccess,
  mockCommandFailure,
  resetAllMocks,
} from "../../mocks/index.js";

describe("Homebrew Package Manager", () => {
  beforeEach(() => {
    resetAllMocks();
    mockResolvePackages.mockReset();
    mockWriteResolvedPackages.mockReset();
    mockReadResolvedPackages.mockReset();
    mockExecAsync.mockReset();
  });

  describe("isApplicable", () => {
    it("should be applicable on macOS platform", async () => {
      const ctx = createMockContext({ platform: "macos" });

      const result = await homebrewModule.isApplicable(ctx);

      expect(result).toBe(true);
    });

    it("should not be applicable on non-macOS platforms", async () => {
      const ctx = createMockContext({ platform: "ubuntu" });

      const result = await homebrewModule.isApplicable(ctx);

      expect(result).toBe(false);
    });
  });

  describe("plan", () => {
    it("should plan Homebrew installation when not installed", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandFailure("which: brew: not found")(mockExecAsync);
      mockResolvePackages.mockReturnValue({ brew: [] });

      const result = await homebrewModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: "Install Homebrew package manager",
      });
    });

    it("should plan package installation when packages are missing", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandSuccess("")(mockExecAsync); // which brew succeeds
      mockResolvePackages.mockReturnValue({
        brew: [
          { name: "eza", manager: "homebrew" },
          { name: "ripgrep", manager: "homebrew" },
        ],
      });

      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: "git\nnode", stderr: "" }) // brew list --formula
        .mockResolvedValueOnce({ stdout: "visual-studio-code", stderr: "" }); // brew list --cask

      const result = await homebrewModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: "Install 2 Homebrew packages: eza, ripgrep",
      });
    });

    it("should not plan package installation when packages are already installed", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandSuccess("")(mockExecAsync); // which brew succeeds
      mockResolvePackages.mockReturnValue({
        brew: [{ name: "git", manager: "homebrew" }],
      });

      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: "git\nnode", stderr: "" }) // brew list --formula
        .mockResolvedValueOnce({ stdout: "visual-studio-code", stderr: "" }); // brew list --cask

      const result = await homebrewModule.plan(ctx);

      expect(result.changes).not.toContainEqual({
        summary: expect.stringContaining("Install"),
      });
    });
  });

  describe("apply", () => {
    it("should install Homebrew when not installed", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandFailure("which: brew: not found")(mockExecAsync);
      mockCommandSuccess("")(mockExecAsync); // Homebrew installation succeeds
      mockResolvePackages.mockReturnValue({ brew: [] });

      const result = await homebrewModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.message).toBe("Homebrew packages up to date");
    });

    it("should install packages successfully", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandSuccess("")(mockExecAsync); // which brew succeeds
      mockResolvePackages.mockReturnValue({
        brew: [
          { name: "git", manager: "homebrew" },
          { name: "curl", manager: "homebrew" },
        ],
      });

      // Mock package operations
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: "node\nvim", stderr: "" }) // brew list --formula
        .mockResolvedValueOnce({ stdout: "visual-studio-code", stderr: "" }) // brew list --cask
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // brew install git
        .mockResolvedValueOnce({ stdout: "", stderr: "" }); // brew install curl

      const result = await homebrewModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe("Installed 2/2 packages");
    });

    it("should handle package installation failures gracefully", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandSuccess("")(mockExecAsync); // which brew succeeds
      mockResolvePackages.mockReturnValue({
        brew: [
          { name: "git", manager: "homebrew" },
          { name: "invalid-package", manager: "homebrew" },
        ],
      });

      // Mock package operations
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: "node\nvim", stderr: "" }) // brew list --formula
        .mockResolvedValueOnce({ stdout: "visual-studio-code", stderr: "" }) // brew list --cask
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // brew install git succeeds
        .mockRejectedValueOnce(new Error("Package not found")); // brew install invalid-package fails

      const result = await homebrewModule.apply(ctx);

      // Homebrew implementation handles failures differently than base class
      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe("Installed 2/2 packages");
    });

    it("should try cask installation when formula fails", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandSuccess("")(mockExecAsync); // which brew succeeds
      mockResolvePackages.mockReturnValue({
        brew: [{ name: "visual-studio-code", manager: "homebrew" }],
      });

      // Mock package operations
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: "node\nvim", stderr: "" }) // brew list --formula
        .mockResolvedValueOnce({ stdout: "other-cask", stderr: "" }) // brew list --cask (visual-studio-code not found)
        .mockRejectedValueOnce(new Error("No such formula")) // brew install visual-studio-code fails
        .mockResolvedValueOnce({ stdout: "", stderr: "" }); // brew install --cask visual-studio-code succeeds

      const result = await homebrewModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe("Installed 1/1 packages");
      expect(mockExecAsync).toHaveBeenCalledWith(
        "brew install visual-studio-code",
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        "brew install --cask visual-studio-code",
      );
    });
  });

  describe("status", () => {
    it("should return stale when Homebrew is not installed", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandFailure("which: brew: not found")(mockExecAsync);

      const result = await homebrewModule.status!(ctx);

      expect(result.status).toBe("stale");
      expect(result.message).toBe("Homebrew not available");
    });

    it("should return applied when no packages configured", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandSuccess("")(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({ brew: [] });

      const result = await homebrewModule.status!(ctx);

      expect(result.status).toBe("applied");
      expect(result.message).toBe("Homebrew available, no packages configured");
    });

    it("should return applied when all packages installed", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandSuccess("")(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({
        brew: [{ name: "git", manager: "homebrew" }],
      });

      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: "git\nnode", stderr: "" }) // brew list --formula
        .mockResolvedValueOnce({ stdout: "visual-studio-code", stderr: "" }); // brew list --cask

      const result = await homebrewModule.status!(ctx);

      expect(result.status).toBe("applied");
      expect(result.message).toBe("All 1 packages installed and up to date");
    });

    it("should return stale when packages are missing", async () => {
      const ctx = createMockContext({ platform: "macos" });
      mockCommandSuccess("")(mockExecAsync);
      mockReadResolvedPackages.mockReturnValue({
        brew: [{ name: "git", manager: "homebrew" }],
      });

      // Mock installed packages check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which brew succeeds
        .mockResolvedValueOnce({ stdout: "node\ncurl", stderr: "" }) // brew list --formula (git not found)
        .mockResolvedValueOnce({ stdout: "visual-studio-code", stderr: "" }); // brew list --cask

      const result = await homebrewModule.status!(ctx);

      expect(result.status).toBe("stale");
      expect(result.message).toBe("1 packages need attention");
    });
  });

  describe("getDetails", () => {
    it("should return package details when packages are configured", () => {
      const ctx = createMockContext({ platform: "macos" });
      mockReadResolvedPackages.mockReturnValue({
        brew: [
          { name: "git", manager: "homebrew" },
          {
            name: "node",
            manager: "homebrew",
            language: "node",
            version: "20.0.0",
          },
        ],
      });

      const result = homebrewModule.getDetails!(ctx);

      expect(result).toEqual([
        "Managing 2 packages:",
        "  • git",
        "  • node@20.0.0",
      ]);
    });

    it("should return no packages message when none configured", () => {
      const ctx = createMockContext({ platform: "macos" });
      mockReadResolvedPackages.mockReturnValue({ brew: [] });

      const result = homebrewModule.getDetails!(ctx);

      expect(result).toEqual(["No packages configured"]);
    });
  });
});
