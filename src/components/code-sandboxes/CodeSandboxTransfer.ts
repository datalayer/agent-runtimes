/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { type IRuntimeOptions } from '../../runtimes';

export interface CodeSandboxTransfer {
  /**
   * Selected Kernel.
   *
   * `displayName` is the name the user gave the sandbox in the picker, carried
   * with the choice so whoever creates it can create it named — the kernels
   * API of a server has no field for one, and a runtime of the platform takes
   * it as its `given_name`.
   */
  runtime: Partial<
    Omit<IRuntimeOptions, 'kernelType'> & {
      id: string;
      displayName: string;
      /**
       * The pod of an external sandbox (Daytona, E2B), which has no kernel of
       * its own — the session binds it through the runtimes proxy by this.
       */
      pod_name: string;
    }
  > | null;
  /**
   * List of selected variables
   *
   * It may differ with the serialized variables if
   * some serialization failed.
   */
  selectedVariables: string[];
}
