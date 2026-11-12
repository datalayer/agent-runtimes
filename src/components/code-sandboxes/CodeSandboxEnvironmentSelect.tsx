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
 * name first and labels after it, so the closed control and the open one
 * show the same thing.
 *
 * An `ActionMenu` rather than a `<select>`: what tells two entries apart is
 * their labels — the environment name, the provider, the credits it burns —
 * and no `<option>` can carry those.
 *
 * @module components/code-sandboxes/CodeSandboxEnvironmentSelect
 */

import { useId, useState, type JSX } from 'react';
import { Box } from '@datalayer/primer-addons';
import {
  ActionList,
  ActionMenu,
  Label,
  Link,
  Text,
  ToggleSwitch,
} from '@primer/react';

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
  /**
   * The version this choice launches, written as it reads — `v3`. Only an
   * environment somebody built has one (E1-19).
   */
  version?: string;
  /** The size class it runs on, which is what prices it (D-4). */
  sizeClass?: string;
  /**
   * Whether the choice cannot be launched: a version whose Datalayer artifact
   * was never built, or one nothing prices. Hidden unless the person asks to
   * see them with the *Show disabled environments* toggle; then shown greyed.
   */
  disabled?: boolean;
  /**
   * Where to go to build the missing artifact: the version's own page. Offered
   * beside a disabled choice whose only trouble is that nobody built it yet.
   */
  buildHref?: string;
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
   * Wide so a priced entry's labels usually fit beside its name; when they do
   * not, they wrap under it rather than squeezing the name.
   */
  overlayWidth?: 'small' | 'medium' | 'large' | 'xlarge' | 'auto';
};

/** Ellipsis on one line: the full text stays in the `title` tooltip. */
const TRUNCATE = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/**
 * The labels of an option: cost, GPU, version, size, name, provider, where.
 *
 * In the list they wrap among themselves (`wrap`), so a long environment id
 * never pushes the row past the overlay. On the trigger they stay on one
 * line and clip, since the trigger is one line high.
 */
function OptionLabels(props: {
  option: ICodeSandboxEnvironmentOption;
  wrap?: boolean;
}): JSX.Element {
  const { option, wrap } = props;
  const labels: {
    key: string;
    text: string;
    variant?: 'sponsors' | 'success' | 'secondary' | 'accent';
  }[] = [];
  if (option.burningRate) {
    labels.push({
      key: 'rate',
      text: `${option.burningRate} credits/second`,
      variant: 'sponsors',
    });
  }
  if (option.gpu) {
    labels.push({ key: 'gpu', text: 'GPU', variant: 'success' });
  }
  if (option.version) {
    labels.push({ key: 'version', text: option.version, variant: 'secondary' });
  }
  if (option.sizeClass) {
    labels.push({ key: 'size', text: option.sizeClass, variant: 'secondary' });
  }
  if (option.name) {
    labels.push({ key: 'name', text: option.name });
  }
  if (option.providerTitle) {
    labels.push({
      key: 'provider',
      text: option.providerTitle,
      variant: 'accent',
    });
  }
  if (option.location) {
    labels.push({
      key: 'location',
      text: option.location,
      variant: 'secondary',
    });
  }
  return (
    <Box
      as="span"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: 0,
        maxWidth: '100%',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        overflow: wrap ? undefined : 'hidden',
      }}
    >
      {labels.map(label => (
        <Label
          key={label.key}
          size="small"
          variant={label.variant}
          title={label.text}
          sx={{ ...TRUNCATE, maxWidth: '100%', flexShrink: wrap ? 1 : 0 }}
        >
          {label.text}
        </Label>
      ))}
    </Box>
  );
}

/**
 * A row's content: the name on one line, ellipsed, and its labels beside it
 * when they fit, under it when they do not. The name keeps at least 12rem
 * before the labels give way to a line of their own.
 */
function OptionRow(props: {
  option: ICodeSandboxEnvironmentOption;
}): JSX.Element {
  const { option } = props;
  return (
    <Box
      as="span"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        columnGap: 2,
        rowGap: 1,
        width: '100%',
        minWidth: 0,
      }}
    >
      <Text
        as="span"
        title={option.title}
        sx={{ ...TRUNCATE, flex: '1 1 12rem', display: 'block' }}
      >
        {option.title}
      </Text>
      <OptionLabels option={option} wrap />
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
  const toggleLabelId = useId();
  /*
   * What cannot be launched is hidden by default: a list of greyed rows reads
   * as noise when choosing where to run. The toggle shows them, greyed, with
   * the build link beside them, for whoever is looking for one.
   */
  const [showDisabled, setShowDisabled] = useState(false);
  const hasDisabled = options.some(option => option.disabled);
  const visible = showDisabled
    ? options
    : options.filter(option => !option.disabled);
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
  const priceFirst = (subset: ICodeSandboxEnvironmentOption[]) => [
    ...subset.filter(option => option.burningRate),
    ...subset.filter(option => !option.burningRate),
  ];
  const grouped = visible.some(option => option.group);
  /*
   * Within a group when there are groups. A grouped list has already been put
   * in the order its headings should read — what is yours, your organizations',
   * then the platform's (E1-19) — and partitioning across the whole list would
   * undo that: one unpriced environment of your own, which is exactly what an
   * environment awaiting its first build is, would move your heading below the
   * platform's.
   */
  const ordered = grouped ? visible : priceFirst(visible);
  const groups = grouped
    ? Array.from(new Set(visible.map(option => option.group ?? '')))
    : [];

  const rows = (subset: ICodeSandboxEnvironmentOption[]) =>
    subset.map(option => (
      <ActionList.Item
        key={option.key}
        selected={option.key === selectedKey}
        disabled={option.disabled}
        onSelect={() => {
          // A choice that cannot be launched is shown, not chosen: selecting
          // it would start a sandbox the platform refuses.
          if (!option.disabled) {
            onSelect(option.key);
          }
        }}
      >
        <OptionRow option={option} />
        {option.disabled && option.buildHref ? (
          // What to do about it, where it is noticed: the version's page is
          // where a build for this variant is started (E1-21).
          <ActionList.Description variant="block">
            <Link
              href={option.buildHref}
              onClick={event => event.stopPropagation()}
              sx={{ pointerEvents: 'auto' }}
            >
              Build for this variant
            </Link>
          </ActionList.Description>
        ) : null}
      </ActionList.Item>
    ));

  return (
    <>
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
              minWidth: 0,
              gridTemplateColumns: 'min-content minmax(0, 1fr) min-content',
            },
            '& [data-component="text"]': {
              width: '100%',
              minWidth: 0,
              textAlign: 'left',
            },
          }}
        >
          {selected ? (
            <Box
              as="span"
              display="flex"
              width="100%"
              minWidth={0}
              alignItems="center"
              justifyContent="space-between"
              gap={2}
            >
              <Text
                as="span"
                title={selected.title}
                sx={{ ...TRUNCATE, flex: '1 1 auto', display: 'block' }}
              >
                {selected.title}
              </Text>
              <OptionLabels option={selected} />
            </Box>
          ) : (
            placeholder
          )}
        </ActionMenu.Button>
        {/*
          Primer already caps the overlay at the viewport's width less 2rem;
          the height is capped too, and scrolls, so a long list in a dialog
          does not run off the bottom of the screen.
        */}
        <ActionMenu.Overlay
          width={overlayWidth}
          maxHeight="large"
          overflow="auto"
        >
          <ActionList selectionVariant="single">
            {grouped
              ? groups.map(group => (
                  <ActionList.Group key={group || 'ungrouped'}>
                    {group ? (
                      <ActionList.GroupHeading>{group}</ActionList.GroupHeading>
                    ) : null}
                    {rows(
                      priceFirst(
                        ordered.filter(
                          option => (option.group ?? '') === group,
                        ),
                      ),
                    )}
                  </ActionList.Group>
                ))
              : rows(ordered)}
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
      {hasDisabled ? (
        <Box display="flex" alignItems="center" gap={2} mt={2}>
          <Text id={toggleLabelId} sx={{ fontSize: 1, color: 'fg.muted' }}>
            Show disabled environments
          </Text>
          <ToggleSwitch
            aria-labelledby={toggleLabelId}
            size="small"
            checked={showDisabled}
            // Controlled, Primer's switch flips only through its click.
            onClick={() => setShowDisabled(!showDisabled)}
          />
        </Box>
      ) : null}
    </>
  );
}

export default CodeSandboxEnvironmentSelect;
