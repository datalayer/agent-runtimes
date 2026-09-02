/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { JSX } from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactElement,
  ReactNode,
} from 'react';
import { ISessionContext } from '@jupyterlab/apputils';
import { ITranslator } from '@jupyterlab/translation';
import { nullTranslator } from '@jupyterlab/translation';
//import { kernelIcon } from '@jupyterlab/ui-components';
import {
  ActionList,
  ActionMenu,
  IconButton,
  Text,
  RadioGroup,
  Radio,
  FormControl,
  LabelGroup,
  Label,
} from '@primer/react';
import CloudUploadIcon from '@datalayer/icons-react/data1/CloudUploadIcon';
import { Box } from '@datalayer/primer-addons';
import { CpuIcon } from '@primer/octicons-react';
import { BrowserIcon, LaptopSimpleIcon } from '@datalayer/icons-react';
import { CreditsIndicator } from '../progress';
import { IRuntimeDesc } from '../../models';
import {
  isRuntimeRemote,
  type IDatalayerSessionContext,
  type IMultiServiceManager,
  type IRuntimeOptions,
} from '../../runtimes';
import { useIAMStore } from '../../state/substates';
import {
  getGroupedCodeSandboxDescs,
  IDatalayerCodeSandboxDesc,
} from './CodeSandboxUtils';
import type { CodeSandboxTransfer } from './CodeSandboxTransfer';
import {
  listCodeSandboxGivenNames,
  nextCodeSandboxGivenName,
} from './CodeSandboxNames';
import { codeSandboxVariantTitle } from '../../models/CodeSandboxVariant';
import {
  creditsLimitFor,
  NewCodeSandboxControls,
  useNewCodeSandboxAllowance,
} from './NewCodeSandboxControls';
import {
  CodeSandboxVariables,
  useCodeSandboxVariablesTransfer,
} from './CodeSandboxVariables';
import {
  CodeSandboxEnvironmentSelect,
  type ICodeSandboxEnvironmentOption,
} from './CodeSandboxEnvironmentSelect';

/**
 * Maximal runtime display name length after which it is trimmed.
 */
const RUNTIME_DISPLAY_NAME_MAX_LENGTH = 25;

type Height = 'large';

type Width = 'auto' | 'small';

type IDisplayMode = 'menu' | 'radio' | 'dropdown';

/**
 * Whether the choice is a sandbox that ALREADY RUNS.
 *
 * A running one is named by its kernel, or — where it runs at an external
 * provider and has no kernel of this platform — by its pod. An environment
 * to start a new one in has neither. Told apart by the kernel alone, every
 * Kaggle and Modal sandbox read as an environment: they were offered under
 * "Assign a new Code Sandbox" and never among the ones already running.
 */
function isRunningSandbox(desc: IRuntimeDesc): boolean {
  return !!desc.kernelId || !!desc.runtimeName;
}

/** How a sandbox is identified among the choices; see `dropdownDescs`. */
function codeSandboxDescKey(desc: IRuntimeDesc): string {
  // The runtime uid, then the pod, stands in for the kernel of a sandbox that
  // does not have one yet. Without that identity all Daytona sandboxes of the
  // same environment answer to one key.
  return `${desc.location}:${desc.kernelId ?? desc.id ?? desc.runtimeName ?? desc.name}`;
}

/** The identifier shown beside a running sandbox. */
function codeSandboxDisplayId(desc: IRuntimeDesc): string | undefined {
  return desc.kernelId ?? desc.id ?? desc.runtimeName;
}

/** Whether two descriptions refer to the same choice. */
function isSameCodeSandbox(
  left: IRuntimeDesc,
  right: IRuntimeDesc | undefined,
): boolean {
  if (!right) {
    return false;
  }
  if (left.runtimeName && right.runtimeName) {
    return left.runtimeName === right.runtimeName;
  }
  const sameLocation =
    left.location === right.location ||
    (isRuntimeRemote(left.location) && isRuntimeRemote(right.location));
  return sameLocation && codeSandboxDescKey(left) === codeSandboxDescKey(right);
}

/**
 * {@link CodeSandboxPicker} properties
 */
export interface ICodeSandboxPickerProps {
  /**
   * The display mode.
   */
  display: IDisplayMode;
  /**
   * Where the sandboxes that ALREADY RUN are offered, in the `dropdown`
   * display.
   *
   * `separated`, the default: as radio buttons of their own, above a
   * dropdown that then offers only the environments — so the dropdown reads
   * as "start a new one" and the running sandboxes are all in sight, which
   * is what picking one of them is usually about.
   *
   * `combined`: everything in the one dropdown, running sandboxes and
   * environments alike, under their headings.
   */
  sandboxLayout?: 'separated' | 'combined';
  /**
   * Additional actions items to be placed at the top of the picker
   */
  preActions?: ReactNode;
  /**
   * Additional actions items to be placed at the bottom of the picker
   */
  postActions?: ReactNode;
  /**
   * Whether the picker is disabled or not.
   */
  disabled?: boolean;
  /**
   * Runtime description passing this filter function will be displayed.
   */
  filterRuntime?: (desc: IRuntimeDesc) => boolean;
  /**
   * Session preference.
   */
  preference?: {
    id?: string;
    kernelDisplayName?: string;
    language?: string;
    location?: string;
  };
  /**
   * The sandbox shown as chosen.
   *
   * Given with {@link setRuntimeDesc}, the choice belongs to the host — a
   * cell keeps it in its metadata. Omitted, the picker holds it itself and
   * reports it through {@link onTransferChange}, which is what a dialog with
   * no state of its own needs.
   */
  runtimeDesc?: IRuntimeDesc;
  /**
   * Set runtime description.
   */
  setRuntimeDesc?: (desc?: IRuntimeDesc) => void;
  /**
   * Document session context.
   */
  sessionContext?: ISessionContext;
  /**
   * Application service manager
   */
  multiServiceManager: IMultiServiceManager;
  /**
   * Application translator.
   */
  translator?: ITranslator;
  /**
   * Change the look depending on the menu integration.
   */
  variant?: 'document' | 'cell';
  /**
   * Whether the questions of a NEW sandbox are asked below the list.
   *
   * They are the launcher's own — see `NewCodeSandboxControls` — and only
   * concern a sandbox that does not run yet.
   */
  withNewSandboxControls?: boolean;
  /**
   * Whether the variables of the current sandbox may be carried to the
   * chosen one, when both speak a language the snippets can serialize.
   */
  withVariablesTransfer?: boolean;
  /**
   * Called with the answer a dialog would return: the sandbox to assign and
   * the variables to carry over.
   *
   * The sandbox is named the way the callers start it: `remote-` and
   * `browser-` prefix an environment to start one in, a local environment is
   * named by its specification alone, and `id` names one that already runs.
   */
  onTransferChange?: (transfer: CodeSandboxTransfer) => void;
}

/**
 * The picker of a code sandbox: what runs already, and what could run.
 */
export function CodeSandboxPicker(
  props: ICodeSandboxPickerProps,
): ReactElement {
  const {
    disabled,
    display,
    filterRuntime,
    multiServiceManager,
    onTransferChange,
    postActions,
    sandboxLayout = 'separated',
    preActions,
    preference,
    sessionContext,
    translator,
    variant,
    withNewSandboxControls,
    withVariablesTransfer,
  } = props;
  /*
   * The choice, held here when the host does not hold it.
   *
   * A cell keeps its sandbox in its metadata and passes both the value and
   * the setter; a dialog has nowhere to keep it, so the picker does.
   */
  const isControlled = props.setRuntimeDesc !== undefined;
  const [ownRuntimeDesc, setOwnRuntimeDesc] = useState<IRuntimeDesc>();
  const runtimeDesc = isControlled ? props.runtimeDesc : ownRuntimeDesc;
  const setRuntimeDesc = useCallback(
    (desc?: IRuntimeDesc): void => {
      if (!isControlled) {
        setOwnRuntimeDesc(desc ? { ...desc } : undefined);
      }
      props.setRuntimeDesc?.(desc);
    },
    [isControlled, props.setRuntimeDesc],
  );
  const [groupedRuntimeDescs, setGroupedRuntimeDescs] = useState<
    { [k: string]: IDatalayerCodeSandboxDesc[] } | undefined
  >(
    getGroupedCodeSandboxDescs(
      multiServiceManager,
      preference?.id,
      translator,
      filterRuntime,
      variant,
    ),
  );
  /*
   * The same choices the radio column lists, as options of the dropdown.
   *
   * Keyed the way the radio column keys its rows — where the sandbox runs
   * and which one it is — because a kernel already running and an
   * environment to start one in are told apart by nothing else: two
   * sandboxes of one environment share a name.
   */
  const dropdownDescs = useMemo(() => {
    const byKey = new Map<string, IDatalayerCodeSandboxDesc>();
    Object.values(groupedRuntimeDescs ?? {}).forEach(descs =>
      descs.forEach(desc => byKey.set(codeSandboxDescKey(desc), desc)),
    );
    return byKey;
  }, [groupedRuntimeDescs]);
  const dropdownOptions = useMemo(
    (): ICodeSandboxEnvironmentOption[] =>
      Object.entries(groupedRuntimeDescs ?? {}).flatMap(([group, descs]) =>
        descs.map(desc => ({
          key: codeSandboxDescKey(desc),
          title: desc.displayName ?? desc.name,
          name: desc.name,
          providerTitle: desc.provider
            ? codeSandboxVariantTitle(desc.provider)
            : undefined,
          location: desc.location,
          burningRate: desc.burningRate,
          gpu: desc.gpu,
          group,
        })),
      ),
    [groupedRuntimeDescs],
  );
  /**
   * The sandboxes as a column of radio buttons, group by group.
   *
   * Shared by the two layouts that show one: the whole list in the `radio`
   * display, and the sandboxes that ALREADY RUN in the separated dropdown
   * display, where the dropdown is left to the environments a new one is
   * started in.
   */
  /*
   * A sandbox that already runs is told from an environment by its KERNEL:
   * a running one has one, an environment to start one in has none. Read
   * from the data rather than from the heading, which is translated.
   */
  const runningEntries = useMemo(
    (): [string, IDatalayerCodeSandboxDesc[]][] =>
      Object.entries(groupedRuntimeDescs ?? {})
        .map(([group, descs]): [string, IDatalayerCodeSandboxDesc[]] => [
          group,
          descs.filter(isRunningSandbox),
        ])
        .filter(([, descs]) => descs.length > 0),
    [groupedRuntimeDescs],
  );
  const environmentOnlyOptions = useMemo(
    () =>
      dropdownOptions
        .filter(option => {
          const desc = dropdownDescs.get(option.key);
          return !desc || !isRunningSandbox(desc);
        })
        // The running sandboxes are the radio column beside this; the dropdown
        // then lists only environments to start, so it needs no group heading
        // of its own ("Assign a new Code Sandbox" already labels the control).
        .map(option => ({ ...option, group: undefined })),
    [dropdownDescs, dropdownOptions],
  );

  const radioSections = (
    entries: [string, IDatalayerCodeSandboxDesc[]][],
  ): JSX.Element => (
    <RadioGroup name="kernel-options" aria-labelledby="kernel-options">
      {entries.map(([group, runtimeDescs]) => (
        <Box key={group}>
          <Box
            as="h4"
            sx={{
              /*
               * The type of a form label, not of a heading.
               *
               * "Assign an existing Code Sandbox" and "Assign a
               * new Code Sandbox" name the two ways of answering
               * one question, and the second is the label of the
               * dropdown; set in the larger, heavier type of an
               * `h4`, the first read as a section above it rather
               * than as its pair. The values are the ones Primer
               * gives `FormControl.Label` — taken as the variables
               * it resolves rather than through the Primer scale,
               * whose `semibold` the JupyterLab theme redefines.
               */
              margin: 0,
              marginBottom: 2,
              color: 'fg.default',
              fontSize: 'var(--text-body-size-medium, 0.875rem)',
              fontWeight: 'var(--base-text-weight-semibold, 600)',
            }}
          >
            {group}
          </Box>
          {runtimeDescs.map(k => {
            const choiceKey = codeSandboxDescKey(k);
            const displayId = codeSandboxDisplayId(k);
            return (
              // A kernel identifies a runtime that already runs; an
              // environment to start one in has none, and is named
              // by where it runs and what it runs.
              <Box key={choiceKey} title={k.name}>
                <FormControl>
                  <Radio
                    value={choiceKey}
                    onChange={() => {
                      setRuntimeDesc(k);
                    }}
                    checked={isSameCodeSandbox(k, runtimeDesc)}
                  />
                  <FormControl.Label>
                    <Box display="flex" sx={{ alignItems: 'baseline' }}>
                      <Box>{k.displayName}</Box>
                      {/*
                                  The identifier of the kernel beside the name:
                                  two sandboxes of the same environment read
                                  alike, and this is what tells them apart.
                                  Quieter than the name, which is what is being
                                  chosen.
                                */}
                      {displayId && (
                        <Text
                          sx={{
                            ml: 2,
                            fontSize: 0,
                            color: 'fg.muted',
                            fontFamily: 'mono',
                          }}
                          title={displayId}
                        >
                          {displayId.slice(0, 8)}
                        </Text>
                      )}
                      {k.kernelId && k.location === 'remote' && (
                        <Box ml={3} mt={1}>
                          <CreditsIndicator
                            key="credits-indicator"
                            kernelId={k.kernelId}
                            serviceManager={multiServiceManager.remote!}
                          />
                        </Box>
                      )}
                    </Box>
                  </FormControl.Label>
                  <FormControl.Caption>
                    <LabelGroup sx={{ marginTop: 1 }}>
                      <Label variant="secondary">{k.name}</Label>
                      {(k as IDatalayerCodeSandboxDesc).provider && (
                        <Label variant="accent" sx={{ marginLeft: 1 }}>
                          {codeSandboxVariantTitle(
                            (k as IDatalayerCodeSandboxDesc).provider!,
                          )}
                        </Label>
                      )}
                      <Label variant="secondary" sx={{ marginLeft: 1 }}>
                        {k.location}
                      </Label>
                      {k.burningRate && (
                        <Label variant="sponsors" sx={{ marginLeft: 1 }}>
                          {k.burningRate} credits/second
                        </Label>
                      )}
                      {k.gpu && (
                        <Label variant="success" sx={{ marginLeft: 1 }}>
                          GPU
                        </Label>
                      )}
                    </LabelGroup>
                  </FormControl.Caption>
                </FormControl>
                <ActionList.Divider />
              </Box>
            );
          })}
        </Box>
      ))}
    </RadioGroup>
  );

  const trans = useMemo(
    () => (translator ?? nullTranslator).load('jupyterlab'),
    [translator],
  );
  const [defaultSet, setDefaultSet] = useState(false);
  const [remoteModelsReady, setRemoteModelsReady] = useState(
    !multiServiceManager.remote,
  );
  // Trick because overflow is an unknown prop of ActionMenu.Overlay.
  const overlayProps = {
    maxHeight: 'large' as Height,
    width: (variant === 'cell' ? 'small' : 'auto') as Width,
  };
  useEffect(() => {
    let disposed = false;
    const updateGroupedRuntimeDescs = () => {
      if (disposed) {
        return;
      }
      setGroupedRuntimeDescs(
        getGroupedCodeSandboxDescs(
          multiServiceManager,
          preference?.id,
          translator,
          filterRuntime,
          variant,
        ),
      );
    };

    const refreshRuntimeModels =
      multiServiceManager.remote?.runtimesManager.refreshRuntimeModels?.();
    if (refreshRuntimeModels) {
      refreshRuntimeModels
        .catch(reason => {
          console.error(
            'Failed to resolve remote runtimes for the runtime picker.',
            reason,
          );
        })
        .finally(() => {
          if (disposed) {
            return;
          }
          updateGroupedRuntimeDescs();
          setRemoteModelsReady(true);
        });
    } else {
      setRemoteModelsReady(true);
    }

    // Recompute immediately in case a runtime changed between the initial
    // render and connecting the manager signals.
    updateGroupedRuntimeDescs();

    multiServiceManager.browser?.kernels.runningChanged.connect(
      updateGroupedRuntimeDescs,
    );
    multiServiceManager.browser?.kernelspecs.specsChanged.connect(
      updateGroupedRuntimeDescs,
    );
    multiServiceManager.browser?.sessions.runningChanged.connect(
      updateGroupedRuntimeDescs,
    );
    multiServiceManager.local.kernels.runningChanged.connect(
      updateGroupedRuntimeDescs,
    );
    multiServiceManager.local.kernelspecs.specsChanged.connect(
      updateGroupedRuntimeDescs,
    );
    multiServiceManager.local.sessions.runningChanged.connect(
      updateGroupedRuntimeDescs,
    );
    multiServiceManager.remote?.runtimesManager.changed.connect(
      updateGroupedRuntimeDescs,
    );
    multiServiceManager.remote?.environments.changed.connect(
      updateGroupedRuntimeDescs,
    );

    return () => {
      disposed = true;
      multiServiceManager.browser?.kernels.runningChanged.disconnect(
        updateGroupedRuntimeDescs,
      );
      multiServiceManager.browser?.kernelspecs.specsChanged.disconnect(
        updateGroupedRuntimeDescs,
      );
      multiServiceManager.browser?.sessions.runningChanged.disconnect(
        updateGroupedRuntimeDescs,
      );
      multiServiceManager.local.kernels.runningChanged.disconnect(
        updateGroupedRuntimeDescs,
      );
      multiServiceManager.local.kernelspecs.specsChanged.disconnect(
        updateGroupedRuntimeDescs,
      );
      multiServiceManager.local.sessions.runningChanged.disconnect(
        updateGroupedRuntimeDescs,
      );
      multiServiceManager.remote?.runtimesManager.changed.disconnect(
        updateGroupedRuntimeDescs,
      );
      multiServiceManager.remote?.environments.changed.disconnect(
        updateGroupedRuntimeDescs,
      );
    };
  }, [multiServiceManager, preference?.id, translator, filterRuntime, variant]);
  /*
   * The sandbox the session already runs on, shown as chosen.
   *
   * Preferably the very row of the list, so the choice is visibly one of
   * them. A session whose sandbox is not listed — the list may leave the
   * current one out, and the remote ones land late — is named from the
   * specifications instead, so the picker still opens on what is running
   * rather than on nothing.
   */
  useEffect(() => {
    if (defaultSet) {
      return;
    }
    if (sessionContext && groupedRuntimeDescs) {
      const kernelId = sessionContext.session?.kernel?.id;
      /*
       * An external sandbox is bound by its POD, not a kernel of this platform.
       *
       * Its descriptor carries the pod and — until a kernel of the platform is
       * ever attached — an empty kernel id, and the session it binds stands on
       * the pod as its `location`. Matching only on the kernel id therefore
       * missed it: the picker fell back to the local kernel the notebook never
       * ran on, opening on "Python 3" while the toolbar rightly showed the
       * sandbox. So the current sandbox is matched on the pod as well, and the
       * remote descriptors — which arrive late — are waited for before the
       * choice is allowed to settle on anything else.
       */
      const location = (sessionContext as IDatalayerSessionContext).location;
      const remoteBound = !!location && isRuntimeRemote(location);
      const matchesCurrent = (desc: IDatalayerCodeSandboxDesc): boolean =>
        (!!kernelId && desc.kernelId === kernelId) ||
        (!!desc.runtimeName && !!location && desc.runtimeName === location);
      if (kernelId || remoteBound) {
        if (remoteBound && !remoteModelsReady) {
          return;
        }
        let matched = false;
        Object.values(groupedRuntimeDescs).forEach(runtimeDescs => {
          runtimeDescs.forEach(runtimeDesc => {
            if (matchesCurrent(runtimeDesc)) {
              matched = true;
              setRuntimeDesc(runtimeDesc);
            }
          });
        });
        if (!matched && kernelId) {
          if (!remoteModelsReady) {
            return;
          }
          const kernelName = sessionContext.session?.kernel?.name;
          const spec = kernelName
            ? sessionContext.specsManager.specs?.kernelspecs[kernelName]
            : undefined;
          if (spec) {
            setRuntimeDesc({
              name: spec.name,
              kernelId,
              language: spec.language,
              displayName: sessionContext.kernelDisplayName,
              location: location ?? 'local',
              runtimeName: remoteBound ? location : undefined,
            });
          }
        }
      } else if (display === 'dropdown') {
        /*
         * Nothing assigned: the FIRST environment stands as the choice.
         *
         * A dropdown that opens on "Select an environment" reads as a
         * question already answered — the control looks filled — and the
         * dialog assigns nothing when it is accepted. A column of radio
         * buttons shows its emptiness plainly and is left alone. The list
         * must be settled first, or the choice would land on a local
         * kernelspec and move when the remote environments arrive.
         */
        if (!remoteModelsReady) {
          return;
        }
        const first = Object.values(groupedRuntimeDescs).flat()[0];
        if (first) {
          setRuntimeDesc(first);
        }
      }
    }
    setDefaultSet(true);
  }, [
    defaultSet,
    display,
    groupedRuntimeDescs,
    remoteModelsReady,
    sessionContext,
    setRuntimeDesc,
  ]);

  /*
   * What a NEW sandbox costs, and the answer the host is given.
   *
   * Only asked when the host wants them: a cell picking among the sandboxes
   * that already run has neither a reservation to make nor an answer to
   * shape. The arithmetic is the launcher's, from its own module.
   */
  const { refreshCredits } = useIAMStore();
  const [timeLimit, setTimeLimit] = useState<number>(10);
  /*
   * The name a new sandbox is given.
   *
   * Offered from what was picked — the environment or the specification —
   * numbered against the sandboxes that already carry that name, and written
   * into the description so whoever creates the sandbox creates it named:
   * `given_name` for a runtime of the platform, the name held beside a kernel
   * of a server. Re-offered whenever another thing is picked, and left alone
   * while the user edits it.
   */
  const [givenName, setGivenName] = useState('');
  const givenNameFor = useRef<string | undefined>(undefined);
  const [homeFolder, setHomeFolder] = useState(false);
  const asksForNewSandbox = withNewSandboxControls || !!onTransferChange;
  useEffect(() => {
    if (asksForNewSandbox) {
      refreshCredits();
    }
  }, [asksForNewSandbox]);
  const resolvedBurningRate =
    runtimeDesc?.burningRate ??
    multiServiceManager.remote?.environments
      .get()
      .find(env => env.name === runtimeDesc?.name)?.burning_rate;
  const allowance = useNewCodeSandboxAllowance(resolvedBurningRate);
  // New means an environment to start, not a sandbox already running. An
  // external sandbox runs with a pod but no kernel of its own, so keying
  // "new" on the kernel alone misread it as new — and a new remote sandbox
  // the account cannot yet price is answered with nothing, which is why
  // assigning an existing Daytona did nothing.
  const isNewSandbox = !!runtimeDesc && !isRunningSandbox(runtimeDesc);
  // Offer a name for what was just picked, and leave it alone afterwards: the
  // key is the thing picked, so re-picking the same one keeps what was typed.
  const pickedKey = isNewSandbox
    ? `${runtimeDesc?.location}:${runtimeDesc?.name}`
    : undefined;
  useEffect(() => {
    if (!pickedKey || givenNameFor.current === pickedKey) {
      return;
    }
    givenNameFor.current = pickedKey;
    const taken = [
      ...(multiServiceManager.remote?.runtimesManager
        .get()
        .map(runtime => runtime.given_name)
        .filter(Boolean) ?? []),
      ...listCodeSandboxGivenNames(),
    ];
    setGivenName(
      nextCodeSandboxGivenName(runtimeDesc?.displayName ?? '', taken),
    );
  }, [multiServiceManager, pickedKey, runtimeDesc?.displayName]);
  const effectiveMaxMinutes =
    runtimeDesc?.location === 'remote'
      ? allowance.effectiveMaxMinutes
      : Math.max(1, allowance.maxFromCredits ?? -1);
  const outOfCredits =
    allowance.hasKnownCredits &&
    allowance.hasKnownRunAllowance &&
    !allowance.hasRemainingRuns &&
    (allowance.maxFromCredits ?? -1) < Number.EPSILON;
  const variables = useCodeSandboxVariablesTransfer(
    sessionContext,
    runtimeDesc,
    withVariablesTransfer,
  );
  const selectedVariables = variables.selected;
  useEffect((): void => {
    if (!onTransferChange) {
      return;
    }
    const maxMinutes =
      runtimeDesc?.location === 'remote' ? allowance.maxFromCredits : undefined;
    const effectiveTimeLimit =
      runtimeDesc?.location === 'remote'
        ? Math.max(
            1,
            Math.min(timeLimit, maxMinutes && maxMinutes > 0 ? maxMinutes : 10),
          )
        : timeLimit;
    const creditsLimit =
      runtimeDesc?.location === 'remote' && resolvedBurningRate
        ? creditsLimitFor(effectiveTimeLimit, resolvedBurningRate)
        : undefined;
    // A new remote sandbox that the account cannot pay for is no answer at
    // all: the dialog is left with nothing to assign rather than with a
    // start that would be refused.
    if (isNewSandbox && runtimeDesc?.location === 'remote') {
      if (!resolvedBurningRate || !Number.isFinite(resolvedBurningRate)) {
        onTransferChange({ runtime: null, selectedVariables });
        return;
      }
      if (
        allowance.hasKnownCredits &&
        allowance.hasKnownRunAllowance &&
        !allowance.hasRemainingRuns &&
        (!creditsLimit || creditsLimit <= 0)
      ) {
        onTransferChange({ runtime: null, selectedVariables });
        return;
      }
    }
    onTransferChange({
      runtime: runtimeDesc
        ? ({
            environmentName: ['browser', 'remote'].includes(
              runtimeDesc.location,
            )
              ? `${runtimeDesc.location}-${runtimeDesc.name}`
              : runtimeDesc.name,
            id: runtimeDesc.kernelId,
            // The pod names a sandbox that has no kernel of its own — an
            // external one — so the session can bind it through the proxy.
            runtime_name: runtimeDesc.runtimeName,
            // The name the sandbox is given, carried with the choice.
            //
            // Everything else about the pick travelled in this object and the
            // name did not, so whoever created the sandbox had nothing to name
            // it with and fell back to the kernelspec: the launcher honoured
            // what was typed, the picker silently dropped it.
            //
            // Two readers, two fields: a sandbox of a server is named from
            // `displayName`, a runtime of the platform is started with
            // `givenName`. A new remote sandbox — a Daytona among them — read
            // the second, which nothing filled, and came up "Code Sandbox".
            // Both carry the name now: what the user typed, or the title of the
            // environment it runs.
            displayName: runtimeDesc.displayName,
            givenName: givenName || runtimeDesc.displayName,
            creditsLimit,
            capabilities: homeFolder ? ['home-folder'] : undefined,
          } satisfies Partial<
            Omit<IRuntimeOptions, 'kernelType'> & {
              id: string;
              displayName: string;
              runtime_name: string;
            }
          > | null)
        : null,
      selectedVariables,
    });
  }, [
    allowance,
    givenName,
    isNewSandbox,
    onTransferChange,
    resolvedBurningRate,
    runtimeDesc,
    selectedVariables,
    timeLimit,
    homeFolder,
  ]);
  // For cell using submenu instead of group would be nice unfortunately the feature
  // is not yet implemented in the component there has been a not-great demo story.
  // https://github.com/primer/react/pull/3585
  return (
    <>
      {display === 'menu' ? (
        /*
         * Section for Menu display.
         */
        <ActionMenu>
          {variant === 'cell' ? (
            <ActionMenu.Anchor>
              <IconButton
                disabled={disabled || groupedRuntimeDescs === null}
                //                icon={() => <kernelIcon.react className="dla-Cell-runtime-icon" tag={'span'} />}
                icon={() => (
                  <span className="dla-Cell-runtime-icon">
                    <CpuIcon />
                  </span>
                )}
                aria-label={trans.__('Assign a Runtime to the Cell.')}
                title={trans.__('Assign a Runtime to the Cell.')}
                size="small"
                variant="invisible"
              />
            </ActionMenu.Anchor>
          ) : (
            <ActionMenu.Button
              variant="default"
              disabled={disabled || groupedRuntimeDescs === null}
            >
              <Text fontWeight={'bold'}>{trans.__('Runtime:')}</Text>
              {' ' + (runtimeDesc?.displayName ?? trans.__('No Runtime'))}
            </ActionMenu.Button>
          )}
          <ActionMenu.Overlay
            {...overlayProps}
            width="medium"
            sx={{ overflowY: 'auto' }}
            side={variant === 'cell' ? 'outside-left' : 'outside-right'}
          >
            <ActionList selectionVariant="single">
              {/* variant === 'document' &&
                <ActionList.Item key={'null'} selected={null === selection} onSelect={() => {setRuntimeDesc(null);}}>
                    {trans.__('No Runtime')}
                </ActionList.Item>
              */}
              {variant === 'cell' && (
                <ActionList.Item
                  key={'null'}
                  selected={runtimeDesc === undefined}
                  onSelect={() => {
                    setRuntimeDesc(undefined);
                  }}
                >
                  {preference?.location && (
                    <ActionList.LeadingVisual>
                      {preference.location === 'local' ? (
                        <LaptopSimpleIcon />
                      ) : preference.location === 'browser' ? (
                        <BrowserIcon />
                      ) : (
                        <CloudUploadIcon />
                      )}
                    </ActionList.LeadingVisual>
                  )}
                  {trans.__('Assign the Notebook Runtime')}
                </ActionList.Item>
              )}
              {!!preActions && preActions}
              {Object.entries(groupedRuntimeDescs ?? {}).map(
                ([group, runtimeDescs]) => (
                  <ActionList.Group key={group}>
                    <ActionList.GroupHeading>{group}</ActionList.GroupHeading>
                    {runtimeDescs.map(candidateRuntimeDesc => {
                      const choiceKey =
                        codeSandboxDescKey(candidateRuntimeDesc);
                      const annotation = candidateRuntimeDesc.runtimeName
                        ? ` - ${candidateRuntimeDesc.runtimeName.split('-', 2).reverse()[0]}`
                        : candidateRuntimeDesc.kernelId
                          ? ` - ${candidateRuntimeDesc.kernelId}`
                          : '';
                      const fullDisplayName =
                        (candidateRuntimeDesc.displayName ?? '') + annotation;
                      const displayName =
                        (candidateRuntimeDesc.displayName?.length ?? 0) >
                        RUNTIME_DISPLAY_NAME_MAX_LENGTH
                          ? candidateRuntimeDesc.displayName!.slice(
                              0,
                              RUNTIME_DISPLAY_NAME_MAX_LENGTH,
                            ) + '…'
                          : (candidateRuntimeDesc.displayName ?? '');
                      return (
                        <ActionList.Item
                          key={choiceKey}
                          title={fullDisplayName}
                          selected={isSameCodeSandbox(
                            candidateRuntimeDesc,
                            runtimeDesc,
                          )}
                          onSelect={() => {
                            setRuntimeDesc(candidateRuntimeDesc);
                          }}
                        >
                          <ActionList.LeadingVisual>
                            {candidateRuntimeDesc.location === 'local' ? (
                              <LaptopSimpleIcon />
                            ) : candidateRuntimeDesc.location === 'browser' ? (
                              <BrowserIcon />
                            ) : (
                              <CloudUploadIcon />
                            )}
                          </ActionList.LeadingVisual>
                          {displayName + annotation.slice(0, 10)}
                          {/*
                            The provider, stated beside the environment: two
                            entries called "GPU" are told apart by whose GPU
                            it is — Datalayer's, Kaggle's, this server's.
                          */}
                          <ActionList.TrailingVisual>
                            {candidateRuntimeDesc.name && (
                              <Label size="small" variant="secondary">
                                {candidateRuntimeDesc.name}
                              </Label>
                            )}{' '}
                            {(candidateRuntimeDesc as IDatalayerCodeSandboxDesc)
                              .provider && (
                              <Label size="small" variant="accent">
                                {codeSandboxVariantTitle(
                                  (
                                    candidateRuntimeDesc as IDatalayerCodeSandboxDesc
                                  ).provider!,
                                )}
                              </Label>
                            )}
                          </ActionList.TrailingVisual>
                        </ActionList.Item>
                      );
                    })}
                  </ActionList.Group>
                ),
              )}
              {!!postActions && (
                <>
                  <ActionList.Divider />
                  {postActions}
                </>
              )}
            </ActionList>
          </ActionMenu.Overlay>
        </ActionMenu>
      ) : display === 'dropdown' ? (
        /*
         * Section for the dropdown display.
         *
         * The same choices as the radio column, in the control the launcher
         * uses — one question asked one way. A list of nine environments is
         * nine rows of radio buttons before anything else on the dialog can
         * be read; closed, it is one line.
         */
        <>
          {defaultSet &&
            sandboxLayout === 'separated' &&
            runningEntries.length > 0 &&
            radioSections(runningEntries)}
          {defaultSet && (
            // Room below: the controls of a new sandbox follow, and the
            // toggle of the home folder sat against the dropdown.
            <FormControl sx={{ marginBottom: 4 }}>
              <FormControl.Label>
                {sandboxLayout === 'separated'
                  ? 'Assign a new Code Sandbox'
                  : 'Environment'}
              </FormControl.Label>
              <CodeSandboxEnvironmentSelect
                disabled={disabled}
                options={
                  sandboxLayout === 'separated'
                    ? environmentOnlyOptions
                    : dropdownOptions
                }
                selectedKey={
                  runtimeDesc ? codeSandboxDescKey(runtimeDesc) : undefined
                }
                onSelect={key => {
                  const chosen = dropdownDescs.get(key);
                  if (chosen) {
                    setRuntimeDesc(chosen);
                  }
                }}
              />
            </FormControl>
          )}
          {!!postActions && <>{postActions}</>}
        </>
      ) : (
        /*
         * Section for Radio display.
         */
        <>
          {defaultSet &&
            radioSections(Object.entries(groupedRuntimeDescs ?? {}))}
          {!!postActions && <>{postActions}</>}
        </>
      )}
      {withNewSandboxControls && isNewSandbox && (
        // The user asked for a NEW sandbox: the questions are the launcher's,
        // asked through the launcher's own controls. A sandbox of this page
        // or of this server reserves nothing, so only the time of a remote
        // one is asked for.
        <NewCodeSandboxControls
          withReservation={runtimeDesc?.location === 'remote'}
          burningRate={resolvedBurningRate}
          timeLimit={timeLimit}
          onTimeChange={setTimeLimit}
          max={effectiveMaxMinutes}
          disabled={outOfCredits}
          error={
            runtimeDesc?.location !== 'remote'
              ? undefined
              : outOfCredits && (allowance.maxFromCredits ?? -1) >= 0
                ? 'You must add credits to your account.'
                : timeLimit === 0
                  ? 'You must set a time limit.'
                  : undefined
          }
          givenName={givenName}
          onGivenNameChange={value => {
            setGivenName(value);
            if (runtimeDesc) {
              // The description is what the caller creates the sandbox from:
              // the name travels with it, rather than beside it.
              setRuntimeDesc({ ...runtimeDesc, displayName: value });
            }
          }}
          homeFolder={homeFolder}
          onHomeFolderToggle={() => setHomeFolder(current => !current)}
        />
      )}
      {variables.available && (
        <CodeSandboxVariables
          selectedVariables={variables.selected}
          setSelectVariable={variables.setSelected}
          transferVariables={variables.transfer}
          setTransferVariable={variables.setTransfer}
          kernelVariables={variables.variables}
          translator={translator}
        />
      )}
    </>
  );
}

export default CodeSandboxPicker;
