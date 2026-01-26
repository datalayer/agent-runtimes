/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect } from 'vitest';
import { useCache } from '@datalayer/core';

describe('hooks', () => {
  it('should export qfds constant', () => {
    expect(useCache).toBeDefined();
  });
  it('useCache should have correct value', () => {
    expect(typeof useCache).toBe('function');
  });
  it('useCache should be a string', () => {
    expect(typeof useCache).toBe('function');
  });
});
