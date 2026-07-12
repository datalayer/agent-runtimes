/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Notebook domain model for the Datalayer Client.
 *
 * @module models/Notebook
 */

import type { UpdateNotebookRequest } from './SpaceDTO';
import * as notebooks from '../api/spacer/notebooks';
import type { AgentRuntimesClient as DatalayerClient } from '../client/AgentRuntimesClient';
import { ItemDTO } from './ItemDTO';
import { ItemTypes } from '@datalayer/core/lib/client/constants';
import { validateJSON } from '@datalayer/core/lib/api/utils/validation';

/**
 * Represents a Jupyter notebook document
 * @interface NotebookData
 */
export interface NotebookData {
  id: string;
  uid: string;
  name_t: string;
  description_t: string;
  type_s: string;
  notebook_extension_s: string;
  s3_path_s: string;
  s3_url_s: string;
  cdn_url_s: string;
}

/**
 * Stable public interface for Notebook data.
 * This is the contract that Client consumers can rely on.
 * The raw API may change, but this interface remains stable.
 */
export interface NotebookJSON {
  /** uuid of the notebook */
  id: string;
  /** ulid for of the notebook */
  uid: string;
  /** Name of the notebook */
  name: string;
  /** Description of the notebook */
  description: string;
  /** Type of notebook */
  type: string;
  /** File extension of the notebook */
  extension: string;
  /** CDN URL for accessing the notebook */
  cdnUrl: string;
}

/**
 * Notebook domain model that extends the base Item class.
 * Provides notebook-specific functionality for managing Jupyter notebooks.
 *
 * @example
 * ```typescript
 * const notebook = await client.createNotebook(formData);
 * const kernelSpec = await notebook.getKernelSpec();
 * ```
 */
export class NotebookDTO extends ItemDTO<NotebookData> {
  /**
   * Create a Notebook instance.
   *
   * @param data - Notebook data from API
   * @param client - Client instance
   */
  constructor(data: NotebookData, client: DatalayerClient) {
    super(data, client);
  }

  // ========================================================================
  // Abstract Method Implementations
  // ========================================================================

  /** Document type identifier. */
  get type(): string {
    this._checkDeleted();
    return ItemTypes.NOTEBOOK;
  }

  /** The cached name of the notebook. */
  get name(): string {
    this._checkDeleted();
    return (
      this._data.name_t ||
      (this._data as any).notebook_name_s ||
      (this._data as any).name ||
      ''
    );
  }

  /** The cached content. */
  get content(): any {
    this._checkDeleted();
    if (!(this._data as any).content && (this._data as any).model_s) {
      try {
        return JSON.parse((this._data as any).model_s);
      } catch {
        return (this._data as any).model_s;
      }
    }
    return (this._data as any).content;
  }

  /** Get the current name from API. */
  async getName(): Promise<string> {
    this._checkDeleted();
    // For now, return cached value - implement API call if needed
    return this.name;
  }

  /** Get when the notebook was last updated from API. */
  async getUpdatedAt(): Promise<Date> {
    this._checkDeleted();
    const dateStr =
      (this._data as any).updated_at || (this._data as any).update_ts_dt;
    if (!dateStr) {
      throw new Error('No update timestamp available for notebook');
    }
    return new Date(dateStr);
  }

  /** Update the notebook. */
  async update(name?: string, description?: string): Promise<this> {
    // FIXME: check if both are needed, and use the existing values if only one provided
    this._checkDeleted();
    const token = (this as any)._client.getToken();
    const spacerUrl = (this as any)._client.getSpacerUrl();
    const updateData: UpdateNotebookRequest = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    await notebooks.updateNotebook(token, this.uid, updateData, spacerUrl);
    // FIXME: handle partial updates
    return this;
  }

  // ========================================================================
  // Notebook-specific Properties
  // ========================================================================

  /** File path within the space. */
  get path(): string {
    this._checkDeleted();
    return (this._data as any).path || '';
  }

  /** Version number. */
  get version(): number {
    this._checkDeleted();
    return (this._data as any).version || 0;
  }

  /** Notebook metadata. */
  get metadata(): Record<string, any> {
    this._checkDeleted();
    return (this._data as any).metadata || {};
  }

  /** Kernel specification (cached). */
  get kernelSpec(): any {
    this._checkDeleted();
    return (this._data as any).kernel_spec;
  }

  /** Description of the notebook. */
  get description(): string {
    this._checkDeleted();
    return this._data.description_t || '';
  }

  /** Get the notebook extension. */
  get extension(): string {
    this._checkDeleted();
    const ext = this._data.notebook_extension_s;
    return ext ? (ext.startsWith('.') ? ext : `.${ext}`) : '.ipynb';
  }

  /**
   * Get notebook data in camelCase format.
   * Returns only the core fields that consumers need.
   * This provides a stable interface regardless of API changes.
   *
   * @returns Core notebook data with camelCase properties
   */
  toJSON(): NotebookJSON {
    this._checkDeleted();
    const obj = {
      id: this.id,
      uid: this.uid,
      name: this.name,
      description: this.description,
      type: this.type,
      extension: this.extension,
      cdnUrl: (this._data as any).cdn_url_s,
    };
    validateJSON(obj, 'Notebook');
    return obj;
  }

  /**
   * Get the raw notebook data exactly as received from the API.
   * This preserves the original snake_case naming from the API response.
   *
   * @returns Raw notebook data from API
   */
  rawData(): NotebookData {
    this._checkDeleted();
    return this._data;
  }
}
