/**
 * Jest setup file - runs before each test file
 * Sets up global mocks and test environment
 */

// Mock environment variables
process.env.NODE_ENV = "test";
process.env.CI = "false";
