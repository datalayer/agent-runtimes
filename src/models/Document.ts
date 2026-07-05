/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IItem } from './Item';

export type IBaseDocument = IItem & {
  model?: any;
};

export type IDocument = IBaseDocument & {
  type: 'document';
};

export default IDocument;
