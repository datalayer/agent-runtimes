/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The two inputs of the nine (LOOP P-20) that `@datalayer/primer-rjsf` does
 * not draw itself, as rjsf widgets a form's uiSchema names (`ui:widget`):
 *
 * - `switch` — a `boolean` as Primer's toggle switch;
 * - `tags` — an `array` of `string` items as words in a field, each a token:
 *   Enter or a comma adds what is typed, a token's cross takes it away.
 *
 * The seven others are primer-rjsf's: Select (an `enum`), Slider (`range`),
 * TextInput (a `string`, or `textarea`), Checkbox (a `boolean`), DatePicker
 * (`format: date`), MultiSelect (an `array` of `enum` items, or
 * `checkboxes`) and RadioGroup (`radio`).
 *
 * @module components/a2ui/datalayer/formWidgets
 */

import { useState } from 'react';
import {
  Box,
  FormControl,
  Text,
  TextInputWithTokens,
  ToggleSwitch,
} from '@primer/react';

/** What rjsf gives a widget, of what these two read. */
export type WidgetProps = {
  id: string;
  value: unknown;
  label: string;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  onChange: (value: unknown) => void;
};

/** A `boolean` as a toggle switch. */
export function SwitchWidget({
  id,
  value,
  label,
  disabled,
  readonly,
  onChange,
}: WidgetProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Text as="span" id={`${id}-label`} sx={{ fontWeight: 'semibold' }}>
        {label}
      </Text>
      <ToggleSwitch
        size="small"
        aria-labelledby={`${id}-label`}
        checked={Boolean(value)}
        disabled={disabled || readonly}
        onClick={() => onChange(!value)}
      />
    </Box>
  );
}

/** An `array` of `string` items as tokens: typed, then Enter or a comma. */
export function TagsWidget({
  id,
  value,
  label,
  disabled,
  readonly,
  placeholder,
  onChange,
}: WidgetProps) {
  const tags: string[] = Array.isArray(value) ? value.map(String) : [];
  const [typed, setTyped] = useState('');
  const add = () => {
    const word = typed.trim();
    if (word && !tags.includes(word)) {
      onChange([...tags, word]);
    }
    setTyped('');
  };
  return (
    <FormControl id={id} disabled={disabled || readonly}>
      <FormControl.Label>{label}</FormControl.Label>
      <TextInputWithTokens
        block
        placeholder={placeholder}
        tokens={tags.map((text, index) => ({ id: index, text }))}
        value={typed}
        onChange={event => setTyped(event.target.value.replace(',', ''))}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        onTokenRemove={index => {
          onChange(tags.filter((_, at) => at !== index));
        }}
      />
    </FormControl>
  );
}

/** What a form's uiSchema may name besides primer-rjsf's own widgets. */
export const FORM_WIDGETS = {
  switch: SwitchWidget,
  tags: TagsWidget,
};
