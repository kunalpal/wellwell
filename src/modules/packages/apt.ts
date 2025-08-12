import { PackageManager, type PackageManagerConfig } from '../../core/package-manager.js';

class AptPackageManager extends PackageManager {
  protected config: PackageManagerConfig = {
    name: 'APT',
    command: 'apt',
    installCommand: 'apt install',
    listCommand: 'dpkg -l | grep "^ii" | awk \'{print $2}\'',
    updateCommand: 'apt update',
    platforms: ['ubuntu'],
    requiresSudo: true,
    installFlags: ['-y'],
  };

  constructor() {
    super({
      id: 'packages:apt',
      description: 'APT package manager for Ubuntu/Debian',
      priority: 15,
    });
  }
}

export const aptModule = new AptPackageManager();
