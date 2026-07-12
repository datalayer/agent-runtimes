/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IItem } from './Item';

export type ICell = IItem & {
  type: 'cell';
  source: string;
  outputshotUrl?: string;
  outputshotData?: string;
};

export default ICell;
