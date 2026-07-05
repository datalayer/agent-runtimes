/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { CodeBlock } from './CodeBlock';

export type ICodefeedBlocks = {
  id: string;
  type: 'codefeed';
  blocks: CodeBlock[];
};

export default ICodefeedBlocks;
