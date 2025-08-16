/**
 * Tests for Mise version manager module
 * Mocks all external dependencies to avoid affecting host system
 */

// Mock all functions first before any imports
const mockResolvePackages = jest.fn();
const mockWriteResolvedPackages = jest.fn();
const mockReadResolvedPackages = jest.fn();
const mockAddPackageContribution = jest.fn();
const mockAddShellInitContribution = jest.fn();
const mockExecAsync = jest.fn();

jest.mock("../../../src/core/contrib.js", () => ({
  resolvePackages: mockResolvePackages,
  writeResolvedPackages: mockWriteResolvedPackages,
  readResolvedPackages: mockReadResolvedPackages,
  addPackageContribution: mockAddPackageContribution,
  addShellInitContribution: mockAddShellInitContribution,
}));

jest.mock("node:child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("node:util", () => ({
  promisify: jest.fn(() => mockExecAsync),
}));

import { miseModule } from "../../../src/modules/packages/mise.js";
import {
  createMockContext,
  mockCommandSuccess,
  mockCommandFailure,
  resetAllMocks,
} from "../../mocks/index.js";

describe("Mise Version Manager", () => {
  beforeEach(() => {
    resetAllMocks();
    mockResolvePackages.mockReset();
    mockWriteResolvedPackages.mockReset();
    mockReadResolvedPackages.mockReset();
    mockAddPackageContribution.mockReset();
    mockAddShellInitContribution.mockReset();
    mockExecAsync.mockReset();
  });

  describe("isApplicable", () => {
    it("should always be applicable", async () => {
      const ctx = createMockContext();

      const result = await miseModule.isApplicable(ctx);

      expect(result).toBe(true);
    });
  });

  describe("plan", () => {
    it("should plan mise installation when not installed", async () => {
      const ctx = createMockContext();
      mockCommandFailure("which: mise: not found")(mockExecAsync);
      mockResolvePackages.mockReturnValue({ mise: [] });

      const result = await miseModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: "Install mise version manager",
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: "node",
        manager: "mise",
        language: "node",
        version: "lts",
        platforms: ["macos", "ubuntu", "al2"],
      });
      expect(mockAddPackageContribution).toHaveBeenCalledWith(ctx, {
        name: "python",
        manager: "mise",
        language: "python",
        version: "3.11",
        platforms: ["macos", "ubuntu", "al2"],
      });
    });

    it("should plan language version installations", async () => {
      const ctx = createMockContext();
      mockCommandSuccess("")(mockExecAsync); // mise is installed
      mockResolvePackages.mockReturnValue({
        mise: [
          {
            name: "node",
            manager: "mise",
            language: "node",
            version: "20.0.0",
          },
          {
            name: "python",
            manager: "mise",
            language: "python",
            version: "3.11",
          },
        ],
      });

      // Mock mise list command to show only node 18.0.0 is installed
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise
        .mockResolvedValueOnce({
          stdout: "node    18.0.0\npython  3.10.0",
          stderr: "",
        }); // mise list

      const result = await miseModule.plan(ctx);

      expect(result.changes).toContainEqual({
        summary: "Install 2 language versions: node@20.0.0, python@3.11",
      });
    });

    it("should not plan installations when versions are satisfied", async () => {
      const ctx = createMockContext();
      mockCommandSuccess("")(mockExecAsync); // mise is installed
      mockResolvePackages.mockReturnValue({
        mise: [
          { name: "node", manager: "mise", language: "node", version: "lts" },
          {
            name: "python",
            manager: "mise",
            language: "python",
            version: "3.11",
          },
        ],
      });

      // Mock mise list to show satisfying versions
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise
        .mockResolvedValueOnce({
          stdout: "node    20.0.0\npython  3.11.5",
          stderr: "",
        }); // mise list

      const result = await miseModule.plan(ctx);

      expect(result.changes).toEqual([]);
    });
  });

  describe("apply", () => {
    it("should install mise when not present", async () => {
      const ctx = createMockContext({ homeDir: "/mock/home" });
      mockResolvePackages.mockReturnValue({ mise: [] });

      mockExecAsync
        .mockRejectedValueOnce(new Error("which: mise: not found")) // mise not installed
        .mockResolvedValueOnce({ stdout: "", stderr: "" }); // install script succeeds

      const result = await miseModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(mockExecAsync).toHaveBeenCalledWith("curl https://mise.run | sh");
      expect(mockAddShellInitContribution).toHaveBeenCalledWith(ctx, {
        name: "mise",
        initCode: expect.stringContaining('eval "$(mise activate zsh)"'),
      });
      expect(process.env.PATH).toContain("/mock/home/.local/bin");
    });

    it("should install language versions successfully", async () => {
      const ctx = createMockContext();
      mockResolvePackages.mockReturnValue({
        mise: [
          {
            name: "node",
            manager: "mise",
            language: "node",
            version: "20.0.0",
          },
          {
            name: "python",
            manager: "mise",
            language: "python",
            version: "3.11",
          },
        ],
      });

      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise succeeds
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // mise list (empty)
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // mise install node@20.0.0
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // mise global node@20.0.0
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // mise install python@3.11
        .mockResolvedValueOnce({ stdout: "", stderr: "" }); // mise global python@3.11

      const result = await miseModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.message).toBe("Installed 2/2 language versions");
      expect(mockExecAsync).toHaveBeenCalledWith("mise install node@20.0.0");
      expect(mockExecAsync).toHaveBeenCalledWith("mise global node@20.0.0");
      expect(mockExecAsync).toHaveBeenCalledWith("mise install python@3.11");
      expect(mockExecAsync).toHaveBeenCalledWith("mise global python@3.11");
    });

    it("should handle partial installation failures", async () => {
      const ctx = createMockContext();
      mockResolvePackages.mockReturnValue({
        mise: [
          {
            name: "node",
            manager: "mise",
            language: "node",
            version: "20.0.0",
          },
          { name: "ruby", manager: "mise", language: "ruby", version: "3.0.0" },
        ],
      });

      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise succeeds
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // mise list (empty)
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // mise install node@20.0.0 succeeds
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // mise global node@20.0.0
        .mockRejectedValueOnce(new Error("Ruby version not found")); // mise install ruby@3.0.0 fails

      const result = await miseModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.changed).toBe(true);
      expect(result.message).toBe("Installed 1/2 language versions");
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        { failed: ["ruby@3.0.0"] },
        "Some language versions failed to install",
      );
    });

    it("should skip global version setting for non-first versions", async () => {
      const ctx = createMockContext();
      mockResolvePackages.mockReturnValue({
        mise: [
          {
            name: "node",
            manager: "mise",
            language: "node",
            version: "20.0.0",
          },
        ],
      });

      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise succeeds
        .mockResolvedValueOnce({ stdout: "node    18.0.0", stderr: "" }) // mise list shows existing version
        .mockResolvedValueOnce({ stdout: "", stderr: "" }); // mise install node@20.0.0

      const result = await miseModule.apply(ctx);

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(mockExecAsync).not.toHaveBeenCalledWith("mise global node@20.0.0");
    });

    it("should handle general errors", async () => {
      const ctx = createMockContext();
      mockExecAsync.mockRejectedValue(new Error("Network error"));

      const result = await miseModule.apply(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toEqual(new Error("Network error"));
    });
  });

  describe("status", () => {
    it("should return stale when mise is not installed", async () => {
      const ctx = createMockContext();
      mockExecAsync.mockRejectedValue(new Error("which: mise: not found"));

      const result = await miseModule.status!(ctx);

      expect(result.status).toBe("stale");
      expect(result.message).toBe("Mise not installed");
    });

    it("should return applied when no language versions configured", async () => {
      const ctx = createMockContext();
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
      mockReadResolvedPackages.mockReturnValue({ mise: [] });

      const result = await miseModule.status!(ctx);

      expect(result.status).toBe("applied");
      expect(result.message).toBe("Mise installed, no language versions");
    });

    it("should return applied when all language versions are satisfied", async () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({
        mise: [
          { name: "node", manager: "mise", language: "node", version: "lts" },
          {
            name: "python",
            manager: "mise",
            language: "python",
            version: "3.11",
          },
        ],
      });

      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise
        .mockResolvedValueOnce({
          stdout: "node    20.0.0\npython  3.11.5",
          stderr: "",
        }); // mise list

      const result = await miseModule.status!(ctx);

      expect(result.status).toBe("applied");
      expect(result.message).toBe("All language versions installed");
    });

    it("should return stale when language versions are missing", async () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({
        mise: [
          {
            name: "node",
            manager: "mise",
            language: "node",
            version: "20.0.0",
          },
          {
            name: "python",
            manager: "mise",
            language: "python",
            version: "3.11",
          },
        ],
      });

      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise
        .mockResolvedValueOnce({ stdout: "node    18.0.0", stderr: "" }); // mise list

      const result = await miseModule.status!(ctx);

      expect(result.status).toBe("stale");
      expect(result.message).toBe("2 language versions missing");
    });
  });

  describe("getDetails", () => {
    it("should return language version details when packages are configured", () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({
        mise: [
          { name: "node", manager: "mise", language: "node", version: "lts" },
          {
            name: "python",
            manager: "mise",
            language: "python",
            version: "3.11",
          },
        ],
      });

      const result = miseModule.getDetails!(ctx);

      expect(result).toEqual([
        "Managing 2 packages:",
        "  • node@lts",
        "  • python@3.11",
      ]);
    });

    it("should return no packages message when none configured", () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue({ mise: [] });

      const result = miseModule.getDetails!(ctx);

      expect(result).toEqual(["No packages configured"]);
    });

    it("should handle undefined resolved packages", () => {
      const ctx = createMockContext();
      mockReadResolvedPackages.mockReturnValue(undefined);

      const result = miseModule.getDetails!(ctx);

      expect(result).toEqual(["No packages configured"]);
    });
  });

  describe("version satisfaction logic", () => {
    it("should handle lts and latest versions", async () => {
      const ctx = createMockContext();
      mockCommandSuccess("")(mockExecAsync);
      mockResolvePackages.mockReturnValue({
        mise: [
          { name: "node", manager: "mise", language: "node", version: "lts" },
          {
            name: "python",
            manager: "mise",
            language: "python",
            version: "latest",
          },
        ],
      });

      // Any installed version should satisfy lts/latest
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise
        .mockResolvedValueOnce({
          stdout: "node    18.0.0\npython  3.10.0",
          stderr: "",
        }); // mise list

      const result = await miseModule.plan(ctx);

      expect(result.changes).toEqual([]);
    });

    it("should handle partial version matching", async () => {
      const ctx = createMockContext();
      mockCommandSuccess("")(mockExecAsync);
      mockResolvePackages.mockReturnValue({
        mise: [
          {
            name: "python",
            manager: "mise",
            language: "python",
            version: "3.11",
          },
        ],
      });

      // 3.11.5 should satisfy 3.11
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise
        .mockResolvedValueOnce({ stdout: "python  3.11.5", stderr: "" }); // mise list

      const result = await miseModule.plan(ctx);

      expect(result.changes).toEqual([]);
    });

    it("should handle exact version matching", async () => {
      const ctx = createMockContext();
      mockCommandSuccess("")(mockExecAsync);
      mockResolvePackages.mockReturnValue({
        mise: [
          {
            name: "node",
            manager: "mise",
            language: "node",
            version: "20.0.0",
          },
        ],
      });

      // Exact match should be satisfied
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // which mise
        .mockResolvedValueOnce({ stdout: "node    20.0.0", stderr: "" }); // mise list

      const result = await miseModule.plan(ctx);

      expect(result.changes).toEqual([]);
    });
  });
});
