import {
  createAppModule,
  createCrossPlatformPackages,
} from "../../core/app-module-factory.js";

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
