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
 * A form without an action is a set of settings (C-16) — an application's
 * `interface.settings` drawn beside its conversation: no button, its values
 * written where `values` points as they are filled, for the next run to take;
 * the runtime checks them against the same schema.
 *
 * Its `ui` says how its fields are drawn (LOOP P-20): a uiSchema by field
 * name, `ui:widget` one of primer-rjsf's widgets or of `switch` and `tags`
 * (`formWidgets`) — the nine inputs a setting is drawn with.
 *
 * @module components/a2ui/datalayer/Form
 */

import { useEffect, useMemo, useState } from 'react';
import { Form as SchemaForm } from '@datalayer/primer-rjsf';
import validator from '@rjsf/validator-ajv8';
import { BlockFrame, Problem, isRecord } from './parts';
import { ownImplementation, type OwnCommon } from './implementation';
import { FORM_WIDGETS } from './formWidgets';

export type FormProps = OwnCommon & {
  title?: string;
  schema: Record<string, unknown>;
  /** How its fields are drawn: a uiSchema by field name (P-20). */
  ui?: Record<string, unknown>;
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
  // Without an action, nothing is sent: no button, the values written as filled.
  const live = action === undefined;
  const drawn = JSON.stringify(props.ui ?? {});
  const uiSchema = useMemo(
    () => ({
      ...(JSON.parse(drawn) as Record<string, unknown>),
      'ui:submitButtonOptions': live
        ? { norender: true }
        : { submitText: submitLabel },
    }),
    [drawn, live, submitLabel],
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
          widgets={FORM_WIDGETS as never}
          formData={values}
          validator={validator}
          liveValidate={touched}
          onBlur={() => setTouched(true)}
          onError={() => setTouched(true)}
          showErrorList={false}
          onChange={event => {
            const filled = (event.formData ?? {}) as Record<string, unknown>;
            setLocal(filled);
            if (live) {
              setValues(filled);
            }
          }}
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
