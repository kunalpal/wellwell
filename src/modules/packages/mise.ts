import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from "../../core/types.js";
import {
  addPackageContribution,
  addShellInitContribution,
  readResolvedPackages,
  resolvePackages,
  writeResolvedPackages,
} from "../../core/contrib.js";
import { templateManager } from "../../core/template-manager.js";

const execAsync = promisify(exec);

/**
 * Checks if Mise (version manager) is installed on the system.
 * @returns Promise resolving to true if Mise is installed, false otherwise.
 */
async function isMiseInstalled(): Promise<boolean> {
  try {
    await execAsync("which mise");
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs Mise (version manager) using the official installer script.
 */
async function installMise(): Promise<void> {
  const script = "curl https://mise.run | sh";
  await execAsync(script);
}

/**
 * Gets a record of installed languages and their versions using Mise.
 * @returns Promise resolving to a record of language names to arrays of installed versions.
 */
async function getInstalledLanguages(): Promise<Record<string, string[]>> {
  try {
    const { stdout } = await execAsync("mise list");
    const languages: Record<string, string[]> = {};
    const lines = stdout.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^(\w+)\s+(\S+)/);
      if (match) {
        const [, lang, version] = match;
        if (!languages[lang]) languages[lang] = [];
        languages[lang].push(version);
      }
    }

    return languages;
  } catch {
    return {};
  }
}

/**
 * Checks if a requested version is satisfied by the installed versions.
 * @param requestedVersion The version requested (e.g., 'lts', '3.11').
 * @param installedVersions Array of installed version strings.
 * @returns True if the requested version is satisfied, false otherwise.
 */
function isVersionSatisfied(
  requestedVersion: string,
  installedVersions: string[],
): boolean {
  if (requestedVersion === "lts" || requestedVersion === "latest") {
    // For lts/latest, any installed version counts as satisfied
    return installedVersions.length > 0;
  }

  // Check for exact match first
  if (installedVersions.includes(requestedVersion)) {
    return true;
  }

  // Check for partial version match (e.g. "3.11" matches "3.11.9", "3.11.13")
  return installedVersions.some((installed) =>
    installed.startsWith(requestedVersion + "."),
  );
}

/**
 * Installs a specific language version using Mise.
 * @param language The language to install (e.g., 'node', 'python').
 * @param version The version to install.
 * @returns Promise resolving to true if installation succeeded, false otherwise.
 */
async function installLanguageVersion(
  language: string,
  version: string,
): Promise<boolean> {
  try {
    await execAsync(`mise install ${language}@${version}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sets the global version for a language using Mise.
 * @param language The language to set.
 * @param version The version to set as global.
 * @returns Promise resolving to true if successful, false otherwise.
 */
async function setGlobalVersion(
  language: string,
  version: string,
): Promise<boolean> {
  try {
    await execAsync(`mise global ${language}@${version}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Default language versions to be managed by Mise for supported platforms.
 */
const defaultVersions = [
  { language: "node", version: "lts", platforms: ["macos", "ubuntu", "al2"] },
  {
    language: "python",
    version: "3.11",
    platforms: ["macos", "ubuntu", "al2"],
  },
] as const;

/**
 * Configuration module for managing Mise version manager and language versions.
 * Handles planning, applying, and status checking for Mise and language installations.
 */
export const miseModule: ConfigurationModule = {
  id: "packages:mise",
  description: "Mise version manager for Node.js, Python, etc.",

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    const isInstalled = await isMiseInstalled();

    if (!isInstalled) {
      changes.push({ summary: "Install mise version manager" });
    }

    // Register default versions
    for (const def of defaultVersions) {
      addPackageContribution(ctx, {
        name: def.language,
        manager: "mise",
        language: def.language,
        version: def.version,
        platforms: [...def.platforms],
      });
    }

    const resolvedPackages = resolvePackages(ctx);
    const misePackages = resolvedPackages.mise ?? [];

    if (misePackages.length > 0) {
      const installed = await getInstalledLanguages();
      const toInstall = misePackages.filter((p) => {
        const versions = installed[p.language!] ?? [];
        return !isVersionSatisfied(p.version!, versions);
      });

      if (toInstall.length > 0) {
        changes.push({
          summary: `Install ${toInstall.length} language versions: ${toInstall.map((p) => `${p.language}@${p.version}`).join(", ")}`,
        });
      }
    }

    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      // Register shell initialization using template
      const initContext = {
        name: "mise",
        command: "mise",
        activationCommand: "mise activate zsh",
      };

      const initCode = await templateManager.loadAndRender(
        "shell",
        "shell-init.zsh.hbs",
        initContext,
      );

      addShellInitContribution(ctx, {
        name: "mise",
        initCode,
      });

      const isInstalled = await isMiseInstalled();

      if (!isInstalled) {
        ctx.logger.info("Installing mise...");
        await installMise();
        // Add mise to PATH for this session
        process.env.PATH = `${ctx.homeDir}/.local/bin:${process.env.PATH}`;
      }

      const resolvedPackages = resolvePackages(ctx);
      const misePackages = resolvedPackages.mise ?? [];

      if (misePackages.length > 0) {
        const installed = await getInstalledLanguages();
        const toInstall = misePackages.filter((p) => {
          const versions = installed[p.language!] ?? [];
          return !isVersionSatisfied(p.version!, versions);
        });

        if (toInstall.length > 0) {
          ctx.logger.info(
            { packages: toInstall.map((p) => `${p.language}@${p.version}`) },
            "Installing language versions",
          );

          let installCount = 0;
          const failed: string[] = [];

          for (const pkg of toInstall) {
            const success = await installLanguageVersion(
              pkg.language!,
              pkg.version!,
            );
            if (success) {
              installCount++;
              // Set as global version if it's the first/only version
              const currentVersions = installed[pkg.language!] ?? [];
              if (currentVersions.length === 0) {
                await setGlobalVersion(pkg.language!, pkg.version!);
              }
            } else {
              failed.push(`${pkg.language}@${pkg.version}`);
            }
          }

          if (failed.length > 0) {
            ctx.logger.warn(
              { failed },
              "Some language versions failed to install",
            );
          }

          return {
            success: failed.length === 0,
            changed: installCount > 0,
            message: `Installed ${installCount}/${toInstall.length} language versions`,
          };
        }
      }

      writeResolvedPackages(ctx, resolvedPackages);
      return { success: true, changed: false, message: "Mise up to date" };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const isInstalled = await isMiseInstalled();
    if (!isInstalled) return { status: "stale", message: "Mise not installed" };

    const resolvedPackages = readResolvedPackages(ctx);
    const misePackages = resolvedPackages?.mise ?? [];

    if (misePackages.length === 0) {
      return {
        status: "applied",
        message: "Mise installed, no language versions",
      };
    }

    const installed = await getInstalledLanguages();
    const missing = misePackages.filter((p) => {
      const versions = installed[p.language!] ?? [];
      return !isVersionSatisfied(p.version!, versions);
    });

    return {
      status: missing.length === 0 ? "applied" : "stale",
      message:
        missing.length > 0
          ? `${missing.length} language versions missing`
          : "All language versions installed",
    };
  },

  getDetails(ctx): string[] {
    const resolvedPackages = readResolvedPackages(ctx);
    const packages = resolvedPackages?.mise ?? [];

    if (packages.length > 0) {
      const details = [`Managing ${packages.length} packages:`];
      packages.forEach((pkg) => {
        if (pkg.language && pkg.version) {
          details.push(`  • ${pkg.language}@${pkg.version}`);
        } else {
          details.push(`  • ${pkg.name}`);
        }
      });
      return details;
    } else {
      return ["No packages configured"];
    }
  },
};
