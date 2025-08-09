import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../../core/types.js';

const ZSHRC_MARKER_START = '# === wellwell:begin ===';
const ZSHRC_MARKER_END = '# === wellwell:end ===';

function renderZshrcBlock(ctx: ConfigurationContext): string {
  const lines = [
    ZSHRC_MARKER_START,
    'export PATH="$HOME/bin:$PATH"',
    'export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#555"',
    ZSHRC_MARKER_END,
    '',
  ];
  if (ctx.platform === 'macos') {
    lines.splice(lines.length - 1, 0, 'export BROWSER="open"');
  }
  return lines.join('\n');
}

async function upsertBlock(filePath: string, newBlock: string): Promise<{ changed: boolean }>
{
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    // create the file if missing so subsequent writes succeed
    await fs.writeFile(filePath, '');
    content = '';
  }
  const startIdx = content.indexOf(ZSHRC_MARKER_START);
  const endIdx = content.indexOf(ZSHRC_MARKER_END);
  let updated = '';
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    updated = content.slice(0, startIdx) + newBlock + content.slice(endIdx + ZSHRC_MARKER_END.length);
  } else {
    updated = (content.endsWith('\n') || content.length === 0 ? content : content + '\n') + newBlock;
  }
  const changed = updated !== content;
  if (changed) await fs.writeFile(filePath, updated);
  return { changed };
}

export const zshrcBaseModule: ConfigurationModule = {
  id: 'shell:zshrc:base',
  description: 'Base zshrc block managed by wellwell',
  dependsOn: ['common:homebin'],
  priority: 50,

  async isApplicable(ctx) {
    return ctx.platform !== 'unknown';
  },

  async plan(ctx): Promise<PlanResult> {
    const target = path.join(ctx.homeDir, '.zshrc');
    const block = renderZshrcBlock(ctx);
    let content = '';
    try {
      content = await fs.readFile(target, 'utf8');
    } catch {}
    const needsChange = !content.includes(block);
    return { changes: needsChange ? [{ summary: `Update ${target} with wellwell block` }] : [] };
  },

  async apply(ctx): Promise<ApplyResult> {
    const target = path.join(ctx.homeDir, '.zshrc');
    const block = renderZshrcBlock(ctx);
    try {
      const { changed } = await upsertBlock(target, block);
      return { success: true, changed, message: changed ? 'zshrc updated' : 'no changes' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const target = path.join(ctx.homeDir, '.zshrc');
    const block = renderZshrcBlock(ctx);
    try {
      const content = await fs.readFile(target, 'utf8');
      return { status: content.includes(block) ? 'applied' : 'idle' };
    } catch {
      return { status: 'idle' };
    }
  },
};


