/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runtimes } from '..';
import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import { MOCK_JWT_TOKEN } from '../../../__tests__/shared/test-constants';

vi.mock('@datalayer/core/lib/api/DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

describe('Runtimes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list runtimes', async () => {
    const mockResponse = {
      success: true,
      runtimes: [{ runtime_name: 'test-runtime' }],
    };
    vi.mocked(requestDatalayerAPI).mockResolvedValue(mockResponse);

    const result = await runtimes.listRuntimes(MOCK_JWT_TOKEN);
    expect(requestDatalayerAPI).toHaveBeenCalled();
    expect(result).toEqual(mockResponse);
  });

  it('should list runtime memories with query params', async () => {
    const mockResponse = {
      success: true,
      count: 1,
      limit: 10,
      offset: 0,
      memories: [{ id: 'm-1', memory: 'remember this' }],
    };
    vi.mocked(requestDatalayerAPI).mockResolvedValue(mockResponse);

    const result = await runtimes.listRuntimeMemories(MOCK_JWT_TOKEN, {
      agentId: 'agent-1',
      limit: 10,
      offset: 0,
    });

    expect(requestDatalayerAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        token: MOCK_JWT_TOKEN,
      }),
    );
    const call = vi.mocked(requestDatalayerAPI).mock.calls.at(0)?.[0] as any;
    expect(String(call?.url || '')).toContain('/api/runtimes/v1/memories');
    expect(String(call?.url || '')).toContain('agent_id=agent-1');
    expect(result.memories).toHaveLength(1);
  });
});
