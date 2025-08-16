import {
  PackageManager,
  type PackageManagerConfig,
} from "../../core/package-manager.js";

/**
 * APT package manager implementation for Ubuntu/Debian.
 * Extends the generic PackageManager with APT-specific commands and configuration.
 */
class AptPackageManager extends PackageManager {
  protected config: PackageManagerConfig = {
    name: "APT",
    command: "apt",
    installCommand: "apt install",
    listCommand: "dpkg -l | grep \"^ii\" | awk '{print $2}'",
    updateCommand: "apt update",
    platforms: ["ubuntu"],
    requiresSudo: true,
    installFlags: ["-y"],
  };

  constructor() {
    super({
      id: "packages:apt",
      description: "APT package manager for Ubuntu/Debian",
      dependsOn: ["core:paths"],
    });
  }
}

/**
 * The singleton instance of the AptPackageManager module for use in the configuration engine.
 */
export const aptModule = new AptPackageManager();
