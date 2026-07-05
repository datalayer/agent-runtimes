/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { JSONExt } from '@lumino/coreutils';
import { Autocomplete, FormControl, TextInputWithTokens } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

/**
 * {@link RuntimeCellVariables} properties
 */
interface IRuntimeCellVariablesProps {
  /**
   * Variable names to be imported
   */
  inputs: string[];
  /**
   * Importable variable names
   */
  getInputOptions?: () => Promise<string[]>;
  /**
   * Set the variable names to be imported
   */
  setInputs: (values: string[]) => void;
  /**
   * Variable name to be exported
   */
  output?: string;
  /**
   * Exportable variable names
   */
  getOutputOptions?: () => Promise<string[]>;
  /**
   * Set the variable name to be exported
   */
  setOutput: (value?: string) => void;
  /**
   * Application translator object
   */
  translator?: ITranslator;
}

/**
 * Cell variables picker datum
 */
type Datum = {
  /**
   * Variable id
   */
  id: string;
  /**
   * Variable displayed description
   */
  text: string;
  /**
   * Whether the variable is selected or not.
   */
  selected?: boolean;
};

/**
 * Runtime Cell Variables Picker.
 */
export function RuntimeCellVariables(
  props: IRuntimeCellVariablesProps,
): JSX.Element {
  const {
    getInputOptions,
    getOutputOptions,
    inputs,
    output,
    setInputs,
    setOutput,
    translator,
  } = props;
  const trans = useMemo(
    () => (translator ?? nullTranslator).load('jupyterlab'),
    [translator],
  );
  const inputForOutputRef = useRef<HTMLInputElement | null>(null);
  const [willSaveOutput, setWillSaveOutput] = useState(false);
  const [inputLoading, setInputLoading] = useState(!!getInputOptions);
  const [outputsState, setOutputsState] = useState<Datum[] | null>(null);
  const [inputsState, setInputsState] = useState<Datum[]>(
    inputs.map(id => ({ id, text: id, selected: true })),
  );
  const [filterVal, setFilterVal] = useState<string>('');
  // Add inputs prop in inputsState
  useEffect(() => {
    const candidates = inputs.filter(
      item => !inputsState.find(localItem => localItem.text === item),
    );
    if (candidates.length) {
      setInputsState([
        ...inputsState,
        ...candidates.map(text => ({ id: text, text, selected: true })),
      ]);
    }
  }, [inputs]);
  // Update inputs with selected inputsState
  useEffect(() => {
    const candidates = inputsState
      .filter(item => item.selected)
      .map(item => item.text);
    if (!JSONExt.deepEqual(inputs, candidates)) {
      setInputs(candidates);
    }
  }, [inputsState]);
  // Fetch the input candidates
  useEffect(() => {
    if (!inputLoading) {
      return;
    }
    if (getInputOptions) {
      getInputOptions().then(ins => {
        const oldItems = inputsState.map(i => i.text);
        setInputsState([
          ...inputsState,
          ...ins
            .sort()
            .filter(item => !oldItems.includes(item))
            .map(text => ({
              id: text,
              text,
              selected: false,
            })),
        ]);
        setInputLoading(false);
      });
    } else {
      setInputLoading(false);
    }
  }, [inputsState, getInputOptions]);
  // Fetch the output candidates
  useEffect(() => {
    if (getOutputOptions) {
      Promise.all([getOutputOptions(), getInputOptions?.()])
        .then(([outs, ins]) => {
          setOutputsState(
            // Add input variables as output candidate to cover
            // mutation case
            outs
              .sort()
              .concat((ins ?? []).sort())
              // Remove duplicated variables; it may happen if
              // the code introspection matches an input.
              .reduce<string[]>((agg, value) => {
                if (!agg.includes(value)) {
                  agg.push(value);
                }
                return agg;
              }, [])
              .map(text => ({
                id: text,
                text,
                selected: false,
              })),
          );
        })
        .catch(err => {
          console.error('Failed to get the cell output candidates', err);
          setOutputsState([]);
        });
    }
  }, [getOutputOptions, getInputOptions]);
  const onTokenRemove = useCallback(
    (tokenId: string | number) => {
      const idx = inputsState.findIndex(item => item.id === tokenId);
      if (idx >= 0) {
        inputsState.splice(idx, 1);
        setInputsState([...inputsState]);
      }
    },
    [inputsState],
  );
  const onSelectedInputsChange = useCallback(
    (newlySelectedItems: Datum | Datum[]) => {
      if (!Array.isArray(newlySelectedItems)) {
        newlySelectedItems = [newlySelectedItems];
      }
      const selectedIds = newlySelectedItems.map(i => i.id);
      setInputsState([
        ...inputsState.map(localItem =>
          selectedIds.includes(localItem.id)
            ? Object.assign(localItem, { selected: true })
            : Object.assign(localItem, { selected: false }),
        ),
      ]);
    },
    [inputsState],
  );
  const onItemSelect = useCallback(
    (item: Datum) => {
      const oldItem = inputsState.find(localItem => localItem.id === item.id);
      if (!oldItem) {
        setInputsState([...inputsState, item]);
      } else {
        oldItem.selected = true;
        setInputsState([...inputsState]);
      }
    },
    [inputsState],
  );
  const handleChange = useCallback((e: any) => {
    if (e.currentTarget) {
      setFilterVal((e.currentTarget as HTMLInputElement).value);
    }
  }, []);
  const onOutputChange = useCallback((e: any) => {
    if (e.currentTarget) {
      setOutput((e.currentTarget as HTMLInputElement).value);
    }
  }, []);
  const handleOutputMenuOpenChange = useCallback(
    // There is a bug in primer Autocomplete that lead to the suggestion
    // not triggering the `onChange` callback. So to fix it here, we
    // use a pointer to the underlying input element to get the value
    // and set it when the autocompletion menu closes.
    (open: boolean) => {
      if (!willSaveOutput) {
        if (open) {
          setWillSaveOutput(true);
        }
        return;
      }
      if (inputForOutputRef.current && !open) {
        setOutput(inputForOutputRef.current.value);
        setWillSaveOutput(false);
      }
    },
    [willSaveOutput],
  );
  return (
    <Box as="form" sx={{ p: 3 }}>
      <FormControl>
        <FormControl.Label id="cell-input-variables">
          {trans.__('Inputs')}
        </FormControl.Label>
        <Autocomplete>
          <Autocomplete.Input
            as={TextInputWithTokens}
            tokens={inputsState.filter(item => item.selected)}
            onTokenRemove={onTokenRemove}
            onChange={handleChange}
          />
          <Autocomplete.Overlay>
            <Autocomplete.Menu
              addNewItem={
                filterVal &&
                !inputsState.find(localItem => localItem.text === filterVal)
                  ? {
                      id: filterVal,
                      text: trans.__("Add '%1'", filterVal),
                      handleAddItem: item => {
                        onItemSelect({
                          ...item,
                          text: filterVal,
                          selected: true,
                        });
                        setFilterVal('');
                      },
                    }
                  : undefined
              }
              items={inputsState}
              selectedItemIds={inputsState
                .filter(item => item.selected)
                .map(item => item.id)}
              onSelectedChange={onSelectedInputsChange}
              aria-labelledby="cell-input-variables"
              selectionVariant="multiple"
              emptyStateText={trans.__('No available variables.')}
              loading={inputLoading}
            />
          </Autocomplete.Overlay>
        </Autocomplete>
      </FormControl>
      <FormControl>
        <FormControl.Label id="cell-output-variables">
          {trans.__('Output')}
        </FormControl.Label>
        <Autocomplete>
          <Autocomplete.Input
            ref={inputForOutputRef}
            value={output}
            onChange={onOutputChange}
          />
          <Autocomplete.Overlay>
            <Autocomplete.Menu
              items={outputsState ?? []}
              selectedItemIds={output ? [output] : []}
              aria-labelledby="cell-output-variables"
              loading={getOutputOptions && !outputsState}
              emptyStateText={trans.__('Not among the available variables.')}
              onOpenChange={handleOutputMenuOpenChange}
            />
          </Autocomplete.Overlay>
        </Autocomplete>
      </FormControl>
    </Box>
  );
}

export default RuntimeCellVariables;
