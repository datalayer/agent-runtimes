/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { users } from '..';
import * as DatalayerApi from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { MOCK_JWT_TOKEN } from '../../../__tests__/shared/test-constants';

vi.mock('@datalayer/core/lib/api/DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

describe('Spacer Users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSpaces = [
    { id: 'space-1', name: 'Workspace 1' },
    { id: 'space-2', name: 'Workspace 2' },
  ];

  it('should get user spaces', async () => {
    const mockResponse = { success: true, spaces: mockSpaces };
    vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(mockResponse);

    const result = await users.getMySpaces(MOCK_JWT_TOKEN);

    expect(result).toEqual(mockResponse);
    expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
      url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/spaces/users/me`,
      method: 'GET',
      token: MOCK_JWT_TOKEN,
    });
  });

  it('should handle errors', async () => {
    vi.mocked(DatalayerApi.requestDatalayerAPI).mockRejectedValue(
      new Error('Network error'),
    );

    await expect(users.getMySpaces(MOCK_JWT_TOKEN)).rejects.toThrow(
      'Network error',
    );
  });
});
