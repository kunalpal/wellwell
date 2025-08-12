import { PackageManager, type PackageManagerConfig } from '../../core/package-manager.js';

class YumPackageManager extends PackageManager {
  protected config: PackageManagerConfig = {
    name: 'YUM',
    command: 'yum',
    installCommand: 'yum install',
    listCommand: 'yum list installed | awk \'{print $1}\' | grep -v "^Loaded\\|^Installed" | sed \'s/\\..*//\'',
    platforms: ['al2'],
    requiresSudo: true,
    installFlags: ['-y'],
  };

  constructor() {
    super({
      id: 'packages:yum',
      description: 'YUM package manager for Amazon Linux 2',
      priority: 15,
    });
  }
}

export const yumModule = new YumPackageManager();
