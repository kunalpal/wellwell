import {
  createAppModule,
  createCrossPlatformPackages,
} from "../../core/app-module-factory.js";

/**
 * Configuration module for Ripgrep (rg), a fast text search tool.
 * Handles planning, applying, and status checking for the ripgrep package.
 */
export const ripgrepModule = createAppModule({
  id: "apps:ripgrep",
  description: "Ripgrep - fast text search tool",
  packageName: "ripgrep",
  packageMappings: createCrossPlatformPackages("ripgrep"),
  checkCommand: "which rg",
  getDetails: (_ctx) => [
    "Fast text search tool:",
    "  • Recursively searches directories for regex patterns",
    "  • Respects .gitignore and other ignore files",
    "  • Faster than grep with better defaults",
    "  • Used as backend for fzf file searching",
  ],
});
