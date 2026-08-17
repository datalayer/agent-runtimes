/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog } from '@primer/react/experimental';
import { ISessionContext } from '@jupyterlab/apputils';
import { CodeCellModel, ICellModel } from '@jupyterlab/cells';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { JSONExt } from '@lumino/coreutils';
import { KernelExecutor } from '@datalayer/jupyter-react';
import { RuntimeSnippetsFacade } from '../../jupyter';
import { CodeSandboxCellVariables } from './CodeSandboxCellVariables';

/**
 * {@link CodeSandboxCellVariablesDialog} properties
 */
export interface ICodeSandboxCellVariablesDialogProps {
  /**
   * Code cell model
   */
  model: CodeCellModel;

  /**
   * Callback request the dialog closure.
   */
  onClose: () => void;

  /**
   * Session preference
   */
  preference?: { id?: string; kernelDisplayName?: string; language?: string };

  /**
   * Document session context
   */
  sessionContext?: ISessionContext;

  /**
   * Application translator
   */
  translator?: ITranslator;
}

/**
 * Dialog to define the runtime cell variables to transfer
 */
export function CodeSandboxCellVariablesDialog(
  props: ICodeSandboxCellVariablesDialogProps,
): JSX.Element {
  const { onClose, model, preference, sessionContext, translator } = props;
  const [inputs, setInputs] = useState<string[]>([]);
  const [output, setOutput] = useState<string | undefined>();
  const trans = useMemo(
    () => (translator ?? nullTranslator).load('jupyterlab'),
    [translator],
  );
  useEffect(() => {
    const updateState = (model: ICellModel) => {
      const datalayerMeta = model.getMetadata('datalayer') ?? {};
      if (datalayerMeta.in && !JSONExt.deepEqual(inputs, datalayerMeta.in)) {
        setInputs(datalayerMeta.in);
      }
      if (datalayerMeta.out && datalayerMeta.out !== output) {
        setOutput(datalayerMeta.out);
      }
    };
    updateState(model);
    model.metadataChanged.connect(updateState);
    return () => {
      model.metadataChanged.disconnect(updateState);
    };
  }, [model, inputs, output]);
  const setVariables = useCallback(() => {
    const datalayerMeta = model.getMetadata('datalayer') ?? {};
    if (inputs.length) {
      datalayerMeta.in = inputs;
    } else {
      delete datalayerMeta.in;
    }
    if (output) {
      datalayerMeta.out = output;
    } else {
      delete datalayerMeta.out;
    }
    model.setMetadata('datalayer', { ...datalayerMeta });
    onClose();
  }, [model, inputs, output, onClose]);
  const getInputCandidates = useCallback(async () => {
    if (!sessionContext) {
      return [];
    }
    const connection = sessionContext.session!.kernel!;
    const spec =
      sessionContext.specsManager.specs!.kernelspecs[connection.model.name]!;
    const snippets = new RuntimeSnippetsFacade(spec.language);
    const outputs = await new KernelExecutor({ connection }).execute(
      snippets.listVariables(),
    );
    const content = outputs.get(0).data['text/plain'] as string;
    if (content) {
      const runtimeVariables = JSON.parse(
        // We need to remove the quotes prior to parsing
        content.slice(1, content.length - 1),
      );
      return Object.keys(runtimeVariables ?? {});
    }
    return [];
  }, [preference, sessionContext]);
  const getOutputCandidates = useCallback(async () => {
    // TODO this is only valid for python - using cell mimetype?
    return new RuntimeSnippetsFacade('python').getOutputCandidates(
      model.sharedModel.source,
    );
  }, [model]);
  const datalayerMeta = model.getMetadata('datalayer') ?? {};
  let title = 'Define cell variables to transfer';
  const kernel = datalayerMeta.kernel ?? {};
  const kernelName = (kernel.displayName || kernel.name) ?? '';
  if (kernelName) {
    if (kernel.params?.notebook !== false && kernel.id) {
      title += ` with running ${kernelName} (${kernel.id.slice(0, 7)})`;
    } else {
      title += ` with ${kernelName}`;
    }
  }
  return (
    <Dialog
      title={<span style={{ color: 'var(--fgColor-default)' }}>{title}</span>}
      onClose={onClose}
      footerButtons={[
        {
          buttonType: 'default',
          content: trans.__('Cancel'),
          onClick: onClose,
        },
        {
          buttonType: 'primary',
          content: trans.__('Set variables'),
          onClick: setVariables,
          autoFocus: true,
        },
      ]}
    >
      <CodeSandboxCellVariables
        inputs={inputs}
        getInputOptions={sessionContext ? getInputCandidates : undefined}
        setInputs={setInputs}
        output={output ?? undefined}
        getOutputOptions={getOutputCandidates}
        setOutput={setOutput}
        translator={translator}
      />
    </Dialog>
  );
}

export default CodeSandboxCellVariablesDialog;
