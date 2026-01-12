# Testing Setup for @datalayer/agent-runtimes

This package includes comprehensive testing setup using Vitest.

## Test Structure

- **Unit Tests**: Located in `src/__tests__/`
  - Test TypeScript functionality
  - Test React components (basic structure)
  - Test utility functions

## Available Test Scripts

```bash
# Run all unit tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI interface
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run Storybook tests
npm run test:storybook
```

## Test Configuration

The project uses two test environments:

1. **Unit Tests**: Uses `jsdom` environment for DOM testing
2. **Storybook Tests**: Uses browser environment with Playwright

## Test Files

- `src/__tests__/index.test.ts` - Tests main exports
- `src/__tests__/App.test.tsx` - Tests React App component
- `src/__tests__/hooks.test.ts` - Tests custom hooks
- `src/__tests__/utils.test.ts` - Tests utility functions

## Coverage

Run `npm run test:coverage` to generate coverage reports.

## Writing Tests

Tests should follow the existing patterns:

```typescript
import { describe, it, expect } from 'vitest';

describe('Component/Function Name', () => {
  it('should describe what it tests', () => {
    expect(actual).toBe(expected);
  });
});
```
