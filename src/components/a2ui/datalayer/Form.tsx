/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Form (LOOP C-18, C-16): several fields asked at once, generated from the
 * JSON Schema the builder gave it by `@datalayer/primer-rjsf` — the form the
 * properties panels are drawn with — checked as they are filled. It starts
 * from the values its `values` binding shows; a form the schema accepts is
 * sent with its button: the values are written where `values` points, then
 * its action is dispatched, so the action's context reads them. A form the
 * schema refuses says why beside each field and sends nothing.
 *
 * @module components/a2ui/datalayer/Form
 */

import { useEffect, useMemo, useState } from 'react';
import { Form as SchemaForm } from '@datalayer/primer-rjsf';
import validator from '@rjsf/validator-ajv8';
import { BlockFrame, Problem, isRecord } from './parts';
import { ownImplementation, type OwnCommon } from './implementation';

export type FormProps = OwnCommon & {
  title?: string;
  schema: Record<string, unknown>;
  submit_label?: string;
  values?: unknown;
  setValues: (values: Record<string, unknown>) => void;
};

/** The default the catalog gives `submit_label`. */
const SUBMIT_LABEL = 'Send';

export function FormView({ props }: { props: FormProps }) {
  const { title, schema, setValues, action } = props;
  const submitLabel = props.submit_label ?? SUBMIT_LABEL;
  const shown = isRecord(props.values) ? props.values : {};
  const [values, setLocal] = useState<Record<string, unknown>>(shown);
  // Checked as it is filled once a field is left or a send is tried: an
  // untouched form does not open with every required field in red.
  const [touched, setTouched] = useState(false);
  // What the application publishes anew is what the form shows.
  const shownKey = JSON.stringify(shown);
  useEffect(() => {
    setLocal(JSON.parse(shownKey));
  }, [shownKey]);
  const uiSchema = useMemo(
    () => ({ 'ui:submitButtonOptions': { submitText: submitLabel } }),
    [submitLabel],
  );
  const problem =
    schema.type !== undefined && schema.type !== 'object'
      ? 'Its fields are not an object schema: a form asks for several named values.'
      : null;
  return (
    <BlockFrame
      title={title}
      label="Form"
      weight={props.weight}
      testId="a2ui-form"
    >
      {problem ? (
        <Problem>{problem}</Problem>
      ) : (
        <SchemaForm
          schema={schema as never}
          uiSchema={uiSchema}
          formData={values}
          validator={validator}
          liveValidate={touched}
          onBlur={() => setTouched(true)}
          onError={() => setTouched(true)}
          showErrorList={false}
          onChange={event =>
            setLocal((event.formData ?? {}) as Record<string, unknown>)
          }
          onSubmit={event => {
            setValues((event.formData ?? {}) as Record<string, unknown>);
            action?.();
          }}
        />
      )}
    </BlockFrame>
  );
}

export const Form = ownImplementation<FormProps>('Form', FormView);
