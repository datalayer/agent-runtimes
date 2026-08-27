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
  Spinner,
  Text,
  TextInput,
  ToggleSwitch,
} from '@primer/react';
import { Dialog } from '@primer/react/experimental';
import { Box } from '@datalayer/primer-addons';
import { useJupyterReactStore } from '@datalayer/jupyter-react';
import { useNavigate } from '@datalayer/core/lib/hooks';
import { NO_RUNTIME_AVAILABLE_LABEL } from '@datalayer/core/lib/i18n';
import type { IRemoteServicesManager } from '../../runtimes';
import type { RunResponseError } from '@datalayer/core/lib/api/DatalayerApi';
import type { ICodeSandboxSnapshot, IRuntimeDesc } from '../../models';
import { isCodeSandboxProviderAvailable } from './codeSandboxProviders';
import {
  CodeSandboxVariant,
  codeSandboxVariantOf,
  codeSandboxVariantTitle,
} from '../../models/CodeSandboxVariant';
import {
  CodeSandboxEnvironmentSelect,
  type ICodeSandboxEnvironmentOption,
} from './CodeSandboxEnvironmentSelect';
import {
  getCodeSandboxGivenName,
  listCodeSandboxGivenNames,
  nextCodeSandboxGivenName,
  setCodeSandboxGivenName,
} from './CodeSandboxNames';
import {
  iamStore,
  runtimesStore,
  useCoreStore,
  useIAMStore,
} from '../../state/substates';
import { createRuntime as createRuntimeRecord } from '../../runtimes/actions';
import { createNotebook, sleep } from '@datalayer/core/lib/utils';
import { Markdown } from '@datalayer/core/lib/components/display';
import { Timer } from '@datalayer/core/lib/components/progress';
import { FlashClosable } from '@datalayer/core/lib/components/flashes';
import {
  creditsLimitFor,
  NewCodeSandboxControls,
  useNewCodeSandboxAllowance,
} from './NewCodeSandboxControls';

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
 * {@link CodeSandboxLauncher} properties.
 */
export interface ICodeSandboxLauncherProps {
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
   * Where "Add credits" navigates.
   *
   * ABSOLUTE, always: a relative route resolves against the CURRENT
   * location — opened from `/…/code-sandboxes`, `usage` landed on
   * `code-sandboxes/usage` and a `:sandboxId` route swallowed it as a
   * sandbox called "usage". The default is the web application's `/plans`
   * (which redirects to the plan overview); a nested surface passes its
   * own (e.g. `/datalayer/jupyter-kernels/usage/plans`).
   */
  usageRoute?: string;

  /**
   * Optional submit button label override.
   */
  submitLabel?: string;
}

/**
 * The launcher of a new code sandbox.
 */
export function CodeSandboxLauncher(
  props: ICodeSandboxLauncherProps,
): JSX.Element {
  const {
    dialogTitle,
    kernelSnapshot,
    manager,
    onSubmit,
    markdownParser,
    sanitizer,
    upgradeSubscription,
    usageRoute = '/plans',
    submitLabel,
    startRuntime = true,
  } = props;

  const hasExample = startRuntime === 'with-example';
  const shouldStartRuntime = startRuntime !== 'defer';

  const user = iamStore.getState().user;
  /*
   * Where a sandbox may be launched: every provider that can be reached.
   *
   * The environments of the platform are offered wherever the account can
   * reach it — withholding them inside JupyterLab left `ai-agents-env` off
   * the list and no way to launch a remote sandbox from there. The Jupyter
   * Server is the provider that depends on where this runs, and it is gated
   * below.
   */
  const jupyterAvailable = isCodeSandboxProviderAvailable(
    'local',
    runtimesStore.getState().multiServiceManager,
  );
  const environments = manager.environments.get();
  /*
   * The sandboxes of this Jupyter Server, offered beside those of the platform.
   *
   * Inside JupyterLab a sandbox can be a kernel of the server, and the picker
   * has always offered both — the launcher offered only the environments of
   * the platform, so "Launch a Code Sandbox" could not launch the very kind
   * that costs nothing and starts at once. The value of a local choice is
   * prefixed, since a kernelspec and an environment are free to share a name.
   */
  const localSpecs = useMemo(() => {
    /*
     * ...and only inside JupyterLab.
     *
     * The rule cuts both ways: the web application talks to no Jupyter Server
     * of its own, so a kernelspec of one is not something it can start — the
     * entries read as choices that lead nowhere.
     */
    if (!jupyterAvailable) {
      return [];
    }
    const specs =
      runtimesStore.getState().multiServiceManager?.local?.kernelspecs.specs
        ?.kernelspecs ?? {};
    return Object.values(specs)
      .filter(Boolean)
      .map(spec => ({
        name: spec!.name,
        title: spec!.display_name,
        language: spec!.language,
      }));
  }, [jupyterAvailable]);
  const LOCAL_PREFIX = 'local:';
  /*
   * The choices of the dropdown: what the platform and the external
   * providers offer, then the kernelspecs of this Jupyter Server. Each says
   * whose machine it is — two entries called "GPU" are told apart by nothing
   * else.
   */
  const environmentOptions = useMemo(
    (): ICodeSandboxEnvironmentOption[] => [
      ...environments.map(spec => ({
        key: spec.name,
        title: spec.title || spec.name,
        name: spec.name,
        providerTitle: codeSandboxVariantTitle(
          codeSandboxVariantOf((spec as any)?.owner),
        ),
        burningRate: (spec as any).burning_rate,
      })),
      ...localSpecs.map(spec => ({
        key: `${LOCAL_PREFIX}${spec.name}`,
        title: spec.title || spec.name,
        name: spec.name,
        providerTitle: codeSandboxVariantTitle(
          CodeSandboxVariant.JupyterServer,
        ),
      })),
    ],
    [environments, localSpecs],
  );

  const localSpecOf = (value: string) =>
    value.startsWith(LOCAL_PREFIX)
      ? localSpecs.find(spec => spec.name === value.slice(LOCAL_PREFIX.length))
      : undefined;

  const { configuration } = useCoreStore();
  const { refreshCredits } = useIAMStore();

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
  /*
   * Something is always selected.
   *
   * With the environments of the platform withheld, the first choice of the
   * list is a sandbox of this server — and nothing was selected at all, so the
   * launcher opened on an empty dropdown that could not be submitted.
   */
  useEffect(() => {
    if (!selection && localSpecs.length) {
      setSelection(`${LOCAL_PREFIX}${localSpecs[0].name}`);
    }
  }, [localSpecs, selection]);
  const [timeLimit, setTimeLimit] = useState<number>(10);
  /*
   * The name the sandbox is given, and what is offered for it.
   *
   * The environment says what to call one of its sandboxes; the sandboxes that
   * already run say which of those names are taken — a second sandbox of an
   * environment is offered that name numbered, exactly as an unnamed one is
   * given one. Both go through `nextCodeSandboxGivenName`, so what is proposed
   * here and what is assigned elsewhere never drift apart.
   */
  const takenGivenNames = useCallback(
    (): string[] => [
      ...manager.runtimesManager
        .get()
        .map(runtime => runtime.given_name)
        .filter(Boolean),
      ...listCodeSandboxGivenNames(),
    ],
    [manager],
  );
  const givenNameFor = useCallback(
    (spec?: { title?: string; runtime?: { givenNameTemplate?: string } }) =>
      nextCodeSandboxGivenName(
        spec?.runtime?.givenNameTemplate || spec?.title || '',
        takenGivenNames(),
      ),
    [takenGivenNames],
  );
  const [runtimeName, setRuntimeName] = useState(() =>
    givenNameFor(environments[0]),
  );
  // Whether the runtim name has been changed by the user or not
  const [hasCustomRuntimeName, setHasCustomRuntimeName] = useState(false);
  const [homeFolder, setHomeFolder] = useState(false);
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
  const isLocalSelection = selection.startsWith(LOCAL_PREFIX);
  const spec = useMemo(
    () => environments.find(spec => spec.name === selection),
    [environments, selection],
  );
  const description = spec?.description ?? '';
  const burningRate = spec?.burning_rate ?? 1;
  // The arithmetic the picker asks too — one copy for both, see the module.
  const allowance = useNewCodeSandboxAllowance(burningRate);
  const effectiveMaxMinutes = allowance.effectiveMaxMinutes;
  const outOfCredits = shouldStartRuntime && allowance.outOfCredits;
  const handleSelectionChange = useCallback(
    (value: string) => {
      setSelection(value);
      if (!hasCustomRuntimeName) {
        const local = localSpecOf(value);
        setRuntimeName(
          givenNameFor(local ?? environments.find(env => env.name === value)),
        );
      }
    },
    [environments, givenNameFor, setSelection, hasCustomRuntimeName],
  );
  const handleSubmitRuntime = useCallback(async () => {
    const localSpec = localSpecOf(selection);
    if (localSpec) {
      /*
       * A sandbox of this Jupyter Server: started here, named here.
       *
       * Nothing to reserve, no credits to weigh, no pod to wait for — the
       * kernel is started and the choice is handed back as any other, with
       * the name the user gave it, which is the local answer to `given_name`.
       */
      setError(undefined);
      const kernels =
        runtimesStore.getState().multiServiceManager?.local?.kernels;
      if (!kernels) {
        setError(<>The Jupyter Server of this page is not reachable.</>);
        return;
      }
      setWaitingForRuntime(true);
      try {
        const connection = await kernels.startNew({ name: localSpec.name });
        setCodeSandboxGivenName(connection.id, runtimeName);
        onSubmit({
          kernelId: connection.id,
          name: localSpec.name,
          language: localSpec.language ?? '',
          location: 'local',
          displayName:
            getCodeSandboxGivenName(connection.id) ?? localSpec.title,
        } as IRuntimeDesc);
      } catch (reason) {
        console.warn('Failed to start a code sandbox of this server.', reason);
        setError(<>The code sandbox could not be started.</>);
      } finally {
        if (isMounted()) {
          setWaitingForRuntime(false);
        }
      }
      return;
    }
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
      const creditsLimit = creditsLimitFor(timeLimit, burningRate);
      desc.params = {};
      if (startRuntime === 'defer') {
        desc.params['creditsLimit'] = creditsLimit;
      }
      if (homeFolder) {
        desc.params['capabilities'] = ['home-folder'];
      }
      let success = true;
      const provider = codeSandboxVariantOf((spec as any)?.owner);
      if (shouldStartRuntime && provider !== CodeSandboxVariant.Datalayer) {
        /*
         * An EXTERNAL environment — Kaggle, Modal. The platform RECORDS such
         * a sandbox rather than running it: the provider runs it under the
         * user's own credentials, and what comes back is a record with no
         * pod, no ingress and no kernel. Waiting for one, as the branch
         * below does, would time out and then delete the record as broken.
         */
        success = false;
        try {
          await createRuntimeRecord({
            environmentName: selection,
            type: 'notebook',
            givenName: runtimeName,
            creditsLimit,
          });
          await manager.runtimesManager.refresh();
          success = true;
        } catch (error) {
          console.error('Failed to record the external sandbox.', error);
          setFlashLevel('danger');
          setError(
            <Text>
              The {codeSandboxVariantTitle(provider)} sandbox could not be
              created.
            </Text>,
          );
        } finally {
          setWaitingForRuntime(false);
        }
      } else if (shouldStartRuntime) {
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
                capabilities: homeFolder ? ['home-folder'] : undefined,
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
    // `localSpecOf` closes over `localSpecs`, which is built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    manager,
    selection,
    startRuntime,
    runtimeName,
    onSubmit,
    homeFolder,
    openExample,
    jupyterLabAdapter,
    timeLimit,
    shouldStartRuntime,
    isMounted,
  ]);
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
          {/*
            Every entry says whose machine it is: the environments of the
            platform and of the external providers by their owner tag, the
            kernelspecs of this server as the jupyter-server provider — one
            rule, since two entries called "GPU" are told apart by nothing
            else. An ActionMenu rather than a native select: the name of the
            environment and its provider read as LABELS, which no <option>
            can carry.
          */}
          {/*
            The one environment control of the application, shared with the
            picker: the trigger reads like the rows, name left and labels
            right, and neither place can drift from the other.
          */}
          <CodeSandboxEnvironmentSelect
            disabled={
              !!kernelSnapshot?.environment || environments.length === 0
            }
            options={environmentOptions}
            selectedKey={selection}
            onSelect={handleSelectionChange}
          />
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
        <NewCodeSandboxControls
          // A sandbox of this server costs nothing and starts at once: it has
          // no time to reserve and no storage of the platform to mount.
          withReservation={!!startRuntime && !isLocalSelection}
          withHomeFolder={!isLocalSelection}
          burningRate={burningRate}
          timeLimit={timeLimit}
          onTimeChange={setTimeLimit}
          max={effectiveMaxMinutes}
          // Nothing to reserve or store until an environment is chosen.
          disabled={outOfCredits || !selection}
          storageDisabled={!selection}
          error={
            outOfCredits ? 'You must add credits to your account.' : undefined
          }
          addCredits={
            navigate
              ? () => {
                  navigate!(usageRoute);
                }
              : undefined
          }
          homeFolder={homeFolder}
          onHomeFolderToggle={() => setHomeFolder(current => !current)}
        />
        <FormControl sx={{ paddingTop: '10px' }}>
          <FormControl.Label>Given Name</FormControl.Label>
          <TextInput
            name="name"
            value={runtimeName}
            onChange={handleKernelNameChange}
            // A sandbox is named only once there is one to name.
            disabled={!selection}
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
