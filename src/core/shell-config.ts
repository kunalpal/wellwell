import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BaseModule, type BaseModuleOptions } from './base-module.js';
import type {
  ApplyResult,
  ConfigurationContext,
  PlanResult,
  StatusResult,
} from './types.js';
import { readResolvedAliases, readResolvedPaths, readResolvedShellInit } from './contrib.js';

export interface ShellConfigOptions extends BaseModuleOptions {
  shellFile: string;
  markerStart: string;
  markerEnd: string;
  platforms?: string[];
}

export abstract class ShellConfig extends BaseModule {
  protected abstract shellFile: string;
  protected abstract markerStart: string;
  protected abstract markerEnd: string;
  protected abstract platforms?: string[];

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
    return ctx.platform !== 'unknown';
  }

  protected getShellFilePath(ctx: ConfigurationContext): string {
    return path.join(ctx.homeDir, this.shellFile);
  }

  protected abstract renderShellBlock(ctx: ConfigurationContext): string;

  protected escapeDoubleQuotes(input: string): string {
    return input.replaceAll('"', '\\"');
  }

  protected async upsertBlock(filePath: string, newBlock: string): Promise<{ changed: boolean }> {
    // Ensure target file exists before attempting to read/replace
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      const fh = await fs.open(filePath, 'a');
      await fh.close();
    } catch {}

    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      content = '';
    }

    const startIdx = content.indexOf(this.markerStart);
    const endIdx = content.indexOf(this.markerEnd);
    let updated = '';

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      updated = content.slice(0, startIdx) + newBlock + content.slice(endIdx + this.markerEnd.length);
    } else {
      updated = (content.endsWith('\n') || content.length === 0 ? content : content + '\n') + newBlock;
    }

    const changed = updated !== content;
    if (changed) await fs.writeFile(filePath, updated);
    return { changed };
  }

  async plan(ctx: ConfigurationContext): Promise<PlanResult> {
    const target = this.getShellFilePath(ctx);
    const block = this.renderShellBlock(ctx);
    
    let content = '';
    try {
      content = await fs.readFile(target, 'utf8');
    } catch {}
    
    const needsChange = !content.includes(block);
    return this.createPlanResult(
      needsChange ? [{ summary: `Update ${target} with wellwell block` }] : []
    );
  }

  async apply(ctx: ConfigurationContext): Promise<ApplyResult> {
    const target = this.getShellFilePath(ctx);
    const block = this.renderShellBlock(ctx);
    
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
        const fh = await fs.open(target, 'a');
        await fh.close();
      } catch {}
      
      const { changed } = await this.upsertBlock(target, block);
      return this.createSuccessResult(changed, changed ? `${this.shellFile} updated` : 'no changes');
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  async status(ctx: ConfigurationContext): Promise<StatusResult> {
    const target = this.getShellFilePath(ctx);
    const block = this.renderShellBlock(ctx);
    
    try {
      const content = await fs.readFile(target, 'utf8');
      return { status: content.includes(block) ? 'applied' : 'stale' };
    } catch {
      return { status: 'stale' };
    }
  }
}

// Specialized ZshConfig class
export class ZshConfig extends ShellConfig {
  protected shellFile = '.zshrc';
  protected markerStart = '# === wellwell:begin ===';
  protected markerEnd = '# === wellwell:end ===';

  protected renderShellBlock(ctx: ConfigurationContext): string {
    const resolvedPaths = readResolvedPaths(ctx) ?? [];
    const resolvedAliases = readResolvedAliases(ctx) ?? [];
    const resolvedShellInit = readResolvedShellInit(ctx) ?? [];
    
    const pathExport = resolvedPaths.length
      ? `export PATH="${this.escapeDoubleQuotes(resolvedPaths.join(':'))}:$PATH"`
      : 'export PATH="$HOME/bin:$PATH"';
    
    const lines = [
      this.markerStart,
      pathExport,
      'export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#555"',
      ...resolvedAliases.map((a) => `alias ${a.name}="${this.escapeDoubleQuotes(a.value)}"`),
      '',
      ...resolvedShellInit.map((init) => init.initCode),
      this.markerEnd,
      '',
    ];
    
    if (ctx.platform === 'macos') {
      lines.splice(lines.length - 2, 0, 'export BROWSER="open"');
    }
    
    return lines.join('\n');
  }
}

