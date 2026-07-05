/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IDataset } from './Dataset';
import { IItem } from './Item';

export type ICode = string;

export type IHelp = string;

export type IExercise = IItem & {
  type: 'exercise';
  help: IHelp;
  codePre: ICode;
  codeSolution: ICode;
  codeQuestion: ICode;
  codeTest: ICode;
  datasets: Array<IDataset>;
  lastUpdateDate?: Date;
  lastPublicationDate?: Date;
};

export default IExercise;
