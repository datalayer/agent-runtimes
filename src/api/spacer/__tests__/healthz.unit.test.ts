/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healthz } from '..';
import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';

vi.mock('../../DatalayerApi');

describe('Spacer Healthz', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return health status', async () => {
    const mockResponse = { success: true, message: 'Service is healthy' };
    vi.mocked(requestDatalayerAPI).mockResolvedValueOnce(mockResponse);

    const result = await healthz.ping();

    expect(result).toEqual(mockResponse);
    expect(requestDatalayerAPI).toHaveBeenCalledWith({
      url: 'https://prod1.datalayer.run/api/spacer/v1/ping',
      method: 'GET',
    });
  });

  it('should use custom base URL', async () => {
    const mockResponse = { success: true, message: 'Service is healthy' };
    vi.mocked(requestDatalayerAPI).mockResolvedValueOnce(mockResponse);

    await healthz.ping('https://test.datalayer.run');

    expect(requestDatalayerAPI).toHaveBeenCalledWith({
      url: 'https://test.datalayer.run/api/spacer/v1/ping',
      method: 'GET',
    });
  });

  it('should throw error on failure', async () => {
    const mockError = new Error('Service error');
    vi.mocked(requestDatalayerAPI).mockRejectedValueOnce(mockError);

    await expect(healthz.ping()).rejects.toThrow();
  });
});
