import {
  PackageManager,
  type PackageManagerConfig,
} from "../../core/package-manager.js";

/**
 * YUM package manager implementation for RHEL/Amazon Linux.
 * Extends the generic PackageManager with YUM-specific commands and configuration.
 */
class YumPackageManager extends PackageManager {
  protected config: PackageManagerConfig = {
    name: "YUM",
    command: "yum",
    installCommand: "yum install",
    listCommand:
      "yum list installed | awk '{print $1}' | grep -v \"^Loaded\\|^Installed\" | sed 's/\\..*//'",
    platforms: ["al2"],
    requiresSudo: true,
    installFlags: ["-y"],
  };

  constructor() {
    super({
      id: "packages:yum",
      description: "YUM package manager for RHEL/Amazon Linux",
      dependsOn: ["core:paths"],
    });
  }
}

/**
 * The singleton instance of the YumPackageManager module for use in the configuration engine.
 */
export const yumModule = new YumPackageManager();
