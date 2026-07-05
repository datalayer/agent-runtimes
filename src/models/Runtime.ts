/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Kernel } from '@jupyterlab/services';

export const BACKWARDS_COMPATIBLE_KERNEL_TYPES_MAP = {
  // Backwards compatible mapping.
  default: 'notebook' as IRuntimeType,
  snippet: 'cell' as IRuntimeType,
  notebook: 'notebook' as IRuntimeType,
  cell: 'cell' as IRuntimeType,
};

/**
 * Error thrown when a runtime has been created
 * but it can ont be reached.
 */
export class RuntimeUnreachable extends Error {
  name = 'RuntimeUnreachable';
}

/**
 * Runtime location.
 */
export type IRuntimeLocation = 'browser' | 'local' | string;

/**
 * Runtime model.
 */
export interface IRuntimeModel extends IRuntimePod, Kernel.IModel {}

/**
 * Runtime pod.
 */
export interface IRuntimePod {
  /**
   * Environment display name
   */
  environment_title: string;
  /**
   * Environment name
   */
  environment_name: string;
  /**
   * Runtime name
   */
  pod_name: string;
  /**
   * Runtime ingress URL
   */
  ingress: string;
  /**
   * Runtime user given name
   */
  given_name: string;
  /**
   * Runtime type
   */
  type: IRuntimeType;
  /**
   * Server authentication token
   */
  token: string;
  /**
   * Credits burning rate per second
   */
  burning_rate: number;
  /**
   * Kernel reservation ID
   */
  reservation_id?: string;
  /**
   * Runtime usage starting timestamp
   */
  started_at: string;
  /**
   * Runtime credits reservation expiration timestamp
   */
  expired_at?: string;
}

/**
 * Runtime description.
 */
export interface IRuntimeDesc {
  /**
   * Runtime ID.
   */
  id?: string;
  /**
   * Runtime Kernel ID.
   */
  kernelId?: string;
  /**
   * Runtime name.
   */
  name: string;
  /**
   * Runtime language.
   */
  language: string;
  /**
   * Runtime location.
   */
  location: IRuntimeLocation;
  /**
   * Runtime display name.
   */
  displayName?: string;
  /**
   * Runtime parameters.
   */
  params?: Record<string, any>;
  /**
   * Runtime credits burning rate.
   */
  burningRate?: number;
  /**
   * Runtime Pod name (if applicable).
   */
  podName?: string;
}

/**
 * Runtime type.
 *
 * TODO refactor with type `IRuntimeLocation`
 */
export type IRuntimeType = 'notebook' | 'cell';

/**
 * Runtime optional capabilities.
 */
export type IRuntimeCapabilities = 'user_storage';
