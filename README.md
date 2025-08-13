wellwell
========

Dotfiles configuration engine with an Ink-based CLI.

Quick start:

```
npm run dev -- plan
npm run dev -- apply
npm run dev -- status
```

Examples:

```
# plan only specific modules
npm run dev -- plan shell:zshrc

# apply everything
npm run dev -- apply
```

## Local Overrides

You can add machine-specific configuration that won't be committed to the repository. When you run `wellwell apply`, it will automatically create an empty `~/.ww-overrides.zsh` file if one doesn't exist.

This file can contain:
- aliases
- environment variables  
- PATH additions
- custom functions

The overrides file is automatically sourced at the end of the wellwell configuration block in your `.zshrc`.
