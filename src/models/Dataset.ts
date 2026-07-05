/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IItem } from './Item';

export type IDataset = IItem & {
  type: 'dataset';
  fileName: string;
  datasetExtension: string;
  contentLength: number;
  contentType: string;
  mimeType: string;
  mimeTypeParams?: object;
  bucketName?: string;
  path?: string;
  creationDate: Date;
  lastPublicationDate?: Date;
  cdnUrl: string;
};

export default IDataset;
