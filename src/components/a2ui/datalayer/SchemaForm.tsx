/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The form a Form block draws, with what checks it: `@datalayer/primer-rjsf`
 * and Ajv. Its own module, fetched when a form is first drawn (`Form.tsx`):
 * the catalogue is in every surface, and in the embed (STUDIO D-08), a form
 * only in some — and Ajv with rjsf weigh more than the rest of the catalogue.
 *
 * @module components/a2ui/datalayer/SchemaForm
 */

import type { ComponentProps } from 'react';
import { Form } from '@datalayer/primer-rjsf';
import validator from '@rjsf/validator-ajv8';
import { FORM_WIDGETS } from './formWidgets';

/** What a Form block hands the form: everything but its checker and widgets. */
export type SchemaFormProps = Omit<
  ComponentProps<typeof Form>,
  'validator' | 'widgets'
>;

export default function SchemaForm(props: SchemaFormProps) {
  return (
    <Form {...props} widgets={FORM_WIDGETS as never} validator={validator} />
  );
}
