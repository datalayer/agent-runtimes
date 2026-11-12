/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript as a sequence diagram (SCENES S2-02), drawn by mermaid
 * from {@link sequenceDiagramPlan}'s source. mermaid is loaded when the
 * view opens (`import('mermaid')`), never with the graph; the drawing is
 * themed from Primer's tokens, light and dark; a click on an arrow or a
 * note selects its line, and the selected one is drawn heavier.
 *
 * @module components/teams/transcript/SequenceDiagram
 */

import type { JSX, MouseEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Spinner, Text, useTheme } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  sequenceDiagramPlan,
  type SequenceCastMember,
} from './sequenceDiagramRules';
import type { TranscriptRowsLines } from './TranscriptViewsTypes';

/** What of mermaid the diagram uses: so that a test gives a stand-in. */
export type MermaidLike = {
  initialize: (config: Record<string, unknown>) => void;
  render: (
    id: string,
    source: string,
  ) => Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
};

/** mermaid, loaded once the view opens: its own chunk. */
export const loadMermaid = async (): Promise<MermaidLike> => {
  const loaded = await import('mermaid');
  return loaded.default as unknown as MermaidLike;
};

export type SequenceDiagramProps = TranscriptRowsLines & {
  /** The cast, in the order the participants stand: the members, then the systems. */
  cast?: readonly SequenceCastMember[];
  /** The selected line's key: its arrow is drawn heavier. */
  selected?: string | null;
  /** An arrow or a note was clicked: its line's key. */
  onSelect?: (key: string) => void;
  /** What is said while there is no line. */
  emptyText?: string;
  /** How tall it grows before it scrolls, in pixels. */
  maxHeight?: number;
  /** How mermaid is loaded: `import('mermaid')` unless a test says. */
  load?: () => Promise<MermaidLike>;
};

/** Primer's tokens the drawing is themed from, each with what it is for. */
const TOKENS = {
  background: ['--bgColor-default', 'canvas.default', '#ffffff'],
  surface: ['--bgColor-muted', 'canvas.subtle', '#f6f8fa'],
  text: ['--fgColor-default', 'fg.default', '#1f2328'],
  muted: ['--fgColor-muted', 'fg.muted', '#59636e'],
  border: ['--borderColor-default', 'border.default', '#d0d7de'],
  accent: ['--bgColor-accent-muted', 'accent.subtle', '#ddf4ff'],
  accentBorder: ['--borderColor-accent-emphasis', 'accent.emphasis', '#0969da'],
  attention: ['--bgColor-attention-muted', 'attention.subtle', '#fff8c5'],
} as const;

type Palette = Record<keyof typeof TOKENS, string>;

/** A token's value: the CSS variable on the element, else the theme's colour, else the default. */
function paletteOf(
  element: Element,
  colors: Record<string, unknown> | undefined,
): Palette {
  const styles = getComputedStyle(element);
  const fromTheme = (path: string): string | undefined => {
    let value: unknown = colors;
    for (const step of path.split('.')) {
      value =
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[step]
          : undefined;
    }
    return typeof value === 'string' ? value : undefined;
  };
  return Object.fromEntries(
    Object.entries(TOKENS).map(([name, [variable, path, fallback]]) => [
      name,
      styles.getPropertyValue(variable).trim() || fromTheme(path) || fallback,
    ]),
  ) as Palette;
}

let renderSequence = 0;

/** Everything mermaid draws a message with, in document order: the arrow's text and its line. */
const MESSAGE_PARTS = 'text.messageText, [class^="messageLine"]';
const NOTE_PARTS = 'text.noteText, rect.note';

/** The transcript as a sequence diagram, drawn by mermaid when the view opens. */
export function SequenceDiagram({
  lines,
  cast = [],
  selected,
  onSelect,
  emptyText = 'What the scene says and does draws here, arrow by arrow.',
  maxHeight,
  load = loadMermaid,
}: SequenceDiagramProps): JSX.Element {
  const target = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const { theme, resolvedColorScheme } = useTheme();
  const [state, setState] = useState<'loading' | 'drawn' | 'error'>('loading');
  const [error, setError] = useState<string>();
  const plan = useMemo(() => sequenceDiagramPlan(lines, cast), [lines, cast]);
  const fontFamily = (theme as { fonts?: { normal?: string } } | undefined)
    ?.fonts?.normal;
  const colors = (theme as { colors?: Record<string, unknown> } | undefined)
    ?.colors;

  useEffect(() => {
    const element = target.current;
    if (!element || lines.length === 0) {
      return undefined;
    }
    let active = true;
    setState('loading');
    setError(undefined);
    const draw = async () => {
      const mermaid = await load();
      if (!active) {
        return;
      }
      const palette = paletteOf(element, colors);
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        fontFamily: fontFamily || 'system-ui, sans-serif',
        themeVariables: {
          darkMode: resolvedColorScheme?.includes('dark') ?? false,
          background: palette.background,
          primaryColor: palette.surface,
          primaryTextColor: palette.text,
          primaryBorderColor: palette.border,
          secondaryColor: palette.accent,
          tertiaryColor: palette.background,
          lineColor: palette.muted,
          textColor: palette.text,
          actorBkg: palette.surface,
          actorBorder: palette.border,
          actorTextColor: palette.text,
          actorLineColor: palette.border,
          signalColor: palette.muted,
          signalTextColor: palette.text,
          labelBoxBkgColor: palette.surface,
          labelBoxBorderColor: palette.border,
          labelTextColor: palette.text,
          loopTextColor: palette.text,
          noteBkgColor: palette.attention,
          noteBorderColor: palette.border,
          noteTextColor: palette.text,
          activationBkgColor: palette.accent,
          activationBorderColor: palette.accentBorder,
          sequenceNumberColor: palette.text,
        },
        sequence: { useMaxWidth: true, mirrorActors: false },
      });
      // StrictMode runs the effect twice before the first drawing settles,
      // and mermaid keeps temporary DOM under this id: each attempt its own.
      renderSequence += 1;
      const id = `dla-sequence-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}-${renderSequence}`;
      const result = await mermaid.render(id, plan.source);
      if (!active || !target.current) {
        return;
      }
      target.current.innerHTML = result.svg;
      result.bindFunctions?.(target.current);
      setState('drawn');
    };
    void draw().catch((reason: unknown) => {
      if (active) {
        setState('error');
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    });
    return () => {
      active = false;
      element.replaceChildren();
    };
  }, [
    plan,
    colors,
    fontFamily,
    resolvedColorScheme,
    lines.length,
    load,
    reactId,
  ]);

  // The selected line's arrow or note, marked on the drawing as it stands.
  useEffect(() => {
    const element = target.current;
    if (!element || state !== 'drawn') {
      return;
    }
    for (const part of element.querySelectorAll('[data-transcript-selected]')) {
      part.removeAttribute('data-transcript-selected');
    }
    if (!selected) {
      return;
    }
    const arrow = plan.arrows.indexOf(selected);
    const note = plan.notes.indexOf(selected);
    const texts = element.querySelectorAll(
      arrow >= 0 ? 'text.messageText' : 'text.noteText',
    );
    const strokes = element.querySelectorAll(
      arrow >= 0 ? '[class^="messageLine"]' : 'rect.note',
    );
    const index = arrow >= 0 ? arrow : note;
    if (index < 0) {
      return;
    }
    texts[index]?.setAttribute('data-transcript-selected', 'text');
    strokes[index]?.setAttribute('data-transcript-selected', 'stroke');
  }, [selected, plan, state]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onSelect || !target.current) {
      return;
    }
    const hit = (event.target as Element | null)?.closest(
      `${MESSAGE_PARTS}, ${NOTE_PARTS}`,
    );
    if (!hit) {
      return;
    }
    const isNote = hit.matches(NOTE_PARTS);
    const parts = [
      ...target.current.querySelectorAll(isNote ? NOTE_PARTS : MESSAGE_PARTS),
    ];
    // Each message is a text and a line, each note a rect and a text: two parts each, in order.
    const index = Math.floor(parts.indexOf(hit) / 2);
    const key = (isNote ? plan.notes : plan.arrows)[index];
    if (key) {
      onSelect(key);
    }
  };

  if (lines.length === 0) {
    return (
      <Text
        as="p"
        sx={{ color: 'fg.muted', fontSize: 1, m: 0 }}
        data-sequence-diagram="empty"
      >
        {emptyText}
      </Text>
    );
  }
  return (
    <Box
      data-sequence-diagram={state}
      data-sequence-arrows={plan.arrows.length}
    >
      {state === 'loading' && (
        <Box display="flex" alignItems="center" gap={2} py={2}>
          <Spinner size="small" />
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            Drawing the sequence…
          </Text>
        </Box>
      )}
      {state === 'error' && (
        <Text
          as="p"
          sx={{ color: 'danger.fg', fontSize: 1, m: 0 }}
          data-sequence-error=""
        >
          The sequence could not be drawn: {error}
        </Text>
      )}
      <Box
        ref={target}
        role="img"
        aria-label="Sequence diagram of the transcript"
        onClick={onClick}
        sx={{
          ...(maxHeight ? { maxHeight, overflow: 'auto' } : {}),
          '& svg': { maxWidth: '100%', height: 'auto' },
          '& text.messageText, & text.noteText, & [class^="messageLine"], & rect.note':
            {
              cursor: onSelect ? 'pointer' : undefined,
            },
          '& [data-transcript-selected="text"]': { fontWeight: 700 },
          '& [data-transcript-selected="stroke"]': { strokeWidth: 3 },
        }}
      />
    </Box>
  );
}

export default SequenceDiagram;
