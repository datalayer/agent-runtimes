/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as spaces from '../spaces';
import * as DatalayerApi from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { MOCK_JWT_TOKEN } from '@datalayer/core/lib/__tests__/shared/test-constants';

vi.mock('../../DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

const BASE = `${DEFAULT_SERVICE_URLS.SPACER}${API_BASE_PATHS.SPACER}`;

describe('Spacer Spaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSpace', () => {
    it('should create a space', async () => {
      const mockResponse = {
        success: true,
        message: 'Created',
        space: { uid: 'new-uid', name_t: 'Test' },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const data = {
        name: 'Test',
        description: 'A test space',
        variant: 'project',
        spaceHandle: 'test',
        organizationId: '',
        seedSpaceId: '',
        public: false,
      };
      const result = await spaces.createSpace(MOCK_JWT_TOKEN, data);

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces`,
        method: 'POST',
        token: MOCK_JWT_TOKEN,
        body: data,
      });
    });
  });

  describe('getSpace', () => {
    it('should get a space by UID', async () => {
      const mockResponse = {
        success: true,
        message: 'OK',
        space: { uid: 'space-123', name_t: 'My Space' },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await spaces.getSpace(MOCK_JWT_TOKEN, 'space-123');

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/space-123`,
        method: 'GET',
        token: MOCK_JWT_TOKEN,
      });
    });
  });

  describe('updateSpace', () => {
    it('should update a space', async () => {
      const mockResponse = {
        success: true,
        message: 'Updated',
        space: { uid: 'space-123', name_t: 'Updated' },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const data = { name: 'Updated' };
      const result = await spaces.updateSpace(
        MOCK_JWT_TOKEN,
        'space-123',
        data,
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/space-123`,
        method: 'PUT',
        token: MOCK_JWT_TOKEN,
        body: data,
      });
    });
  });

  describe('updateUserSpace', () => {
    it('should update a user-specific space', async () => {
      const mockResponse = {
        success: true,
        message: 'Updated',
        space: { uid: 'space-123' },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const data = { name: 'Updated' };
      const result = await spaces.updateUserSpace(
        MOCK_JWT_TOKEN,
        'space-123',
        'user-456',
        data,
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/space-123/users/user-456`,
        method: 'PUT',
        token: MOCK_JWT_TOKEN,
        body: data,
      });
    });
  });

  describe('deleteSpace', () => {
    it('should delete a space', async () => {
      const mockResponse = { success: true, message: 'Deleted' };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await spaces.deleteSpace(MOCK_JWT_TOKEN, 'space-123');

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/space-123`,
        method: 'DELETE',
        token: MOCK_JWT_TOKEN,
      });
    });
  });

  describe('getSpaceDefaultItems', () => {
    it('should get default items for a space', async () => {
      const mockResponse = {
        success: true,
        message: 'OK',
        default_notebook_uid: 'nb-123',
        default_document_uid: 'doc-456',
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await spaces.getSpaceDefaultItems(
        MOCK_JWT_TOKEN,
        'space-123',
      );

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/space-123/default-items`,
        method: 'GET',
        token: MOCK_JWT_TOKEN,
      });
    });
  });

  describe('getSpacesByType', () => {
    it('should get spaces by type', async () => {
      const mockResponse = {
        success: true,
        message: 'OK',
        spaces: [{ uid: 'proj-1', variant_s: 'project' }],
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await spaces.getSpacesByType(MOCK_JWT_TOKEN, 'project');

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/types/project`,
        method: 'GET',
        token: MOCK_JWT_TOKEN,
      });
    });
  });

  describe('makeSpacePublic', () => {
    it('should make a space public', async () => {
      const mockResponse = {
        success: true,
        message: 'OK',
        space: { uid: 'space-123', public_b: true },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await spaces.makeSpacePublic(MOCK_JWT_TOKEN, 'space-123');

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/space-123/public`,
        method: 'PUT',
        token: MOCK_JWT_TOKEN,
      });
    });
  });

  describe('makeSpacePrivate', () => {
    it('should make a space private', async () => {
      const mockResponse = {
        success: true,
        message: 'OK',
        space: { uid: 'space-123', public_b: false },
      };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await spaces.makeSpacePrivate(MOCK_JWT_TOKEN, 'space-123');

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/space-123/private`,
        method: 'PUT',
        token: MOCK_JWT_TOKEN,
      });
    });
  });

  describe('exportSpace', () => {
    it('should export a space', async () => {
      const mockResponse = { notebooks: [], documents: [] };
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockResolvedValue(
        mockResponse,
      );

      const result = await spaces.exportSpace(MOCK_JWT_TOKEN, 'space-123');

      expect(result).toEqual(mockResponse);
      expect(DatalayerApi.requestDatalayerAPI).toHaveBeenCalledWith({
        url: `${BASE}/spaces/space-123/export`,
        method: 'GET',
        token: MOCK_JWT_TOKEN,
      });
    });
  });

  describe('error handling', () => {
    it('should propagate network errors', async () => {
      vi.mocked(DatalayerApi.requestDatalayerAPI).mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        spaces.getSpace(MOCK_JWT_TOKEN, 'space-123'),
      ).rejects.toThrow('Network error');
    });

    it('should reject with missing token', async () => {
      await expect(spaces.getSpace('', 'space-123')).rejects.toThrow();
    });
  });
});
