/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { CodeBlock } from './CodeBlock';

export type ICodefeedBlocks = {
  id: string;
  type: 'codefeed';
  blocks: CodeBlock[];
};

export default ICodefeedBlocks;
