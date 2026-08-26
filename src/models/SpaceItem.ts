/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { INotebook } from './Notebook';
import { IDocument } from './Document';
import { ICell } from './Cell';
import { IEnvironment } from './Environment';
import { ILesson } from './Lesson';
import { IExercise } from './Exercise';
import { IAssignment } from './Assignment';

export type ISpaceItem =
  | INotebook
  | ICell
  | IEnvironment
  | ILesson
  | IExercise
  | IAssignment
  | IDocument;

export default ISpaceItem;
