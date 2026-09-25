/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ISessionContext } from '@jupyterlab/apputils';
import { CodeCellModel, ICellModel } from '@jupyterlab/cells';
import type { IMarkdownParser, IRenderMime } from '@jupyterlab/rendermime';
import { nullTranslator } from '@jupyterlab/translation';
import { ActionList } from '@primer/react';
import { CloudUploadIcon } from '@datalayer/icons-react';
import type { ISnippet } from '../../models';
import { useCoreStore, useIAMStore } from '../../state/substates';
import { IRuntimeDesc } from '../../models';
import { isRuntimeRemote } from '../../runtimes';
import { RuntimeSnippetsFacade } from '../../jupyter';
import { ExternalTokenSilentLogin } from '@datalayer/core/lib/components/iam';
import { SnippetDialog } from '../../components/snippets/SnippetDialog';
import {
  CodeSandboxPicker,
  type ICodeSandboxPickerProps,
} from './CodeSandboxPicker';
import { CodeSandboxLauncher } from './CodeSandboxLauncher';
import { CodeSandboxCellVariablesDialog } from './CodeSandboxCellVariablesDialog';

/**
 * {@link CodeSandboxPickerCell} properties
 */
export type ICodeSandboxPickerCellProps = Pick<
  ICodeSandboxPickerProps,
  'multiServiceManager' | 'preference' | 'translator'
> & {
  /**
   * Callback to allow the user to login
   */
  logIn?: () => void;
  /**
   * Code cell model
   */
  model: CodeCellModel;
  /**
   * Document session context
   */
  sessionContext?: ISessionContext;
  /**
   * Markdown parser
   */
  markdownParser?: IMarkdownParser;
  /**
   * HTML sanitizer; if not provided the produced HTML will not be sanitized.
   */
  sanitizer?: IRenderMime.ISanitizer;
};

/**
 * Runtime picker component for a cell.
 */
export function CodeSandboxPickerCell(
  props: ICodeSandboxPickerCellProps,
): JSX.Element {
  const {
    logIn,
    markdownParser,
    model,
    preference,
    sanitizer,
    multiServiceManager,
    sessionContext,
    translator,
  } = props;
  const { token } = useIAMStore();
  const { configuration } = useCoreStore();
  const [isForeign, setIsForeign] = useState(false);
  const [hasCellRuntime, setHasCellRuntime] = useState(false);
  const [isKernelDialogOpen, setIsKernelDialogOpen] = useState(false);
  const [isVariableDialogOpen, setIsVariableDialogOpen] = useState(false);
  const [language, setLanguage] = useState<string>('');
  const [snippets, setSnippets] = useState<ISnippet[]>([]);
  const [isSnippetDialogOpen, setIsSnippetDialogOpen] = useState(false);
  const trans = useMemo(
    () => (translator ?? nullTranslator).load('jupyterlab'),
    [translator],
  );
  useEffect(() => {
    const updateState = (model: ICellModel) => {
      const datalayerMeta = model.getMetadata('datalayer') ?? {};
      const runtime = datalayerMeta.kernel as IRuntimeDesc | undefined;
      setIsForeign(!!runtime);
      setHasCellRuntime(runtime?.params?.notebook === false);
      const newSnippets = new Array<ISnippet>();
      if (runtime) {
        const spec = multiServiceManager.remote?.environments
          .get()
          .find(env => env.name === runtime.name);
        setLanguage(spec?.language ?? '');
        if (spec?.snippets) {
          newSnippets.push(...spec.snippets);
        }
      }
      setSnippets(newSnippets);
    };
    updateState(model);
    model.metadataChanged.connect(updateState);
    return () => {
      model.metadataChanged.disconnect(updateState);
    };
  }, [model]);
  const filterKernel = useCallback(
    (desc: IRuntimeDesc) => {
      return (
        !!desc.kernelId &&
        isRuntimeRemote(desc.location) &&
        (!preference?.language || desc.language === preference?.language)
      );
    },
    [preference],
  );
  const setSelectedRuntimeDesc = useCallback(
    (kernel?: IRuntimeDesc): void => {
      const datalayerMeta = model.getMetadata('datalayer') ?? {
        runtime: undefined,
      };
      if (!kernel) {
        delete datalayerMeta.kernel;
        model.setMetadata('datalayer', datalayerMeta);
      } else {
        model.setMetadata(
          'datalayer',
          Object.assign(datalayerMeta, { kernel }),
        );
      }
    },
    [model],
  );
  const closeVariableDialog = useCallback(() => {
    setIsVariableDialogOpen(false);
  }, []);
  const openVariableDialog = useCallback(() => {
    setIsVariableDialogOpen(true);
  }, []);
  const closeSnippetDialog = useCallback(() => {
    setIsSnippetDialogOpen(false);
  }, []);
  const openSnippetDialog = useCallback(() => {
    setIsSnippetDialogOpen(true);
  }, []);
  const setCell = useCallback(() => {
    setIsKernelDialogOpen(true);
  }, []);
  const onStartRemote = useCallback(
    (desc?: IRuntimeDesc) => {
      if (desc) {
        desc.params = {
          ...desc.params,
          notebook: false,
        };
        setSelectedRuntimeDesc(desc);
      }
      setIsKernelDialogOpen(false);
    },
    [setSelectedRuntimeDesc],
  );
  const datalayerMeta = model.getMetadata('datalayer') ?? {};
  return (
    <>
      <CodeSandboxPicker
        display="menu"
        filterRuntime={filterKernel}
        preference={preference}
        multiServiceManager={multiServiceManager}
        runtimeDesc={datalayerMeta.kernel ? datalayerMeta.kernel : undefined}
        setRuntimeDesc={setSelectedRuntimeDesc}
        variant={'cell'}
        preActions={
          <ActionList.Item
            disabled={!multiServiceManager.remote}
            onSelect={setCell}
            selected={hasCellRuntime}
            title={
              !multiServiceManager.remote
                ? 'You are not connected with Datalayer.'
                : 'Assign a new temporary Runtime on each Cell execution.'
            }
          >
            <ActionList.LeadingVisual>
              <CloudUploadIcon />
            </ActionList.LeadingVisual>
            {trans.__('Assign a Cell Runtime')}
          </ActionList.Item>
        }
        postActions={
          token || !logIn ? (
            <>
              {RuntimeSnippetsFacade.supports(preference?.language ?? '') && (
                <ActionList.Item
                  onSelect={openVariableDialog}
                  disabled={!isForeign}
                  title={trans.__(
                    'Define variables to transfer between the document kernel and the cell kernel.',
                  )}
                >
                  {trans.__('Define Cell Variables Transfer')}
                </ActionList.Item>
              )}
              {!configuration.whiteLabel && (
                <ActionList.Item
                  onSelect={openSnippetDialog}
                  disabled={snippets.length === 0}
                  title={trans.__(
                    'Inject a code snippet at the end of the cell.',
                  )}
                >
                  {trans.__('Inject Code Snippet')}
                </ActionList.Item>
              )}
            </>
          ) : (
            <ActionList.Item onSelect={props.logIn} title={'Runtime Provider.'}>
              <ExternalTokenSilentLogin message="Click to sign in" />
            </ActionList.Item>
          )
        }
        translator={translator}
      />
      {isVariableDialogOpen && (
        <CodeSandboxCellVariablesDialog
          model={model}
          onClose={closeVariableDialog}
          preference={preference}
          sessionContext={sessionContext}
          translator={translator}
        />
      )}
      {isSnippetDialogOpen && (
        <SnippetDialog
          language={language}
          model={model}
          snippets={snippets}
          onClose={closeSnippetDialog}
          markdownParser={markdownParser}
          sanitizer={sanitizer}
        />
      )}
      {isKernelDialogOpen && (
        <CodeSandboxLauncher
          manager={multiServiceManager.remote!}
          onSubmit={onStartRemote}
          startRuntime={'defer'}
          submitLabel="Assign"
          markdownParser={markdownParser}
          sanitizer={sanitizer}
        />
      )}
    </>
  );
}

export default CodeSandboxPickerCell;
