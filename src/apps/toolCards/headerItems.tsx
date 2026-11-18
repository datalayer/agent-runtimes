/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a header UI draws in the chat's title bar, and its plugin (the user,
 * 18 November 2026: "Design and add plugins to show suited buttons in the
 * header for the other seed agents ... a drop-down choice, or visual
 * indicators").
 *
 * One set of small parts, all 28px high, in the theme's own tokens:
 *
 * - `HeaderAction`: a button; pressing it says its message as the person.
 * - `HeaderChoice`: a drop-down (an `ActionMenu`, one option chosen); the
 *   option goes with every run (`LoopRunProps`: `loop.header.<ui>.<item>`).
 * - `HeaderIndicator`: what the agent shows — words (`label`), a number and
 *   its words (`counter`), a dot and its words (`status`), a small bar
 *   (`meter`) — a polite live region, drawn only once the agent said it.
 *
 * `defineHeaderPlugin` makes a header UI's plugin from its declaration in
 * the catalogue (`UI_CATALOGUE[id].header`): each item its own entry of the
 * title bar's slot, so that a narrow chat moves them into the "…" menu one
 * by one; its frontend tool (`set_<id>`) handed to the chat with its extras;
 * its drop-downs sent with every run. The state is `headerState`'s.
 *
 * @module apps/toolCards/headerItems
 */

import type { ComponentType, JSX } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { ActionList, ActionMenu, Button } from '@primer/react';
import {
  BroadcastIcon,
  CalendarIcon,
  CloudIcon,
  CreditCardIcon,
  DotFillIcon,
  FileIcon,
  GitCompareIcon,
  GlobeIcon,
  GraphIcon,
  ListUnorderedIcon,
  MeterIcon,
  PackageIcon,
  PaperAirplaneIcon,
  PencilIcon,
  PeopleIcon,
  PlayIcon,
  SearchIcon,
  ShieldCheckIcon,
  TableIcon,
  type Icon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { contribution, definePlugin, signal } from '@datalayer/reactor';
import type { ReactorPlugin, Signal } from '@datalayer/reactor';
import { useSignalValue } from '@datalayer/reactor/react';
import {
  LoopChatExtras,
  LoopRunProps,
  LoopSlots,
  type LoopChatExtrasValue,
  type LoopWorkspaceContext,
} from '../core';
import { UI_CATALOGUE } from '../../specs/ui';
import type {
  UiHeaderItemSpec,
  UiHeaderSpec,
  UiHeaderTone,
} from '../../types/agentspecs';
import type { FrontendToolDefinition } from '../../types/tools';
import {
  chosenOptionOf,
  chosenOptionsOf,
  headerCallSummary,
  headerRunProps,
  headerStateOf,
  headerToolDescription,
  headerToolParameters,
  indicatorWords,
  meterShare,
  readHeaderArgs,
  type HeaderIndicatorState,
  type HeaderPick,
  type HeaderState,
} from './headerState';
import { PAGE_TOOL_RESULTS, useToolCalls } from './toolResults';

/** The height of every header part: Primer's small control. */
export const HEADER_PART_HEIGHT = 28;

/** The Octicons a header item may name. */
export const HEADER_ICONS: Readonly<Record<string, Icon>> = {
  broadcast: BroadcastIcon,
  calendar: CalendarIcon,
  cloud: CloudIcon,
  'credit-card': CreditCardIcon,
  file: FileIcon,
  'git-compare': GitCompareIcon,
  globe: GlobeIcon,
  graph: GraphIcon,
  'list-unordered': ListUnorderedIcon,
  meter: MeterIcon,
  package: PackageIcon,
  'paper-airplane': PaperAirplaneIcon,
  pencil: PencilIcon,
  people: PeopleIcon,
  play: PlayIcon,
  search: SearchIcon,
  'shield-check': ShieldCheckIcon,
  table: TableIcon,
};

/** A tone's colours, as the theme names them. */
export const TONE_COLORS: Readonly<
  Record<UiHeaderTone, { fg: string; emphasis: string; subtle: string }>
> = {
  neutral: {
    fg: 'fg.muted',
    emphasis: 'neutral.emphasis',
    subtle: 'neutral.subtle',
  },
  accent: {
    fg: 'accent.fg',
    emphasis: 'accent.emphasis',
    subtle: 'accent.subtle',
  },
  success: {
    fg: 'success.fg',
    emphasis: 'success.emphasis',
    subtle: 'success.subtle',
  },
  attention: {
    fg: 'attention.fg',
    emphasis: 'attention.emphasis',
    subtle: 'attention.subtle',
  },
  danger: {
    fg: 'danger.fg',
    emphasis: 'danger.emphasis',
    subtle: 'danger.subtle',
  },
};

const iconOf = (item: UiHeaderItemSpec): Icon | undefined =>
  item.octicon ? HEADER_ICONS[item.octicon] : undefined;

/** A soft ring when what an indicator says changes; none under reduced motion. */
function useChangeCue(key: string): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const node = ref.current;
    if (
      !node ||
      typeof node.animate !== 'function' ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    ) {
      return;
    }
    node.animate(
      [
        { boxShadow: '0 0 0 0 currentColor', opacity: 0.6 },
        { boxShadow: '0 0 0 4px transparent', opacity: 1 },
      ],
      { duration: 480, easing: 'ease-out' },
    );
  }, [key]);
  return ref;
}

/**
 * An indicator: what the agent shows. A polite live region: a screen reader
 * says it when it changes, without taking the person out of what they do.
 */
export function HeaderIndicator({
  item,
  state,
}: {
  item: UiHeaderItemSpec;
  state: HeaderIndicatorState | undefined;
}): JSX.Element | null {
  const shown = state !== undefined && state.visible !== false;
  const words = shown ? indicatorWords(item, state) : '';
  const ref = useChangeCue(words);
  if (!shown || !state) {
    // The live region stays, empty, so that its first words are announced.
    return (
      <Box
        as="span"
        role="status"
        aria-live="polite"
        data-header-indicator={item.id}
        data-header-shown="false"
        sx={{ display: 'none' }}
      />
    );
  }
  const tone = TONE_COLORS[state.tone ?? 'neutral'];
  const Glyph = iconOf(item);
  const display = item.display ?? 'label';
  return (
    <Box
      ref={ref}
      role="status"
      aria-live="polite"
      aria-label={words}
      title={`${words}. ${item.description}`}
      data-header-indicator={item.id}
      data-header-display={display}
      data-header-tone={state.tone ?? 'neutral'}
      data-header-shown="true"
      display="inline-flex"
      alignItems="center"
      flexShrink={0}
      sx={{
        gap: '6px',
        height: HEADER_PART_HEIGHT,
        px: 2,
        // The corner and the hairline of the theme's own small buttons, with
        // no fill: it is read, not pressed.
        borderRadius: 'var(--borderRadius-medium, 6px)',
        border: '1px solid',
        borderColor:
          'var(--button-default-borderColor-rest, var(--borderColor-muted))',
        color: tone.fg,
        fontSize: 0,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        maxWidth: 260,
      }}
    >
      {display === 'status' ? (
        <Box
          as="span"
          aria-hidden="true"
          sx={{ display: 'inline-flex', color: tone.fg, mx: '-3px' }}
        >
          <DotFillIcon size={16} />
        </Box>
      ) : Glyph ? (
        <Box as="span" aria-hidden="true" sx={{ display: 'inline-flex' }}>
          <Glyph size={14} />
        </Box>
      ) : null}
      {display === 'counter' ? (
        <Box
          as="span"
          aria-hidden="true"
          sx={{
            minWidth: 18,
            height: 18,
            px: '5px',
            borderRadius: 999,
            bg: tone.subtle,
            color: tone.fg,
            fontWeight: 'semibold',
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {state.value ?? 0}
        </Box>
      ) : null}
      {display === 'meter' ? (
        <>
          <Box
            as="span"
            aria-hidden="true"
            sx={{
              width: 44,
              height: 6,
              borderRadius: 999,
              bg: 'neutral.muted',
              overflow: 'hidden',
              display: 'inline-flex',
            }}
          >
            <Box
              as="span"
              data-header-meter-fill=""
              sx={{
                width: `${Math.round(meterShare(item, state) * 100)}%`,
                bg: tone.emphasis,
                borderRadius: 999,
                transition: 'width 240ms ease-out',
                '@media (prefers-reduced-motion: reduce)': {
                  transition: 'none',
                },
              }}
            />
          </Box>
          <Box
            as="span"
            aria-hidden="true"
            sx={{ fontWeight: 'semibold', fontVariantNumeric: 'tabular-nums' }}
          >
            {`${state.value ?? 0}${item.unit ?? ''}`}
          </Box>
        </>
      ) : null}
      <Box
        as="span"
        aria-hidden="true"
        sx={{
          color: 'fg.default',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {state.label || item.label}
      </Box>
    </Box>
  );
}

/** A drop-down: one option chosen, told to the agent with every turn. */
export function HeaderChoice({
  item,
  chosen,
  onChoose,
}: {
  item: UiHeaderItemSpec;
  chosen: string;
  onChoose: (option: string) => void;
}): JSX.Element {
  const options = item.options ?? [];
  const current = options.find(option => option.id === chosen) ?? options[0];
  const Glyph = iconOf(item);
  return (
    <ActionMenu>
      <ActionMenu.Button
        size="small"
        leadingVisual={Glyph}
        aria-label={`${item.label}: ${current?.label ?? ''}`}
        title={item.description}
        data-header-choice={item.id}
        data-header-chosen={current?.id}
      >
        {current?.label}
      </ActionMenu.Button>
      <ActionMenu.Overlay width="auto" align="end">
        <ActionList selectionVariant="single" aria-label={item.label}>
          {options.map(option => (
            <ActionList.Item
              key={option.id}
              selected={option.id === current?.id}
              onSelect={() => onChoose(option.id)}
              data-header-option={option.id}
            >
              {option.label}
            </ActionList.Item>
          ))}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

/** A button: pressing it says its message to the agent, as the person. */
export function HeaderAction({
  item,
  onPress,
  disabled = false,
}: {
  item: UiHeaderItemSpec;
  onPress: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <Button
      size="small"
      leadingVisual={iconOf(item)}
      title={item.description}
      onClick={onPress}
      disabled={disabled}
      data-header-action={item.id}
    >
      {item.label}
    </Button>
  );
}

/**
 * What an indicator shows when its tool has not said it, read from what the
 * agent showed otherwise (the basket of `show_basket`, the savings listed):
 * a hook, called by the indicator; `order` is the call it read, so that the
 * newer of the two — it, or the tool — is what shows.
 */
export type HeaderDerive = () =>
  (HeaderIndicatorState & { order: number }) | undefined;

export type HeaderPluginOptions = {
  /** The UI spec's id: its declaration is the catalogue's. */
  id: string;
  /** Indicators that also read what the agent showed, by item id. */
  derive?: Readonly<Record<string, HeaderDerive>>;
};

type SlotProps = { workspace?: LoopWorkspaceContext };

/** A header UI's declaration, from the catalogue. */
export function headerSpecOf(id: string): UiHeaderSpec {
  const header = UI_CATALOGUE[id]?.header;
  if (!header) {
    throw new Error(`The UI '${id}' declares no header.`);
  }
  return header;
}

/** The header's frontend tool: checks what the model said, and answers what it set. */
export function headerToolOf(id: string): FrontendToolDefinition | undefined {
  const spec = UI_CATALOGUE[id];
  const header = headerSpecOf(id);
  if (!header.tool) {
    return undefined;
  }
  return {
    name: header.tool,
    description: headerToolDescription(spec.name, header),
    parameters: headerToolParameters(header),
    handler: async args => {
      const read = readHeaderArgs(header, args);
      const set = [
        ...Object.keys(read.indicators),
        ...Object.keys(read.choices),
      ];
      if (set.length === 0) {
        throw new Error(
          read.problems.join(' ') ||
            `Nothing to set: name one of ${header.items
              .filter(item => item.kind !== 'action')
              .map(item => item.id)
              .join(', ')}.`,
        );
      }
      return {
        set,
        ...(read.problems.length > 0 ? { ignored: read.problems } : {}),
      };
    },
    summaryOf: args => headerCallSummary(header, args),
  };
}

/**
 * A header UI's plugin: `@datalayer/loop-plugin-<id>`. Built per workspace,
 * so that what a person picked is that workspace's.
 */
export function defineHeaderPlugin(
  options: HeaderPluginOptions,
): () => ReactorPlugin<Record<string, never>, unknown, unknown> {
  const { id } = options;
  return () => {
    const spec = UI_CATALOGUE[id];
    const header = headerSpecOf(id);
    const tool = headerToolOf(id);
    const toolNames = tool ? [tool.name] : [];
    const picked: Signal<Record<string, HeaderPick>> = signal({});
    const extras = signal<LoopChatExtrasValue>(
      tool ? { frontendTools: [tool] } : {},
    );
    const hasChoice = header.items.some(item => item.kind === 'choice');

    function useHeaderState(): HeaderState {
      const calls = useToolCalls(toolNames);
      return useMemo(() => headerStateOf(header, calls), [calls]);
    }

    const components = header.items.map(item => {
      const derive = options.derive?.[item.id];
      function Item({ workspace }: SlotProps): JSX.Element | null {
        const state = useHeaderState();
        const picks = useSignalValue(picked);
        // A hook or nothing, the same on every render of this item.
        const derived = derive?.();
        if (item.kind === 'indicator') {
          const set = state.indicators[item.id];
          const shown =
            derived && (!set || derived.order > set.order) ? derived : set;
          return <HeaderIndicator item={item} state={shown} />;
        }
        if (item.kind === 'choice') {
          return (
            <HeaderChoice
              item={item}
              chosen={chosenOptionOf(
                item,
                picks[item.id],
                state.choices[item.id],
              )}
              onChoose={option => {
                picked.value = {
                  ...picked.peek(),
                  [item.id]: { option, after: state.last },
                };
              }}
            />
          );
        }
        const send = workspace?.viewControls.send;
        return (
          <HeaderAction
            item={item}
            disabled={!send || Boolean(workspace?.viewControls.busy)}
            onPress={() => send?.(item.message ?? '')}
          />
        );
      }
      Item.displayName = `Header(${id}.${item.id})`;
      return {
        slot: LoopSlots.chatHeader,
        id: `${id}-${item.id}`,
        Component: Item as ComponentType<SlotProps> as never,
      };
    });

    return definePlugin({
      name: `@datalayer/loop-plugin-${id}`,
      displayName: spec.name,
      description: spec.description,
      octicon: spec.octicon ?? 'rows',
      emoji: spec.emoji,
      contributes: [
        contribution(
          LoopChatExtras,
          { id: `${id}-tool`, extras },
          { id: `${id}-tool` },
        ),
        ...(hasChoice
          ? [
              contribution(
                LoopRunProps,
                {
                  id: `${id}-choices`,
                  // The options the title bar shows, with every run.
                  props: () =>
                    headerRunProps(
                      id,
                      chosenOptionsOf(
                        header,
                        picked.peek(),
                        headerStateOf(
                          header,
                          PAGE_TOOL_RESULTS.callsOf(toolNames),
                        ),
                      ),
                    ),
                },
                { id: `${id}-choices` },
              ),
            ]
          : []),
      ],
      build() {
        return { components };
      },
    }) as unknown as ReactorPlugin<Record<string, never>, unknown, unknown>;
  };
}
