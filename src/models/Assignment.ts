/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IBaseNotebook } from './Notebook';
import { IStudentItem } from './StudentItem';

export type IAssignment = IBaseNotebook & {
  type: 'assignment';
  studentItem?: IStudentItem;
};

export default IAssignment;
