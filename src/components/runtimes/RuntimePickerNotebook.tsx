/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActionList } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ITranslator } from '@jupyterlab/translation';
import { JSONExt } from '@lumino/coreutils';
import { CommandRegistry } from '@lumino/commands';
import { KernelExecutor } from '@datalayer/jupyter-react';
import type {
  IRuntimeOptions,
  IMultiServiceManager,
  IDatalayerSessionContext,
} from '../../runtimes';
import { RuntimeSnippetsFacade } from '../../jupyter';
import { IRuntimeDesc } from '../../models';
import { ExternalTokenSilentLogin } from '@datalayer/core/lib/components/iam';
import { useIAMStore } from '../../state/substates';
import { RuntimeVariables } from './RuntimeVariables';
import { CodeSandboxPicker } from '../code-sandboxes/CodeSandboxPicker';
import {
  creditsLimitFor,
  NewCodeSandboxControls,
  useNewCodeSandboxAllowance,
} from '../code-sandboxes/NewCodeSandboxControls';
import { RuntimeTransfer } from './RuntimeTransfer';

/**
 * {@link RuntimePickerNotebook} properties
 */
export interface IRuntimePickerNotebookProps {
  /**
   * Callback to allow the user to login
   */
  logIn?: () => void;
  /**
   * Document session context
   */
  sessionContext: IDatalayerSessionContext;
  /**
   * Multi service manager
   */
  multiServiceManager: IMultiServiceManager;
  /**
   * Set the selected kernel
   */
  setValue: (v: RuntimeTransfer | Error) => void;
  /**
   * Close the dialog
   */
  close: () => void;
  /**
   * Command registry
   */
  commands: CommandRegistry;
  /**
   * Application translator
   */
  translator?: ITranslator;
}

/**
 * Runtime Picker components for a Notebook.
 */
export function RuntimePickerNotebook(
  props: IRuntimePickerNotebookProps,
): JSX.Element {
  const { multiServiceManager, sessionContext, setValue, translator } = props;
  const { refreshCredits, token } = useIAMStore();
  const [selectedRuntimeDesc, setSelectedRuntimeDesc] =
    useState<IRuntimeDesc>();
  const [timeLimit, setTimeLimit] = useState<number>(10);
  const [userStorage, setUserStorage] = useState(false);
  const [canTransferFrom, setTransferFrom] = useState<boolean>(false);
  const [canTransferTo, setTransferTo] = useState<boolean>(false);
  const [transferVariables, setTransferVariables] = useState<boolean>(false);
  const [hasLoadedVariables, setHasLoadedVariables] = useState<boolean>(false);
  const [kernelVariables, setRuntimeVariables] = useState<{
    [name: string]: string;
  }>();
  const [toTransfer, setToTransfer] = useState<string[]>([]);
  useEffect(() => {
    refreshCredits();
  }, []);
  useEffect(() => {
    const specs = sessionContext.specsManager.specs?.kernelspecs;
    if (sessionContext.session?.kernel?.name && specs) {
      const spec = Object.values(specs).find(
        spec => spec?.name === sessionContext.session!.kernel!.name,
      );
      if (spec) {
        setSelectedRuntimeDesc({
          name: spec.name,
          kernelId: sessionContext.session.kernel.id,
          location: (sessionContext as IDatalayerSessionContext).location,
          language: spec.language,
          displayName: sessionContext.kernelDisplayName,
        });
        setTransferFrom(RuntimeSnippetsFacade.supports(spec.language));
      }
    }
  }, [sessionContext]);
  const listRuntimeVariables = useCallback(async (): Promise<void> => {
    if (hasLoadedVariables) {
      return Promise.resolve();
    }
    setHasLoadedVariables(true);
    const connection = sessionContext.session!.kernel!;
    const spec =
      sessionContext.specsManager.specs!.kernelspecs[connection.model.name]!;
    const snippets = new RuntimeSnippetsFacade(spec.language);
    const outputs = await new KernelExecutor({ connection }).execute(
      snippets.listVariables(),
    );
    const content = outputs.get(0).data['text/plain'] as string;
    if (content) {
      setRuntimeVariables(
        JSON.parse(
          // We need to remove the quotes prior to parsing.
          content.slice(1, content.length - 1),
        ),
      );
      if (toTransfer.length) {
        const candidates = Object.keys(kernelVariables ?? {});
        setToTransfer(toTransfer.filter(n => candidates.includes(n)));
      } else {
        // By default select all variables.
        setToTransfer(Object.keys(kernelVariables ?? {}));
      }
    } else {
      setRuntimeVariables({});
    }
  }, [hasLoadedVariables, kernelVariables, toTransfer]);
  const setSelectedVariables = useCallback(
    (l: string[]): void => {
      if (!JSONExt.deepEqual(toTransfer, l)) {
        setToTransfer(l);
      }
    },
    [toTransfer],
  );
  const setTransferVariable = useCallback(
    (value: boolean): void => {
      if (transferVariables !== value) {
        if (value) {
          listRuntimeVariables().catch(error => {
            console.error('Failed to list the runtime variable', error);
            setHasLoadedVariables(false);
          });
        }
        setTransferVariables(value);
      }
    },
    [transferVariables],
  );
  const setRuntimeDesc = useCallback(
    (runtimeDesc?: IRuntimeDesc): void => {
      if (!runtimeDesc) {
        if (selectedRuntimeDesc) {
          setSelectedRuntimeDesc(undefined);
          setTransferTo(false);
        }
        return;
      }
      if (
        selectedRuntimeDesc?.displayName !== runtimeDesc.displayName ||
        selectedRuntimeDesc?.kernelId !== runtimeDesc.kernelId
      ) {
        setSelectedRuntimeDesc({ ...runtimeDesc });
        setTransferTo(RuntimeSnippetsFacade.supports(runtimeDesc.language));
      }
    },
    [selectedRuntimeDesc],
  );
  // The burning rate of the choice, and what the account allows for it —
  // the same one copy of the arithmetic the launcher uses.
  const resolvedBurningRate =
    selectedRuntimeDesc?.burningRate ??
    multiServiceManager.remote?.environments
      .get()
      .find(env => env.name === selectedRuntimeDesc?.name)?.burning_rate;
  const allowance = useNewCodeSandboxAllowance(resolvedBurningRate);
  useEffect((): void => {
    const maxMinutes =
      selectedRuntimeDesc?.location === 'remote'
        ? allowance.maxFromCredits
        : undefined;
    const effectiveTimeLimit =
      selectedRuntimeDesc?.location === 'remote'
        ? Math.max(
            1,
            Math.min(timeLimit, maxMinutes && maxMinutes > 0 ? maxMinutes : 10),
          )
        : timeLimit;
    const creditsLimit =
      selectedRuntimeDesc?.location === 'remote' && resolvedBurningRate
        ? creditsLimitFor(effectiveTimeLimit, resolvedBurningRate)
        : undefined;
    const requiresRuntimeStart =
      !!selectedRuntimeDesc && !selectedRuntimeDesc.kernelId;
    if (requiresRuntimeStart && selectedRuntimeDesc.location === 'remote') {
      if (!resolvedBurningRate || !Number.isFinite(resolvedBurningRate)) {
        setValue({ runtime: null, selectedVariables: toTransfer });
        return;
      }
      if (
        allowance.hasKnownCredits &&
        allowance.hasKnownRunAllowance &&
        !allowance.hasRemainingRuns &&
        (!creditsLimit || creditsLimit <= 0)
      ) {
        setValue({ runtime: null, selectedVariables: toTransfer });
        return;
      }
    }
    setValue({
      runtime: selectedRuntimeDesc
        ? ({
            environmentName: ['browser', 'remote'].includes(
              selectedRuntimeDesc.location,
            )
              ? `${selectedRuntimeDesc.location}-${selectedRuntimeDesc.name}`
              : selectedRuntimeDesc.name,
            id: selectedRuntimeDesc.kernelId,
            creditsLimit,
            capabilities: userStorage ? ['user_storage'] : undefined,
          } satisfies Partial<
            Omit<IRuntimeOptions, 'kernelType'> & { id: string }
          > | null)
        : null,
      selectedVariables: toTransfer,
    });
  }, [
    selectedRuntimeDesc,
    userStorage,
    toTransfer,
    timeLimit,
    multiServiceManager.remote,
    resolvedBurningRate,
    allowance,
  ]);
  const {
    kernelPreference: { canStart },
  } = sessionContext;
  const effectiveMaxMinutes =
    selectedRuntimeDesc?.location === 'remote'
      ? allowance.effectiveMaxMinutes
      : Math.max(1, allowance.maxFromCredits ?? -1);
  const outOfCredits =
    allowance.hasKnownCredits &&
    allowance.hasKnownRunAllowance &&
    !allowance.hasRemainingRuns &&
    (allowance.maxFromCredits ?? -1) < Number.EPSILON;
  return (
    <Box as="form" className="dla-Runtimes-picker">
      <Box sx={{ padding: 'var(--stack-padding-condensed) 0' }}>
        <CodeSandboxPicker
          display="radio"
          disabled={canStart === false}
          preference={{
            id: sessionContext.session?.id,
            kernelDisplayName: sessionContext.kernelPreference.shouldStart
              ? sessionContext.kernelDisplayName
              : undefined,
          }}
          sessionContext={sessionContext}
          multiServiceManager={multiServiceManager}
          translator={translator}
          runtimeDesc={selectedRuntimeDesc}
          setRuntimeDesc={setRuntimeDesc}
          postActions={
            token || !props.logIn ? (
              /*
            <Button
              variant="default"
              onClick={e => {
                e.preventDefault();
                commands.execute(CommandIDs.launchRemoteRuntime);
                close();
              }}
            >
              Launch a New Runtime
            </Button>
            */
              <></>
            ) : (
              <ActionList.Item
                onSelect={props.logIn}
                title={'Runtime Provider.'}
              >
                <ExternalTokenSilentLogin message="Click to sign in." />
              </ActionList.Item>
            )
          }
        />
      </Box>
      {!selectedRuntimeDesc?.kernelId &&
        selectedRuntimeDesc?.location === 'remote' && (
          // The user asked for a NEW sandbox: the questions are the
          // launcher's, asked through the launcher's own controls.
          <NewCodeSandboxControls
            burningRate={selectedRuntimeDesc.burningRate}
            timeLimit={timeLimit}
            onTimeChange={setTimeLimit}
            max={effectiveMaxMinutes}
            disabled={outOfCredits}
            error={
              outOfCredits && (allowance.maxFromCredits ?? -1) >= 0
                ? 'You must add credits to your account.'
                : timeLimit === 0
                  ? 'You must set a time limit.'
                  : undefined
            }
            userStorage={userStorage}
            onUserStorageToggle={() => setUserStorage(current => !current)}
          />
        )}
      {canTransferFrom && canTransferTo && (
        <RuntimeVariables
          selectedVariables={toTransfer}
          setSelectVariable={setSelectedVariables}
          transferVariables={transferVariables}
          setTransferVariable={setTransferVariable}
          kernelVariables={kernelVariables}
          translator={translator}
        />
      )}
    </Box>
  );
}

export default RuntimePickerNotebook;
