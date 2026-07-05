/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { INotebookContent } from '@jupyterlab/nbformat';
import { IItem } from './Item';
import { IDataset } from './Dataset';

export type IBaseNotebook = IItem & {
  nbformat?: INotebookContent;
  datasets: Array<IDataset>;
};

export type INotebook = IBaseNotebook & {
  type: 'notebook';
};

export default INotebook;
