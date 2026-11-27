/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The designer: an application, a scene or a stage
 * authored the way Visual Basic authored a form. Nothing runs here — what is
 * built is played elsewhere.
 *
 * The design surface fills the page, on the dotted grid a form designer
 * draws; on its right, the *Toolbox* of what can be placed on it, the
 * *Properties* of what is selected, and its *Events* — what happens when.
 * Each panel has its title bar and folds away. Below a desktop's width the
 * panels go under the surface.
 *
 * @module apps/composer/DesignerShell
 */

import type {
  DragEvent,
  JSX,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconButton, Text } from '@primer/react';
import { Box, Card } from '@datalayer/primer-addons';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GrabberIcon,
  PinIcon,
  PinSlashIcon,
  type Icon,
} from '@primer/octicons-react';

/** What the designer's panels are called, and what they say when empty. */
export const DESIGNER_WORDS = {
  surface: 'Design surface',
  dock: 'Controls',
  toolbox: 'Toolbox',
  properties: 'Properties',
  events: 'Events',
  nothingSelected: 'Select a part on the surface to set its properties.',
  /** *Remove this part* asks first: what goes with the part, and that Undo brings it back. */
  removeTitle: (label: string): string => `Remove ${label}?`,
  removeSays:
    'It goes off the surface with what was set on it. Undo brings it back; adding it again from the Toolbox starts it blank.',
  removeConfirm: 'Remove it',
} as const;

/** One of the designer's panels: a title bar that folds it, and what it holds. */
export function DesignerPanel({
  title,
  icon: PanelIcon,
  children,
  folded: startFolded = false,
  open,
  onOpenChange,
  id,
  maxHeight = '60vh',
  summary,
}: {
  title: string;
  icon: Icon;
  children: ReactNode;
  /** What it holds in a few words, after its title while it is folded: the scene's backdrop, `Space`. */
  summary?: ReactNode;
  /** Folded at first (when not controlled by `open`). */
  folded?: boolean;
  /** Open or folded, decided by the designer (a click on the surface opens the section of what it picked). */
  open?: boolean;
  /** Its title bar was clicked: the designer decides. */
  onOpenChange?: (open: boolean) => void;
  id: string;
  /** How tall it grows before it scrolls: a long toolbox gives way to the properties under it. */
  maxHeight?: string | number;
}): JSX.Element {
  const [ownFolded, setOwnFolded] = useState(startFolded);
  const folded = open === undefined ? ownFolded : !open;
  const setFolded = (next: (value: boolean) => boolean) => {
    const value = next(folded);
    if (open === undefined) {
      setOwnFolded(value);
    }
    onOpenChange?.(!value);
  };
  const Chevron = folded ? ChevronRightIcon : ChevronDownIcon;
  return (
    <Card
      // A region, not a <section>: a slide is a <section> to Reveal, which hides
      // and counts every one inside a deck (the mock designer on a slide).
      role="region"
      aria-labelledby={`designer-${id}`}
      data-designer-panel={id}
      border
      shadow="none"
      display="block"
      p={0}
      overflow="hidden"
    >
      <Box
        as="button"
        type="button"
        id={`designer-${id}`}
        aria-expanded={!folded}
        onClick={() => setFolded(value => !value)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          width: '100%',
          px: 2,
          py: 1,
          border: 0,
          borderBottom: folded ? 0 : '1px solid',
          borderColor: 'border.default',
          bg: 'canvas.subtle',
          color: 'fg.default',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        <Chevron size={14} />
        <PanelIcon size={14} />
        <Text
          sx={{
            fontSize: 0,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {title}
        </Text>
        {folded && summary ? (
          <Text
            sx={{
              fontSize: 0,
              color: 'fg.muted',
              ml: 'auto',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            data-designer-panel-summary=""
          >
            {summary}
          </Text>
        ) : null}
      </Box>
      {folded ? null : (
        <Box p={2} maxHeight={maxHeight} overflowY="auto">
          {children}
        </Box>
      )}
    </Card>
  );
}

/**
 * One thing the toolbox places: dragged onto the surface, or added with a
 * click or the keyboard where no pointer is. What it carries in the
 * drag is the surface's to read: `type` names the drag, `payload` the thing.
 */
export function DesignerTool({
  type,
  payload,
  data,
  icon,
  label,
  says,
  onAdd,
  onDragStart,
  onDragEnd,
  disabled = false,
  current = false,
}: {
  type: string;
  payload: string;
  /** Its `data-designer-tool`, which a test or a probe finds it by. */
  data: string;
  icon: ReactNode;
  label: string;
  says: string;
  onAdd: () => void;
  /** Told when it is picked up and let go: the surface shows where it may be dropped meanwhile. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
  disabled?: boolean;
  /** The entry the part selected on the surface was placed from: marked, its properties under it. */
  current?: boolean;
}): JSX.Element {
  return (
    <Box
      as="button"
      type="button"
      draggable={!disabled}
      disabled={disabled}
      aria-current={current ? 'true' : undefined}
      data-designer-tool={data}
      data-designer-tool-current={current ? '' : undefined}
      title={says}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.setData(type, payload);
        event.dataTransfer.effectAllowed = 'copy';
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onClick={onAdd}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        width: '100%',
        px: 2,
        py: '6px',
        mb: 1,
        font: 'inherit',
        textAlign: 'left',
        color: 'fg.default',
        bg: current ? 'accent.subtle' : 'canvas.default',
        border: '1px solid',
        borderColor: current ? 'accent.emphasis' : 'border.default',
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'grab',
        '&:hover': { borderColor: 'accent.emphasis', bg: 'accent.subtle' },
        '&:active': { cursor: 'grabbing' },
      }}
    >
      <Box flexShrink={0} display="flex">
        {icon}
      </Box>
      <Box minWidth={0}>
        <Text
          as="div"
          sx={{
            fontSize: 1,
            fontWeight: 'semibold',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Text>
        {says ? (
          <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
            {says}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * Where the dock sits when it floats: the top left corner of its box, in the
 * designer's own frame — not the window, so a picture of the designer, scaled
 * to its box, floats its dock inside itself too.
 */
export type DockPosition = { x: number; y: number };

const DOCK_WIDTH = 360;
/** How close to the frame's edges a floating dock may go. */
const DOCK_MARGIN = 8;
/** Remembered per viewer, a convenience only: the page is right without it. */

/** The room between the editor and a dock floating beside it. */
const DOCK_GAP = 16;

/** Where a dock first stands: on the right of the surface, or floating beside the editor. */
export type InitialDock = 'docked' | 'right';

/**
 * A spread editor with its dock floating: its width — its own, or less, so
 * that a dock fits on either side of it, centred — and where a dock beside
 * it on the right stands.
 */
export function besideEditor(
  frameWidth: number,
  contentWidth: number,
): { editorWidth: number; x: number } {
  const editorWidth = Math.max(
    480,
    Math.min(
      contentWidth,
      frameWidth - 2 * (DOCK_WIDTH + DOCK_GAP + DOCK_MARGIN),
    ),
  );
  const x = Math.min(
    (frameWidth + editorWidth) / 2 + DOCK_GAP,
    Math.max(DOCK_MARGIN, frameWidth - DOCK_WIDTH - DOCK_MARGIN),
  );
  return { editorWidth, x };
}

/**
 * An editor as wide as its frame, with its dock floating: narrowed on its right
 * by a dock's room, the dock beside it there (the user, 27 November 2026: "show
 * the dock at the right of the canvas editor"). A frame too narrow for both
 * keeps the editor whole and the dock over its right-hand side.
 */
export function besideFullEditor(frameWidth: number): {
  editorWidth: number;
  x: number;
} {
  const room = DOCK_WIDTH + DOCK_GAP + DOCK_MARGIN;
  if (frameWidth - room < 480) {
    return {
      editorWidth: frameWidth,
      x: Math.max(DOCK_MARGIN, frameWidth - DOCK_WIDTH - DOCK_MARGIN),
    };
  }
  return { editorWidth: frameWidth - room, x: frameWidth - room + DOCK_GAP };
}

/** The dock kept inside the designer's frame, whatever it is dragged to or the frame becomes. */
export function clampDock(
  position: DockPosition,
  frame: { width: number; height: number },
): DockPosition {
  const maxX = Math.max(DOCK_MARGIN, frame.width - DOCK_WIDTH - DOCK_MARGIN);
  // Its header stays reachable: never dragged under the frame's bottom edge.
  const maxY = Math.max(DOCK_MARGIN, frame.height - 48);
  return {
    x: Math.min(Math.max(position.x, DOCK_MARGIN), maxX),
    y: Math.min(Math.max(position.y, DOCK_MARGIN), maxY),
  };
}

/** The dock's cookie: where the reader left it, a year long, for every page of the site. */
export const DOCK_COOKIE = 'datalayer-designer-dock';
const DOCK_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Where the reader left the dock, read from its cookie; `null` when they never
 * chose (the dock then floats beside the editor: the user, 24 November 2026).
 */
export function readDock(): {
  floating: boolean;
  position: DockPosition | null;
} | null {
  try {
    const raw = document.cookie
      .split('; ')
      .find(part => part.startsWith(`${DOCK_COOKIE}=`));
    if (!raw) {
      return null;
    }
    const kept = JSON.parse(
      decodeURIComponent(raw.slice(DOCK_COOKIE.length + 1)),
    );
    if (kept && typeof kept.floating === 'boolean') {
      const position =
        kept.position &&
        Number.isFinite(kept.position.x) &&
        Number.isFinite(kept.position.y)
          ? { x: kept.position.x, y: kept.position.y }
          : null;
      return { floating: kept.floating, position };
    }
  } catch {
    // An unreadable cookie: as if never chosen.
  }
  return null;
}

/** The reader's choice, kept in the dock's cookie. */
export function keepDock(
  floating: boolean,
  position: DockPosition | null,
): void {
  try {
    document.cookie = `${DOCK_COOKIE}=${encodeURIComponent(
      JSON.stringify({ floating, position }),
    )}; path=/; max-age=${DOCK_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    // No cookies here: it floats beside the editor next time.
  }
}

const DOCK_WORDS = {
  float: 'Float the panel over the surface',
  dock: 'Dock the panel on the right',
  move: 'Move the panel: drag it, or use the arrow keys',
} as const;

/** Elements in the header or footer that act on a click, never start a drag. */
const NOT_A_HANDLE = 'button, a, input, select, textarea';

/** A bar of the dock — its header or its footer: a grip to drag it by, and what the designer adds. */
function DockBar({
  edge,
  children,
  onGrab,
  onNudge,
}: {
  edge: 'header' | 'footer';
  children?: ReactNode;
  onGrab: (event: ReactPointerEvent) => void;
  onNudge: (dx: number, dy: number) => void;
}): JSX.Element {
  return (
    <Box
      data-designer-dock-bar={edge}
      onPointerDown={onGrab}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        minHeight: 32,
        px: 2,
        py: 1,
        bg: 'canvas.subtle',
        borderColor: 'border.default',
        [edge === 'header' ? 'borderBottom' : 'borderTop']: '1px solid',
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
        '&:active': { cursor: 'grabbing' },
      }}
    >
      <Box
        as="span"
        role="button"
        tabIndex={0}
        aria-label={DOCK_WORDS.move}
        title={DOCK_WORDS.move}
        data-designer-dock-grip={edge}
        onKeyDown={(event: KeyboardEvent) => {
          const step = event.shiftKey ? 64 : 16;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const move = moves[event.key];
          if (move) {
            event.preventDefault();
            onNudge(...move);
          }
        }}
        sx={{
          display: 'flex',
          color: 'fg.muted',
          borderRadius: 1,
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'accent.fg',
          },
        }}
      >
        <GrabberIcon size={14} />
      </Box>
      <Box display="flex" alignItems="center" gap={2} flex={1} minWidth={0}>
        {children}
      </Box>
    </Box>
  );
}

export type DesignerDockProps = {
  /** Its name, in its header. */
  title: string;
  /** What the designer adds to the header, after the title: labels, indicators. */
  header?: ReactNode;
  /** What the designer adds to the footer: counts, states, hints. */
  footer?: ReactNode;
  /** The panels it holds, top to bottom. */
  children: ReactNode;
  /** The designer's frame, which a floating dock is placed in. */
  frame: RefObject<HTMLElement | null>;
  floating: boolean;
  position: DockPosition | null;
  onDock: (floating: boolean, position: DockPosition | null) => void;
};

/**
 * The designer's controls in one box (asked 14 October 2026): docked on the
 * right by default, or floated over the surface — dragged there by its header
 * or its footer, or by the button in its header — in which case the surface
 * takes the whole width. The header and the footer carry what the designer
 * adds to them, beside the grip.
 */
export function DesignerDock({
  title,
  header,
  footer,
  children,
  frame,
  floating,
  position,
  onDock,
}: DesignerDockProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  /** The frame's box on screen, its own size, and how much it is scaled (a picture of the designer is). */
  const measure = () => {
    const element = frame.current;
    const rect = element?.getBoundingClientRect() ?? new DOMRect();
    const width = element?.offsetWidth ?? 0;
    const height = element?.offsetHeight ?? 0;
    return {
      rect,
      width,
      height,
      scale: width && rect.width ? rect.width / width : 1,
    };
  };

  // Floating, it stays in the frame whatever the frame becomes.
  useEffect(() => {
    const element = frame.current;
    if (
      !floating ||
      !position ||
      !element ||
      typeof ResizeObserver === 'undefined'
    ) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      const kept = clampDock(position, measure());
      if (kept.x !== position.x || kept.y !== position.y) {
        onDock(true, kept);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [floating, position, onDock, frame]);

  /** Where the dock is now, in the frame. */
  const at = (): DockPosition => {
    if (floating && position) {
      return position;
    }
    const { rect: frameRect, scale, width } = measure();
    const rect = box.current?.getBoundingClientRect();
    return rect
      ? {
          x: (rect.left - frameRect.left) / scale,
          y: (rect.top - frameRect.top) / scale,
        }
      : { x: width - DOCK_WIDTH - DOCK_MARGIN, y: DOCK_MARGIN };
  };

  const grab = (event: ReactPointerEvent) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(NOT_A_HANDLE)
    ) {
      return;
    }
    event.preventDefault();
    // Where the pointer took it, in the dock: it follows the pointer from there, docked or not.
    const from = at();
    const start = measure();
    const offset = {
      x: (event.clientX - start.rect.left) / start.scale - from.x,
      y: (event.clientY - start.rect.top) / start.scale - from.y,
    };
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    let moved = false;
    const onMove = (move: PointerEvent) => {
      if (
        !moved &&
        Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) <
          4
      ) {
        return;
      }
      moved = true;
      // Measured again each time: lifted off its column, the frame's layout changes under it.
      const now = measure();
      onDock(
        true,
        clampDock(
          {
            x: (move.clientX - now.rect.left) / now.scale - offset.x,
            y: (move.clientY - now.rect.top) / now.scale - offset.y,
          },
          now,
        ),
      );
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const nudge = (dx: number, dy: number) => {
    const from = at();
    onDock(true, clampDock({ x: from.x + dx, y: from.y + dy }, measure()));
  };
  const toggle = () => {
    if (floating) {
      onDock(false, position);
    } else {
      // Floated beside the editor, on its right: no position, the shell places it (the user, 27 November 2026).
      onDock(true, null);
    }
  };

  const floated = floating && position;
  return (
    <Box
      ref={box}
      as="aside"
      aria-label="Designer"
      data-designer-dock={floated ? 'floating' : 'docked'}
      display="flex"
      flexDirection="column"
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
      bg="canvas.default"
      overflow="hidden"
      sx={
        floated
          ? {
              position: 'absolute',
              left: position.x,
              top: position.y,
              width: DOCK_WIDTH,
              maxHeight: '80vh',
              zIndex: 30,
              // Floated, it keeps the one shadow level the rules allow (rule 4).
              boxShadow: 'shadow.small',
            }
          : {}
      }
    >
      <DockBar edge="header" onGrab={grab} onNudge={nudge}>
        <Text
          sx={{
            fontSize: 0,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Text>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="flex-end"
          gap={1}
          flex={1}
          minWidth={0}
          overflow="hidden"
          data-designer-dock-header=""
        >
          {header}
        </Box>
        <IconButton
          size="small"
          variant="invisible"
          icon={floating ? PinIcon : PinSlashIcon}
          aria-label={floating ? DOCK_WORDS.dock : DOCK_WORDS.float}
          data-designer-dock-toggle=""
          onClick={toggle}
        />
      </DockBar>
      <Box
        display="flex"
        flexDirection="column"
        gap={3}
        p={2}
        flex="1 1 auto"
        minHeight={0}
        overflowY={floated ? 'auto' : 'visible'}
      >
        {children}
      </Box>
      <DockBar edge="footer" onGrab={grab} onNudge={nudge}>
        <Box
          display="flex"
          alignItems="center"
          gap={2}
          flex={1}
          minWidth={0}
          overflow="hidden"
          data-designer-dock-footer=""
        >
          {footer}
        </Box>
      </DockBar>
    </Box>
  );
}

export type DesignerShellProps = {
  /** What is authored, drawn on the design grid. */
  surface: ReactNode;
  /** The right-hand panels, top to bottom: the toolbox, the properties, the events. */
  panels: ReactNode;
  /** A line above the surface: what is designed, and how. */
  caption?: ReactNode;
  /**
   * The panels beside the surface whatever the medium, as on a desktop: for a
   * picture laid out at a designer's width and scaled to its box. The
   * breakpoints are `screen` media queries, so printed, the responsive grid
   * fell to one column under a scale measured on screen (12 October 2026).
   * A picture's dock floats too, inside the picture.
   */
  wide?: boolean;
  /** The dock's name (its header). */
  dockTitle?: string;
  /** What the dock's header says beside its name: labels, indicators. */
  dockHeader?: ReactNode;
  /** What the dock's footer says. */
  dockFooter?: ReactNode;
  /**
   * The editor's own width, centred in a frame as wide as its box: the
   * floating dock ranges over the whole frame, so it can be moved aside of an
   * editor that stays where it is (the home page, asked 14 October 2026).
   */
  contentWidth?: number;
  /** Where the dock first stands (`docked` unless said): floating beside the editor on its right, `right`. */
  initialDock?: InitialDock;
};

const WIDE_COLUMNS = 'minmax(0, 1fr) 360px';

/** The designer's frame: the surface, and its dock — on the right, or floating over the surface. */
export function DesignerShell({
  surface,
  panels,
  caption,
  wide = false,
  dockTitle = DESIGNER_WORDS.dock,
  dockHeader,
  dockFooter,
  contentWidth,
  initialDock = 'docked',
}: DesignerShellProps): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  // The frame's own width (unscaled), which a spread editor and a dock beside it are measured against.
  const [frameWidth, setFrameWidth] = useState(0);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() =>
      setFrameWidth(element.offsetWidth),
    );
    observer.observe(element);
    setFrameWidth(element.offsetWidth);
    return () => observer.disconnect();
  }, []);
  // Where the dock was left is remembered for the next visit, in one cookie for every canvas editor: the
  // application's, the one the agent's footer opens, a picture of the designer (the user, 25 November 2026).
  // Never chosen, the dock floats beside the editor (the user, 24 November 2026).
  const [kept] = useState(readDock);
  const [dock, setDock] = useState(
    () => kept ?? { floating: false, position: null },
  );
  // Floating, it always starts beside the editor on its right, wherever it was left (the user, 27 November
  // 2026); the cookie keeps whether it floats, and where it was moved to until the next visit.
  const [follows, setFollows] = useState(
    () =>
      kept === null ||
      kept.floating ||
      (initialDock === 'right' && !dock.floating),
  );
  const onDock = useCallback(
    (floating: boolean, position: DockPosition | null) => {
      // Floated without a place (its header's pin): beside the editor, following it. Moved or docked: no longer.
      setFollows(floating && position === null);
      setDock(previous =>
        floating && position === null
          ? { ...previous, floating }
          : { floating, position },
      );
      keepDock(floating, position);
    },
    [],
  );
  // Asked to start beside the editor: placed there once the frame is measured, and kept there as the frame
  // settles (a picture is measured more than once) until the reader moves it — unless they left it somewhere already.
  useEffect(() => {
    if (!follows || !frameWidth) {
      return;
    }
    const x = contentWidth
      ? besideEditor(frameWidth, contentWidth).x
      : besideFullEditor(frameWidth).x;
    setDock(previous =>
      previous.floating &&
      previous.position?.x === x &&
      previous.position.y === 0
        ? previous
        : { floating: true, position: { x, y: 0 } },
    );
  }, [follows, frameWidth, contentWidth]);
  // Floating, the dock leaves the grid: the surface takes the whole width — a spread editor its own width, less
  // what a dock needs on either side of it.
  const floating = dock.floating && dock.position !== null;
  // Floating, the editor leaves the dock its room on the right: a spread editor centred, a full one narrowed.
  const editorWidth =
    floating && frameWidth
      ? contentWidth
        ? besideEditor(frameWidth, contentWidth).editorWidth
        : besideFullEditor(frameWidth).editorWidth
      : contentWidth;
  return (
    // The frame a floating dock ranges over; the editor in it, centred at its own width when it has one.
    <Box
      ref={frame}
      position="relative"
      width="100%"
      data-designer-dock-frame=""
    >
      <Box
        data-designer=""
        display="grid"
        gridTemplateColumns={
          floating
            ? 'minmax(0, 1fr)'
            : wide
              ? WIDE_COLUMNS
              : ['minmax(0, 1fr)', 'minmax(0, 1fr)', WIDE_COLUMNS]
        }
        gap={3}
        alignItems="start"
        maxWidth={editorWidth}
        mx={contentWidth ? 'auto' : undefined}
      >
        <Box minWidth={0}>
          {caption}
          <Box
            aria-label={DESIGNER_WORDS.surface}
            data-designer-surface=""
            border="1px solid"
            borderColor="border.default"
            borderRadius={2}
            p={3}
            minHeight={420}
            sx={{
              // A form designer's dotted grid, in the theme's own muted border colour.
              backgroundColor: 'canvas.inset',
              backgroundImage:
                'radial-gradient(var(--borderColor-muted, rgba(0,0,0,0.12)) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          >
            {surface}
          </Box>
        </Box>
        <Box
          position={
            floating || wide ? 'static' : ['static', 'static', 'sticky']
          }
          top={72}
          minWidth={0}
        >
          <DesignerDock
            title={dockTitle}
            header={dockHeader}
            footer={dockFooter}
            frame={frame}
            floating={floating}
            position={dock.position}
            onDock={onDock}
          >
            {panels}
          </DesignerDock>
        </Box>
      </Box>
    </Box>
  );
}

export default DesignerShell;
