/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
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
 * A live runtime.
 *
 * Composition of the control-plane runtime pod ({@link IRuntimePod}) and the
 * JupyterLab kernel model ({@link Kernel.IModel}, e.g. `id`, `name`,
 * `execution_state`). This is the canonical shape used across the app once a
 * pod has an attached kernel: `IRuntimePod` supplies the pod/control-plane
 * fields (snake_case) and `Kernel.IModel` supplies the live kernel fields.
 *
 * Note on identity: `Kernel.IModel.id` is the *kernel* id (only present once a
 * kernel is attached), while {@link IRuntimePod.uid} is the stable *pod* id.
 * Prefer `uid` for pod identity and `id` for kernel identity.
 */
export interface IRuntimeModel extends IRuntimePod, Kernel.IModel {}

/**
 * A runtime pod as returned by the Datalayer control-plane.
 *
 * This is the canonical snake_case transport shape for a runtime pod. The
 * Datalayer Client's `RuntimeData` (see `RuntimeDTO.ts`) is a type alias of
 * this interface, so there is a single source of truth for the pod payload.
 * It is the source of the pod-level fields composed into {@link IRuntimeModel}.
 *
 * It is distinct from {@link IRuntimeDesc}, which is the camelCase,
 * location-agnostic UI descriptor used by pickers/launchers - do not merge the
 * two (see `IRuntimeDesc`).
 */
export interface IRuntimePod {
  /**
   * Stable runtime pod identifier (ULID) assigned by the control-plane.
   *
   * Distinct from the kernel `id` carried by {@link Kernel.IModel}: a pod may
   * exist before a kernel is attached, so prefer `uid` for pod identity.
   */
  uid: string;
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
 * Runtime description (UI layer).
 *
 * A lightweight, camelCase, location-agnostic descriptor used by the runtime
 * pickers/launchers to describe a *desired or selected* runtime across all
 * locations (browser / local / remote). It is intentionally kept separate from
 * {@link IRuntimePod}:
 *  - naming: camelCase (UI) vs snake_case (backend transport);
 *  - scope: spans all {@link IRuntimeLocation}s vs remote pod only;
 *  - lifecycle: a selection/description (may not exist yet) vs a concrete
 *    running pod.
 * Map between the two at the boundary (e.g. `podName` <-> `pod_name`,
 * `burningRate` <-> `burning_rate`) rather than merging them.
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
