/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsMounted } from 'usehooks-ts';
import type { IMarkdownParser, IRenderMime } from '@jupyterlab/rendermime';
import {
  Button,
  FormControl,
  Select,
  Spinner,
  Text,
  TextInput,
  ToggleSwitch,
  Tooltip,
  IconButton,
} from '@primer/react';
import { Dialog } from '@primer/react/experimental';
import { AlertIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { useJupyterReactStore } from '@datalayer/jupyter-react';
import { USAGE_ROUTE } from '@datalayer/core/lib/routes';
import { useNavigate } from '@datalayer/core/lib/hooks';
import { NO_RUNTIME_AVAILABLE_LABEL } from '@datalayer/core/lib/i18n';
import type { IRemoteServicesManager } from '../../runtimes';
import type { RunResponseError } from '@datalayer/core/lib/api/DatalayerApi';
import type { ICodeSandboxSnapshot, IRuntimeDesc } from '../../models';
import { iamStore, useCoreStore, useIAMStore } from '../../state/substates';
import { createNotebook, sleep } from '@datalayer/core/lib/utils';
import { Markdown } from '@datalayer/core/lib/components/display';
import { Timer } from '@datalayer/core/lib/components/progress';
import { FlashClosable } from '@datalayer/core/lib/components/flashes';
import {
  RuntimeReservationControl,
  MAXIMAL_RUNTIME_TIME_RESERVATION_MINUTES,
} from './RuntimeReservationControl';

/**
 * The text a fragment of markup reads as.
 *
 * @param html Markup to read
 */
function asPlainText(html: string): string {
  if (!html || typeof DOMParser === 'undefined') {
    return html;
  }
  return (
    new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  );
}

/**
 * Initial time in milliseconds before retrying in case no kernels are available
 */
const NOT_AVAILABLE_INIT_RETRY = 10_000;

/**
 * Number of trials in case of unavailable code sandboxes
 */
const NOT_AVAILABLE_RETRIES = 5;

/**
 * {@link RuntimeLauncherDialog} properties.
 */
export interface IRuntimeLauncherDialogProps {
  /**
   * Dialog title
   */
  dialogTitle?: string;

  /**
   * Remote Jupyter service manager
   */
  manager: IRemoteServicesManager;

  /**
   * Form submission callback
   */
  onSubmit: (spec?: IRuntimeDesc) => void;

  /**
   * Whether to start the kernel or not.
   *
   * If `with-example`, a kernel will be started an
   * an example document will be opened (if available).
   * If `defer`, a kernel will not be started but the
   * kernel params will have a `creditsLimit` defined
   * for spinning a runtime.
   *
   * Default: `true`
   */
  startRuntime?: boolean | 'with-example' | 'defer';

  /**
   * Markdown parser
   */
  markdownParser?: IMarkdownParser;

  /**
   * If provided the kernel will be started and will
   * restore the provided snapshot in the kernel.
   */
  kernelSnapshot?: ICodeSandboxSnapshot;

  /**
   * HTML sanitizer
   */
  sanitizer?: IRenderMime.ISanitizer;

  /**
   * Upgrade subscription URL
   */
  upgradeSubscription?: string;

  /**
   * Optional submit button label override.
   */
  submitLabel?: string;
}

/**
 * Start Runtime Launcher Dialog.
 */
export function RuntimeLauncherDialog(
  props: IRuntimeLauncherDialogProps,
): JSX.Element {
  const {
    dialogTitle,
    kernelSnapshot,
    manager,
    onSubmit,
    markdownParser,
    sanitizer,
    upgradeSubscription,
    submitLabel,
    startRuntime = true,
  } = props;

  const hasExample = startRuntime === 'with-example';
  const shouldStartRuntime = startRuntime !== 'defer';

  const user = iamStore.getState().user;
  const environments = manager.environments.get();

  const { configuration } = useCoreStore();
  const { credits, refreshCredits } = useIAMStore();

  let navigate:
    ((location: string, e?: any, resetPortals?: boolean) => void) | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigate = useNavigate();
  } catch (reason) {
    // TODO when would this component be shown outside of a react-router? navigation is only available within a react-router.
    console.warn(reason);
  }
  const jupyterReactStore = useJupyterReactStore();
  const jupyterLabAdapter = (jupyterReactStore as any).jupyterLabAdapter;
  const [selection, setSelection] = useState(
    (kernelSnapshot?.environment || environments[0]?.name) ?? '',
  );
  const [timeLimit, setTimeLimit] = useState<number>(10);
  const [runtimeName, setRuntimeName] = useState(
    environments[0]?.runtime?.givenNameTemplate || environments[0]?.title || '',
  );
  // Whether the runtim name has been changed by the user or not
  const [hasCustomRuntimeName, setHasCustomRuntimeName] = useState(false);
  const [userStorage, setUserStorage] = useState(false);
  const [openExample, setOpenExample] = useState(false);
  const [waitingForRuntime, setWaitingForRuntime] = useState(false);
  const [error, setError] = useState<JSX.Element>();
  const [flashLevel, setFlashLevel] = useState<'danger' | 'warning'>('danger');
  const isMounted = useIsMounted();
  useEffect(() => {
    if (shouldStartRuntime) {
      refreshCredits();
    }
  }, [shouldStartRuntime]);
  const spec = useMemo(
    () => environments.find(spec => spec.name === selection),
    [environments, selection],
  );
  const description = spec?.description ?? '';
  const burningRate = spec?.burning_rate ?? 1;
  const creditsToMinutes = 1.0 / burningRate / 60.0;
  const includedRuns =
    user?.subscription?.usage?.included_runs ??
    user?.subscription?.included_runs;
  const currentRuns =
    user?.subscription?.usage?.current_runs ??
    user?.subscription?.current_runs ??
    user?.subscription?.used_runs;
  const hasKnownRunAllowance = typeof includedRuns === 'number';
  const hasRemainingRuns =
    hasKnownRunAllowance &&
    typeof currentRuns === 'number' &&
    includedRuns > 0 &&
    currentRuns < includedRuns;
  const hasKnownCredits = typeof credits?.available === 'number';
  const maxFromCredits = hasKnownCredits
    ? Math.floor((credits.available ?? 0) * creditsToMinutes)
    : 10;
  const effectiveMaxMinutes =
    hasKnownCredits && hasKnownRunAllowance && !hasRemainingRuns
      ? Math.max(1, maxFromCredits)
      : Math.max(10, maxFromCredits > 0 ? maxFromCredits : 0);
  const outOfCredits =
    shouldStartRuntime &&
    hasKnownCredits &&
    hasKnownRunAllowance &&
    !hasRemainingRuns &&
    ((credits.available ?? 0) <= 0 || maxFromCredits < Number.EPSILON);
  const handleSelectionChange = useCallback(
    (e: any) => {
      const selection = (e.target as HTMLSelectElement).value;
      setSelection(selection);
      if (!hasCustomRuntimeName) {
        const spec = environments.find(env => env.name === selection);
        setRuntimeName(spec?.runtime?.givenNameTemplate || spec?.title || '');
      }
    },
    [setSelection, hasCustomRuntimeName],
  );
  const handleSubmitRuntime = useCallback(async () => {
    if (selection) {
      setError(undefined);
      setWaitingForRuntime(shouldStartRuntime);
      const spec = environments.find(s => s.name === selection);
      const desc: IRuntimeDesc = {
        name: selection,
        language: spec?.language ?? '',
        location: 'remote',
        displayName: runtimeName ?? spec?.title,
      };
      const creditsLimit =
        Math.min(timeLimit, MAXIMAL_RUNTIME_TIME_RESERVATION_MINUTES) /
        creditsToMinutes;
      desc.params = {};
      if (startRuntime === 'defer') {
        desc.params['creditsLimit'] = creditsLimit;
      }
      if (userStorage) {
        desc.params['capabilities'] = ['user_storage'];
      }
      let success = true;
      if (shouldStartRuntime) {
        success = false;
        let availableTrial = 1;
        let retryDelay = NOT_AVAILABLE_INIT_RETRY;
        // Should return success status.
        const startNewKernel = async (): Promise<boolean> => {
          try {
            const connection = await manager.runtimesManager.startNew(
              {
                environmentName: selection,
                type: 'notebook',
                givenName: runtimeName,
                creditsLimit: creditsLimit,
                capabilities: userStorage ? ['user_storage'] : undefined,
                snapshot: kernelSnapshot?.id,
              },
              {
                username: user?.handle,
                handleComms: true,
              },
            );
            desc.kernelId = connection.id;
            if (jupyterLabAdapter?.jupyterLab && hasExample && openExample) {
              const example = environments.find(
                spec => spec.name === selection,
              )?.example;
              if (example) {
                const options = {
                  kernelId: connection.id,
                  kernelName: connection.name,
                };
                createNotebook({
                  app: jupyterLabAdapter.jupyterLab,
                  name: selection,
                  url: example,
                  options,
                });
              }
            }
            // Close the connection as we are not using it.
            connection.dispose();
          } catch (error) {
            let msg = <Text>Failed to create the remote runtime…</Text>;
            let level: 'danger' | 'warning' = 'danger';
            let retry = false;
            if ((error as RunResponseError).response?.status === 503) {
              if (availableTrial++ <= NOT_AVAILABLE_RETRIES) {
                retry = true;
                msg = (
                  <Text>
                    The runtime you have requested is currently not available
                    due to resource limitations. Leave this dialog open, new
                    trial in <Timer duration={retryDelay * 0.001} />
                    {` (${availableTrial - 1}/${NOT_AVAILABLE_RETRIES}).`}
                  </Text>
                );
              } else {
                msg = <Text>{NO_RUNTIME_AVAILABLE_LABEL}</Text>;
              }
              level = 'warning';
            } else if ((error as any).name === 'MaxRuntimesExceededError') {
              msg = (
                <Text>
                  You reached your remote runtime limits. Stop existing runtimes
                  before starting new ones.
                </Text>
              );
              level = 'warning';
            } else if ((error as any).name === 'RuntimeUnreachable') {
              msg = (
                <Text>
                  The runtime has been created but can not be accessed. Please
                  contact your IT support team to report this issue.
                </Text>
              );
            }
            setFlashLevel(level);
            console.error(msg, error);
            setError(msg);
            if (retry) {
              await sleep(retryDelay);
              retryDelay *= 2;
              if (isMounted()) {
                return await startNewKernel();
              }
            }
            return false;
          } finally {
            setWaitingForRuntime(false);
          }
          return true;
        };
        // Start the kernel if the reservation succeeded.
        success = await startNewKernel();
      }
      if (success && isMounted()) {
        if (!shouldStartRuntime) {
          setWaitingForRuntime(false);
        }
        onSubmit(desc);
      }
    }
  }, [
    manager,
    selection,
    startRuntime,
    runtimeName,
    onSubmit,
    userStorage,
    openExample,
    jupyterLabAdapter,
    timeLimit,
    shouldStartRuntime,
    isMounted,
  ]);
  const handleUserStorageChange = useCallback(
    (e: any) => {
      (e as MouseEvent).preventDefault();
      setUserStorage(!userStorage);
    },
    [userStorage],
  );
  const handleSwitchClick = useCallback(
    (e: any) => {
      (e as MouseEvent).preventDefault();
      setOpenExample(!openExample);
    },
    [openExample],
  );
  const handleUpgrade = useCallback(() => {
    if (upgradeSubscription) {
      navigate?.(upgradeSubscription);
    }
  }, [navigate, upgradeSubscription]);
  const handleKernelNameChange = useCallback((e: any) => {
    if (typeof (e.target as HTMLInputElement).value === 'string') {
      setRuntimeName((e.target as HTMLInputElement).value);
      setHasCustomRuntimeName(true);
    }
  }, []);
  // TODO title color is enforced for JupyterLab.
  // This may be fixed in the jupyter-react theme (Primer generates h1 for the dialog title).
  return (
    <Dialog
      title={
        <span style={{ color: 'var(--fgColor-default)' }}>
          {dialogTitle || 'Launch a new Code Sandbox'}
        </span>
      }
      onClose={() => {
        onSubmit(undefined);
      }}
      footerButtons={[
        {
          buttonType: 'default',
          onClick: () => {
            onSubmit(undefined);
          },
          content: 'Cancel',
          disabled: waitingForRuntime,
        },
        {
          buttonType: 'primary',
          onClick: handleSubmitRuntime,
          content: waitingForRuntime ? (
            <Spinner size="small" />
          ) : (
            (submitLabel ?? ((startRuntime ?? true) ? 'Launch' : 'Assign'))
          ),
          disabled: waitingForRuntime || !selection || outOfCredits,
          autoFocus: true,
        },
      ]}
    >
      <Box
        as="form"
        onKeyDown={event => {
          if (event.defaultPrevented) {
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            handleSubmitRuntime();
          }
        }}
      >
        <FormControl
          disabled={!!kernelSnapshot?.environment || environments.length === 0}
        >
          <FormControl.Label>Environment</FormControl.Label>
          <Select
            name="environment"
            disabled={
              !!kernelSnapshot?.environment || environments.length === 0
            }
            value={selection}
            onChange={handleSelectionChange}
            block
          >
            {environments.map(spec => (
              <Select.Option key={spec.name} value={spec.name}>
                {spec.name}
                {spec.title && (
                  <>
                    {' - '}
                    {spec.title as string}
                  </>
                )}
              </Select.Option>
            ))}
          </Select>
          <FormControl.Caption>
            <>
              {markdownParser ? (
                <Box sx={{ img: { maxWidth: '100%' } }}>
                  <Markdown
                    text={description}
                    markdownParser={markdownParser}
                    sanitizer={sanitizer}
                  />
                </Box>
              ) : sanitizer ? (
                // The description of an environment carries markup. With no
                // parser to render it, the sanitizer of the application is
                // enough to show it as what it is rather than as its tags.
                <Box
                  sx={{ img: { maxWidth: '100%' } }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizer.sanitize(description),
                  }}
                />
              ) : (
                // Neither a parser nor a sanitizer: the text of the markup,
                // which is still better than the markup itself.
                asPlainText(description)
              )}
              {/*
              {spec?.contents?.length && (
                <>
                  <FormControl>
                    <FormControl.Label>Contents</FormControl.Label>
                  </FormControl>
                  {spec?.contents?.map(content => {
                    return (
                      <Box mb={1}>
                        <Label>{content.name}</Label> mounted on{' '}
                        <Label>{content.mount}</Label>
                      </Box>
                    );
                  })}
                </>
              )}
              */}
            </>
          </FormControl.Caption>
        </FormControl>
        {startRuntime && (
          <RuntimeReservationControl
            addCredits={
              navigate
                ? () => {
                    navigate!(USAGE_ROUTE);
                  }
                : undefined
            }
            disabled={outOfCredits}
            label={'Time reservation'}
            max={effectiveMaxMinutes}
            time={timeLimit}
            burningRate={burningRate}
            onTimeChange={setTimeLimit}
            error={
              outOfCredits ? 'You must add credits to your account.' : undefined
            }
          />
        )}
        {!configuration.whiteLabel && (
          <FormControl layout="horizontal">
            <FormControl.Label id="user-storage-label">
              User storage
              <Tooltip
                text={'The runtime will be slower to start.'}
                direction="e"
                style={{ marginLeft: 3 }}
              >
                <IconButton
                  icon={AlertIcon}
                  aria-label=""
                  variant="invisible"
                />
              </Tooltip>
            </FormControl.Label>
            <ToggleSwitch
              checked={userStorage}
              size="small"
              onClick={handleUserStorageChange}
              aria-labelledby="user-storage-label"
            />
          </FormControl>
        )}
        <FormControl sx={{ paddingTop: '10px' }}>
          <FormControl.Label>Runtime name</FormControl.Label>
          <TextInput
            name="name"
            value={runtimeName}
            onChange={handleKernelNameChange}
            block
          />
        </FormControl>
        {hasExample &&
          jupyterLabAdapter?.jupyterLab &&
          !configuration.whiteLabel && (
            <FormControl sx={{ paddingTop: '10px' }}>
              <FormControl.Label id="open-example-label">
                Open example notebook
              </FormControl.Label>
              <ToggleSwitch
                disabled={
                  !environments.find(spec => spec.name === selection)?.example
                }
                checked={openExample}
                size="small"
                onClick={handleSwitchClick}
                aria-labelledby="open-example-label"
              />
            </FormControl>
          )}
        {error && (
          <FlashClosable
            variant={flashLevel}
            actions={
              navigate && upgradeSubscription && flashLevel === 'warning' ? (
                <Button
                  onClick={handleUpgrade}
                  title={'Upgrade your subscription.'}
                >
                  Upgrade
                </Button>
              ) : undefined
            }
          >
            {error}
          </FlashClosable>
        )}
      </Box>
    </Dialog>
  );
}
