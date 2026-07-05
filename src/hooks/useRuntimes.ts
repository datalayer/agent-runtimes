/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { requestJupyterKernelsExtension } from '../stateful/runtimes/jupyter/kernelsHandler';

export const useRuntimes = () => {
  // Folder Mounting ----------------------------------------------------------

  const mountLocalFolder = (kernelId: string) => {
    requestJupyterKernelsExtension<any>(`jump/${kernelId}`)
      .then(data => {
        //        console.log('--- Mount Local Folder', data);
      })
      .catch(reason => {
        console.error(
          `Error while accessing the jupyter server jupyter_kernels extension.\n${reason}`,
        );
      });
  };

  const unmountLocalFolder = (kernelId: string) => {
    requestJupyterKernelsExtension<any>(`jump/${kernelId}`, {
      method: 'DELETE',
    })
      .then(data => {
        //        console.log('--- Unmount Local Folder', data);
      })
      .catch(reason => {
        console.error(
          `Error while accessing the jupyter server jupyter_kernels extension.\n${reason}`,
        );
      });
  };

  // --------------------------------------------------------------------------

  return {
    mountLocalFolder,
    unmountLocalFolder,
  };
};

export default useRuntimes;
