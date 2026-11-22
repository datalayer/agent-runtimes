/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A component's properties, as a builder configures them, in
 * the page's theme — the person's own (changed 2026-10-06): a
 * component of Datalayer's own as a form drawn from its JSON Schema with
 * `@datalayer/primer-rjsf`, validated as it is filled; a standard one with
 * its properties named as the catalog's JSON Schema gives them. One
 * form for the components page and the Canvas's properties panel
 *.
 *
 * @module apps/composer/ComponentProperties
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { Form } from '@datalayer/primer-rjsf';
import validator from '@rjsf/validator-ajv8';
import type { ComponentSpec } from '../../types/agentspecs';

/** A standard component's properties, as the catalog's JSON Schema names them. */
export const catalogProperties = (
  component: ComponentSpec,
): Array<{ name: string; title: string }> =>
  Object.entries(
    (component.properties.properties ?? {}) as Record<
      string,
      { title?: string }
    >,
  ).map(([name, field]) => ({ name, title: field.title ?? name }));

/** A standard component's properties: named as the catalog gives them, set by the agent. */
export function StandardProperties({
  component,
}: {
  component: ComponentSpec;
}): JSX.Element {
  const fields = catalogProperties(component);
  return (
    <Text as="p" sx={{ color: 'fg.muted' }}>
      {fields.length ? (
        <>
          Set by the agent as A2UI describes them:{' '}
          {fields.map(({ name, title }, index) => (
            <span key={name}>
              {index ? ', ' : ''}
              <Text
                sx={{ fontFamily: 'mono', color: 'fg.default' }}
                title={title}
              >
                {name}
              </Text>
            </span>
          ))}
          .
        </>
      ) : (
        'It has no properties of its own.'
      )}
    </Text>
  );
}

/**
 * The form's uiSchema: no submit button, the properties edited elsewhere
 * hidden, and a list's items without the label rjsf makes of the list's
 * name and their index (`accept-0`): the list's own label says what they
 * are.
 */
export function propertiesUiSchema(
  component: ComponentSpec,
  hidden: string[] = [],
): Record<string, unknown> {
  const uiSchema: Record<string, unknown> = {
    'ui:submitButtonOptions': { norender: true },
  };
  const fields = (component.properties.properties ?? {}) as Record<
    string,
    { type?: unknown }
  >;
  for (const [name, field] of Object.entries(fields)) {
    if (field.type === 'array') {
      uiSchema[name] = { items: { 'ui:label': false } };
    }
  }
  for (const name of hidden) {
    uiSchema[name] = { 'ui:widget': 'hidden' };
  }
  return uiSchema;
}

export type OwnPropertiesFormProps = {
  component: ComponentSpec;
  /** The values it starts from; the form keeps what is typed from then on. */
  initial: Record<string, unknown>;
  /** Each change, with how many values the schema refuses (0: it can be written). */
  onChange: (values: Record<string, unknown>, refused: number) => void;
  /** Properties edited elsewhere (the label, on the Canvas). */
  hidden?: string[];
  disabled?: boolean;
};

/**
 * A component of Datalayer's own's properties, as the form its JSON Schema
 * draws. Validated as it is filled: a value the schema refuses is said beside
 * it, and the caller is told so it does not write it. Keyed by its
 * caller on what it configures, so that another one starts afresh.
 */
export function OwnPropertiesForm({
  component,
  initial,
  onChange,
  hidden = [],
  disabled = false,
}: OwnPropertiesFormProps): JSX.Element {
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const uiSchema = propertiesUiSchema(component, hidden);
  return (
    <Box
      p={3}
      border="1px solid"
      borderColor="border.default"
      borderRadius="var(--theme-radius-card, 6px)"
    >
      <Form
        schema={component.properties as never}
        formData={values}
        validator={validator}
        liveValidate
        showErrorList={false}
        disabled={disabled}
        uiSchema={uiSchema}
        onChange={event => {
          const next = (event.formData ?? {}) as Record<string, unknown>;
          setValues(next);
          onChange(next, event.errors?.length ?? 0);
        }}
      />
    </Box>
  );
}
