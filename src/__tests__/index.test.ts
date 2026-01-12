/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect } from 'vitest';
import * as coreIndex from '@datalayer/core';

describe('@datalayer/agent-runtimes - index', () => {
  it('should export BackdropContext from hooks', () => {
    expect(coreIndex.BackdropContext).toBeDefined();
    expect(coreIndex.BackdropContext).toHaveProperty('$$typeof');
    expect(typeof coreIndex.BackdropContext).toBe('object');
  });

  it('should export utils functions', () => {
    expect(coreIndex.convertToLargestUnit).toBeDefined();
    expect(coreIndex.asArray).toBeDefined();
  });

  it('should export DatalayerServiceManager from services', () => {
    expect(coreIndex.createDatalayerServiceManager).toBeDefined();
    expect(typeof coreIndex.createDatalayerServiceManager).toBe('function');
  });

  it('should have all expected exports', () => {
    const exports = Object.keys(coreIndex);
    expect(exports).toContain('convertToLargestUnit');
    expect(exports).toContain('asArray');
    expect(exports).toContain('createDatalayerServiceManager');
  });
});
