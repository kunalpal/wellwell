/**
 * Tests for contribution system functionality
 * Tests contribution management without side effects on host system
 */

import {
  addPathContribution,
  listPathContributions,
  resolvePaths,
  writeResolvedPaths,
  readResolvedPaths,
  addAliasContribution,
  listAliasContributions,
  resolveAliases,
  writeResolvedAliases,
  readResolvedAliases,
  addPackageContribution,
  listPackageContributions,
  resolvePackages,
  writeResolvedPackages,
  readResolvedPackages,
  addShellInitContribution,
  listShellInitContributions,
  resolveShellInit,
  writeResolvedShellInit,
  readResolvedShellInit,
  type PathContribution,
  type AliasContribution,
  type PackageContribution,
  type ShellInitContribution,
} from "../../src/core/contrib.js";
import { createMockContext } from "../mocks/index.js";

describe("Contribution System", () => {
  describe("Path Contributions", () => {
    it("should add path contribution for matching platform", () => {
      const ctx = createMockContext({ platform: "ubuntu" });
      const contribution: PathContribution = {
        path: "/usr/local/bin",
        platforms: ["ubuntu"],
      };

      const result = addPathContribution(ctx, contribution);

      expect(result).toBe(true);
      expect(ctx.state.set).toHaveBeenCalledWith("contrib.paths", [
        contribution,
      ]);
    });

    it("should not add path contribution for non-matching platform", () => {
      const ctx = createMockContext({ platform: "macos" });
      const contribution: PathContribution = {
        path: "/usr/local/bin",
        platforms: ["ubuntu"],
      };

      const result = addPathContribution(ctx, contribution);

      expect(result).toBe(false);
      expect(ctx.state.set).not.toHaveBeenCalled();
    });

    it("should add path contribution without platform restriction", () => {
      const ctx = createMockContext({ platform: "macos" });
      const contribution: PathContribution = {
        path: "/usr/local/bin",
      };

      const result = addPathContribution(ctx, contribution);

      expect(result).toBe(true);
      expect(ctx.state.set).toHaveBeenCalledWith("contrib.paths", [
        contribution,
      ]);
    });

    it("should not add duplicate path contributions", () => {
      const ctx = createMockContext();
      const existing: PathContribution[] = [{ path: "/usr/local/bin" }];
      (ctx.state.get as jest.Mock).mockReturnValue(existing);

      const contribution: PathContribution = {
        path: "/usr/local/bin",
        prepend: true,
      };

      const result = addPathContribution(ctx, contribution);

      expect(result).toBe(false);
      expect(ctx.state.set).not.toHaveBeenCalled();
    });

    it("should list path contributions", () => {
      const ctx = createMockContext();
      const contributions: PathContribution[] = [
        { path: "/usr/local/bin" },
        { path: "/usr/bin", prepend: true },
      ];
      (ctx.state.get as jest.Mock).mockReturnValue(contributions);

      const result = listPathContributions(ctx);

      expect(result).toEqual(contributions);
      expect(result).not.toBe(contributions); // Should return a copy
    });

    it("should resolve paths with prepend order", () => {
      const ctx = createMockContext();
      const contributions: PathContribution[] = [
        { path: "/usr/local/bin" },
        { path: "/usr/bin", prepend: true },
        { path: "/bin" },
        { path: "/opt/bin", prepend: true },
      ];
      (ctx.state.get as jest.Mock).mockReturnValue(contributions);

      const result = resolvePaths(ctx);

      expect(result).toEqual([
        "/usr/bin",
        "/opt/bin",
        "/usr/local/bin",
        "/bin",
      ]);
    });

    it("should deduplicate paths during resolution", () => {
      const ctx = createMockContext();
      const contributions: PathContribution[] = [
        { path: "/usr/local/bin" },
        { path: "/usr/local/bin", prepend: true },
        { path: "/usr/bin" },
      ];
      (ctx.state.get as jest.Mock).mockReturnValue(contributions);

      const result = resolvePaths(ctx);

      expect(result).toEqual(["/usr/local/bin", "/usr/bin"]);
    });

    it("should write and read resolved paths", () => {
      const ctx = createMockContext();
      const paths = ["/usr/local/bin", "/usr/bin"];

      writeResolvedPaths(ctx, paths);
      expect(ctx.state.set).toHaveBeenCalledWith("resolved.paths", paths);

      (ctx.state.get as jest.Mock).mockReturnValue(paths);
      const result = readResolvedPaths(ctx);
      expect(result).toEqual(paths);
    });
  });

  describe("Alias Contributions", () => {
    it("should add alias contribution for matching platform", () => {
      const ctx = createMockContext({ platform: "ubuntu" });
      const contribution: AliasContribution = {
        name: "ls",
        value: "eza",
        platforms: ["ubuntu"],
      };

      const result = addAliasContribution(ctx, contribution);

      expect(result).toBe(true);
      expect(ctx.state.set).toHaveBeenCalledWith("contrib.aliases", [
        contribution,
      ]);
    });

    it("should not add alias contribution for non-matching platform", () => {
      const ctx = createMockContext({ platform: "macos" });
      const contribution: AliasContribution = {
        name: "ls",
        value: "eza",
        platforms: ["ubuntu"],
      };

      const result = addAliasContribution(ctx, contribution);

      expect(result).toBe(false);
      expect(ctx.state.set).not.toHaveBeenCalled();
    });

    it("should not add duplicate alias contributions", () => {
      const ctx = createMockContext();
      const existing: AliasContribution[] = [{ name: "ls", value: "eza" }];
      (ctx.state.get as jest.Mock).mockReturnValue(existing);

      const contribution: AliasContribution = {
        name: "ls",
        value: "eza",
      };

      const result = addAliasContribution(ctx, contribution);

      expect(result).toBe(false);
      expect(ctx.state.set).not.toHaveBeenCalled();
    });

    it("should resolve aliases with last-writer-wins strategy", () => {
      const ctx = createMockContext();
      const contributions: AliasContribution[] = [
        { name: "ls", value: "ls --color" },
        { name: "grep", value: "grep --color" },
        { name: "ls", value: "eza" }, // Should override first ls
      ];
      (ctx.state.get as jest.Mock).mockReturnValue(contributions);

      const result = resolveAliases(ctx);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ name: "grep", value: "grep --color" });
      expect(result).toContainEqual({ name: "ls", value: "eza" });
    });

    it("should write and read resolved aliases", () => {
      const ctx = createMockContext();
      const aliases: AliasContribution[] = [{ name: "ls", value: "eza" }];

      writeResolvedAliases(ctx, aliases);
      expect(ctx.state.set).toHaveBeenCalledWith("resolved.aliases", aliases);

      (ctx.state.get as jest.Mock).mockReturnValue(aliases);
      const result = readResolvedAliases(ctx);
      expect(result).toEqual(aliases);
    });
  });

  describe("Package Contributions", () => {
    it("should add package contribution for matching platform", () => {
      const ctx = createMockContext({ platform: "macos" });
      const contribution: PackageContribution = {
        name: "eza",
        manager: "homebrew",
        platforms: ["macos"],
      };

      const result = addPackageContribution(ctx, contribution);

      expect(result).toBe(true);
      expect(ctx.state.set).toHaveBeenCalledWith("contrib.packages", [
        {
          id: "homebrew:eza",
          data: contribution,
          platforms: ["macos"],
        },
      ]);
    });

    it("should not add package contribution for non-matching platform", () => {
      const ctx = createMockContext({ platform: "ubuntu" });
      const contribution: PackageContribution = {
        name: "eza",
        manager: "homebrew",
        platforms: ["macos"],
      };

      const result = addPackageContribution(ctx, contribution);

      expect(result).toBe(false);
      expect(ctx.state.set).not.toHaveBeenCalled();
    });

    it("should handle mise packages with language and version", () => {
      const ctx = createMockContext();
      const contribution: PackageContribution = {
        name: "node",
        manager: "mise",
        language: "node",
        version: "20.0.0",
      };

      const result = addPackageContribution(ctx, contribution);

      expect(result).toBe(true);
      expect(ctx.state.set).toHaveBeenCalledWith("contrib.packages", [
        {
          id: "mise:node",
          data: contribution,
          platforms: undefined,
        },
      ]);
    });

    it("should not add duplicate package contributions", () => {
      const ctx = createMockContext();
      const existing = [
        {
          id: "homebrew:eza",
          data: { name: "eza", manager: "homebrew" },
          platforms: undefined,
        },
      ];
      (ctx.state.get as jest.Mock).mockReturnValue(existing);

      const contribution: PackageContribution = {
        name: "eza",
        manager: "homebrew",
      };

      const result = addPackageContribution(ctx, contribution);

      expect(result).toBe(false);
      expect(ctx.state.set).not.toHaveBeenCalled();
    });

    it("should resolve packages by manager", () => {
      const ctx = createMockContext();
      const contributions = [
        { id: "1", data: { name: "eza", manager: "homebrew" } },
        { id: "2", data: { name: "ripgrep", manager: "homebrew" } },
        { id: "3", data: { name: "eza", manager: "apt" } },
        {
          id: "4",
          data: {
            name: "node",
            manager: "mise",
            language: "node",
            version: "20.0.0",
          },
        },
      ];
      (ctx.state.get as jest.Mock).mockReturnValue(contributions);

      const result = resolvePackages(ctx);

      expect(result).toEqual({
        homebrew: [
          { name: "eza", manager: "homebrew" },
          { name: "ripgrep", manager: "homebrew" },
        ],
        apt: [{ name: "eza", manager: "apt" }],
        mise: [
          {
            name: "node",
            manager: "mise",
            language: "node",
            version: "20.0.0",
          },
        ],
      });
    });

    it("should write and read resolved packages", () => {
      const ctx = createMockContext();
      const packages = {
        homebrew: [{ name: "eza", manager: "homebrew" as const }],
      };

      writeResolvedPackages(ctx, packages);
      expect(ctx.state.set).toHaveBeenCalledWith("resolved.packages", packages);

      (ctx.state.get as jest.Mock).mockReturnValue(packages);
      const result = readResolvedPackages(ctx);
      expect(result).toEqual(packages);
    });
  });

  describe("Shell Init Contributions", () => {
    it("should add shell init contribution for matching platform", () => {
      const ctx = createMockContext({ platform: "ubuntu" });
      const contribution: ShellInitContribution = {
        name: "starship",
        initCode: 'eval "$(starship init zsh)"',
        platforms: ["ubuntu"],
      };

      const result = addShellInitContribution(ctx, contribution);

      expect(result).toBe(true);
      expect(ctx.state.set).toHaveBeenCalledWith("contrib.shell.init", [
        contribution,
      ]);
    });

    it("should not add shell init contribution for non-matching platform", () => {
      const ctx = createMockContext({ platform: "macos" });
      const contribution: ShellInitContribution = {
        name: "starship",
        initCode: 'eval "$(starship init zsh)"',
        platforms: ["ubuntu"],
      };

      const result = addShellInitContribution(ctx, contribution);

      expect(result).toBe(false);
      expect(ctx.state.set).not.toHaveBeenCalled();
    });

    it("should not add duplicate shell init contributions", () => {
      const ctx = createMockContext();
      const existing: ShellInitContribution[] = [
        { name: "starship", initCode: 'eval "$(starship init zsh)"' },
      ];
      (ctx.state.get as jest.Mock).mockReturnValue(existing);

      const contribution: ShellInitContribution = {
        name: "starship",
        initCode: 'eval "$(starship init bash)"', // Different init code but same name
      };

      const result = addShellInitContribution(ctx, contribution);

      expect(result).toBe(false);
      expect(ctx.state.set).not.toHaveBeenCalled();
    });

    it("should resolve shell init contributions", () => {
      const ctx = createMockContext();
      const contributions: ShellInitContribution[] = [
        { name: "starship", initCode: 'eval "$(starship init zsh)"' },
        { name: "direnv", initCode: 'eval "$(direnv hook zsh)"' },
      ];
      (ctx.state.get as jest.Mock).mockReturnValue(contributions);

      const result = resolveShellInit(ctx);

      expect(result).toEqual(contributions);
    });

    it("should write and read resolved shell init", () => {
      const ctx = createMockContext();
      const shellInit: ShellInitContribution[] = [
        { name: "starship", initCode: 'eval "$(starship init zsh)"' },
      ];

      writeResolvedShellInit(ctx, shellInit);
      expect(ctx.state.set).toHaveBeenCalledWith(
        "resolved.shell.init",
        shellInit,
      );

      (ctx.state.get as jest.Mock).mockReturnValue(shellInit);
      const result = readResolvedShellInit(ctx);
      expect(result).toEqual(shellInit);
    });
  });
});
