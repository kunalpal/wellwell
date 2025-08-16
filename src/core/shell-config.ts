import { promises as fs } from "node:fs";
import path from "node:path";
import { BaseModule, type BaseModuleOptions } from "./base-module.js";
import type {
  ApplyResult,
  ConfigurationContext,
  PlanResult,
  StatusResult,
} from "./types.js";
import {
  readResolvedAliases,
  readResolvedPaths,
  readResolvedShellInit,
  readResolvedEnvVars,
} from "./contrib.js";
import { templateManager } from "./template-manager.js";

/**
 * Options for configuring a ShellConfig module, including shell file, markers, and supported platforms.
 */
export interface ShellConfigOptions extends BaseModuleOptions {
  shellFile: string;
  markerStart: string;
  markerEnd: string;
  platforms?: string[];
}

/**
 * Abstract base class for shell configuration modules.
 * Handles shell file management, marker-based block insertion, and platform support.
 */
export abstract class ShellConfig extends BaseModule {
  protected shellFile!: string;
  protected markerStart!: string;
  protected markerEnd!: string;
  protected platforms?: string[];

  constructor(options: ShellConfigOptions) {
    super(options);
    this.shellFile = options.shellFile;
    this.markerStart = options.markerStart;
    this.markerEnd = options.markerEnd;
    this.platforms = options.platforms;
  }

  async isApplicable(ctx: ConfigurationContext): Promise<boolean> {
    if (this.platforms && !this.platforms.includes(ctx.platform)) {
      return false;
    }
    return ctx.platform !== "unknown";
  }

  protected getShellFilePath(ctx: ConfigurationContext): string {
    return path.join(ctx.homeDir, this.shellFile);
  }

  protected abstract renderShellBlock(
    ctx: ConfigurationContext,
  ): Promise<string>;

  protected escapeDoubleQuotes(input: string): string {
    return input.replaceAll('"', '\\"');
  }

  protected async upsertBlock(
    filePath: string,
    newBlock: string,
  ): Promise<{ changed: boolean }> {
    // Ensure target file exists before attempting to read/replace
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      const fh = await fs.open(filePath, "a");
      await fh.close();
    } catch {}

    let content = "";
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      content = "";
    }

    const startIdx = content.indexOf(this.markerStart);
    const endIdx = content.indexOf(this.markerEnd);
    let updated = "";

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      updated =
        content.slice(0, startIdx) +
        newBlock +
        content.slice(endIdx + this.markerEnd.length);
    } else {
      updated =
        (content.endsWith("\n") || content.length === 0
          ? content
          : content + "\n") + newBlock;
    }

    const changed = updated !== content;
    if (changed) await fs.writeFile(filePath, updated);
    return { changed };
  }

  async plan(ctx: ConfigurationContext): Promise<PlanResult> {
    const target = this.getShellFilePath(ctx);
    const block = await this.renderShellBlock(ctx);

    let content = "";
    try {
      content = await fs.readFile(target, "utf8");
    } catch {}

    const needsChange = !content.includes(block);
    return this.createPlanResult(
      needsChange ? [{ summary: `Update ${target} with wellwell block` }] : [],
    );
  }

  async apply(ctx: ConfigurationContext): Promise<ApplyResult> {
    const target = this.getShellFilePath(ctx);
    const block = await this.renderShellBlock(ctx);

    try {
      // Handle broken symlinks
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        const st = await fs.lstat(target);
        if (st.isSymbolicLink()) {
          try {
            await fs.readFile(target);
          } catch {
            await fs.unlink(target);
          }
        }
      } catch {
        // lstat failed; proceed to create file
      }

      try {
        const fh = await fs.open(target, "a");
        await fh.close();
      } catch {}

      const { changed } = await this.upsertBlock(target, block);
      return this.createSuccessResult(
        changed,
        changed ? `${this.shellFile} updated` : "no changes",
      );
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  async status(ctx: ConfigurationContext): Promise<StatusResult> {
    const target = this.getShellFilePath(ctx);
    const desiredBlock = await this.renderShellBlock(ctx);

    try {
      const content = await fs.readFile(target, "utf8");

      if (content.includes(desiredBlock)) {
        return {
          status: "applied",
          message: `${this.shellFile} is properly configured`,
          metadata: {
            lastChecked: new Date(),
            checksum: await this.generateChecksum(desiredBlock),
          },
        };
      }

      // Check if block exists but is different
      const hasBlock =
        content.includes(this.markerStart) && content.includes(this.markerEnd);

      if (hasBlock) {
        // Extract current block and compare
        const currentBlock = this.extractBlock(content);
        const diff = this.generateDiff(currentBlock, desiredBlock);

        return {
          status: "stale",
          message: `${this.shellFile} block needs update`,
          details: {
            current: currentBlock,
            desired: desiredBlock,
            diff: diff,
            issues: ["Shell configuration block differs from expected"],
            recommendations: ["Run apply to update the shell configuration"],
          },
        };
      }

      return {
        status: "stale",
        message: `${this.shellFile} missing configuration block`,
        details: {
          issues: [
            `No wellwell configuration block found in ${this.shellFile}`,
          ],
          recommendations: ["Run apply to add the configuration block"],
        },
      };
    } catch (error) {
      return {
        status: "stale",
        message: `${this.shellFile} not accessible`,
        details: {
          issues: [`Cannot read ${this.shellFile}: ${error}`],
          recommendations: ["Check file permissions and try again"],
        },
      };
    }
  }

  private extractBlock(content: string): string {
    const startIdx = content.indexOf(this.markerStart);
    const endIdx = content.indexOf(this.markerEnd);

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return "";
    }

    return content.substring(startIdx, endIdx + this.markerEnd.length);
  }

  protected generateDiff(current: string, desired: string): string[] {
    // Simple line-by-line diff
    const currentLines = current.split("\n");
    const desiredLines = desired.split("\n");
    const diff: string[] = [];

    const maxLines = Math.max(currentLines.length, desiredLines.length);

    for (let i = 0; i < maxLines; i++) {
      const currentLine = currentLines[i] || "";
      const desiredLine = desiredLines[i] || "";

      if (currentLine !== desiredLine) {
        diff.push(`Line ${i + 1}:`);
        if (currentLine) diff.push(`- ${currentLine}`);
        if (desiredLine) diff.push(`+ ${desiredLine}`);
      }
    }

    return diff;
  }

  private async generateChecksum(content: string): Promise<string> {
    // Simple hash for content validation
    const crypto = await import("crypto");
    return crypto.createHash("md5").update(content).digest("hex");
  }
}

/**
 * Specialized ZshConfig class for managing .zshrc configuration.
 */
export class ZshConfig extends ShellConfig {
  protected shellFile = ".zshrc";
  protected markerStart = "# === wellwell:begin ===";
  protected markerEnd = "# === wellwell:end ===";
  protected platforms = ["macos", "ubuntu"];

  protected async renderShellBlock(ctx: ConfigurationContext): Promise<string> {
    // Load module partials
    await templateManager.loadModulePartials("shell");

    const resolvedPaths = readResolvedPaths(ctx) ?? [];
    const resolvedAliases = readResolvedAliases(ctx) ?? [];
    const resolvedShellInit = readResolvedShellInit(ctx) ?? [];
    const resolvedEnvVars = readResolvedEnvVars(ctx) ?? [];

    // Generate context for template
    const context = {
      paths: resolvedPaths.length > 0 ? resolvedPaths.join(":") : "",
      aliases: resolvedAliases,
      envVars: resolvedEnvVars,
      shellInit: resolvedShellInit,
      isMacos: ctx.platform === "macos",
    };

    // Load and render the template
    return templateManager.loadAndRender(
      "shell",
      "zshrc-base.zsh.hbs",
      context,
    );
  }
}
