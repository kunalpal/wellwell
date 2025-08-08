import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { runCommand } from '../lib/exec.js';
import type { ActionResult, ItemStatus } from './types.js';
import { MANAGED_ZSHRC_PATH, ZSH_DOTFILES_ROOT } from '../lib/paths.js';

const lstat = promisify(fs.lstat);
const symlink = promisify(fs.symlink);
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const HOME = os.homedir();
const MANAGED_ROOT = ZSH_DOTFILES_ROOT;
const MANAGED_ZSHRC = MANAGED_ZSHRC_PATH;
const LINK_ZSHRC = path.join(HOME, '.zshrc');
// Zinit directories (XDG compliant)
const XDG_DATA_HOME = process.env.XDG_DATA_HOME || path.join(HOME, '.local', 'share');
const ZINIT_HOME = path.join(XDG_DATA_HOME, 'zinit', 'zinit.git');
const ZINIT_PLUGINS_DIR = path.join(XDG_DATA_HOME, 'zinit', 'plugins');
const AUTOSUGGESTIONS_DIR = path.join(ZINIT_PLUGINS_DIR, 'zsh-users---zsh-autosuggestions');
const SYNTAX_HIGHLIGHTING_DIR = path.join(ZINIT_PLUGINS_DIR, 'zsh-users---zsh-syntax-highlighting');
const COMPLETIONS_DIR = path.join(ZINIT_PLUGINS_DIR, 'zsh-users---zsh-completions');

export type ZshStatus = {
  defaultShell: ItemStatus;
  zshrcLink: ItemStatus;
  zinit: ItemStatus;
  autosuggestions: ItemStatus;
  syntaxHighlighting: ItemStatus;
  completions: ItemStatus;
};

export async function getZshStatus(): Promise<ZshStatus> {
  const [shell, link, zinitStatus, auto, syntax, completions] = await Promise.all([
    detectDefaultShell(),
    detectZshrcLink(),
    detectZinit(),
    detectPlugin(AUTOSUGGESTIONS_DIR, 'zsh-autosuggestions'),
    detectPlugin(SYNTAX_HIGHLIGHTING_DIR, 'zsh-syntax-highlighting'),
    detectPlugin(COMPLETIONS_DIR, 'zsh-completions'),
  ]);

  return {
    defaultShell: shell,
    zshrcLink: link,
    zinit: zinitStatus,
    autosuggestions: auto,
    syntaxHighlighting: syntax,
    completions,
  };
}

export async function getStatusList(): Promise<ItemStatus[]> {
  const s = await getZshStatus();
  return [s.defaultShell, s.zshrcLink, s.zinit, s.autosuggestions, s.syntaxHighlighting, s.completions];
}

export async function diffModule() {
  // Diff managed zshrc vs linked or home file
  try {
    const exists = await pathExists(LINK_ZSHRC);
    if (!exists) {
      return { ok: true, message: `No ~/.zshrc present. Would link to ${MANAGED_ZSHRC}.` };
    }
    const content = await readFile(LINK_ZSHRC, 'utf8').catch(() => '');
    const managedContent = await readFile(MANAGED_ZSHRC, 'utf8').catch(() => '');
    if (content.trim() === managedContent.trim()) {
      return { ok: true, message: 'No differences' };
    }
    // Simple line-by-line diff preview (first 10 lines)
    const homeLines = content.split('\n');
    const managedLines = managedContent.split('\n');
    const preview = [
      '--- ~/.zshrc',
      `+++ ${MANAGED_ZSHRC}`,
      ...homeLines.slice(0, 10).map((l) => `- ${l}`),
      ...managedLines.slice(0, 10).map((l) => `+ ${l}`),
      homeLines.length > 10 || managedLines.length > 10 ? '(diff truncated)' : '',
    ]
      .filter(Boolean)
      .join('\n');
    return { ok: true, message: preview };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function installModule() {
  // Ensure zsh is installed, managed file, link it, install plugins
  const steps = [actionEnsureZshInstalled, actionEnsureManagedZshrc, actionLinkZshrc, actionInstallPlugins];
  for (const step of steps) {
    const res = await step();
    if (!res.ok) return res;
  }
  return { ok: true, message: 'Zsh installed (managed .zshrc linked, plugins installed).' };
}

export async function updateModule() {
  // Ensure zsh present, re-link to ensure correct target and reinstall missing plugins
  const steps = [actionEnsureZshInstalled, actionLinkZshrc, actionInstallPlugins];
  for (const step of steps) {
    const res = await step();
    if (!res.ok) return res;
  }
  return { ok: true, message: 'Zsh updated.' };
}

export async function actionEnsureZshInstalled(): Promise<ActionResult> {
  try {
    const which = await runCommand(`command -v zsh || true`);
    if (which.stdout) return { ok: true, message: 'zsh already installed' };
    if (process.platform === 'darwin') {
      await runCommand(`brew install zsh || true`);
    } else {
      const apt = await runCommand(`command -v apt-get || true`);
      const dnf = await runCommand(`command -v dnf || true`);
      const yum = await runCommand(`command -v yum || true`);
      if (apt.stdout) {
        await runCommand(`sudo -n apt-get update || true`);
        await runCommand(`sudo -n apt-get install -y zsh || true`);
      } else if (dnf.stdout) {
        await runCommand(`sudo -n dnf install -y zsh || true`);
      } else if (yum.stdout) {
        await runCommand(`sudo -n yum install -y zsh || true`);
      }
    }
    return { ok: true, message: 'zsh ensured' };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

async function detectDefaultShell(): Promise<ItemStatus> {
  try {
    if (process.platform === 'darwin') {
      // Use id -un to avoid relying on $USER and sanitize to a single line
      const { stdout } = await runCommand(`dscl . -read /Users/"$(id -un)" UserShell | awk '{print $2}' | head -n1`);
      const current = (stdout.split('\n')[0] || process.env.SHELL || '').trim();
      const ok = current.includes('/zsh');
      return {
        id: 'default-shell',
        label: 'Default shell is zsh',
        level: ok ? 'ok' : 'error',
        details: ok ? current : `Current: ${current || 'unknown'}`,
      };
    }

    // Linux fallback – ensure only one line of output, resilient to noisy shell init
    const { stdout } = await runCommand(`getent passwd "$(id -un)" | awk -F: '{print $7}' | head -n1`);
    const current = (stdout.split('\n')[0] || process.env.SHELL || '').trim();
    const ok = current.includes('zsh');
    return {
      id: 'default-shell',
      label: 'Default shell is zsh',
      level: ok ? 'ok' : 'error',
      details: ok ? current : `Current: ${current || 'unknown'}`,
    };
  } catch (e) {
    return { id: 'default-shell', label: 'Default shell check failed', level: 'warning', details: (e as Error).message };
  }
}

async function detectZshrcLink(): Promise<ItemStatus> {
  try {
    const managedExists = await fileExists(MANAGED_ZSHRC);
    if (!managedExists) {
      return { id: 'zshrc-link', label: '~/.zshrc linked to managed file', level: 'warning', details: `Managed file missing at ${MANAGED_ZSHRC}` };
    }

    const linkExists = await pathExists(LINK_ZSHRC);
    if (!linkExists) {
      return { id: 'zshrc-link', label: '~/.zshrc linked to managed file', level: 'error', details: 'No ~/.zshrc present' };
    }

    const stat = await lstat(LINK_ZSHRC);
    if (stat.isSymbolicLink()) {
      const target = await fs.promises.readlink(LINK_ZSHRC);
      const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(LINK_ZSHRC), target);
      if (absoluteTarget === MANAGED_ZSHRC) {
        return { id: 'zshrc-link', label: '~/.zshrc linked to managed file', level: 'ok', details: 'Linked correctly' };
      }
      return { id: 'zshrc-link', label: '~/.zshrc linked to managed file', level: 'warning', details: `Symlink points to ${absoluteTarget}` };
    }

    // Compare content
    const content = await readFile(LINK_ZSHRC, 'utf8').catch(() => '');
    const managedContent = await readFile(MANAGED_ZSHRC, 'utf8').catch(() => '');
    const same = content.trim() === managedContent.trim();
    return {
      id: 'zshrc-link',
      label: '~/.zshrc linked to managed file',
      level: same ? 'warning' : 'error',
      details: same ? 'Unlinked but same content' : 'Unlinked and different content',
    };
  } catch (e) {
    return { id: 'zshrc-link', label: '~/.zshrc linked to managed file', level: 'warning', details: (e as Error).message };
  }
}

async function detectZinit(): Promise<ItemStatus> {
  const exists = await pathExists(path.join(ZINIT_HOME, 'zinit.zsh'));
  return {
    id: 'zinit',
    label: 'Zinit installed',
    level: exists ? 'ok' : 'error',
    details: exists ? ZINIT_HOME : 'Not installed',
  };
}

async function detectPlugin(dir: string, name: string): Promise<ItemStatus> {
  const exists = await pathExists(dir);
  return {
    id: `plugin-${name}`,
    label: `${name} installed`,
    level: exists ? 'ok' : 'error',
    details: exists ? dir : 'Not installed',
  };
}

export async function actionSetDefaultShellToZsh(): Promise<ActionResult> {
  try {
    const zshPath = '/bin/zsh';
    const { stdout } = await runCommand(`which zsh || true`);
    const pathToUse = stdout || zshPath;
    await runCommand(`chsh -s ${pathToUse}`);
    return { ok: true, message: `Default shell set to ${pathToUse}. You may need to log out and back in.` };
  } catch (error) {
    return { ok: false, error: error as Error, message: 'Failed to set default shell (you may need to enter your password or run manually: chsh -s /bin/zsh)' };
  }
}

export async function actionEnsureManagedZshrc(): Promise<ActionResult> {
  try {
    await mkdir(MANAGED_ROOT, { recursive: true });
    // If file exists, keep; otherwise, seed with a simple default
    const exists = await fileExists(MANAGED_ZSHRC);
    if (!exists) {
      await writeFile(
        MANAGED_ZSHRC,
        `# Managed by wellwell\n# Add your zsh configuration here.\n`,
        'utf8'
      );
    }
    return { ok: true, message: `Ensured managed .zshrc at ${MANAGED_ZSHRC}` };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function actionLinkZshrc(): Promise<ActionResult> {
  try {
    await mkdir(path.dirname(LINK_ZSHRC), { recursive: true });
    const exists = await pathExists(LINK_ZSHRC);
    if (exists) {
      const st = await lstat(LINK_ZSHRC);
      if (st.isSymbolicLink()) {
        await fs.promises.unlink(LINK_ZSHRC);
      } else {
        const backup = `${LINK_ZSHRC}.backup-${Date.now()}`;
        await fs.promises.rename(LINK_ZSHRC, backup);
      }
    }
    await symlink(MANAGED_ZSHRC, LINK_ZSHRC);
    return { ok: true, message: `Symlinked ${LINK_ZSHRC} -> ${MANAGED_ZSHRC}` };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function actionInstallPlugins(): Promise<ActionResult> {
  try {
    // Ensure Zinit exists
    if (!(await pathExists(path.join(ZINIT_HOME, 'zinit.zsh')))) {
      await mkdir(path.dirname(ZINIT_HOME), { recursive: true });
      await runCommand(`git clone https://github.com/zdharma-continuum/zinit.git "${ZINIT_HOME}"`);
    }
    // Use zsh to install plugins via zinit. Sourcing user's ~/.zshrc ensures any customizations.
    await runCommand(`zsh -lc 'source ~/.zshrc >/dev/null 2>&1 || true; zinit light zsh-users/zsh-autosuggestions; zinit light zsh-users/zsh-syntax-highlighting; zinit light zsh-users/zsh-completions; autoload -Uz compinit && compinit -u'`);
    return { ok: true, message: 'Zinit and plugins installed (including zsh-completions)' };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await lstat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}
