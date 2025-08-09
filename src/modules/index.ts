import type { ConfigurationModule } from '../core/types.js';
import { homeBinModule } from './common/homebin.js';
import { zshrcModules } from './shell/zshrc/index.js';

export const allModules: ConfigurationModule[] = [
  homeBinModule,
  ...zshrcModules,
];


