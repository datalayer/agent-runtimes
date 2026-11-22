/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The designer's property grid: any part of a
 * spec, drawn from its JSON Schema with `@datalayer/primer-rjsf` — the right
 * control for each field's type, its choices from the schema, its default
 * filled, what the schema refuses said beside the field as it is typed.
 *
 * Nothing about a part is written here: the grid is told where the part is
 * (`path`, and the `keys` of a part made of some of an object's keys), finds
 * its schema (`schemaAt`), reads it from the document, and hands back the
 * whole document with the part replaced — so a part of an application, a
 * scene or a stage is drawn the same way, and whoever holds the document
 * keeps it the one source of truth.
 *
 * @module apps/composer/SchemaProperties
 */

import type { JSX } from 'react';
import { useMemo, useRef, useState } from 'react';
import { Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { Form } from '@datalayer/primer-rjsf';
import validator from '@rjsf/validator-ajv8';
import type { JsonSchema } from '../../specs/appspecSchema';
import { documentWith, gridUiSchema, partOf, type PartAt } from './schemaAt';

export type { PartAt };

export type SchemaPropertiesProps = {
  /** The document's whole schema, with its `$defs`. */
  root: JsonSchema;
  /** The document, in the schema's spelling. */
  data: unknown;
  /** The part being edited. The caller keys the grid on it, so another part starts afresh. */
  at: PartAt;
  /** What the part is called, as the surface shows it. */
  title: string;
  /** Each change: the whole document with the part replaced, and how many values the schema refuses. */
  onChange: (data: unknown, refused: number) => void;
  disabled?: boolean;
};

/** A part's properties, drawn from its schema. */
export function SchemaProperties({
  root,
  data,
  at,
  title,
  onChange,
  disabled = false,
}: SchemaPropertiesProps): JSX.Element {
  const part = useMemo(() => partOf(root, data, at), [root, at, data]);
  // The form keeps what is typed; the document is told each change.
  const [value, setValue] = useState<unknown>(part?.value);
  // The form says a change as it opens, its defaults filled in: no change of
  // the person's, and written it was a step of Undo for a click. It
  // writes once the person has touched a field.
  const touched = useRef(false);
  const touch = () => {
    touched.current = true;
  };
  if (!part) {
    return (
      <Text as="p" sx={{ color: 'fg.muted', fontSize: 1, m: 0 }}>
        Nothing to set on this part.
      </Text>
    );
  }
  return (
    <Box data-designer-properties="" data-designer-model={part.model ?? ''}>
      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>{title}</Text>
        {part.model ? (
          <Label variant="secondary" sx={{ fontFamily: 'mono' }}>
            {part.model}
          </Label>
        ) : null}
      </Box>
      {/* What the part is, said once: a model's own description; a part made
          of some of the document's keys is not the document. */}
      {part.model && !at.keys && part.schema.description ? (
        <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, mt: 0, mb: 2 }}>
          {String(part.schema.description)}
        </Text>
      ) : null}
      <Box
        onInputCapture={touch}
        onChangeCapture={touch}
        onClickCapture={touch}
        onKeyDownCapture={touch}
        sx={{
          // The grid of a designer: dense, labels small, every field one under the other.
          fontSize: 1,
          '& label': { fontSize: 0, fontWeight: 'semibold' },
          '& .form-group, & fieldset': { mb: 2 },
        }}
      >
        <Form
          // The header above says what the part is: the form draws its fields only.
          schema={
            {
              ...part.schema,
              title: undefined,
              description: undefined,
            } as never
          }
          // Not `root`, the form's own prefix: a part that is one string — a
          // protocol, `pap` — drew its input as `#root`, the page's mount, and
          // the page's `#root { min-height: 100vh }` stretched it to the
          // window, a pill a screen tall (reported 12 October 2026).
          idPrefix="designer-properties"
          formData={value as never}
          validator={validator}
          liveValidate
          showErrorList={false}
          disabled={disabled}
          uiSchema={gridUiSchema(part.schema)}
          onChange={event => {
            setValue(event.formData);
            if (!touched.current) {
              return;
            }
            onChange(
              documentWith(data, at, event.formData),
              event.errors?.length ?? 0,
            );
          }}
        />
      </Box>
    </Box>
  );
}

export default SchemaProperties;
