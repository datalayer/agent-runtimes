/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The one dropdown for choosing where code runs.
 *
 * The launcher asks it of a new sandbox and the picker asks it of an editor
 * that needs one; both are the same question, and were drawn twice — a menu
 * here, a column of radio buttons there. This is that control, once: the
 * chosen entry reads on the trigger exactly as the entries read in the list,
 * name to the left and labels to the right, so the closed control and the
 * open one show the same thing.
 *
 * An `ActionMenu` rather than a `<select>`: what tells two entries apart is
 * their labels — the environment name, the provider, the credits it burns —
 * and no `<option>` can carry those.
 *
 * @module components/code-sandboxes/CodeSandboxEnvironmentSelect
 */

import type { JSX } from 'react';
import { ActionList, ActionMenu, Box, Label, Text } from '@primer/react';

/** One choice of the dropdown. */
export type ICodeSandboxEnvironmentOption = {
  /** Identity of the choice, as the host knows it. */
  key: string;
  /** What it is called. */
  title: string;
  /** The environment name, shown as a label beside the title. */
  name?: string;
  /** Who runs it — Datalayer, Kaggle, Modal, the Jupyter Server… */
  providerTitle?: string;
  /** Where it runs: `local`, `remote`, `browser`. */
  location?: string;
  /** Credits per second, when it costs any. */
  burningRate?: number;
  /** The GPU the environment carries, when it carries one. */
  gpu?: string | boolean;
  /** The heading this choice is listed under, when the list is grouped. */
  group?: string;
};

export type ICodeSandboxEnvironmentSelectProps = {
  /** The choices, in the order they should read. */
  options: ICodeSandboxEnvironmentOption[];
  /** The `key` of the chosen one, if any. */
  selectedKey?: string;
  /** Called with the `key` of the choice made. */
  onSelect: (key: string) => void;
  /** Whether the control refuses to open. */
  disabled?: boolean;
  /** What the trigger reads when nothing is chosen. */
  placeholder?: string;
  /**
   * Width of the overlay, `xlarge` by default.
   *
   * Wide because the entries carry their labels on the same line as their
   * name, and a priced one — the credits it burns, the environment, the
   * provider, where it runs — is nearly as wide as the row itself.
   */
  overlayWidth?: 'small' | 'medium' | 'large' | 'xlarge' | 'auto';
};

/**
 * The labels of an option, on one line: cost, name, provider, where.
 *
 * The price is the widest of them — "0.0008 credits/second" outruns the
 * name, the provider and the location together — so the room comes from the
 * overlay rather than from a second line: see `overlayWidth`.
 */
function OptionLabels(props: {
  option: ICodeSandboxEnvironmentOption;
}): JSX.Element {
  const { option } = props;
  return (
    <Box
      as="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {option.burningRate ? (
        <Label size="small" variant="sponsors">
          {option.burningRate} credits/second
        </Label>
      ) : null}
      {option.gpu ? (
        <Label size="small" variant="success">
          GPU
        </Label>
      ) : null}
      {option.name ? <Label size="small">{option.name}</Label> : null}
      {option.providerTitle ? (
        <Label size="small" variant="accent">
          {option.providerTitle}
        </Label>
      ) : null}
      {option.location ? (
        <Label size="small" variant="secondary">
          {option.location}
        </Label>
      ) : null}
    </Box>
  );
}

export function CodeSandboxEnvironmentSelect(
  props: ICodeSandboxEnvironmentSelectProps,
): JSX.Element {
  const {
    disabled,
    onSelect,
    options,
    overlayWidth = 'xlarge',
    placeholder = 'Select an environment',
    selectedKey,
  } = props;
  const selected = options.find(option => option.key === selectedKey);
  /*
   * What costs credits leads.
   *
   * The sandboxes of the platform and of its providers are the ones worth
   * choosing between — a kernel of this server is the fallback, always
   * there and free — so they are read first rather than found under a list
   * of local specifications. A stable partition: within each half the order
   * given by the caller is kept.
   */
  const ordered = [
    ...options.filter(option => option.burningRate),
    ...options.filter(option => !option.burningRate),
  ];
  const grouped = ordered.some(option => option.group);
  const groups = grouped
    ? Array.from(new Set(ordered.map(option => option.group ?? '')))
    : [];

  const rows = (subset: ICodeSandboxEnvironmentOption[]) =>
    subset.map(option => (
      <ActionList.Item
        key={option.key}
        selected={option.key === selectedKey}
        onSelect={() => onSelect(option.key)}
      >
        {option.title}
        <ActionList.TrailingVisual>
          <OptionLabels option={option} />
        </ActionList.TrailingVisual>
      </ActionList.Item>
    ));

  return (
    <ActionMenu>
      <ActionMenu.Button
        block
        disabled={disabled || ordered.length === 0}
        // The button centers its text by default; the trigger must read like
        // the rows below it — name left, labels right.
        sx={{
          // The content of a Primer button is a grid whose middle track is
          // content-sized, which hugs the labels against the title. The
          // template areas stay "leadingVisual text trailingVisual": only
          // that track changes, from content-sized to 1fr.
          '& [data-component="buttonContent"]': {
            flex: 1,
            gridTemplateColumns: 'min-content minmax(0, 1fr) min-content',
          },
          '& [data-component="text"]': { width: '100%', textAlign: 'left' },
        }}
      >
        {selected ? (
          <Box
            as="span"
            sx={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Text>{selected.title}</Text>
            <OptionLabels option={selected} />
          </Box>
        ) : (
          placeholder
        )}
      </ActionMenu.Button>
      <ActionMenu.Overlay width={overlayWidth}>
        <ActionList selectionVariant="single">
          {grouped
            ? groups.map(group => (
                <ActionList.Group key={group || 'ungrouped'}>
                  {group ? (
                    <ActionList.GroupHeading>{group}</ActionList.GroupHeading>
                  ) : null}
                  {rows(
                    ordered.filter(option => (option.group ?? '') === group),
                  )}
                </ActionList.Group>
              ))
            : rows(ordered)}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

export default CodeSandboxEnvironmentSelect;
