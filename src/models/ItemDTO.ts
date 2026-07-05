/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Abstract base class for all Datalayer content items.
 *
 * @module models/ItemDTO
 */

import type { AgentRuntimesClient as DatalayerClient } from '../client/AgentRuntimesClient';
import * as items from '../api/spacer/items';

/**
 * Abstract base class for all Datalayer content items.
 * Provides common functionality for content management including lifecycle tracking.
 *
 * @template TData - Raw data type from API
 * @template TUpdateRequest - Update request type for API
 */
export abstract class ItemDTO<TData> {
  protected _data: TData;
  private _client: DatalayerClient;
  private _deleted: boolean = false;

  /**
   * Create an Item instance.
   * @param data - Item data from API
   * @param client - Client instance
   */
  constructor(data: TData, client: DatalayerClient) {
    this._data = data;
    this._client = client;
  }

  // ========================================================================
  // Deletion State Management
  // ========================================================================

  /** Check if this item has been deleted. */
  get isDeleted(): boolean {
    return this._deleted;
  }

  /**
   * Check if this item has been deleted and throw error if so.
   * @throws Error if deleted
   */
  protected _checkDeleted(): void {
    if (this._deleted) {
      throw new Error(
        `${this.constructor.name} ${(this._data as any).id} has been deleted and no longer exists`,
      );
    }
  }

  // ========================================================================
  // Static Properties (set at creation, never change)
  // ========================================================================

  /** Item ID. */
  get id(): string {
    this._checkDeleted();
    return (this._data as any).id;
  }

  /** Unique identifier for the item. */
  get uid(): string {
    this._checkDeleted();
    return (this._data as any).uid;
  }

  /** Parent space ID. */
  get spaceId(): string {
    this._checkDeleted();

    // Try the direct field first (if API provides it)
    if ((this._data as any).space_id) {
      return (this._data as any).space_id;
    }

    // Extract from s3_path_s if available: "datalayer.ai/SPACE_ID/..."
    const s3Path = (this._data as any).s3_path_s;
    if (s3Path && typeof s3Path === 'string') {
      const match = s3Path.match(/^datalayer\.app\/([^/]+)\//);
      if (match) {
        return match[1];
      }
    }

    // Fallback to empty string if no space ID can be determined
    return '';
  }

  /** Owner user ID. */
  get ownerId(): string {
    this._checkDeleted();
    return (
      (this._data as any).owner_id || (this._data as any).creator_uid || ''
    );
  }

  /** When the item was created. */
  get createdAt(): Date {
    this._checkDeleted();
    const dateStr =
      (this._data as any).creation_ts_dt || (this._data as any).created_at;
    if (!dateStr) {
      throw new Error(
        `No creation timestamp available for ${this.constructor.name.toLowerCase()}`,
      );
    }
    return new Date(dateStr);
  }

  /** The cached update time. */
  get updatedAt(): Date {
    this._checkDeleted();
    const dateStr =
      (this._data as any).last_update_ts_dt ||
      (this._data as any).updated_at ||
      (this._data as any).creation_ts_dt ||
      (this._data as any).created_at;
    if (!dateStr) {
      throw new Error(
        `No update timestamp available for ${this.constructor.name.toLowerCase()}`,
      );
    }
    return new Date(dateStr);
  }

  // ========================================================================
  // Abstract Methods (must be implemented by subclasses)
  // ========================================================================

  /** Get the item type identifier. */
  abstract get type(): string;

  /** The cached name. */
  abstract get name(): string;

  /** Get the current name from API. */
  abstract getName(): Promise<string>;

  /** The cached content. */
  abstract get content(): any;

  /** Get when the item was last updated from API. */
  abstract getUpdatedAt(): Promise<Date>;

  /** Update the item. */
  abstract update(...args: any[]): Promise<this>;

  // ========================================================================
  // Action Methods
  // ========================================================================

  /**
   * Delete this item permanently.
   * After deletion, all subsequent method calls will throw errors.
   */
  async delete(): Promise<void> {
    this._checkDeleted();
    const token = (this._client as any).getToken();
    const spacerRunUrl = (this._client as any).getSpacerRunUrl();
    await items.deleteItem(token, this.uid, spacerRunUrl);
    this._deleted = true;
  }

  /** Get the document content from API. */
  async getContent(): Promise<any> {
    this._checkDeleted();

    // First try: CDN URL (fastest)
    const cdnUrl = (this._data as any).cdn_url_s;
    if (cdnUrl) {
      try {
        const response = await fetch(cdnUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch content from CDN');
        }
        const data = await response.json();
        if (data.content !== undefined && data.content !== null) {
          return data.content;
        }
      } catch (error) {
        console.error('Error fetching content from CDN:', error);
      }
    }

    // Second try: Check if content is already loaded
    const cachedContent = this.content;
    if (cachedContent !== undefined && cachedContent !== null) {
      return cachedContent;
    }

    // Third try: Fetch full item details from API
    try {
      const token = (this._client as any).getToken();
      const spacerRunUrl = (this._client as any).getSpacerRunUrl();
      const response = await items.getItem(token, this.uid, spacerRunUrl);

      // Update internal data with full item details
      if (response.success && response.item) {
        this._data = response.item as any;
        const freshContent = this.content;
        if (freshContent !== undefined && freshContent !== null) {
          return freshContent;
        }
      }
    } catch (error) {
      console.error('Error fetching full item details:', error);
    }

    throw new Error(
      `Content is not available for item ${this.uid}. The item may not have been fully loaded or the content is not yet available.`,
    );
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /** Get raw item data object. */
  rawData(): TData {
    this._checkDeleted();
    return this._data;
  }

  /** Convert to JSON representation - must be implemented by subclasses. */
  abstract toJSON(): any;

  /** String representation of the item. */
  toString(): string {
    this._checkDeleted();
    const name = this.name || 'Unnamed';
    return `${this.constructor.name}(${this.id}, ${name})`;
  }

  // ========================================================================
  // Protected Helper Methods
  // ========================================================================

  /** Get Client token for API calls. */
  protected _getToken(): string {
    return (this._client as any).getToken();
  }

  /** Get spacer API URL for API calls. */
  protected _getSpacerRunUrl(): string {
    return (this._client as any).getSpacerRunUrl();
  }

  /** Update internal data after API call. */
  protected _updateData(newData: TData): void {
    this._data = newData;
  }
}
