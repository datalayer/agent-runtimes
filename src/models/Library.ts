/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IExercise } from './Exercise';

export type LibraryType = 'public' | 'private';

export type Library = {
  id: string;
  type: LibraryType;
  exercises: Array<IExercise>;
};

export default Library;
