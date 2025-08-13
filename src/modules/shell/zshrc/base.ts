import { ZshConfig } from '../../../core/shell-config.js';

class ZshrcBaseConfig extends ZshConfig {
  protected platforms: string[] = ['macos', 'ubuntu', 'al2']; // All platforms

  constructor() {
    super({
      id: 'shell:zshrc:base',
      description: 'Base zshrc block managed by wellwell',
      dependsOn: ['common:homebin', 'core:paths', 'core:aliases', 'core:env-vars', 'shell:init'],
      priority: 50,
      shellFile: '.zshrc',
      markerStart: '# === wellwell:begin ===',
      markerEnd: '# === wellwell:end ===',
    });
  }

  getDetails(_ctx: any): string[] {
    return [
      'Base zsh configuration:',
      '  • PATH management',
      '  • Environment variables',
      '  • Aliases integration',
      '  • Shell initializations',
    ];
  }
}

export const zshrcBaseModule = new ZshrcBaseConfig();


