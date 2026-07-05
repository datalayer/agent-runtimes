/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IBaseNotebook } from './Notebook';

export type ILesson = IBaseNotebook & {
  type: 'lesson';
};

export default ILesson;
