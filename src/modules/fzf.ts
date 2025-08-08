import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ActionResult, ItemStatus } from './types.js';
import { runCommand } from '../lib/exec.js';
import { MANAGED_FZF_ZSH_PATH, USER_FZF_ZSH_PATH, FZF_DOTFILES_ROOT, USER_CONFIG_DIR } from '../lib/paths.js';

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
  const exists = await pathExists(MANAGED_FZF_ZSH_PATH);
  return { id: 'fzf-managed', label: 'fzf.zsh present (repo)', level: exists ? 'ok' : 'error', details: MANAGED_FZF_ZSH_PATH };
}

async function detectLink(): Promise<ItemStatus> {
  try {
    const exists = await pathExists(USER_FZF_ZSH_PATH);
    if (!exists) return { id: 'fzf-link', label: 'fzf.zsh linked', level: 'error', details: `No ${USER_FZF_ZSH_PATH}` };
    const stat = await lstat(USER_FZF_ZSH_PATH);
    if (stat.isSymbolicLink()) {
      const target = await fs.promises.readlink(USER_FZF_ZSH_PATH);
      const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(USER_FZF_ZSH_PATH), target);
      if (absoluteTarget === MANAGED_FZF_ZSH_PATH) return { id: 'fzf-link', label: 'fzf.zsh linked', level: 'ok', details: 'Linked correctly' };
      return { id: 'fzf-link', label: 'fzf.zsh linked', level: 'warning', details: `Symlink points to ${absoluteTarget}` };
    }
    const userContent = await readFile(USER_FZF_ZSH_PATH, 'utf8').catch(() => '');
    const managedContent = await readFile(MANAGED_FZF_ZSH_PATH, 'utf8').catch(() => '');
    const same = userContent.trim() === managedContent.trim();
    return { id: 'fzf-link', label: 'fzf.zsh linked', level: same ? 'warning' : 'error', details: same ? 'Unlinked but same content' : 'Unlinked and different content' };
  } catch (e) {
    return { id: 'fzf-link', label: 'fzf.zsh linked', level: 'warning', details: (e as Error).message };
  }
}

export async function diff(): Promise<ActionResult> {
  try {
    const exists = await pathExists(USER_FZF_ZSH_PATH);
    if (!exists) return { ok: true, message: `No user fzf zsh file. Would link to ${MANAGED_FZF_ZSH_PATH}.` };
    const userContent = await readFile(USER_FZF_ZSH_PATH, 'utf8').catch(() => '');
    const managedContent = await readFile(MANAGED_FZF_ZSH_PATH, 'utf8').catch(() => '');
    if (userContent.trim() === managedContent.trim()) return { ok: true, message: 'No differences' };
    const u = userContent.split('\n');
    const m = managedContent.split('\n');
    const preview = [
      `--- ${USER_FZF_ZSH_PATH}`,
      `+++ ${MANAGED_FZF_ZSH_PATH}`,
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
    // Ensure fzf is installed
    const fzf = await runCommand(`command -v fzf || true`);
    if (!fzf.stdout) {
      if (process.platform === 'darwin') {
        await runCommand(`brew install fzf || true`);
      } else {
        const apt = await runCommand(`command -v apt-get || true`);
        const dnf = await runCommand(`command -v dnf || true`);
        const yum = await runCommand(`command -v yum || true`);
        if (apt.stdout) {
          await runCommand(`sudo -n apt-get update || true`);
          await runCommand(`sudo -n apt-get install -y fzf || true`);
        } else if (dnf.stdout) {
          await runCommand(`sudo -n dnf install -y fzf || true`);
        } else if (yum.stdout) {
          await runCommand(`sudo -n yum install -y fzf || true`);
        }
      }
    }

    await mkdir(path.dirname(USER_FZF_ZSH_PATH), { recursive: true });
    try {
      const st = await lstat(USER_FZF_ZSH_PATH);
      if (st.isSymbolicLink()) await fs.promises.unlink(USER_FZF_ZSH_PATH);
      else await fs.promises.rename(USER_FZF_ZSH_PATH, `${USER_FZF_ZSH_PATH}.backup-${Date.now()}`);
    } catch {}
    await fs.promises.symlink(MANAGED_FZF_ZSH_PATH, USER_FZF_ZSH_PATH);
    return { ok: true, message: 'fzf config linked' };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function update(): Promise<ActionResult> {
  return install();
}
