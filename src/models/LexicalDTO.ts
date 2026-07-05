/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Lexical domain model for the Datalayer Client.
 *
 * @module models/LexicalDTO
 */

import * as lexicals from '../api/spacer/lexicals';
import type { AgentRuntimesClient as DatalayerClient } from '../client/AgentRuntimesClient';
import { ItemTypes } from '@datalayer/core/lib/client';
import { ItemDTO } from './ItemDTO';
import { validateJSON } from '@datalayer/core/lib/api/utils/validation';

/**
 * Represents a Lexical document (rich text editor)
 * @interface Lexical
 */
export interface LexicalData {
  id: string;
  uid: string;
  name?: string; // May not be present in API response
  name_t?: string; // Text field for name
  content?: any;
  space_id?: string; // May not be present, extracted from s3_path_s
  owner_id?: string; // May not be present
  creator_uid?: string; // Creator UID from API
  creator_handle_s?: string; // Creator handle from API
  created_at?: string; // May not be present
  creation_ts_dt?: string; // Creation timestamp from API
  updated_at?: string; // May not be present
  last_update_ts_dt?: string; // Last update timestamp from API
  cdn_url_s: string;
  // Additional fields from actual API response
  type_s?: string;
  public_b?: boolean;
  description_t?: string;
  document_name_s?: string;
  document_extension_s: string;
  document_format_s?: string;
  content_length_i?: number;
  content_type_s?: string;
  mime_type_s?: string;
  s3_path_s?: string;
  s3_url_s?: string;
  model_s?: string;
}

/**
 * Request payload for creating a Lexical document
 * @interface CreateLexicalRequest
 */
export interface CreateLexicalRequest {
  spaceId: string;
  documentType: string;
  name: string;
  description: string;
  file?: File | Blob;
}

/**
 * Response from creating a Lexical document
 * @interface CreateLexicalResponse
 */
export interface CreateLexicalResponse {
  success: boolean;
  message: string;
  document?: LexicalData;
}

/**
 * Response from getting a Lexical document
 * @interface GetLexicalResponse
 */
export interface GetLexicalResponse {
  success: boolean;
  message: string;
  document?: LexicalData; // Optional - not present in 404 response
}

/**
 * Request payload for updating a Lexical document
 * @interface UpdateLexicalRequest
 */
export interface UpdateLexicalRequest {
  name?: string;
  description?: string;
}

/**
 * Response from updating a Lexical document
 * @interface UpdateLexicalResponse
 */
export interface UpdateLexicalResponse {
  success: boolean;
  message: string;
  document: LexicalData;
}

/**
 * Stable public interface for Lexical data.
 * This is the contract that Client consumers can rely on.
 * The raw API may change, but this interface remains stable.
 */
export interface LexicalJSON {
  /** Unique identifier for the lexical document */
  uid: string;
  /** Unique identifier for the lexical document */
  id: string;
  /** Name of the lexical document */
  name: string;
  /** Description of the lexical document */
  description: string;
  /** Type of lexical document */
  type: string;
  /** File extension of the lexical document */
  extension: string;
  /** ISO 8601 timestamp when the document was created */
  createdAt: string;
  /** ISO 8601 timestamp when the document was last updated */
  updatedAt: string;
  /** CDN URL for accessing the document */
  cdnUrl: string;
}

/**
 * Lexical domain model that extends the base Item class.
 * Provides lexical document functionality for managing rich text documents.
 *
 * @example
 * ```typescript
 * const lexical = await client.createLexical(formData);
 * await lexical.update({ name: 'Updated Documentation' });
 * ```
 */
export class LexicalDTO extends ItemDTO<LexicalData> {
  /**
   * Create a Lexical instance.
   *
   * @param data - Lexical data from API
   * @param client - Client instance
   */
  constructor(data: LexicalData, client: DatalayerClient) {
    super(data, client);
  }

  // ========================================================================
  // Abstract Method Implementations
  // ========================================================================

  /** Document type identifier. */
  get type(): string {
    this._checkDeleted();
    return ItemTypes.LEXICAL;
  }

  /** The cached name of the document. */
  get name(): string {
    this._checkDeleted();
    return this._data.name_t || this._data.name || '';
  }

  /** Get the current name of the document from API. */
  async getName(): Promise<string> {
    this._checkDeleted();
    const token = this._getToken();
    const spacerRunUrl = this._getSpacerRunUrl();
    const response = await lexicals.getLexical(token, this.uid, spacerRunUrl);

    if (response.document) {
      this._updateData(response.document);
      return response.document.name_t || response.document.name || '';
    }

    return this.name;
  }

  /** The cached content. */
  get content(): any {
    this._checkDeleted();
    if (!this._data.content && this._data.model_s) {
      try {
        return JSON.parse(this._data.model_s);
      } catch {
        return this._data.model_s;
      }
    }
    return this._data.content;
  }

  /** Description of the lexical document. */
  get description(): string {
    this._checkDeleted();
    return this._data.description_t || '';
  }

  /** Get the document extension. */
  get extension(): string {
    this._checkDeleted();
    const ext = this._data.document_extension_s;
    return ext ? (ext.startsWith('.') ? ext : `.${ext}`) : '.lexical';
  }

  /** Get when the document was last updated from API. */
  async getUpdatedAt(): Promise<Date> {
    this._checkDeleted();
    const token = this._getToken();
    const spacerRunUrl = this._getSpacerRunUrl();
    const response = await lexicals.getLexical(token, this.uid, spacerRunUrl);

    if (response.document) {
      this._updateData(response.document);
      const dateStr =
        response.document.last_update_ts_dt ||
        response.document.updated_at ||
        response.document.creation_ts_dt ||
        response.document.created_at;
      if (!dateStr) {
        throw new Error('No timestamp available for lexical document');
      }
      return new Date(dateStr);
    }

    const dateStr =
      this._data.last_update_ts_dt ||
      this._data.updated_at ||
      this._data.creation_ts_dt ||
      this._data.created_at;
    if (!dateStr) {
      throw new Error('No timestamp available for lexical document');
    }
    return new Date(dateStr);
  }

  /** Update the document. */
  async update(name?: string, description?: string): Promise<this> {
    // FIXME: check if both are needed, and use the existing values if only one provided
    this._checkDeleted();
    const token = this._getToken();
    const spacerRunUrl = this._getSpacerRunUrl();
    const updateData: UpdateLexicalRequest = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const response = await lexicals.updateLexical(
      token,
      this.uid,
      updateData,
      spacerRunUrl,
    );
    this._updateData(response.document);
    return this;
  }

  /**
   * Get lexical document data in camelCase format.
   * Returns only the core fields that consumers need.
   * This provides a stable interface regardless of API changes.
   *
   * @returns Core lexical data with camelCase properties
   */
  toJSON(): LexicalJSON {
    this._checkDeleted();
    const obj = {
      uid: this.uid,
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      extension: this.extension,
      createdAt: this.createdAt.toDateString(),
      updatedAt: this.updatedAt.toDateString(),
      cdnUrl: this._data.cdn_url_s,
    };
    validateJSON(obj, 'Lexical');
    return obj;
  }

  /**
   * Get the raw lexical data exactly as received from the API.
   * This preserves the original snake_case naming from the API response.
   *
   * @returns Raw lexical data from API
   */
  rawData(): LexicalData {
    this._checkDeleted();
    return this._data;
  }
}
