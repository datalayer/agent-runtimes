/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ReactElement, useCallback, useMemo, useState } from 'react';
import { IconButton, ToggleSwitch, FormControl } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { Blankslate, DataTable, Table } from '@primer/react/experimental';
import { ISessionContext } from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { checkIcon } from '@jupyterlab/ui-components';
import { JSONExt } from '@lumino/coreutils';
import { KernelExecutor } from '@datalayer/jupyter-react';
import { RuntimeSnippetsFacade } from '../../jupyter';
import type { IRuntimeDesc } from '../../models';

/** What {@link useCodeSandboxVariablesTransfer} answers. */
export interface ICodeSandboxVariablesTransfer {
  /**
   * Whether carrying variables over is possible at all.
   *
   * Both ends must speak a language the snippets know how to serialize: the
   * sandbox the variables come from, and the one they would go to.
   */
  available: boolean;
  /** The variables of the current sandbox, by name and type. */
  variables?: { [name: string]: string };
  /** Those the user chose to carry over. */
  selected: string[];
  setSelected: (names: string[]) => void;
  /** Whether the user asked for the transfer at all. */
  transfer: boolean;
  setTransfer: (value: boolean) => void;
}

/**
 * The variables of the current sandbox, and which of them to carry over.
 *
 * Listing them runs code in the sandbox — the snippet that names them — so it
 * is deferred until the user asks for the transfer, and done once.
 *
 * @param sessionContext The session the variables are read from
 * @param target The sandbox they would be carried to
 * @param enabled Whether the transfer is offered at all
 */
export function useCodeSandboxVariablesTransfer(
  sessionContext: ISessionContext | undefined,
  target: IRuntimeDesc | undefined,
  enabled = true,
): ICodeSandboxVariablesTransfer {
  const [variables, setVariables] = useState<{ [name: string]: string }>();
  const [selected, setSelectedState] = useState<string[]>([]);
  const [transfer, setTransferState] = useState(false);
  const [listed, setListed] = useState(false);
  const sourceLanguage =
    sessionContext?.session?.kernel?.name && sessionContext.specsManager.specs
      ? sessionContext.specsManager.specs.kernelspecs[
          sessionContext.session.kernel.name
        ]?.language
      : undefined;
  const available =
    enabled &&
    RuntimeSnippetsFacade.supports(sourceLanguage ?? '') &&
    RuntimeSnippetsFacade.supports(target?.language ?? '');
  const list = useCallback(async (): Promise<void> => {
    if (listed) {
      return;
    }
    setListed(true);
    const connection = sessionContext?.session?.kernel;
    const spec =
      connection &&
      sessionContext?.specsManager.specs?.kernelspecs[connection.model.name];
    if (!connection || !spec) {
      setVariables({});
      return;
    }
    const snippets = new RuntimeSnippetsFacade(spec.language);
    const outputs = await new KernelExecutor({ connection }).execute(
      snippets.listVariables(),
    );
    const content = outputs.get(0).data['text/plain'] as string;
    if (!content) {
      setVariables({});
      return;
    }
    // The payload comes quoted, as the representation of a string.
    const listedVariables = JSON.parse(content.slice(1, content.length - 1));
    setVariables(listedVariables);
    // Everything is carried over unless the user says otherwise.
    setSelectedState(Object.keys(listedVariables ?? {}));
  }, [listed, sessionContext]);
  const setSelected = useCallback(
    (names: string[]): void => {
      setSelectedState(current =>
        JSONExt.deepEqual(current, names) ? current : names,
      );
    },
    [setSelectedState],
  );
  const setTransfer = useCallback(
    (value: boolean): void => {
      setTransferState(current => {
        if (current === value) {
          return current;
        }
        if (value) {
          list().catch(reason => {
            console.error('Failed to list the variables of the sandbox', reason);
            setListed(false);
          });
        }
        return value;
      });
    },
    [list],
  );
  return {
    available,
    variables,
    selected: available && transfer ? selected : [],
    setSelected,
    transfer,
    setTransfer,
  };
}

/**
 * {@link CodeSandboxVariables} properties
 */
export interface ICodeSandboxVariablesProps {
  /**
   * Component class name
   */
  className?: string;
  /**
   * Available kernel variables
   *
   * Mapping (variable name, variable type)
   */
  kernelVariables?: { [name: string]: string };
  /**
   * Kernel variables to be transferred.
   */
  selectedVariables: string[];
  setSelectVariable: (l: string[]) => void;
  /**
   * Whether to transfer the variable from the current
   * to the selected kernel or not.
   */
  transferVariables: boolean;
  setTransferVariable: (v: boolean) => void;
  /**
   * Application translator
   */
  translator?: ITranslator;
}

/**
 * Runtime variables selector component.
 */
export function CodeSandboxVariables(props: ICodeSandboxVariablesProps): ReactElement {
  const {
    className,
    translator,
    selectedVariables,
    setSelectVariable,
    transferVariables,
    setTransferVariable,
    kernelVariables,
  } = props;
  const trans = useMemo(
    () => (translator ?? nullTranslator).load('jupyterlab'),
    [translator],
  );
  const nRows = Object.keys(kernelVariables ?? {}).length;
  // Sorting and actions does not play nice together :'(
  const columns: any[] = [
    {
      header: trans.__('Name'),
      field: 'name',
      rowHeader: true,
    },
    {
      header: trans.__('Type'),
      field: 'type',
    },
    {
      id: 'select',
      maxWidth: '70px',
      header: () => (
        <IconButton
          aria-label={
            selectedVariables.length === nRows
              ? trans.__('Deselect all')
              : trans.__('Select all')
          }
          title={
            selectedVariables.length === nRows
              ? trans.__('Deselect all')
              : trans.__('Select all')
          }
          icon={
            selectedVariables.length === nRows
              ? checkIcon.react
              : () => <span></span>
          }
          variant="default"
          size="small"
          onClick={e => {
            e.preventDefault();
            if (selectedVariables.length === nRows) {
              setSelectVariable([]);
            } else {
              setSelectVariable(Object.keys(kernelVariables ?? {}));
            }
          }}
        />
      ),
      renderCell: (row: any) => {
        const isSelected = selectedVariables.includes(row.name);
        return (
          <IconButton
            aria-label={
              isSelected
                ? trans.__('Deselect: %1', row.name)
                : trans.__('Select: %1', row.name)
            }
            title={
              isSelected
                ? trans.__('Deselect: %1', row.name)
                : trans.__('Select: %1', row.name)
            }
            icon={isSelected ? checkIcon.react : () => <span></span>}
            variant="default"
            size="small"
            onClick={e => {
              e.preventDefault();
              const index = selectedVariables.findIndex(v => v === row.name);
              if (index >= 0) {
                const copy = [...selectedVariables];
                copy.splice(index, 1);
                setSelectVariable(copy);
              } else {
                setSelectVariable([...selectedVariables, row.name]);
              }
            }}
          />
        );
      },
    },
  ];
  return (
    <Box className={className} sx={{ paddingTop: '10px' }}>
      <FormControl layout="horizontal">
        <FormControl.Label>{trans.__('Transfer variables')}</FormControl.Label>
        <ToggleSwitch
          checked={transferVariables}
          size="small"
          onClick={e => {
            e.preventDefault();
            setTransferVariable(!transferVariables);
          }}
          aria-labelledby="kernel-toggle-variables"
        />
      </FormControl>
      {transferVariables && (
        <Table.Container sx={{ flex: '1 1 auto', marginTop: 3 }}>
          <Table.Subtitle as="p" id="dla-kernel-variables-subtitle">
            {trans.__('The list of transferable runtime variables.')}
          </Table.Subtitle>
          {kernelVariables ? (
            Object.keys(kernelVariables ?? {}).length ? (
              <DataTable
                aria-labelledby="dla-kernel-variables"
                aria-describedby="dla-kernel-variables-subtitle"
                data={Object.entries(kernelVariables ?? {})
                  .map(([name, type], id) => ({ id, name, type }))
                  .sort((a, b) => (a.name > b.name ? 1 : -1))}
                columns={columns}
                cellPadding="condensed"
              />
            ) : (
              <Box sx={{ gridArea: 'table' }}>
                <Blankslate border>
                  <Blankslate.Heading>
                    {trans.__('No eligible variables.')}
                  </Blankslate.Heading>
                </Blankslate>
              </Box>
            )
          ) : (
            <Table.Skeleton
              aria-labelledby="dla-kernel-variables"
              aria-describedby="dla-kernel-variables-subtitle"
              columns={columns}
              rows={5}
            />
          )}
        </Table.Container>
      )}
    </Box>
  );
}
