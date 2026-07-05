/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IUser } from '@datalayer/core/lib/models/User';

export type CodeBlock = {
  id: string;
  type: 'codeblock';
  code: string;
  author: IUser;
  ancestor: CodeBlock;
  descendants: CodeBlock[];
};

export default CodeBlock;
