import type { ConfigurationModule } from '../core/types.js';
import { homeBinModule } from './common/homebin.js';
import { zshrcModules } from './shell/zshrc/index.js';
import { pathsModule } from './core/paths.js';
import { aliasesModule } from './core/aliases.js';

export const allModules: ConfigurationModule[] = [
  homeBinModule,
  pathsModule,
  aliasesModule,
  ...zshrcModules,
];


