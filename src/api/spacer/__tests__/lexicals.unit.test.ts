/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lexicals } from '..';
import * as DatalayerApi from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { MOCK_JWT_TOKEN } from '../../../__tests__/shared/test-constants';

vi.mock('@datalayer/core/lib/api/DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

describe('Spacer Lexicals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockLexical = {
    id: 'lexical-123',
    uid: 'uid-lexical-123',
    name: 'Test Document',
  };

  describe('create', () => {
    it('should create lexical document', async () => {
      const mockResponse = { success: true, lexical: mockLexical };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await lexicals.createLexical(
        MOCK_JWT_TOKEN,
        { spaceId: 'space-456', name: 'Test Document' },
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
        lexicals.createLexical(MOCK_JWT_TOKEN, {
          spaceId: 'space-456',
          name: 'Test',
        }),
      ).rejects.toThrow('API Error');
    });
  });

  describe('get', () => {
    it('should get lexical document', async () => {
      const mockResponse = { success: true, lexical: mockLexical };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await lexicals.getLexical(
        MOCK_JWT_TOKEN,
        'lexical-123',
        DEFAULT_SERVICE_URLS.SPACER,
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/lexicals/lexical-123`,
        method: 'GET',
        token: MOCK_JWT_TOKEN,
      });
    });

    it('should handle errors', async () => {
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        lexicals.getLexical(MOCK_JWT_TOKEN, 'lexical-123'),
      ).rejects.toThrow('Network error');
    });
  });

  describe('update', () => {
    it('should update lexical document', async () => {
      const mockResponse = {
        success: true,
        lexical: { ...mockLexical, name: 'Updated' },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await lexicals.updateLexical(
        MOCK_JWT_TOKEN,
        'lexical-123',
        { name: 'Updated' },
        DEFAULT_SERVICE_URLS.SPACER,
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/lexicals/lexical-123`,
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
        lexicals.updateLexical(MOCK_JWT_TOKEN, 'lexical-123', {
          name: 'Updated',
        }),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('clone', () => {
    it('should clone lexical document', async () => {
      const mockResponse = {
        success: true,
        document: { ...mockLexical, id: 'lexical-clone' },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await lexicals.cloneLexical(MOCK_JWT_TOKEN, 'lexical-123');

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}/lexicals/lexical-123/clone`,
        method: 'POST',
        token: MOCK_JWT_TOKEN,
      });
    });
  });
});
