/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { type IRuntimeOptions } from '../../stateful/runtimes';

export interface RuntimeTransfer {
  /**
   * Selected Kernel.
   */
  runtime: Partial<Omit<IRuntimeOptions, 'kernelType'> & { id: string }> | null;
  /**
   * List of selected variables
   *
   * It may differ with the serialized variables if
   * some serialization failed.
   */
  selectedVariables: string[];
}
