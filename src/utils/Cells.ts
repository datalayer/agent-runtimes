/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IDataset } from '../models';

export const getDatasetCell = (dataset: IDataset) => {
  switch (dataset.contentType) {
    case 'application/vnd.ms-excel':
    case 'text/csv':
      return `# --- ✅ Load the ${dataset.fileName}.${dataset.datasetExtension} dataset (${dataset.mimeType})
import pandas as pd
${dataset.fileName}_${dataset.datasetExtension} = pd.read_csv("${dataset.cdnUrl}")
${dataset.fileName}_${dataset.datasetExtension}

`;
    case 'image/png':
    case 'image/jpg':
    case 'image/jpeg':
      return `# --- ✅ Display the ${dataset.fileName}.${dataset.datasetExtension} dataset (${dataset.mimeType})
from IPython.display import Image
url = "${dataset.cdnUrl}"
Image(url, width=300)

`;
    default:
      return `# --- 😞 File of type ${dataset.contentType} is not supported for now.
`;
  }
};
