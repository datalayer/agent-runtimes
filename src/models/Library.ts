/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IExercise } from './Exercise';
import { IDataset } from './Dataset';

export type LibraryType = 'public' | 'private';

export type Library = {
  id: string;
  type: LibraryType;
  exercises: Array<IExercise>;
  datasets: Array<IDataset>;
};

export default Library;
