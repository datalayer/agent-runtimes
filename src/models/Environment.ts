/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IContent } from './Content';
import { IItem } from './Item';

export type IEnvironment = IItem & {
  type: 'environment';
};

export interface IResources {
  cpu: string;
  memory: string;
  'nvidia.com/gpu'?: string;
}

/**
 * Code snippet
 */
export interface ISnippet {
  /**
   * Snippet summary
   */
  title: string;
  /**
   * Snippet long description
   */
  description?: string;
  /**
   * Code snippet
   */
  code: string;
}

/**
 * Datalayer environment
 */
export interface IDatalayerEnvironment {
  /**
   * Name
   */
  name: string;
  /**
   * Title
   */
  title: string;
  /**
   * Description
   */
  description: string;
  /**
   * Icon key (e.g. ai-agent -> AiAgentIcon)
   */
  icon?: string;
  /**
   * Execution language
   */
  language: string;
  /**
   * Docker image
   */
  dockerImage: string;
  /**
   * Example notebook URL
   */
  example?: string;
  /**
   * Example code snippets
   */
  snippets?: ISnippet[];
  /**
   * Associate kernel attributes
   */
  runtime?: {
    /**
     * Proposed display name
     */
    givenNameTemplate?: string;
  };

  /**
   * Environment credits burning rate
   */
  burning_rate: number;

  /**
   * Environment server resources
   */
  resources?: IResources;

  /**
   * Environment contents.
   */
  contents?: IContent[];
}

export default IEnvironment;
