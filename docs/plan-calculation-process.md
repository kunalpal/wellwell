# Plan Calculation Process Documentation

This document details all the steps that happen when calculating plans for each module in wellwell's configuration management system.

## Overview

The plan calculation process determines what changes need to be made to bring the system to the desired state. It respects module dependencies, handles platform applicability, and ensures correct execution order through topological sorting.

## Core Components

### Engine (`src/core/engine.ts`)
The central orchestrator that manages module registration, dependency resolution, and plan execution.

### Module Interface (`src/core/types.ts`)
Defines the core `Module` interface with:
- `id`: Unique module identifier
- `dependsOn`: Array of dependency module IDs
- `isApplicable()`: Platform/context applicability check
- `plan()`: Generate list of planned changes
- `apply()`: Execute the planned changes

### Module Registration
Modules are registered with the engine via `engine.register(module)`, building an internal registry.

## Plan Calculation Steps

### 1. Context Building

```typescript
buildContext(): ConfigurationContext {
  return {
    platform: detectPlatform(),
    homeDir: os.homedir(),
    cwd: process.cwd(),
    isCI: Boolean(process.env.CI),
    logger: createLogger({ pretty: this.options.prettyLogs, verbose: this.options.verbose }),
    state: this.sharedState,
  };
}
```

**Purpose**: Create execution context with platform info, directories, and shared state.

### 2. Module Selection and Dependency Expansion

When `plan(selectedIds?: string[])` is called:

```typescript
// If specific modules are selected, expand to include all dependencies
const expandedIds = selectedIds ? this.expandSelectedIds(selectedIds) : undefined;
const modulesToProcess = expandedIds 
  ? modules.filter(m => expandedIds.includes(m.id))
  : modules;
```

**Automatic Dependency Expansion**:
- If specific modules are selected, recursively include all their dependencies
- Ensures dependent modules are always planned and applied together
- Uses depth-first traversal to collect all transitive dependencies

### 3. Topological Sorting

```typescript
private topoSortModules(selectedIds?: string[]): ConfigurationModule[] {
  const modules = Array.from(this.modules.values());
  const idToModule = new Map(modules.map((m) => [m.id, m]));
  const tempMark = new Set<string>();
  const permMark = new Set<string>();
  const result: ConfigurationModule[] = [];

  const visit = (module: ConfigurationModule): void => {
    if (permMark.has(module.id)) return;
    if (tempMark.has(module.id)) {
      throw new Error(`Circular dependency detected at ${module.id}`);
    }
    tempMark.add(module.id);
    const deps = module.dependsOn ?? [];
    for (const depId of deps) {
      const dep = idToModule.get(depId);
      if (!dep) throw new Error(`Missing dependency ${depId} for ${module.id}`);
      visit(dep);
    }
    permMark.add(module.id);
    tempMark.delete(module.id);
    result.push(module);
  };

  // Sort by ID for deterministic order, then perform DFS
  modulesToProcess
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach(visit);

  return result;
}
```

**Key Features**:
- **Dependency-First Ordering**: Dependencies are always processed before dependents
- **Cycle Detection**: Detects and reports circular dependencies
- **Deterministic Results**: Consistent ordering via ID-based sorting for modules at the same dependency level
- **Missing Dependency Detection**: Validates all declared dependencies exist

### 4. Applicability Filtering

For each module in topological order:

```typescript
if (!(await mod.isApplicable(ctx))) continue;
```

**Purpose**: 
- Skip modules not applicable to current platform/context
- Allows modules to self-determine when they should run
- Reduces unnecessary work and potential errors

### 5. Plan Generation

For each applicable module:

```typescript
const plan = await mod.plan(ctx);
results[mod.id] = plan;
```

**Module Planning Process**:
- Each module analyzes current state vs desired state
- Returns `PlanResult` with array of `PlanChange` objects
- Changes include summary and optional details
- Empty changes array means no work needed

### 6. State Persistence

```typescript
await ctx.state.flush();
return results;
```

**Purpose**: Ensure all state changes are persisted to disk before returning results.

## Module Dependencies

### Dependency Declaration

Modules declare dependencies using the `dependsOn` field:

```typescript
export const starshipModule: ConfigurationModule = {
  id: 'shell:starship',
  dependsOn: ['themes:base16'],
  // ... other methods
};
```

### Common Dependency Patterns

**Foundation Modules** (no dependencies):
- `themes:base16` - Color scheme management
- `common:homebin` - Create ~/bin directory

**Infrastructure Modules** (depend on foundations):
- `core:paths` - PATH management
- `packages:homebrew` - Package manager (depends on `core:paths`)

**Application Modules** (depend on infrastructure):
- `apps:eza` - Depends on package managers and themes
- `apps:fzf` - Depends on ripgrep and themes

**Integration Modules** (depend on applications):
- `shell:starship` - Depends on themes for colors
- `core:shell-init` - Depends on all shell contribution modules

### Example Dependency Chain

```
themes:base16 (foundation)
├── shell:starship (depends on themes)
├── apps:eza (depends on package manager + themes)
└── core:shell-init (depends on starship, eza, etc.)
```

## Error Handling

### Missing Dependencies
```typescript
if (!dep) throw new Error(`Missing dependency ${depId} for ${module.id}`);
```

### Circular Dependencies
```typescript
if (tempMark.has(module.id)) {
  throw new Error(`Circular dependency detected at ${module.id}`);
}
```

### Module Planning Errors
Individual module planning errors are caught and logged, but don't stop the overall process.

## Plan Result Structure

```typescript
interface PlanResult {
  changes: PlanChange[];
}

interface PlanChange {
  summary: string;
  details?: string;
}
```

**Example Plan Results**:
```typescript
{
  'themes:base16': { changes: [] }, // No changes needed
  'packages:homebrew': { 
    changes: [
      { summary: 'Install 3 packages', details: 'eza, fzf, ripgrep' }
    ] 
  },
  'apps:eza': {
    changes: [
      { summary: 'Generate ~/.config/eza/config', details: 'Theme: dracula' }
    ]
  }
}
```

## Performance Considerations

### Lazy Evaluation
- Modules are only planned if they're applicable
- Dependencies are resolved on-demand during topological sort

### Caching
- The engine maintains module registry to avoid re-registration
- State store provides persistent caching across runs

### Parallel vs Sequential
- Planning is sequential to respect dependencies
- Individual module planning can be optimized internally

## Integration with Apply Process

The plan calculation directly feeds into the apply process:

1. **Same Topological Order**: Apply uses the same dependency-respecting order
2. **Plan Validation**: Apply can reference the plan to validate expected changes
3. **State Comparison**: Plans are used for robust status checking and change detection

## Testing and Validation

### Unit Tests
- Individual module planning logic
- Dependency resolution correctness
- Error handling scenarios

### Integration Tests
- Full plan calculation with real modules
- Cross-platform applicability
- Complex dependency scenarios

## Module Implementation Guide

### Required Methods

```typescript
export const myModule: ConfigurationModule = {
  id: 'category:name',
  dependsOn: ['other:module'], // Optional but recommended
  
  async isApplicable(ctx: ConfigurationContext): Promise<boolean> {
    // Return true if module should run on this platform/context
    return ctx.platform === 'macos';
  },
  
  async plan(ctx: ConfigurationContext): Promise<PlanResult> {
    const changes: PlanChange[] = [];
    
    // Analyze current state vs desired state
    const needsConfig = !await this.configExists(ctx);
    if (needsConfig) {
      changes.push({
        summary: 'Create configuration file',
        details: `Path: ${this.getConfigPath(ctx)}`
      });
    }
    
    return { changes };
  },
  
  async apply(ctx: ConfigurationContext): Promise<ModuleResult> {
    // Implementation details...
  }
};
```

### Best Practices

1. **Clear Dependencies**: Explicitly declare all dependencies
2. **Precise Planning**: Only report actual changes needed
3. **Idempotent Operations**: Plans should be consistent across multiple runs
4. **Error Handling**: Gracefully handle missing files, permissions, etc.
5. **Platform Awareness**: Use `isApplicable()` to handle platform differences

## Troubleshooting

### Common Issues

**Circular Dependencies**:
```
Error: Circular dependency detected at module:name
```
*Solution*: Review and break circular references in `dependsOn` declarations

**Missing Dependencies**:
```
Error: Missing dependency other:module for current:module
```
*Solution*: Ensure all referenced modules are registered with the engine

**Planning Errors**:
```
Module planning failed: [details]
```
*Solution*: Check module's `plan()` method implementation and context requirements

## Future Enhancements

### Planned Improvements
- **Parallel Planning**: Plan independent module subtrees in parallel
- **Plan Caching**: Cache plans based on state checksums
- **Incremental Planning**: Only re-plan modules whose dependencies changed
- **Plan Visualization**: Generate dependency graphs and execution flow diagrams

This completes the comprehensive documentation of wellwell's plan calculation process.
