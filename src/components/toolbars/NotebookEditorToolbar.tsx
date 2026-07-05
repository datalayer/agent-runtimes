/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { NotebookCommandIds } from '@datalayer/jupyter-react';
import { Session, type KernelMessage } from '@jupyterlab/services';
import { CommandRegistry } from '@lumino/commands';
import { Button } from '@primer/react';
import { PlayIcon, StopIcon } from '@primer/octicons-react';
import type { IRuntimeDesc } from '../../models';
import { useEffect, useState } from 'react';

/**
 * NotebookEditorToolbar component properties
 */
export type INotebookEditorToolbar = {
  /**
   * Jupyter commands registry
   */
  commandRegistry?: CommandRegistry;
  /**
   * Kernel description
   */
  runtimeDesc?: IRuntimeDesc;
  /**
   * Callback to save the notebook model
   */
  save: () => void;
  /**
   * Session connection
   */
  sessionConnection?: Session.ISessionConnection;
};

/**
 * Notebook editor toolbar
 */
export function NotebookEditorToolbar(
  props: INotebookEditorToolbar,
): JSX.Element {
  const { commandRegistry, runtimeDesc, sessionConnection } = props;
  const [kernelStatus, setKernelStatus] = useState<
    KernelMessage.Status | undefined
  >();
  useEffect(() => {
    const onStatusChanged = () => {
      setKernelStatus(sessionConnection?.kernel?.status);
    };
    onStatusChanged();
    sessionConnection?.statusChanged.connect(onStatusChanged);
    sessionConnection?.connectionStatusChanged.connect(onStatusChanged);
    return () => {
      sessionConnection?.statusChanged.disconnect(onStatusChanged);
      sessionConnection?.connectionStatusChanged.disconnect(onStatusChanged);
    };
  }, [sessionConnection]);
  return (
    <>
      {/*
      <Button
        variant="invisible"
        size="small"
        leadingVisual={RepoPushIcon}
        disabled={runtimeDesc?.location === undefined}
        onClick={save}
      >
        Save
      </Button>
      */}
      <Button
        variant="invisible"
        size="small"
        leadingVisual={PlayIcon}
        disabled={!runtimeDesc?.location || kernelStatus === 'busy'}
        onClick={(e: any) =>
          commandRegistry?.execute(NotebookCommandIds.runAll)
        }
      >
        Run all
      </Button>
      <Button
        variant="invisible"
        size="small"
        leadingVisual={StopIcon}
        disabled={!runtimeDesc?.location || kernelStatus !== 'busy'}
        onClick={(e: any) =>
          commandRegistry?.execute(NotebookCommandIds.interrupt)
        }
      >
        Interrupt
      </Button>
    </>
  );
}

export default NotebookEditorToolbar;
