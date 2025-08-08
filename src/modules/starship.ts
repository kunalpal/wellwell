import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { runCommand } from '../lib/exec.js';
import type { ActionResult, ItemStatus } from './types.js';
import { MANAGED_STARSHIP_TOML_PATH, USER_STARSHIP_TOML_PATH, STARSHIP_DOTFILES_ROOT } from '../lib/paths.js';

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

export type StarshipStatus = {
  installed: ItemStatus;
  configLink: ItemStatus;
};

export async function getStatusList(): Promise<ItemStatus[]> {
  const [installed, configLink] = await Promise.all([detectInstalled(), detectConfigLink()]);
  return [installed, configLink];
}

async function detectInstalled(): Promise<ItemStatus> {
  try {
    const { stdout } = await runCommand(`command -v starship || true`);
    const ok = Boolean(stdout);
    return { id: 'starship-installed', label: 'Starship installed', level: ok ? 'ok' : 'error', details: ok ? stdout : 'Not found' };
  } catch (e) {
    return { id: 'starship-installed', label: 'Starship installed', level: 'warning', details: (e as Error).message };
  }
}

async function detectConfigLink(): Promise<ItemStatus> {
  try {
    const managedExists = await pathExists(MANAGED_STARSHIP_TOML_PATH);
    if (!managedExists) {
      return { id: 'starship-config', label: 'starship.toml linked', level: 'warning', details: `Managed file missing at ${MANAGED_STARSHIP_TOML_PATH}` };
    }

    const exists = await pathExists(USER_STARSHIP_TOML_PATH);
    if (!exists) return { id: 'starship-config', label: 'starship.toml linked', level: 'error', details: 'No user starship.toml' };

    const stat = await lstat(USER_STARSHIP_TOML_PATH);
    if (stat.isSymbolicLink()) {
      const target = await fs.promises.readlink(USER_STARSHIP_TOML_PATH);
      const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(USER_STARSHIP_TOML_PATH), target);
      if (absoluteTarget === MANAGED_STARSHIP_TOML_PATH) {
        return { id: 'starship-config', label: 'starship.toml linked', level: 'ok', details: 'Linked correctly' };
      }
      return { id: 'starship-config', label: 'starship.toml linked', level: 'warning', details: `Symlink points to ${absoluteTarget}` };
    }

    const userContent = await readFile(USER_STARSHIP_TOML_PATH, 'utf8').catch(() => '');
    const managedContent = await readFile(MANAGED_STARSHIP_TOML_PATH, 'utf8').catch(() => '');
    const same = userContent.trim() === managedContent.trim();
    return { id: 'starship-config', label: 'starship.toml linked', level: same ? 'warning' : 'error', details: same ? 'Unlinked but same content' : 'Unlinked and different content' };
  } catch (e) {
    return { id: 'starship-config', label: 'starship.toml linked', level: 'warning', details: (e as Error).message };
  }
}

export async function diff(): Promise<ActionResult> {
  try {
    const exists = await pathExists(USER_STARSHIP_TOML_PATH);
    if (!exists) return { ok: true, message: `No starship.toml present. Would link to ${MANAGED_STARSHIP_TOML_PATH}.` };

    const userContent = await readFile(USER_STARSHIP_TOML_PATH, 'utf8').catch(() => '');
    const managedContent = await readFile(MANAGED_STARSHIP_TOML_PATH, 'utf8').catch(() => '');
    if (userContent.trim() === managedContent.trim()) return { ok: true, message: 'No differences' };

    const u = userContent.split('\n');
    const m = managedContent.split('\n');
    const preview = [
      `--- ${USER_STARSHIP_TOML_PATH}`,
      `+++ ${MANAGED_STARSHIP_TOML_PATH}`,
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
    // Install starship if missing using platform package managers, fallback to curl script
    const { stdout } = await runCommand(`command -v starship || true`);
    if (!stdout) {
      if (process.platform === 'darwin') {
        await runCommand(`brew install starship || true`);
      } else {
        const apt = await runCommand(`command -v apt-get || true`);
        const dnf = await runCommand(`command -v dnf || true`);
        const yum = await runCommand(`command -v yum || true`);
        let installed = false;
        if (apt.stdout) {
          await runCommand(`sudo -n apt-get update || true`);
          await runCommand(`sudo -n apt-get install -y starship || true`);
          installed = true;
        } else if (dnf.stdout) {
          await runCommand(`sudo -n dnf install -y starship || true`);
          installed = true;
        } else if (yum.stdout) {
          await runCommand(`sudo -n yum install -y starship || true`);
          installed = true;
        }
        if (!installed) {
          await runCommand(`curl -sS https://starship.rs/install.sh | sh -s -- -y || true`);
        }
      }
    }

    await mkdir(path.dirname(USER_STARSHIP_TOML_PATH), { recursive: true });
    // link config
    try {
      const st = await lstat(USER_STARSHIP_TOML_PATH);
      if (st.isSymbolicLink()) await fs.promises.unlink(USER_STARSHIP_TOML_PATH);
      else await fs.promises.rename(USER_STARSHIP_TOML_PATH, `${USER_STARSHIP_TOML_PATH}.backup-${Date.now()}`);
    } catch {}
    await fs.promises.symlink(MANAGED_STARSHIP_TOML_PATH, USER_STARSHIP_TOML_PATH);

    return { ok: true, message: 'Starship installed and config linked' };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function update(): Promise<ActionResult> {
  try {
    // Re-link config and upgrade starship via brew if available
    await install();
    if (process.platform === 'darwin') {
      await runCommand(`brew upgrade starship || true`);
    }
    return { ok: true, message: 'Starship updated' };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}
