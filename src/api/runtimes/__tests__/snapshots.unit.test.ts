/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snapshots } from '..';
import { requestDatalayerAPI } from '@datalayer/core/lib/base/api/DatalayerApi';
import { MOCK_JWT_TOKEN } from '@datalayer/core/lib/base/__tests__/shared/test-constants';

vi.mock('../../DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

describe('Runtimes Snapshots API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list snapshots', async () => {
    const mockResponse = {
      success: true,
      snapshots: [{ id: 'snapshot-123' }],
    };
    vi.mocked(requestDatalayerAPI).mockResolvedValue(mockResponse);

    const result = await snapshots.listSnapshots(MOCK_JWT_TOKEN);
    expect(requestDatalayerAPI).toHaveBeenCalled();
    expect(result).toEqual(mockResponse);
  });
});
