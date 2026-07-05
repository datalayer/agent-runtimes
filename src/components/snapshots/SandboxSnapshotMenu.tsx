/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { DeviceCameraIcon } from '@primer/octicons-react';
import { Kernel } from '@jupyterlab/services';
import {
  ActionList,
  ActionMenu,
  Flash,
  FormControl,
  Select,
  Spinner,
} from '@primer/react';
import { Dialog } from '@primer/react/experimental';
import { Box } from '@datalayer/primer-addons';
import { useToast } from '@datalayer/core/lib/hooks';
import { type ICodeSandboxSnapshot } from '../../models';
import {
  createSandboxSnapshot,
  getSandboxSnapshots,
  loadBrowserSandboxSnapshot,
  loadSandboxSnapshot,
  IMultiServiceManager,
} from '../../runtimes';
import { useRuntimesStore } from '../../state/substates';
import { createSandboxSnapshotName } from '@datalayer/core/lib/utils';

/**
 * Code Sandbox snapshot menu component properties
 */
type ICodeSandboxSnapshotMenu = {
  /**
   * Application multi service manager.
   */
  multiServiceManager?: IMultiServiceManager;
  /**
   * Connection to the current kernel.
   *
   * It is needed only for browser kernels.
   */
  connection?: Kernel.IKernelConnection;
  /**
   * Pod name
   *
   * It is needed for remote kernels.
   */
  podName?: string;
  /**
   * Whether the menu is disabled.
   */
  disabled: boolean;
};

/**
 * Code Sandbox Snapshot menu component.
 */
export function SandboxSnapshotMenu({
  children,
  connection,
  podName,
  multiServiceManager,
  disabled = false,
}: PropsWithChildren<ICodeSandboxSnapshotMenu>): JSX.Element {
  const {
    addSandboxSnapshot,
    runtimesRunUrl,
    runtimeSnapshots,
    setSandboxSnapshots,
  } = useRuntimesStore();
  const { enqueueToast, trackAsyncTask } = useToast();
  const [openLoadDialog, setOpenLoadDialog] = useState(false);
  const [loadingSandboxSnapshot, setLoadingSandboxSnapshot] = useState(false);
  const [takingSandboxSnapshot, setTakingSandboxSnapshot] = useState(false);
  const [selection, setSelection] = useState(runtimeSnapshots[0]?.id ?? '');
  const [error, setError] = useState<string>();
  useEffect(() => {
    getSandboxSnapshots()
      .then(snapshots => {
        setSandboxSnapshots(snapshots);
        if (!selection && snapshots.length > 0) {
          setSelection(snapshots[0].id);
        }
      })
      .catch(reason => {
        console.error(`Failed to fetch remote kernel snapshots; ${reason}`);
      });
  }, [runtimesRunUrl]);
  const onLoadSandboxSnapshot = useCallback(() => {
    setError(undefined);
    setOpenLoadDialog(true);
  }, []);
  const onSandboxSnapshotChanged = useCallback(event => {
    setSelection(event.target.value);
  }, []);
  const onLoadSandboxSnapshotSubmit = useCallback(
    async ({
      id,
      connection,
      podName,
    }: {
      id: string;
      connection?: Kernel.IKernelConnection;
      podName?: string;
    }) => {
      if (podName) {
        await loadSandboxSnapshot({ id: podName, from: id });
        enqueueToast(`Code Sandbox snapshot ${podName} is loaded.`, {
          variant: 'success',
        });
      } else if (connection) {
        await loadBrowserSandboxSnapshot({ connection, id });
        enqueueToast(`Code Sandbox snapshot ${id} is loaded.`, {
          variant: 'success',
        });
      }
    },
    [],
  );
  const onTakeSandboxSnapshot = useCallback(async () => {
    try {
      setTakingSandboxSnapshot(true);
      let snapshot: ICodeSandboxSnapshot | undefined;
      let task: Promise<any> | undefined;
      let ref = '';
      let snapshotName = '';
      if (podName && multiServiceManager?.remote) {
        snapshotName = createSandboxSnapshotName('cloud');
        task = multiServiceManager.remote.runtimesManager.snapshotRuntime({
          podName,
          name: snapshotName,
          description: snapshotName,
          stop: false,
        });
        ref = podName.split('-', 2).reverse()[0];
        task.then(s => {
          snapshot = s;
        });
      } else if (connection && multiServiceManager?.browser) {
        const model = connection.model;
        ref = model.id;
        snapshotName = createSandboxSnapshotName('browser');
        let isPending = true;
        task = createSandboxSnapshot({
          connection: multiServiceManager.browser.kernels.connectTo({
            model,
          }),
          metadata: { filename: `${snapshotName}.data` },
          onUploadProgress: () => {
            if (isPending) {
              isPending = false;
              // Get the kernel snapshot uid.
              getSandboxSnapshots().then(snapshots => {
                snapshot = snapshots.find(s => s.name === snapshotName);
              });
            }
          },
        });
      }
      if (task) {
        trackAsyncTask(task, {
          error: {
            message: (reason, data) => {
              const msg =
                reason === 'Empty snapshot'
                  ? `Runtime ${ref} will not be snapshotted as it does not contain any serializable state.`
                  : `Failed to snapshot runtime ${ref} - ${reason}`;
              return msg;
            },
          },
          pending: { message: `Taking a snapshot of runtime ${ref}…` },
          success: {
            message: () =>
              `Runtime ${ref} successfully snapshotted as ${snapshotName}.`,
          },
        });
        await task;
        if (snapshot) {
          addSandboxSnapshot(snapshot);
        }
      }
    } finally {
      setTakingSandboxSnapshot(false);
    }
  }, [connection, podName, multiServiceManager]);
  return (
    <>
      <ActionMenu>
        <ActionMenu.Button
          leadingVisual={DeviceCameraIcon}
          variant="invisible"
          size="small"
          disabled={loadingSandboxSnapshot || takingSandboxSnapshot || disabled}
        >
          {children}
        </ActionMenu.Button>
        <ActionMenu.Overlay>
          <ActionList>
            <ActionList.Item
              onSelect={onLoadSandboxSnapshot}
              disabled={loadingSandboxSnapshot || runtimeSnapshots.length === 0}
            >
              Load a code sandbox snapshot…
            </ActionList.Item>
            <ActionList.Item
              onSelect={onTakeSandboxSnapshot}
              disabled={takingSandboxSnapshot}
            >
              Take a code sandbox snapshot
            </ActionList.Item>
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
      {openLoadDialog && (
        <Dialog
          title={
            <span style={{ color: 'var(--fgColor-default)' }}>
              Choose a code sandbox snapshot to load
            </span>
          }
          onClose={() => {
            setOpenLoadDialog(false);
          }}
          footerButtons={[
            {
              buttonType: 'default',
              content: 'Cancel',
              onClick: event => {
                if (!event.defaultPrevented) {
                  event.preventDefault();
                  setOpenLoadDialog(false);
                }
              },
            },
            {
              buttonType: 'primary',
              content: loadingSandboxSnapshot ? (
                <Spinner size="small" />
              ) : (
                'Load'
              ),
              disabled: loadingSandboxSnapshot,
              onClick: async event => {
                if (!event.defaultPrevented) {
                  event.preventDefault();
                  setLoadingSandboxSnapshot(true);
                  try {
                    setError(undefined);
                    const snapshot = runtimeSnapshots.find(
                      s => s.id === selection,
                    );
                    if (snapshot && (connection || podName)) {
                      await onLoadSandboxSnapshotSubmit({
                        connection,
                        id: snapshot.id,
                        podName,
                      });
                    } else {
                      setError('No code sandbox snapshot found.');
                    }
                  } finally {
                    setLoadingSandboxSnapshot(false);
                    setOpenLoadDialog(false);
                  }
                }
              },
              autoFocus: true,
            },
          ]}
        >
          <Box as="form">
            <FormControl>
              <FormControl.Label>Snapshot</FormControl.Label>
              <Select
                name="snapshot"
                value={selection}
                onChange={onSandboxSnapshotChanged}
                block
              >
                {runtimeSnapshots.map(s => (
                  <Select.Option key={s.id} value={s.id}>
                    {s.name ? `${s.name} (${s.id})` : s.id}
                  </Select.Option>
                ))}
              </Select>
            </FormControl>
            {error && <Flash variant="danger">{error}</Flash>}
          </Box>
        </Dialog>
      )}
    </>
  );
}
