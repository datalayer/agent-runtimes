/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Environment domain model for the Datalayer Client.
 *
 * @module models/EnvironmentDTO
 */

import type { AgentRuntimesClient as DatalayerClient } from '../client/AgentRuntimesClient';
import { validateJSON } from '@datalayer/core/lib/api/utils/validation';

/**
 * Represents a computing environment available in the Datalayer platform.
 * @interface EnvironmentData
 */
export interface EnvironmentData {
  /** Human-readable title for the environment */
  title: string;
  /** Detailed description of the environment */
  description: string;
  /** Docker image used for this environment */
  dockerImage: string;
  /** Example usage or description */
  example?: string;
  /** Code snippets for this environment */
  snippets?: any[]; // Simplified - EnvironmentSnippet type removed
  /** Content mounts for this environment */
  contents?: any[]; // Simplified - EnvironmentContent type removed
  /** Kernel configuration */
  runtime?: {
    /** Template for kernel naming */
    givenNameTemplate?: string;
  };
  /** Programming language (e.g., "python", "r") */
  language: string;
  /** Resource ranges configuration */
  resourcesRanges?: any; // Simplified - ResourceRanges type removed
  /** Credits consumed per hour when running */
  burning_rate: number;
  /** Simple resource specification */
  resources?: any; // Simplified - ResourceConfig type removed
  /** Name identifier for the environment */
  name: string;
  /** Docker registry for the image */
  dockerRegistry?: string;
  /** Icon or avatar URL for the environment */
  icon?: string;
  /** Whether the environment is enabled */
  enabled?: boolean;
  /** Tags associated with the environment */
  tags?: string[];
}

/**
 * Stable public interface for Environment data.
 * This is the contract that Client consumers can rely on.
 * The raw API may change, but this interface remains stable.
 */
export interface EnvironmentJSON {
  /** Human-readable title for the environment */
  title: string;
  /** Unique name identifier for the environment */
  name: string;
  /** Credits consumed per hour for this environment */
  burningRate: number;
  /** Description of the environment (contains HTML markup) */
  description: string;
  /** Rich description of the environment (contains HTML markup) */
  richDescription: string;
}

// API Response types that match actual server responses
/**
 * Response from listing available environments
 * @interface ListEnvironmentsResponse
 */
export interface ListEnvironmentsResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Response message from the server */
  message: string;
  /** Array of available environments */
  environments: EnvironmentData[];
}

/**
 * Environment domain model that wraps API responses with convenient methods.
 * Provides information about available computational environments.
 *
 * @example
 * ```typescript
 * const environments = await client.listEnvironments();
 * const aiEnv = environments.find(env => env.name === 'ai-env');
 * console.log(aiEnv.title); // "AI Environment"
 * ```
 */
export class EnvironmentDTO {
  /** @internal */
  _data: EnvironmentData;

  /**
   * Create an Environment instance.
   *
   * @param data - Environment data from API
   * @param _client - Client instance (not currently used but kept for consistency)
   */
  constructor(data: EnvironmentData, _client: DatalayerClient) {
    this._data = data;
    // Client instance not currently used but kept for future extensibility
  }

  // ========================================================================
  // Properties
  // ========================================================================

  /** Human-readable title for the environment (e.g., 'AI Environment', 'Python CPU Environment'). */
  get title(): string {
    return this._data.title;
  }

  /** Unique name identifier for the environment (e.g., 'ai-env', 'ai-agents-env'). */
  get name(): string {
    return this._data.name;
  }

  /** Credits consumed per hour for this environment. */
  get burningRate(): number {
    return this._data.burning_rate;
  }

  /** Rich description of the environment (contains HTML markup). */
  get richDescription(): string {
    return this._data.description;
  }

  /** Clean description without HTML tags. */
  get description(): string {
    // Simple HTML tag removal
    return this._data.description.replace(/<[^>]*>/g, '').trim();
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Get environment data in camelCase format.
   * Returns only the core fields that consumers need.
   * This provides a stable interface regardless of API changes.
   *
   * @returns Core environment data with camelCase properties
   */
  toJSON(): EnvironmentJSON {
    const obj = {
      title: this.title,
      name: this.name,
      burningRate: this.burningRate,
      description: this.description,
      richDescription: this.richDescription,
    };
    validateJSON(obj, 'Environment');
    return obj;
  }

  /**
   * Get the raw environment data exactly as received from the API.
   * This preserves the original snake_case naming from the API response.
   *
   * @returns Raw environment data from API
   */
  rawData(): EnvironmentData {
    return this._data;
  }

  /** String representation of the environment. */
  toString(): string {
    return `Environment(${this.name}, ${this.title})`;
  }
}
