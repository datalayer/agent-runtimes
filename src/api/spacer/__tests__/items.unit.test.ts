/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { items } from '..';
import * as DatalayerApi from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { MOCK_JWT_TOKEN } from '@datalayer/core/lib/__tests__/shared/test-constants';

vi.mock('../../DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

describe('Spacer Items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockItems = [
    { id: 'item-1', type: 'notebook', name: 'My Notebook' },
    { id: 'item-2', type: 'lexical', name: 'My Document' },
  ];

  describe('getSpaceItems', () => {
    it('should get space items', async () => {
      const mockResponse = { success: true, items: mockItems };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await items.getSpaceItems(
        MOCK_JWT_TOKEN,
        'space-123',
        DEFAULT_SERVICE_URLS.SPACER,
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/spaces/space-123/items`,
        method: 'GET',
        token: MOCK_JWT_TOKEN,
      });
    });

    it('should handle errors', async () => {
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        items.getSpaceItems(MOCK_JWT_TOKEN, 'space-123'),
      ).rejects.toThrow('Network error');
    });
  });

  describe('deleteItem', () => {
    it('should delete item', async () => {
      const mockResponse = { success: true, message: 'Item deleted' };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await items.deleteItem(
        MOCK_JWT_TOKEN,
        'item-123',
        DEFAULT_SERVICE_URLS.SPACER,
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/spaces/items/item-123`,
        method: 'DELETE',
        token: MOCK_JWT_TOKEN,
      });
    });

    it('should handle errors', async () => {
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        items.deleteItem(MOCK_JWT_TOKEN, 'item-123'),
      ).rejects.toThrow('Network error');
    });
  });
});
