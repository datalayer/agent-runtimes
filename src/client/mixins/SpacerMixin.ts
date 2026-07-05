/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Spacer mixin for managing workspaces, notebooks, and content.
 * @module client/mixins/SpacerMixin
 */

import * as spaces from '../../api/spacer/spaces';
import * as notebooks from '../../api/spacer/notebooks';
import * as users from '../../api/spacer/users';
import * as lexicals from '../../api/spacer/lexicals';
import * as documents from '../../api/spacer/documents';
import * as items from '../../api/spacer/items';
import type {
  CreateSpaceRequest,
  UpdateSpaceRequest,
  UpdateNotebookRequest,
  GetSpaceItemsResponse,
} from '../../models/SpaceDTO';
import { UpdateLexicalRequest } from '../../models/LexicalDTO';
import type { Constructor } from '@datalayer/core/lib/client/utils/mixins';
import { NotebookDTO } from '../../models/NotebookDTO';
import { LexicalDTO } from '../../models/LexicalDTO';
import { SpaceDTO } from '../../models/SpaceDTO';
import { ProjectDTO, type ProjectDefaultItems } from '../../models/ProjectDTO';
import { HealthCheck } from '@datalayer/core/lib/models/HealthCheck';
import { convertSpaceItemsToModels } from '../utils/spacerUtils';
import { generateHandle } from '@datalayer/core/lib/client/utils/slugify';

/** Options for content loading with CDN support. */
export interface ContentLoadingOptions {
  /** Whether to try CDN first before API (default: true) */
  preferCDN?: boolean;
  /** CDN base URL (default: https://cdn.datalayer.run) */
  cdnBaseUrl?: string;
}

/** Spacer mixin providing workspace and content management. */
export function SpacerMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    // ========================================================================
    // User
    // ========================================================================

    /**
     * Get all workspaces for the authenticated user.
     * @returns Array of Space instances
     */
    async getMySpaces(): Promise<SpaceDTO[]> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await users.getMySpaces(token, spacerRunUrl);
      return response.spaces.map(s => new SpaceDTO(s, this as any));
    }

    // ========================================================================
    // Spaces
    // ========================================================================

    /**
     * Create a new workspace.
     * @param name - Space name
     * @param description - Space description
     * @param variant - Space variant type
     * @param spaceHandle - Unique handle for the space
     * @param organizationId - Organization ID
     * @param seedSpaceId - Seed space ID for initialization
     * @param isPublic - Whether the space is public
     * @returns Created Space instance
     */
    async createSpace(
      name: string,
      description: string,
      variant: string,
      spaceHandle: string,
      organizationId: string,
      seedSpaceId: string,
      isPublic: boolean,
    ): Promise<SpaceDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();

      const data: CreateSpaceRequest = {
        name,
        description,
        variant,
        spaceHandle,
        organizationId,
        seedSpaceId,
        public: isPublic,
      };

      const response = await spaces.createSpace(token, data, spacerRunUrl);
      if (!response.space) {
        throw new Error('Failed to create space: no space returned');
      }
      return new SpaceDTO(response.space, this as any);
    }

    // ========================================================================
    // Notebooks
    // ========================================================================

    /**
     * Create a new notebook.
     * @param spaceId - ID of the space to create the notebook in
     * @param name - Name of the notebook
     * @param description - Description of the notebook
     * @param file - Optional file for notebook content
     * @returns Created Notebook instance
     */
    async createNotebook(
      spaceId: string,
      name: string,
      description: string,
      file?: File | Blob,
    ): Promise<NotebookDTO> {
      // Get the Space model instance
      const spaces = await this.getMySpaces();
      const spaceModel = spaces.find((s: any) => s.uid === spaceId);

      if (!spaceModel) {
        throw new Error(`Space with ID '${spaceId}' not found`);
      }

      // Use the Space model's createNotebook method
      return await spaceModel.createNotebook({
        name,
        description,
        file,
      });
    }

    /**
     * Get a notebook by ID.
     * @param id - Notebook ID
     * @returns Notebook instance
     */
    async getNotebook(id: string): Promise<NotebookDTO> {
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const token = (this as any).getToken();
      const response = await notebooks.getNotebook(token, id, spacerRunUrl);

      if (!response.notebook) {
        throw new Error(`Notebook with ID '${id}' not found`);
      }

      return new NotebookDTO(response.notebook, this as any);
    }

    /**
     * Update a notebook.
     * @param id - Notebook ID
     * @param name - Optional new name for the notebook
     * @param description - Optional new description for the notebook
     * @returns Updated Notebook instance
     */
    async updateNotebook(
      id: string,
      name?: string,
      description?: string,
    ): Promise<NotebookDTO> {
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const token = (this as any).getToken();

      const data: UpdateNotebookRequest = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;

      const response = await notebooks.updateNotebook(
        token,
        id,
        data,
        spacerRunUrl,
      );
      if (!response.notebook) {
        throw new Error('Failed to update notebook: no notebook returned');
      }
      return new NotebookDTO(response.notebook, this as any);
    }

    // ========================================================================
    // Lexicals
    // ========================================================================

    /**
     * Create a new lexical document.
     * @param spaceId - ID of the space to create the lexical document in
     * @param name - Name of the lexical document
     * @param description - Description of the lexical document
     * @param file - Optional file for document content
     * @returns Created Lexical instance
     */
    async createLexical(
      spaceId: string,
      name: string,
      description: string,
      file?: File | Blob,
    ): Promise<LexicalDTO> {
      // Get the Space model instance
      const spaces = await this.getMySpaces();
      const spaceModel = spaces.find((s: any) => s.uid === spaceId);

      if (!spaceModel) {
        throw new Error(`Space with ID '${spaceId}' not found`);
      }

      // Use the Space model's createLexical method
      return await spaceModel.createLexical({
        name,
        description,
        file,
      });
    }

    /**
     * Get a lexical document by ID.
     * @param id - Document ID
     * @returns Lexical instance
     */
    async getLexical(id: string): Promise<LexicalDTO> {
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const token = (this as any).getToken();
      const response = await lexicals.getLexical(token, id, spacerRunUrl);

      if (!response.document) {
        throw new Error(`Lexical document with ID '${id}' not found`);
      }

      return new LexicalDTO(response.document, this as any);
    }

    /**
     * Update a lexical document.
     * @param id - Document ID
     * @param name - Optional new name for the lexical document
     * @param description - Optional new description for the lexical document
     * @returns Updated Lexical instance
     */
    async updateLexical(
      id: string,
      name?: string,
      description?: string,
    ): Promise<LexicalDTO> {
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const token = (this as any).getToken();

      const data: UpdateLexicalRequest = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;

      const response = await lexicals.updateLexical(
        token,
        id,
        data,
        spacerRunUrl,
      );
      return new LexicalDTO(response.document, this as any);
    }

    // ========================================================================
    // Items
    // ========================================================================

    /**
     * Get the items of a space as model instances.
     * @param spaceId - Space ID
     * @returns Array of Notebook and Lexical model instances
     */
    async getSpaceItems(
      spaceId: string,
    ): Promise<(NotebookDTO | LexicalDTO)[]> {
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const token = (this as any).getToken();

      const response: GetSpaceItemsResponse = await items.getSpaceItems(
        token,
        spaceId,
        spacerRunUrl,
      );

      // Use shared utility function to convert items to model instances
      return convertSpaceItemsToModels(response.items, this as any);
    }

    /**
     * Get a single item from a space.
     * @param itemId - Item ID to retrieve
     * @returns Notebook or Lexical model instance
     * @throws Error if item not found
     */
    async getSpaceItem(itemId: string): Promise<NotebookDTO | LexicalDTO> {
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const token = (this as any).getToken();

      const response = await items.getItem(token, itemId, spacerRunUrl);
      if (!response.success || !response.item) {
        throw new Error(`Space item '${itemId}' not found`);
      }

      // Determine item type and create appropriate model
      const item = response.item;
      if (item.type_s === 'notebook' || item.notebook_name_s !== undefined) {
        return new NotebookDTO(item, this as any);
      } else if (
        item.type_s === 'lexical' ||
        item.document_name_s !== undefined
      ) {
        return new LexicalDTO(item, this as any);
      } else {
        throw new Error(`Unknown item type for item '${itemId}'`);
      }
    }

    /**
     * Delete an item from a space.
     * @param itemId - Item ID to delete
     * @throws Error if deletion fails
     */
    async deleteSpaceItem(itemId: string): Promise<void> {
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const token = (this as any).getToken();

      // First, check if the item exists
      try {
        const getResponse = await items.getItem(token, itemId, spacerRunUrl);
        if (!getResponse.success || !getResponse.item) {
          throw new Error(`Space item '${itemId}' not found`);
        }
      } catch (error: any) {
        // If getItem throws (e.g., 404), wrap in descriptive error
        if (
          error.message?.includes('404') ||
          error.message?.includes('not found')
        ) {
          throw new Error(
            `Failed to delete space item '${itemId}': Item not found`,
          );
        }
        throw new Error(
          `Failed to delete space item '${itemId}': ${error.message}`,
        );
      }

      // Item exists, proceed with deletion
      const response = await items.deleteItem(token, itemId, spacerRunUrl);

      if (!response.success) {
        throw new Error(
          `Failed to delete space item '${itemId}': ${response.message}`,
        );
      }

      // Success - return void
    }

    // ========================================================================
    // Content Loading with CDN Support
    // ========================================================================
    async getContent(itemId: string): Promise<any> {
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const token = (this as any).getToken();

      // First, get the item to check for CDN URL
      const response = await items.getItem(token, itemId, spacerRunUrl);
      if (!response.success || !response.item) {
        throw new Error(`Space item '${itemId}' not found`);
      }
      const item = response.item;
      const cdnUrl = item.cdn_url_s;

      if (cdnUrl) {
        // Load content from CDN
        const cdnResponse = await fetch(cdnUrl);
        if (!cdnResponse.ok) {
          throw new Error(
            `Failed to load content from CDN: ${cdnResponse.statusText}`,
          );
        }
        return await cdnResponse.json();
      }

      // No CDN URL, return content from item
      return item.content;
    }

    // ========================================================================
    // Service Health Checks
    // ========================================================================

    /**
     * Check the health status of the Spacer service.
     * Performs a lightweight check to verify service accessibility.
     *
     * @returns Health check result with status and response time
     */
    async checkSpacerHealth(): Promise<HealthCheck> {
      const startTime = Date.now();
      const errors: string[] = [];
      let status = 'unknown';
      let healthy = false;

      try {
        // Test basic connectivity by getting user spaces (lightweight operation)
        const spaces = await this.getMySpaces();
        const responseTime = Date.now() - startTime;

        if (Array.isArray(spaces)) {
          healthy = true;
          status = 'operational';
        } else {
          status = 'degraded';
          errors.push('Unexpected response format from spaces endpoint');
        }

        return new HealthCheck(
          {
            healthy,
            status,
            responseTime,
            errors,
            timestamp: new Date(),
          },
          this as any,
        );
      } catch (error) {
        const responseTime = Date.now() - startTime;
        status = 'down';
        errors.push(`Service unreachable: ${error}`);

        return new HealthCheck(
          {
            healthy: false,
            status,
            responseTime,
            errors,
            timestamp: new Date(),
          },
          this as any,
        );
      }
    }
    /**
     * Get collaboration session ID for a document
     */
    async getCollaborationSessionId(documentId: string): Promise<string> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await documents.getCollaborationSessionId(
        token,
        documentId,
        spacerRunUrl,
      );
      if (!response.success || !response.sessionId) {
        throw new Error(
          `Failed to get collaboration session ID for document '${documentId}': ${response.error || 'Unknown error'}`,
        );
      }
      return response.sessionId;
    }

    // ========================================================================
    // Additional Space Operations
    // ========================================================================

    /**
     * Get a space by UID.
     * @param uid - Space UID
     * @returns Space instance
     */
    async getSpace(uid: string): Promise<SpaceDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await spaces.getSpace(token, uid, spacerRunUrl);
      if (!response.space) {
        throw new Error(`Space with UID '${uid}' not found`);
      }
      return new SpaceDTO(response.space, this as any);
    }

    /**
     * Update a space (owner updating their own space).
     * @param uid - Space UID
     * @param data - Update data (supports arbitrary Solr fields)
     * @returns Updated Space instance
     */
    async updateSpace(
      uid: string,
      data: UpdateSpaceRequest,
    ): Promise<SpaceDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await spaces.updateSpace(token, uid, data, spacerRunUrl);
      if (!response.space) {
        throw new Error(`Failed to update space '${uid}'`);
      }
      return new SpaceDTO(response.space, this as any);
    }

    /**
     * Update a user-specific space (e.g., org admin context).
     * @param uid - Space UID
     * @param userId - User ID
     * @param data - Update data (supports arbitrary Solr fields)
     * @returns Updated Space instance
     */
    async updateUserSpace(
      uid: string,
      userId: string,
      data: UpdateSpaceRequest,
    ): Promise<SpaceDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await spaces.updateUserSpace(
        token,
        uid,
        userId,
        data,
        spacerRunUrl,
      );
      if (!response.space) {
        throw new Error(`Failed to update space '${uid}' for user '${userId}'`);
      }
      return new SpaceDTO(response.space, this as any);
    }

    /**
     * Delete a space and all its contents.
     * @param uid - Space UID
     */
    async deleteSpace(uid: string): Promise<void> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      await spaces.deleteSpace(token, uid, spacerRunUrl);
    }

    /**
     * Make a space public.
     * @param uid - Space UID
     * @returns Updated Space instance
     */
    async makeSpacePublic(uid: string): Promise<SpaceDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await spaces.makeSpacePublic(token, uid, spacerRunUrl);
      if (!response.space) {
        throw new Error(`Failed to make space '${uid}' public`);
      }
      return new SpaceDTO(response.space, this as any);
    }

    /**
     * Make a space private.
     * @param uid - Space UID
     * @returns Updated Space instance
     */
    async makeSpacePrivate(uid: string): Promise<SpaceDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await spaces.makeSpacePrivate(token, uid, spacerRunUrl);
      if (!response.space) {
        throw new Error(`Failed to make space '${uid}' private`);
      }
      return new SpaceDTO(response.space, this as any);
    }

    /**
     * Export a space and its contents.
     * @param uid - Space UID
     * @returns Export data
     */
    async exportSpace(uid: string): Promise<any> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      return spaces.exportSpace(token, uid, spacerRunUrl);
    }

    /**
     * Clone a notebook.
     * @param id - Notebook ID to clone
     * @returns Cloned Notebook instance
     */
    async cloneNotebook(id: string): Promise<NotebookDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await notebooks.cloneNotebook(token, id, spacerRunUrl);
      if (!response.notebook) {
        throw new Error(`Failed to clone notebook '${id}'`);
      }
      return new NotebookDTO(response.notebook, this as any);
    }

    /**
     * Clone a lexical document.
     * @param id - Document ID to clone
     * @returns Cloned Lexical instance
     */
    async cloneLexical(id: string): Promise<LexicalDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await lexicals.cloneLexical(token, id, spacerRunUrl);
      if (!response.document) {
        throw new Error(`Failed to clone lexical document '${id}'`);
      }
      return new LexicalDTO(response.document, this as any);
    }

    // ========================================================================
    // Projects
    // ========================================================================

    /**
     * Get all projects for the authenticated user.
     * Projects are spaces with variant='project'.
     * @returns Array of Project instances
     */
    async getProjects(): Promise<ProjectDTO[]> {
      // Use getMySpaces and filter by variant, because the
      // /spaces/types/project endpoint returns empty results.
      const allSpaces = await this.getMySpaces();

      const isProjectSpace = (space: SpaceDTO): boolean => {
        const raw = space.rawData() as any;
        const variant = raw?.variant_s ?? space.variant;
        if (variant !== 'project') {
          return false;
        }

        const items = Array.isArray(raw?.items)
          ? raw.items
          : raw?.items && typeof raw.items === 'object'
            ? [raw.items]
            : [];

        if (items.length === 0) {
          return true;
        }

        const hasNotebook = items.some(
          (item: any) => (item?.type_s ?? item?.type) === 'notebook',
        );
        const hasDocument = items.some((item: any) => {
          const type = item?.type_s ?? item?.type;
          return type === 'document' || type === 'lexical';
        });

        return hasNotebook && hasDocument;
      };

      return allSpaces
        .filter(s => isProjectSpace(s))
        .map(s => new ProjectDTO(s.rawData()));
    }

    /**
     * Get a project by UID.
     * @param uid - Project UID
     * @returns Project instance
     */
    async getProject(uid: string): Promise<ProjectDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await spaces.getSpace(token, uid, spacerRunUrl);
      if (!response.space) {
        throw new Error(`Project with UID '${uid}' not found`);
      }
      return new ProjectDTO(response.space);
    }

    /**
     * Create a new project.
     * @param name - Project name
     * @param description - Project description
     * @returns Created Project instance
     */
    async createProject(
      name: string,
      description?: string,
    ): Promise<ProjectDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const spaceHandle = generateHandle(name);

      const data: CreateSpaceRequest = {
        name,
        description: description || '',
        variant: 'project',
        spaceHandle,
        organizationId: '',
        seedSpaceId: '',
        public: false,
      };

      const response = await spaces.createSpace(token, data, spacerRunUrl);
      if (!response.space) {
        throw new Error('Failed to create project: no project returned');
      }
      return new ProjectDTO(response.space);
    }

    /**
     * Update a project.
     * @param uid - Project UID
     * @param data - Update data (supports arbitrary Solr fields)
     * @returns Updated Project instance
     */
    async updateProject(
      uid: string,
      data: UpdateSpaceRequest,
    ): Promise<ProjectDTO> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      // Resolve userId from: IAM mixin cache > AuthenticationManager cache > whoami()
      let resolvedUserId: string | undefined;
      const iamUser = (this as any).currentUserCache;
      if (iamUser) {
        resolvedUserId = iamUser.uid ?? iamUser.id;
      }
      if (!resolvedUserId) {
        const authUser = (this as any).auth?.getCurrentUser?.();
        if (authUser) {
          resolvedUserId = authUser.uid ?? authUser.id;
        }
      }
      if (!resolvedUserId) {
        try {
          const user = await (this as any).whoami();
          resolvedUserId = user?.uid ?? user?.id;
        } catch (_e: any) {
          // whoami() not available — no user context
        }
      }
      if (!resolvedUserId) {
        throw new Error('Cannot update project: no authenticated user');
      }
      const response = await spaces.updateUserSpace(
        token,
        uid,
        resolvedUserId,
        data,
        spacerRunUrl,
      );
      if (response.space) {
        return new ProjectDTO(response.space);
      }
      // Backend returns space: null on success for user-scoped updates.
      // Re-fetch the project to return fresh data.
      const freshResponse = await spaces.getSpace(token, uid, spacerRunUrl);
      if (!freshResponse.space) {
        throw new Error(`Failed to update project '${uid}'`);
      }
      return new ProjectDTO(freshResponse.space);
    }

    /**
     * Rename a project.
     * @param uid - Project UID
     * @param newName - New project name
     * @param description - Project description to preserve.
     * @param userId - Authenticated user ID for user-scoped update.
     * @returns Updated Project instance
     */
    async renameProject(
      uid: string,
      newName: string,
      description?: string,
    ): Promise<ProjectDTO> {
      const data: UpdateSpaceRequest = { name: newName };
      if (description !== undefined) {
        data.description = description;
      }
      return this.updateProject(uid, data);
    }

    /**
     * Get default items (notebook UID and document UID) for a project.
     * @param uid - Project UID
     * @returns Default notebook and document UIDs
     */
    async getProjectDefaultItems(uid: string): Promise<ProjectDefaultItems> {
      const token = (this as any).getToken();
      const spacerRunUrl = (this as any).getSpacerRunUrl();
      const response = await spaces.getSpaceDefaultItems(
        token,
        uid,
        spacerRunUrl,
      );
      return {
        defaultNotebookUid: response.default_notebook_uid,
        defaultDocumentUid: response.default_document_uid,
      };
    }
  };
}
