/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The nine inputs a setting is drawn with (LOOP P-20): each a JSON Schema
 * field and, where the field's own widget is not the one wanted, the widget a
 * form's uiSchema names for it (`ui:widget`) — what `@datalayer/primer-rjsf`
 * draws. agentspecs' `SETTING_INPUTS`, `FORM_WIDGETS` and
 * `form_ui_problems`, said again for the page, in its sentences.
 *
 * Pure: no React, no network.
 *
 * @module apps/apps/settingsInputs
 */

/** The nine inputs: the field each is, and the widget it is drawn with. */
export const SETTING_INPUTS: Record<string, { field: string; widget: string }> =
  {
    Select: { field: 'a field with an `enum`', widget: 'select (its own)' },
    Slider: {
      field: 'a `number` or an `integer` with a `minimum` and a `maximum`',
      widget: 'range',
    },
    Switch: { field: 'a `boolean`', widget: 'switch' },
    TextInput: { field: 'a `string`', widget: 'text (its own), or textarea' },
    Checkbox: { field: 'a `boolean`', widget: 'checkbox (its own)' },
    DatePicker: {
      field: 'a `string` of `format: date`',
      widget: 'date (its own)',
    },
    MultiSelect: {
      field: 'an `array` of `uniqueItems` whose `items` have an `enum`',
      widget: 'select (its own), or checkboxes',
    },
    RadioGroup: { field: 'a field with an `enum`', widget: 'radio' },
    Tags: {
      field: 'an `array` of `string` items without an `enum`',
      widget: 'tags',
    },
  };

/** The widgets a form's `ui` may name (`ui:widget`). */
export const FORM_WIDGETS = [
  'select',
  'radio',
  'range',
  'updown',
  'switch',
  'checkbox',
  'text',
  'textarea',
  'date',
  'checkboxes',
  'tags',
] as const;

type Data = Record<string, unknown>;

const isData = (value: unknown): value is Data =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Why a widget cannot draw a field, in words; null when it can. */
export function widgetRefusal(widget: string, field: Data): string | null {
  const kind = field.type;
  const items = isData(field.items) ? field.items : {};
  switch (widget) {
    case 'select':
    case 'radio':
      if ('enum' in field || (widget === 'radio' && kind === 'boolean')) {
        return null;
      }
      if (widget === 'select' && kind === 'array' && 'enum' in items) {
        return null;
      }
      return 'draws a choice: the field has an `enum`';
    case 'range':
      return (kind === 'number' || kind === 'integer') &&
        'minimum' in field &&
        'maximum' in field
        ? null
        : 'is a slider: a `number` or an `integer` with a `minimum` and a `maximum`';
    case 'updown':
      return kind === 'number' || kind === 'integer'
        ? null
        : 'draws a `number` or an `integer`';
    case 'switch':
    case 'checkbox':
      return kind === 'boolean' ? null : 'draws a `boolean`';
    case 'text':
    case 'textarea':
      return kind === 'string' ? null : 'draws a `string`';
    case 'date':
      return kind === 'string' ? null : 'draws a `string` of `format: date`';
    case 'checkboxes':
      return kind === 'array' && 'enum' in items
        ? null
        : 'draws an `array` whose `items` have an `enum`';
    case 'tags':
      return kind === 'array' && items.type === 'string' && !('enum' in items)
        ? null
        : 'draws an `array` of `string` items without an `enum`';
    default:
      return `is no widget: ${FORM_WIDGETS.join(', ')}`;
  }
}

const quoted = (value: unknown): string => `“${String(value)}”`;

/**
 * What is wrong with how a form's fields are drawn, in agentspecs'
 * `form_ui_problems` sentences: by field name, the `ui:` options of each —
 * `ui:widget` one of {@link FORM_WIDGETS} that draws the field — and
 * `ui:order` at its top.
 */
export function formUiProblems(
  said: string,
  schema: Data,
  ui: unknown,
): string[] {
  if (!isData(ui)) {
    return [`${said} is drawn by field name: its \`ui\` is a mapping.`];
  }
  const fields = isData(schema.properties) ? schema.properties : {};
  const problems: string[] = [];
  for (const [name, options] of Object.entries(ui)) {
    if (name === 'ui:order') {
      const order = Array.isArray(options) ? options : null;
      const unknown = (order ?? []).filter(
        item => item !== '*' && !(String(item) in fields),
      );
      if (order === null || unknown.length > 0) {
        problems.push(
          `${said} orders fields it does not ask: ${unknown.map(quoted).join(', ') || String(options)}.`,
        );
      }
      continue;
    }
    if (name.startsWith('ui:')) {
      continue;
    }
    if (!(name in fields)) {
      problems.push(
        `${said} says how to draw ${quoted(name)}, which it does not ask.`,
      );
      continue;
    }
    if (!isData(options)) {
      problems.push(
        `${said}'s field ${quoted(name)} is drawn with \`ui:\` options, a mapping.`,
      );
      continue;
    }
    const wrong = Object.keys(options).filter(
      key => !key.startsWith('ui:') && key !== 'items',
    );
    if (wrong.length > 0) {
      problems.push(
        `${said}'s field ${quoted(name)} is drawn with \`ui:\` options, not ${wrong.map(quoted).join(', ')}.`,
      );
    }
    const widget = options['ui:widget'];
    const field = fields[name];
    if (widget === undefined || !isData(field)) {
      continue;
    }
    const refusal = widgetRefusal(String(widget), field);
    if (refusal) {
      problems.push(
        `${said}'s field ${quoted(name)} is drawn with ${quoted(widget)}, which ${refusal}.`,
      );
    }
  }
  return problems;
}
