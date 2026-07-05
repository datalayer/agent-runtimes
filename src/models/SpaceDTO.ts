/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Space domain model for the Datalayer Client.
 *
 * @module models/SpaceDTO
 */

import * as users from '../api/spacer/users';
import * as items from '../api/spacer/items';
import * as notebooks from '../api/spacer/notebooks';
import * as lexicals from '../api/spacer/lexicals';
import type { AgentRuntimesClient as DatalayerClient } from '../client/AgentRuntimesClient';
import { NotebookDTO, type NotebookJSON } from './NotebookDTO';
import { NotebookData } from './NotebookDTO';
import { LexicalDTO, type LexicalJSON } from './LexicalDTO';
import { ItemTypes } from '@datalayer/core/lib/client/constants';
import { convertSpaceItemsToModels } from '../client/utils/spacerUtils';
import { validateJSON } from '@datalayer/core/lib/api/utils/validation';

/**
 * Represents a workspace or project space in Datalayer
 * @interface SpaceData
 */
export interface SpaceData {
  uid: string;
  id?: string;
  name_t: string;
  handle_s: string;
  variant_s: string;
  description_t: string;
  tags_ss?: string[];
  members?: any[];
  items?: any[];
  public_b?: boolean;
  creation_ts_dt?: string;
  attached_agent_pod_name_s?: string;
  attached_agent_spec_id_s?: string;
  attached_agent_given_name_s?: string;
  shared_owner_user_uids_ss?: string[];
  shared_ower_user_uids_ss?: string[];
}

/**
 * Stable public interface for Space data.
 * This is the contract that Client consumers can rely on.
 * The raw API may change, but this interface remains stable.
 */
export interface SpaceJSON {
  /** ulid for the space */
  uid: string;
  /** Name of the space */
  name: string;
  /** Handle for the space */
  handle: string;
  /** Variant of the space */
  variant: string;
  /** Description of the space */
  description: string;
  /** Items contained in the space (as JSON) */
  items: Array<NotebookJSON | LexicalJSON>;
  /** Owner user UIDs for this space */
  ownerUserUids?: string[];
}

/**
 * Space domain model that wraps API responses with convenient methods.
 * Provides workspace management with data refresh and content creation operations.
 *
 * @example
 * ```typescript
 * const space = spaces[0];
 * const items = await space.getItems();
 * const notebook = await space.createNotebook({ name: 'Analysis' });
 * ```
 */
export class SpaceDTO {
  protected _data: SpaceData;
  private _client: DatalayerClient;
  private _items: (NotebookDTO | LexicalDTO)[] | null = null;
  private _deleted: boolean = false;

  /**
   * Create a Space instance.
   *
   * @param data - Space data from API
   * @param client - Client instance
   */
  constructor(data: SpaceData, client: DatalayerClient) {
    this._data = data;
    this._client = client;
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Check if this space has been deleted and throw error if so.
   * @throws Error if deleted
   */
  private _checkDeleted(): void {
    if (this._deleted) {
      throw new Error(
        `Space ${this._data.uid} has been deleted and no longer exists`,
      );
    }
  }

  /**
   * Refresh space data from the API by fetching user's spaces.
   */
  async refresh(): Promise<void> {
    const token = (this._client as any).getToken();
    const spacerRunUrl = (this._client as any).getSpacerRunUrl();
    const response = await users.getMySpaces(token, spacerRunUrl);
    const freshSpace = response.spaces.find(s => s.uid === this.uid);
    if (freshSpace) {
      this._data = freshSpace;
    }
  }

  // ========================================================================
  // Static Properties (set at creation, never change)
  // ========================================================================

  /** Unique identifier for the space. */
  get uid(): string {
    this._checkDeleted();
    return this._data.uid;
  }

  /** URL-friendly handle for the space. */
  get handle(): string {
    this._checkDeleted();
    return this._data.handle_s;
  }

  /** Space variant type. */
  get variant(): string {
    this._checkDeleted();
    return this._data.variant_s;
  }

  /**
   * The name of the space.
   */
  get name(): string {
    return this._data.name_t;
  }

  /**
   * The description of the space.
   */
  get description(): string {
    return this._data.description_t;
  }

  // ========================================================================
  // Space-specific Methods
  // ========================================================================

  /**
   * Helper method to create items in this space.
   *
   * @param itemType - Type of item to create
   * @param data - Creation configuration
   * @returns Created model instance
   * @internal
   */
  private async _createItem<T extends NotebookDTO | LexicalDTO>(data: {
    name: string;
    type: string;
    description: string;
    file?: File | Blob;
  }): Promise<T> {
    this._checkDeleted();

    // Get necessary configuration from Client
    const token = (this._client as any).getToken();
    const spacerRunUrl = (this._client as any).getSpacerRunUrl();

    if (data.type === ItemTypes.NOTEBOOK) {
      const requestData = {
        spaceId: this.uid,
        name: data.name,
        description: data.description,
        notebookType: data.type,
        file: data.file,
      };
      const response = await notebooks.createNotebook(
        token,
        requestData,
        spacerRunUrl,
      );
      if (!response.notebook) {
        throw new Error('Failed to create notebook: No notebook returned');
      } else {
        return new NotebookDTO(response.notebook, this._client) as T;
      }
    } else if (data.type === ItemTypes.LEXICAL) {
      const requestData = {
        spaceId: this.uid,
        name: data.name,
        description: data.description,
        documentType: data.type,
        file: data.file,
      };
      const response = await lexicals.createLexical(
        token,
        requestData,
        spacerRunUrl,
      );
      if (!response.document) {
        throw new Error(
          'Failed to create lexical document: No document returned',
        );
      } else {
        return new LexicalDTO(response.document, this._client) as T;
      }
    } else {
      throw new Error(`Unsupported item type: ${data.type}`);
    }
  }

  /**
   * Get all items in this space as model instances.
   *
   * @returns Array of Notebook and Lexical model instances
   */
  async getItems(): Promise<(NotebookDTO | LexicalDTO)[]> {
    this._checkDeleted();
    const token = (this._client as any).getToken();
    const spacerRunUrl = (this._client as any).getSpacerRunUrl();

    const response: GetSpaceItemsResponse = await items.getSpaceItems(
      token,
      this.uid,
      spacerRunUrl,
    );

    // Use shared utility function to convert items to model instances
    this._items = convertSpaceItemsToModels(response.items || [], this._client);
    return this._items;
  }

  /**
   * Create a new notebook in this space.
   *
   * @param data - Notebook creation configuration
   * @returns Created Notebook instance
   */
  async createNotebook(data: {
    name: string;
    description: string;
    file?: File | Blob;
  }): Promise<NotebookDTO> {
    return this._createItem({
      name: data.name,
      type: ItemTypes.NOTEBOOK,
      description: data.description,
      file: data.file,
    });
  }

  /**
   * Create a new lexical document in this space.
   *
   * @param data - Lexical creation configuration
   * @returns Created Lexical instance
   */
  async createLexical(data: {
    name: string;
    description: string;
    file?: File | Blob;
  }): Promise<LexicalDTO> {
    return this._createItem({
      name: data.name,
      type: ItemTypes.LEXICAL,
      description: data.description,
      file: data.file,
    });
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Get raw space data object.
   * Returns cached data without refreshing.
   *
   * @returns Raw space data object
   */
  /**
   * Get space data in camelCase format.
   * Returns only the core fields that consumers need.
   * This provides a stable interface regardless of API changes.
   *
   * @returns Core space data with camelCase properties
   */
  toJSON(): SpaceJSON {
    this._checkDeleted();
    const ownerUserUids = Array.from(
      new Set(
        [
          ...(this._data.shared_owner_user_uids_ss || []),
          ...(this._data.shared_ower_user_uids_ss || []),
        ].filter(uid => typeof uid === 'string' && uid.length > 0),
      ),
    );
    const obj = {
      uid: this.uid,
      name: this.name,
      description: this.description,
      variant: this.variant,
      handle: this.handle,
      ownerUserUids,
      items: this._data.items
        ? convertSpaceItemsToModels(this._data.items, this._client).map(item =>
            item.toJSON(),
          )
        : [],
    };
    validateJSON(obj, 'Space');
    return obj;
  }

  /**
   * Get the raw space data exactly as received from the API.
   * This preserves the original snake_case naming from the API response.
   *
   * @returns Raw space data from API
   */
  rawData(): SpaceData {
    this._checkDeleted();
    return this._data;
  }

  /** String representation of the space. */
  toString(): string {
    this._checkDeleted();
    return `Space(${this.uid}, ${this.name})`;
  }
}

/**
 * Request payload for creating a new space
 * @interface CreateSpaceRequest
 */
export interface CreateSpaceRequest {
  name: string;
  description: string;
  variant: string;
  spaceHandle: string;
  organizationId: string;
  seedSpaceId: string;
  public: boolean;
}

/**
 * Response from getting a collaboration session ID
 * @interface CollaborationSessionResponse
 */
export interface CollaborationSessionResponse {
  success: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * Response from creating a space
 * @interface CreateSpaceResponse
 */
export interface CreateSpaceResponse {
  success: boolean;
  message: string;
  space?: SpaceData;
}

/**
 * Request payload for creating a new notebook (multipart/form-data)
 * @interface CreateNotebookRequest
 */
export interface CreateNotebookRequest {
  spaceId: string;
  notebookType: string;
  name: string;
  description: string;
  file?: File | Blob; // Optional file for notebook content
}

/**
 * Response from creating a notebook
 * @interface CreateNotebookResponse
 */
export interface CreateNotebookResponse {
  success: boolean;
  message: string;
  notebook?: NotebookData;
}

/**
 * Response from getting a notebook
 * @interface GetNotebookResponse
 */
export interface GetNotebookResponse {
  success: boolean;
  message: string;
  notebook?: NotebookData; // Optional - not present in 404 response
}

/**
 * Request payload for updating a notebook
 * @interface UpdateNotebookRequest
 */
export interface UpdateNotebookRequest {
  name?: string;
  description?: string;
}

/**
 * Response from updating a notebook
 * @interface UpdateNotebookResponse
 */
export interface UpdateNotebookResponse {
  success: boolean;
  message: string;
  notebook?: NotebookData;
}

/**
 * Represents an item within a space
 * @interface SpaceItem
 */
export interface SpaceItem {
  id: string;
  type_s: 'notebook' | 'lexical';
  space_id: string;
  item_id: string;
  name: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Response from getting space items
 * @interface GetSpaceItemsResponse
 */
export interface GetSpaceItemsResponse {
  success: boolean;
  message: string;
  items: SpaceItem[];
}

/**
 * Response from deleting a space item
 * @interface DeleteSpaceItemResponse
 */
export interface DeleteSpaceItemResponse {
  success: boolean;
  message: string;
}

/**
 * Response from getting a single space item
 * @interface GetSpaceItemResponse
 */
export interface GetSpaceItemResponse {
  success: boolean;
  message: string;
  item?: any; // Item data when found (various types: notebook, lexical, etc.)
}

// API Response types that match actual server responses
/**
 * Response from getting spaces for a user
 * @interface SpacesForUserResponse
 */
export interface SpacesForUserResponse {
  success: boolean;
  message: string;
  spaces: SpaceData[];
}

/**
 * Request payload for updating a space.
 * Supports arbitrary Solr fields via index signature.
 * @interface UpdateSpaceRequest
 */
export interface UpdateSpaceRequest {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Response from getting a space by ID
 * @interface GetSpaceResponse
 */
export interface GetSpaceResponse {
  success: boolean;
  message: string;
  space?: SpaceData;
}

/**
 * Response from updating a space
 * @interface UpdateSpaceResponse
 */
export interface UpdateSpaceResponse {
  success: boolean;
  message: string;
  space?: SpaceData;
}

/**
 * Response from deleting a space
 * @interface DeleteSpaceResponse
 */
export interface DeleteSpaceResponse {
  success: boolean;
  message: string;
}

/**
 * Response from getting default items for a space
 * @interface GetSpaceDefaultItemsResponse
 */
export interface GetSpaceDefaultItemsResponse {
  success: boolean;
  message: string;
  default_notebook_uid: string | null;
  default_document_uid: string | null;
}

/**
 * Response from getting spaces by type
 * @interface GetSpacesByTypeResponse
 */
export interface GetSpacesByTypeResponse {
  success: boolean;
  message: string;
  spaces: SpaceData[];
}
