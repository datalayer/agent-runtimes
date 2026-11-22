/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The mould of the seed agents' small UI plugins (the user, 15 November 2026:
 * "make sure we have fine grained plugins to be injected in the various seed
 * agents we focus on").
 *
 * Each of those plugins does one job: it draws one tool's call — the
 * Shopper's `show_basket`, the Accountant's `show_reconciliation`, the
 * Marketer's `post_to_x` — where the call lands in the transcript. It binds
 * that tool (`ToolBindings`, with or without a server's prefix) to a display
 * type of its own and renders that type (`Renderers`), as `pap-sign-in` does:
 * no plugin silences another, and a tool nobody claims keeps the chat's row.
 *
 * A card reads what the agent passed (`args`) while the call runs and what
 * the tool answered once it is done — the runtime's `show_*` tools
 * (`agent_runtimes.tools.cards`) check the data and answer it normalized —,
 * and falls back to the chat's own row for a refusal or a failed call.
 *
 * A card that answers back (*Choose this trip*, *Approve these matches*)
 * sends the person's next turn as a form submission
 * (`chat/messages/formSubmission`), through the chat it is drawn in
 * (`ToolCardSendContext`, which `ChatBase` provides).
 *
 * @module apps/toolCards/kit
 */

import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type JSX,
} from 'react';
import type { ReactNode } from 'react';
import { Heading, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { contribution, definePlugin, signal } from '@datalayer/reactor';
import type { ReactorPlatform, ReactorPlugin } from '@datalayer/reactor';
import {
  pickRenderer,
  Renderers,
  ToolBindings,
  type Display,
} from '@datalayer/reactor/ui';
import {
  defineRenderer,
  type ReactRendererContribution,
  type RendererProps,
} from '@datalayer/reactor/ui/react';
import type { ToolCallRenderContext } from '../../types/chat';
import type { FrontendToolDefinition } from '../../types/tools';
import { AgentChatExtras, type AgentChatExtrasValue } from '../core';
import type { AgentSidePanelProps } from '../shell/SidePanel';
import { CHROME_SLOTS, SIDE_PANEL_ORDER, type SidePlacement } from './chrome';
import {
  encodeFormSubmission,
  type FormSubmission,
} from '../../chat/messages/formSubmission';
import { uiManifestOf } from '../uiManifest';

/** Sends a turn as the person; false when the chat could not. */
export type ToolCardSend = (message: string) => boolean;

/**
 * The chat's send, for the cards drawn in its transcript. `ChatBase`
 * provides it around its message list; absent, a card offers no button.
 */
export const ToolCardSendContext = createContext<ToolCardSend | undefined>(
  undefined,
);

/** The send of the chat a card is drawn in, if it has one. */
export function useToolCardSend(): ToolCardSend | undefined {
  return useContext(ToolCardSendContext);
}

/** Sends a form submission as the person's next turn. */
export function submitCard(
  send: ToolCardSend | undefined,
  submission: FormSubmission,
): boolean {
  return send ? send(encodeFormSubmission(submission)) : false;
}

/**
 * The platform of an agent's own UI plugins, for a `Chat` that is not inside
 * an Agent workspace (`Chat uiPlugins`): its transcript draws the tool calls
 * those plugins bind from it rather than from the page's reactor.
 */
export const AgentUiPlatformContext = createContext<ReactorPlatform | null>(
  null,
);

/**
 * A display drawn by the renderer a given platform contributes — the
 * agent's own plugins' platform, which the page's reactor hooks
 * (`ReactorDisplay`) do not see —, else the fallback.
 */
export function PlatformDisplay<C>({
  platform,
  display,
  context,
  fallback,
}: {
  platform: ReactorPlatform;
  display: Display;
  context?: C;
  fallback: ReactNode;
}): JSX.Element {
  const entry = pickRenderer(
    platform.getContributions(Renderers) as never,
    display,
  );
  const component = (entry?.value as ReactRendererContribution<C> | undefined)
    ?.component;
  if (!component) {
    return <>{fallback}</>;
  }
  const Component = component;
  return <Component display={display} context={context} />;
}

/** A tool name, bare or with a server's or a toolset's prefix. */
export function toolPattern(name: string): RegExp {
  return new RegExp(`(^|[_.:\\-/])${name}$`);
}

// ---- Reading what the agent passed --------------------------------------

export type Data = Record<string, unknown>;

/** An object, or the JSON of one; null otherwise. */
export function record(value: unknown): Data | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) {
      return null;
    }
    try {
      return record(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Data)
    : null;
}

/** Words, trimmed; empty for anything else. */
export function words(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

/** A finite number, from a number or its words; undefined otherwise. */
export function amount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const read = Number(value.trim().replace(/,/g, ''));
    return Number.isFinite(read) ? read : undefined;
  }
  return undefined;
}

/** The objects of a list; empty for anything else. */
export function records(value: unknown): Data[] {
  return Array.isArray(value)
    ? value.map(record).filter((each): each is Data => each !== null)
    : [];
}

/** The words of a list; empty for anything else. */
export function wordsList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(words).filter(Boolean) : [];
}

/** An address a card may link to: https only. */
export function safeUrl(value: unknown): string {
  const url = words(value);
  return /^https:\/\/[^\s]+$/i.test(url) ? url : '';
}

/** An image a card may draw: https, or a PNG/JPEG/WebP data URL. */
export function safeImage(value: unknown): string {
  const url = words(value);
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) {
    return url;
  }
  return safeUrl(url);
}

/** An amount in its currency: `USD 1,234.50`. */
export function money(value: number | undefined, currency: string): string {
  if (value === undefined) {
    return '';
  }
  const shown = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${shown}` : shown;
}

/**
 * What a card draws from: the tool's answer once complete — the runtime's
 * `show_*` tools answer the data they checked, under `shown` —, else what
 * the agent passed. Null for a refusal (a sentence) or a failed call.
 */
export function cardData(context: ToolCallRenderContext | undefined): {
  data: Data;
  done: boolean;
} | null {
  if (!context) {
    return null;
  }
  if (context.status === 'error') {
    return null;
  }
  if (context.status === 'complete') {
    const answered = record(context.result);
    if (answered && 'shown' in answered) {
      return { data: answered, done: true };
    }
    if (answered === null && typeof context.result === 'string') {
      // A sentence: the tool refused what it was given.
      return null;
    }
    return { data: answered ?? record(context.args) ?? {}, done: true };
  }
  return { data: record(context.args) ?? {}, done: false };
}

// ---- Drawing ------------------------------------------------------------

/** A card: a titled section, as the chat's other cards stand. */
export function CardFrame({
  title,
  subtitle,
  label,
  children,
  maxWidth = 640,
}: {
  title: string;
  subtitle?: string;
  label?: string;
  children?: ReactNode;
  maxWidth?: number;
}): JSX.Element {
  return (
    <Box
      as="section"
      aria-label={label ?? title}
      my={2}
      p={3}
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
      bg="canvas.subtle"
      width="100%"
      maxWidth={maxWidth}
    >
      <Heading as="h4" sx={{ fontSize: 2, mb: subtitle ? 0 : 2 }}>
        {title}
      </Heading>
      {subtitle ? (
        <Text as="p" sx={{ mt: 0, mb: 2, color: 'fg.muted', fontSize: 1 }}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

export type Column<Row> = {
  key: string;
  title: string;
  align?: 'left' | 'right' | 'center';
  cell: (row: Row) => ReactNode;
};

/** A plain table, scrolled sideways on a narrow chat rather than squeezed. */
export function CardTable<Row>({
  columns,
  rows,
  caption,
  footer,
  rowKey,
}: {
  columns: Column<Row>[];
  rows: Row[];
  caption: string;
  footer?: ReactNode;
  rowKey: (row: Row, index: number) => string;
}): JSX.Element {
  const cellSx = {
    px: 2,
    py: 1,
    borderBottom: '1px solid',
    borderColor: 'border.muted',
    fontSize: 1,
    verticalAlign: 'top',
  } as const;
  return (
    <Box overflowX="auto">
      <Box as="table" width="100%" sx={{ borderCollapse: 'collapse' }}>
        <Box
          as="caption"
          sx={{ textAlign: 'left', fontSize: 0, color: 'fg.muted', pb: 1 }}
        >
          {caption}
        </Box>
        <thead>
          <tr>
            {columns.map(column => (
              <Box
                as="th"
                key={column.key}
                scope="col"
                sx={{
                  ...cellSx,
                  textAlign: column.align ?? 'left',
                  color: 'fg.muted',
                  fontWeight: 'semibold',
                  whiteSpace: 'nowrap',
                }}
              >
                {column.title}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map(column => (
                <Box
                  as="td"
                  key={column.key}
                  sx={{ ...cellSx, textAlign: column.align ?? 'left' }}
                >
                  {column.cell(row)}
                </Box>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </Box>
    </Box>
  );
}

/** A grey bar standing for a card still being written. */
export function CardSkeleton({ label }: { label: string }): JSX.Element {
  return (
    <Box aria-busy="true" aria-label={label} my={2} width="100%" maxWidth={640}>
      {[0, 1, 2].map(line => (
        <Box
          key={line}
          height={12}
          mb={2}
          borderRadius={2}
          bg="neutral.muted"
          width={line === 2 ? '60%' : '100%'}
        />
      ))}
    </Box>
  );
}

// ---- The plugin ---------------------------------------------------------

export type ToolCardPluginOptions = {
  /** The UI spec's id, and the folder's name (`trip-options`). */
  id: string;
  displayName: string;
  description: string;
  octicon: string;
  emoji: string;
  /** The tools it draws, by bare name; a server's prefix is allowed. */
  tools: readonly string[];
  /** What it draws for one call. */
  Card: (props: { context: ToolCallRenderContext }) => JSX.Element;
  /**
   * The frontend tools it hands the chat's agent, run in the page: the
   * tools whose calls it draws, when they are the page's own (a deck or a
   * sheet built in the conversation) rather than the runtime's `show_*`.
   * They reach the agent with the chat's extras, wherever it runs.
   */
  frontendTools?: FrontendToolDefinition[];
  /**
   * What it draws in a side panel, when its UI is placed there (`left`,
   * `right`): the live view of what its tools built (the deck, the sheet),
   * the conversation keeping a line per call (`useCardSide`). The panel
   * opens with its tools' first call.
   */
  Panel?: ComponentType<AgentSidePanelProps>;
  /** The width its panel needs, in pixels. */
  panelWidth?: number;
  /**
   * Components it draws in the workspace's slots besides its cards (the
   * notices over the view, `AgentSlots.viewOverlay`).
   */
  components?: ReadonlyArray<{
    slot: string;
    id: string;
    Component: ComponentType<Record<string, unknown>>;
  }>;
};

/**
 * The side panel a card's UI is placed in, when it is placed in one: its
 * live view is drawn there, and the conversation keeps a line per call.
 */
export const CardSideContext = createContext<SidePlacement | undefined>(
  undefined,
);

/** The side panel the card being drawn is placed in, if any (`CardSideContext`). */
export function useCardSide(): SidePlacement | undefined {
  return useContext(CardSideContext);
}

/** The plugin's name: `@datalayer/agent-plugin-<id>`. */
export const toolCardPluginName = (id: string): string =>
  `@datalayer/agent-plugin-${id}`;

/** The display type a tool card plugin renders. */
export const toolCardType = (id: string): string =>
  `application/vnd.datalayer.card.${id}+json`;

/**
 * A plugin that draws its tools' calls: one renderer, one binding per tool.
 */
export function defineToolCardPlugin(
  options: ToolCardPluginOptions,
  side?: SidePlacement,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  const type = toolCardType(options.id);
  const { Card, Panel } = options;
  if (side && !Panel) {
    throw new Error(
      `The card ${options.id} has no view for a side panel: it is drawn in the conversation only.`,
    );
  }
  function Rendered({
    display,
    context,
  }: RendererProps<ToolCallRenderContext>): JSX.Element {
    if (!context) {
      return createElement('span', null, display.text);
    }
    const card = createElement(Card, { key: display.id, context });
    return side
      ? createElement(CardSideContext.Provider, { value: side }, card)
      : card;
  }
  const plugin = definePlugin({
    name: toolCardPluginName(options.id),
    displayName: options.displayName,
    description: options.description,
    octicon: options.octicon,
    emoji: options.emoji,
    // What its UI spec says, when it is one: the catalogue's facts on its manifest.
    ...uiManifestOf(options.id),
    contributes: [
      contribution(Renderers, defineRenderer({ type, component: Rendered }), {
        id: options.id,
      }),
      ...options.tools.map(tool =>
        contribution(
          ToolBindings,
          { tool: toolPattern(tool), type },
          { id: `${options.id}-${tool}` },
        ),
      ),
      ...(options.frontendTools?.length
        ? [
            contribution(
              AgentChatExtras,
              {
                id: `${options.id}-tools`,
                extras: signal<AgentChatExtrasValue>({
                  frontendTools: options.frontendTools,
                }),
              },
              { id: `${options.id}-tools` },
            ),
          ]
        : []),
    ],
    // Placed in a side panel: its live view there, opened by its first call.
    ...(side || options.components?.length
      ? {
          build: () => ({
            components: [
              ...(options.components ?? []),
              ...(side && Panel
                ? [
                    {
                      slot: CHROME_SLOTS[side],
                      id: `${options.id}-${side}`,
                      Component: Panel as never,
                      order: SIDE_PANEL_ORDER,
                      panel: {
                        label: options.displayName,
                        follows: options.tools,
                        ...(options.panelWidth
                          ? { width: options.panelWidth }
                          : {}),
                      },
                    },
                  ]
                : []),
            ],
          }),
        }
      : {}),
  });
  return plugin as unknown as ReactorPlugin<
    Record<string, never>,
    unknown,
    unknown
  >;
}
