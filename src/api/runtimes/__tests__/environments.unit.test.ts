/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { environments } from '..';
import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import { MOCK_JWT_TOKEN } from '../../../__tests__/shared/test-constants';

vi.mock('@datalayer/core/lib/api/DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

describe('Runtimes Environments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list environments', async () => {
    const mockResponse = {
      success: true,
      environments: [{ name: 'python-cpu' }],
    };
    vi.mocked(requestDatalayerAPI).mockResolvedValue(mockResponse);

    const result = await environments.listEnvironments(MOCK_JWT_TOKEN);
    expect(requestDatalayerAPI).toHaveBeenCalled();
    expect(result).toEqual(mockResponse);
  });
});
