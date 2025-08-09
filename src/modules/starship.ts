import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
    // Install starship if missing. Prefer package managers when privileges are available;
    // otherwise fall back to the official installer script which installs under ~/.local/bin.
    const foundBefore = await runCommand(`command -v starship || true`);
    if (!foundBefore.stdout) {
      if (process.platform === 'darwin') {
        await runCommand(`brew install starship || true`);
      } else {
        const apt = await runCommand(`command -v apt-get || true`);
        const dnf = await runCommand(`command -v dnf || true`);
        const yum = await runCommand(`command -v yum || true`);
        // Determine if we can run privileged installs
        const uid = await runCommand(`id -u || echo 1000`);
        const isRoot = uid.stdout.trim() === '0';
        const hasSudo = (await runCommand(`command -v sudo || true`)).stdout ? true : false;
        const sudoWorks = hasSudo ? (await runCommand(`sudo -n true || true`)).stderr === '' : false;
        const canPrivInstall = isRoot || sudoWorks;

        if (canPrivInstall) {
          if (apt.stdout) {
            await runCommand(`sudo -n apt-get update || true`);
            const res = await runCommand(`sudo -n apt-get install -y starship || true`);
          } else if (dnf.stdout) {
            await runCommand(`sudo -n dnf install -y starship || true`);
          } else if (yum.stdout) {
            await runCommand(`sudo -n yum install -y starship || true`);
          }
        }

        // Re-check; if still missing, try official installer script to ~/.local/bin (no sudo)
        const afterPm = await runCommand(`command -v starship || true`);
        if (!afterPm.stdout) {
          const binDir = path.join(os.homedir(), '.local', 'bin');
          await fs.promises.mkdir(binDir, { recursive: true });
          const tmpDir = path.join(os.tmpdir(), `starship-install-${Date.now()}`);
          await fs.promises.mkdir(tmpDir, { recursive: true });
          const installScript = path.join(tmpDir, 'install.sh');
          await runCommand(`curl -fsSL https://starship.rs/install.sh -o ${installScript} || true`);
          await runCommand(`sh ${installScript} -y -b ${binDir} || true`);

          // If still missing, fetch prebuilt tarball as a fallback
          const afterScript = await runCommand(`command -v starship || true`);
          if (!afterScript.stdout) {
            const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : '';
            if (!arch) {
              return { ok: false, message: `Unsupported architecture for starship: ${process.arch}` };
            }
            const url = `https://github.com/starship/starship/releases/latest/download/starship-${arch}-unknown-linux-gnu.tar.gz`;
            const tarPath = path.join(tmpDir, 'starship.tar.gz');
            await runCommand(`curl -fsSL ${url} -o ${tarPath} || true`);
            await runCommand(`(test -f ${tarPath} && tar -xzf ${tarPath} -C ${tmpDir}) || true`);
            await runCommand(`(test -f ${tmpDir}/starship && mv ${tmpDir}/starship ${binDir}/starship && chmod +x ${binDir}/starship) || true`);
          }
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

    // Final check of binary presence for accurate messaging
    const finalCheck = await runCommand(`command -v starship || true`);
    const msg = finalCheck.stdout ? 'Starship installed and config linked' : 'Starship config linked (binary not found on PATH)';
    return { ok: true, message: msg };
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
