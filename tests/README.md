# Testing Guide

This project uses Jest for testing with comprehensive mocking to ensure the host system is not affected during test execution.

## Test Structure

- `tests/core/` - Tests for core functionality (engine, logger, platform detection, state management)
- `tests/modules/packages/` - Tests for package manager modules (homebrew, apt, yum, mise)
- `tests/modules/apps/` - Tests for application modules (eza, fzf, kitty, nvim, etc.)
- `tests/mocks/` - Centralized mocking utilities

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (development)
npm run test:watch

# Run tests for CI (no watch, with coverage)
npm run test:ci

# Run specific test file
npm test -- --testPathPatterns=platform.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="Platform Detection"
```

## Key Testing Principles

### 1. Host System Protection

All tests use comprehensive mocking to prevent any changes to the host system:

- Filesystem operations are mocked
- Shell commands are mocked
- Network requests are mocked
- Package manager operations are mocked

### 2. Mock Architecture

The `tests/mocks/index.ts` file provides centralized mock utilities:

- `mockFs` - Mock filesystem operations
- `mockExec` - Mock shell command execution
- `mockOs` - Mock OS detection
- `createMockContext` - Create test configuration contexts
- `resetAllMocks` - Reset all mocks between tests

### 3. Test Categories

#### Core Module Tests

Test the fundamental functionality:

- Platform detection logic
- State management (JsonFileStateStore)
- Logger configuration
- Engine dependency resolution and execution
- Contribution system

#### Package Manager Tests

Test package manager integration:

- Platform-specific applicability
- Package installation planning and execution
- Status checking
- Error handling

#### Application Module Tests

Test application-specific configuration:

- Package contribution registration
- Configuration file management
- Shell initialization
- Feature detection

## Mock Usage Examples

### Testing Commands

```typescript
// Mock successful command
mockCommandSuccess("output")(mockExecAsync);

// Mock command failure
mockCommandFailure("Error message")(mockExecAsync);
```

### Testing File Operations

```typescript
// Mock file exists
mockFileExists("/path/to/file", true);

// Mock file content
mockFileContent("/path/to/file", "content");
```

### Creating Test Contexts

```typescript
const ctx = createMockContext({
  platform: "macos",
  homeDir: "/mock/home",
});
```

## CI Integration

Tests run automatically on:

- Push to main/develop branches
- Pull requests to main
- Multiple Node.js versions (18.x, 20.x)

Coverage reports are uploaded to Codecov for tracking test coverage over time.

## Best Practices

1. **Always use mocks** - Never let tests affect the real system
2. **Test error cases** - Ensure robust error handling
3. **Test platform-specific behavior** - Verify cross-platform compatibility
4. **Use descriptive test names** - Make test failures easy to understand
5. **Reset mocks** - Ensure test isolation with proper cleanup
