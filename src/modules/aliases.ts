import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ActionResult, ItemStatus } from './types.js';
import { MANAGED_ALIASES_ZSH_PATH, USER_ALIASES_ZSH_PATH, ALIASES_DOTFILES_ROOT } from '../lib/paths.js';

const lstat = promisify(fs.lstat);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);

async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

export async function getStatusList(): Promise<ItemStatus[]> {
  const [managed, link] = await Promise.all([detectManaged(), detectLink()]);
  return [managed, link];
}

async function detectManaged(): Promise<ItemStatus> {
  const exists = await pathExists(MANAGED_ALIASES_ZSH_PATH);
  return { id: 'aliases-managed', label: 'aliases.zsh present (repo)', level: exists ? 'ok' : 'error', details: MANAGED_ALIASES_ZSH_PATH };
}

async function detectLink(): Promise<ItemStatus> {
  try {
    const exists = await pathExists(USER_ALIASES_ZSH_PATH);
    if (!exists) return { id: 'aliases-link', label: 'aliases.zsh linked', level: 'error', details: 'No ~/.zsh/aliases.zsh' };
    const stat = await lstat(USER_ALIASES_ZSH_PATH);
    if (stat.isSymbolicLink()) {
      const target = await fs.promises.readlink(USER_ALIASES_ZSH_PATH);
      const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(USER_ALIASES_ZSH_PATH), target);
      if (absoluteTarget === MANAGED_ALIASES_ZSH_PATH) return { id: 'aliases-link', label: 'aliases.zsh linked', level: 'ok', details: 'Linked correctly' };
      return { id: 'aliases-link', label: 'aliases.zsh linked', level: 'warning', details: `Symlink points to ${absoluteTarget}` };
    }
    const userContent = await readFile(USER_ALIASES_ZSH_PATH, 'utf8').catch(() => '');
    const managedContent = await readFile(MANAGED_ALIASES_ZSH_PATH, 'utf8').catch(() => '');
    const same = userContent.trim() === managedContent.trim();
    return { id: 'aliases-link', label: 'aliases.zsh linked', level: same ? 'warning' : 'error', details: same ? 'Unlinked but same content' : 'Unlinked and different content' };
  } catch (e) {
    return { id: 'aliases-link', label: 'aliases.zsh linked', level: 'warning', details: (e as Error).message };
  }
}

export async function diff(): Promise<ActionResult> {
  try {
    const exists = await pathExists(USER_ALIASES_ZSH_PATH);
    if (!exists) return { ok: true, message: `No user aliases file. Would link to ${MANAGED_ALIASES_ZSH_PATH}.` };
    const userContent = await readFile(USER_ALIASES_ZSH_PATH, 'utf8').catch(() => '');
    const managedContent = await readFile(MANAGED_ALIASES_ZSH_PATH, 'utf8').catch(() => '');
    if (userContent.trim() === managedContent.trim()) return { ok: true, message: 'No differences' };
    const u = userContent.split('\n');
    const m = managedContent.split('\n');
    const preview = [
      `--- ${USER_ALIASES_ZSH_PATH}`,
      `+++ ${MANAGED_ALIASES_ZSH_PATH}`,
      ...u.slice(0, 20).map((l) => `- ${l}`),
      ...m.slice(0, 20).map((l) => `+ ${l}`),
      u.length > 20 || m.length > 20 ? '(diff truncated)' : '',
    ]
      .filter(Boolean)
      .join('\n');
    return { ok: true, message: preview };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function install(): Promise<ActionResult> {
  try {
    await mkdir(path.dirname(USER_ALIASES_ZSH_PATH), { recursive: true });
    try {
      const st = await lstat(USER_ALIASES_ZSH_PATH);
      if (st.isSymbolicLink()) await fs.promises.unlink(USER_ALIASES_ZSH_PATH);
      else await fs.promises.rename(USER_ALIASES_ZSH_PATH, `${USER_ALIASES_ZSH_PATH}.backup-${Date.now()}`);
    } catch {}
    await fs.promises.symlink(MANAGED_ALIASES_ZSH_PATH, USER_ALIASES_ZSH_PATH);
    return { ok: true, message: 'Aliases linked' };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function update(): Promise<ActionResult> {
  return install();
}
