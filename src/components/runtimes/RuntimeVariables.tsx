/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ReactElement, useMemo } from 'react';
import { IconButton, ToggleSwitch, FormControl } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { Blankslate, DataTable, Table } from '@primer/react/experimental';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { checkIcon } from '@jupyterlab/ui-components';

/**
 * {@link RuntimeVariables} properties
 */
export interface IRuntimeVariablesProps {
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
export function RuntimeVariables(props: IRuntimeVariablesProps): ReactElement {
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
