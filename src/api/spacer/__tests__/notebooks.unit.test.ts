/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notebooks } from '..';
import * as DatalayerApi from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { MOCK_JWT_TOKEN } from '@datalayer/core/lib/__tests__/shared/test-constants';

vi.mock('../../DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

describe('Spacer Notebooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockNotebook = {
    id: 'notebook-123',
    uid: 'uid-notebook-123',
    name: 'Test Notebook',
  };

  describe('create', () => {
    it('should create notebook', async () => {
      const mockResponse = { success: true, notebook: mockNotebook };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await notebooks.createNotebook(
        MOCK_JWT_TOKEN,
        { spaceId: 'space-456', name: 'Test Notebook' },
        DEFAULT_SERVICE_URLS.SPACER,
      );

      expect(result).toEqual(mockResponse);
      const callArgs = vi.mocked(DatalayerApi.requestDatalayerAPI).mock
        .calls[0][0];
      expect(callArgs.body).toBeInstanceOf(FormData);
    });

    it('should handle errors', async () => {
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockRejectedValue(
        new Error('API Error'),
      );

      await expect(
        notebooks.createNotebook(MOCK_JWT_TOKEN, {
          spaceId: 'space-456',
          name: 'Test',
        }),
      ).rejects.toThrow('API Error');
    });
  });

  describe('get', () => {
    it('should get notebook', async () => {
      const mockResponse = { success: true, notebook: mockNotebook };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await notebooks.getNotebook(
        MOCK_JWT_TOKEN,
        'notebook-123',
        DEFAULT_SERVICE_URLS.SPACER,
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/notebooks/notebook-123`,
        method: 'GET',
        token: MOCK_JWT_TOKEN,
      });
    });

    it('should handle errors', async () => {
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        notebooks.getNotebook(MOCK_JWT_TOKEN, 'notebook-123'),
      ).rejects.toThrow('Network error');
    });
  });

  describe('update', () => {
    it('should update notebook', async () => {
      const mockResponse = {
        success: true,
        notebook: { ...mockNotebook, name: 'Updated' },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await notebooks.updateNotebook(
        MOCK_JWT_TOKEN,
        'notebook-123',
        { name: 'Updated' },
        DEFAULT_SERVICE_URLS.SPACER,
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/notebooks/notebook-123`,
        method: 'PUT',
        token: MOCK_JWT_TOKEN,
        body: { name: 'Updated' },
      });
    });

    it('should handle errors', async () => {
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockRejectedValue(
        new Error('Update failed'),
      );

      await expect(
        notebooks.updateNotebook(MOCK_JWT_TOKEN, 'notebook-123', {
          name: 'Updated',
        }),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('clone', () => {
    it('should clone notebook', async () => {
      const mockResponse = {
        success: true,
        notebook: { ...mockNotebook, id: 'notebook-clone' },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await notebooks.cloneNotebook(
        MOCK_JWT_TOKEN,
        'notebook-123',
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/notebooks/notebook-123/clone`,
        method: 'POST',
        token: MOCK_JWT_TOKEN,
      });
    });
  });
});
