/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace's two side panels, beside the view (the user, 18 November
 * 2026: "left and right side panels are the main deliverable. They are real
 * panels that receive controls and visuals: an agent's UI plugins placed
 * there … Unify the left one with the existing leftPanel"):
 *
 * - the **left** one (`AgentSlots.leftPanel`): what is said about the work —
 *   a host's presentation of the application — and the agent's UI placed
 *   `left`;
 * - the **right** one (`AgentSlots.rightPanel`): what the agent builds beside
 *   the conversation — the UI placed `right`, such as the deck or the sheet
 *   it makes in the page.
 *
 * One panel, two sides, the same contract. Closed to start with: the view
 * has the whole width, and a toggle opens each — the left one leading the
 * chat's title bar (or the workspace's header), the right one trailing it.
 * A toggle is there only while its panel is closed and something fills it:
 * open, the panel's own Close control closes it, and the toggle shows back,
 * the focus on it. Open, a panel takes a column beside the view; in a
 * narrow workspace (a phone) it opens over the view instead, and the two
 * cannot both be open beside a view too narrow for the three: opening one
 * then closes the other. On opening the focus moves into it, to its Close
 * control, and Escape closes it from anywhere inside. Its width and its
 * opacity move as it opens and closes, and nothing moves when the person
 * asked for reduced motion. Closed, it is out of the tab order and of the
 * accessibility tree, and its components are mounted on the first opening
 * only.
 *
 * **Open or closed is the conversation's** (`sidePanelOpen`): the agent
 * opens and closes a panel with its frontend tools (`open_side_panel`,
 * `close_side_panel`, the `side-panels` UI), a UI placed in a panel opens it
 * with the first thing it shows (its `panel.follows` tools: the deck's
 * first slide), and the person's toggle wins until the agent's next call.
 * All of it is read from the conversation's recorded calls, so a
 * conversation opened again shows its panels as they stood, and one started
 * over closes them.
 *
 * A component says how it shows with its `panel` (`AgentSidePanelComponent`):
 * its toggle's name, whether it has anything to show for the application,
 * whether it draws its own Close control (then the shell draws none, so that
 * there is always exactly one), the width it needs, and the tools whose
 * calls open the panel.
 *
 * @module apps/shell/SidePanel
 */

import { lastReveal, subscribeReveal } from './sidePanelReveal';
import type { ElementType, JSX, PointerEvent, RefObject } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useContext,
} from 'react';
import { IconButton } from '@primer/react';
import { SidebarExpandIcon, XIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ViewTabs } from '@datalayer/core/lib/components/tabs';
import {
  useContributions,
  useSlotComponents,
  type ReactorSlotComponent,
} from '@datalayer/reactor/react';
import type { AppSpec } from '../../types/agentspecs';
import { AgentApplication, AgentSlots } from '../core';
import { toolPattern } from '../toolCards/kit';
import {
  ToolResultsContext,
  type RecordedToolCall,
} from '../toolCards/toolResults';

export type SidePanelSide = 'left' | 'right';

export const SIDE_PANEL_SIDES: readonly SidePanelSide[] = ['left', 'right'];

/** The slot of each side. */
export const SIDE_PANEL_SLOTS: Record<SidePanelSide, string> = {
  left: AgentSlots.leftPanel,
  right: AgentSlots.rightPanel,
};

/** The frontend tool that opens a side panel: `{side}`. */
export const OPEN_SIDE_PANEL = 'open_side_panel';

/** The frontend tool that closes a side panel: `{side}`. */
export const CLOSE_SIDE_PANEL = 'close_side_panel';

/** How a side panel's component shows. */
export type AgentSidePanel = {
  /**
   * Its name, on its toggle: said to a screen reader and shown on hover
   * (*About the Marketer*). A function reads it off the application.
   */
  label: string | ((application: AppSpec | undefined) => string);
  /** A line icon (an octicon) for its toggle, in place of the sidebar's. */
  icon?: ElementType;
  /**
   * Whether it has anything to show for the application the workspace draws
   * (none when it draws none). Always, when unsaid.
   */
  when?: (application: AppSpec | undefined) => boolean;
  /**
   * Whether the component draws its own Close control, calling the `close`
   * it is handed: the shell then draws none. Mark that control with
   * `data-agent-<side>-panel-close`, and the focus goes to it when the panel
   * opens. Unsaid, the shell draws its own.
   */
  closes?: boolean;
  /** The width it needs, in pixels, beside the view; the side's own unsaid. */
  width?: number;
  /**
   * The tools whose first answered call in a conversation opens the panel
   * (the deck's first slide): what it shows arrived. By bare name; a
   * server's prefix is allowed.
   */
  follows?: readonly string[];
};

/** A component as the panel and the agent name it in the tabs. */
export type SidePanelTab = {
  /** Stable Reactor component id; accepted by `open_side_panel`. */
  id: string;
  /** The tab's visible name; accepted by `open_side_panel` too. */
  label: string;
};

/** What a component of a side panel is rendered with. */
export type AgentSidePanelProps = Record<string, unknown> & {
  /** The application the workspace draws, when it draws one. */
  application: AppSpec | undefined;
  /** Which side it is on. */
  side: SidePanelSide;
  /** Whether the panel is open. */
  open: boolean;
  /** Close the panel: its toggle shows back, the focus on it. */
  close: () => void;
  /** Open the panel when closed, close it when open. */
  toggle: () => void;
  /** The panel's element id, which its toggle controls. */
  panelId: string;
};

/** A component of a side panel's slot, with how it shows. */
export type AgentSidePanelComponent = ReactorSlotComponent & {
  panel?: AgentSidePanel;
};

/** A side panel's width when open beside the view, in pixels, unless a component needs more. */
export const SIDE_PANEL_WIDTH = 400;

/** Bounds and keyboard step for a panel resized by the person. */
export const SIDE_PANEL_MIN_WIDTH = 280;
export const SIDE_PANEL_MAX_WIDTH = 960;
export const SIDE_PANEL_RESIZE_STEP = 32;

export const clampSidePanelWidth = (width: number): number =>
  Math.min(
    SIDE_PANEL_MAX_WIDTH,
    Math.max(
      SIDE_PANEL_MIN_WIDTH,
      Number.isFinite(width) ? width : SIDE_PANEL_WIDTH,
    ),
  );

/** Under this width, in pixels, the workspace is narrow: a panel opens over the view. */
export const SIDE_PANEL_NARROW = 720;

/** What the view keeps, at least, beside two open panels; under it, one closes. */
export const SIDE_PANEL_VIEW_MIN = 480;

/** How long a panel takes to open or close. */
export const SIDE_PANEL_MOTION = '200ms';

/** The components that have something to show for an application, in the slot's order. */
export function sidePanelShown(
  components: ReadonlyArray<AgentSidePanelComponent>,
  application: AppSpec | undefined,
): AgentSidePanelComponent[] {
  return components.filter(component =>
    component.panel?.when ? component.panel.when(application) : true,
  );
}

/** The toggle's name: the first component's, or *Panel* when it names none. */
export function sidePanelLabel(
  components: ReadonlyArray<AgentSidePanelComponent>,
  application: AppSpec | undefined,
): string {
  const label = components[0]?.panel?.label;
  return (typeof label === 'function' ? label(application) : label) || 'Panel';
}

/** The width a side needs: its widest component's, else its own. */
export function sidePanelWidth(
  components: ReadonlyArray<AgentSidePanelComponent>,
): number {
  return Math.max(
    SIDE_PANEL_WIDTH,
    ...components.map(component => component.panel?.width ?? 0),
  );
}

/**
 * What opened or closed a panel, in the conversation's order: a tool call
 * at its `order`, or the person, after the call they had seen last (`after`)
 * and then in the order they acted (`seq`).
 */
export type SidePanelEvent = {
  open: boolean;
  /** The recorded call's order, or the last one seen when the person acted. */
  order: number;
  /** 0 for a call; the person's own count after it. */
  seq: number;
};

/** Whether one event came after another. */
export const laterThan = (a: SidePanelEvent, b: SidePanelEvent): boolean =>
  a.order !== b.order ? a.order > b.order : a.seq > b.seq;

const succeeded = (call: RecordedToolCall): boolean => {
  const said = call.result;
  if (typeof said === 'string') {
    return false;
  }
  return !(
    said &&
    typeof said === 'object' &&
    'error' in (said as Record<string, unknown>)
  );
};

/**
 * The last thing the conversation's calls did to a side, if any: the agent
 * opening or closing it (`open_side_panel`, `close_side_panel` with its
 * `side`), or the first answered call of a tool its components follow,
 * which opens it.
 */
export function sidePanelCallEvent(
  side: SidePanelSide,
  calls: readonly RecordedToolCall[],
  follows: readonly string[],
): SidePanelEvent | undefined {
  const open = toolPattern(OPEN_SIDE_PANEL);
  const close = toolPattern(CLOSE_SIDE_PANEL);
  const followed = follows.map(toolPattern);
  let last: SidePanelEvent | undefined;
  let revealed = false;
  for (const call of [...calls].sort((a, b) => a.order - b.order)) {
    if (!succeeded(call)) {
      continue;
    }
    const opens = open.test(call.toolName);
    if (opens || close.test(call.toolName)) {
      if (call.args.side === side) {
        last = { open: opens, order: call.order, seq: 0 };
      }
      continue;
    }
    if (!revealed && followed.some(pattern => pattern.test(call.toolName))) {
      revealed = true;
      // What it shows arrived: the panel opens, unless it was said already.
      if (!last) {
        last = { open: true, order: call.order, seq: 0 };
      }
    }
  }
  return last;
}

/** Whether a side is open: its latest event, the conversation's or the person's. */
export function sidePanelOpen(
  fromCalls: SidePanelEvent | undefined,
  fromPerson: SidePanelEvent | undefined,
): boolean {
  if (fromPerson && (!fromCalls || laterThan(fromPerson, fromCalls))) {
    return fromPerson.open;
  }
  return fromCalls?.open ?? false;
}

/** A side panel of a workspace, as its shell keeps it. */
export type SidePanelState = {
  side: SidePanelSide;
  /** What has something to show: empty, there is no toggle and no panel. */
  components: AgentSidePanelComponent[];
  /** The application the workspace draws, when it draws one. */
  application: AppSpec | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The toggle's name. */
  label: string;
  /** The toggle's icon, when a component gives one. */
  icon: ElementType | undefined;
  /** The panel's element id, which the toggle controls. */
  panelId: string;
  /** The toggle, to give the focus back to. */
  toggleRef: RefObject<HTMLButtonElement | null>;
  /** Its width beside the view. */
  width: number;
  /** Resize it beside the view. */
  setWidth: (width: number) => void;
  /** The event that made it as it is: what decides between two panels. */
  latest: SidePanelEvent | undefined;
  /** The contribution shown in the panel. */
  activeTab: string;
  /** The contributions as tabs, in slot order. */
  tabs: SidePanelTab[];
  /** Show another contribution, as the person or the agent asks. */
  setActiveTab: (id: string) => void;
};

/**
 * The person's acts on either panel, in order: one count for both sides, so
 * that which was opened last can be told between them.
 */
let PERSON_SEQ = 0;

/** The conversation's calls of these tools, and how many times it started over. */
function useConversationCalls(names: readonly string[]): {
  calls: RecordedToolCall[];
  generation: number;
  /** The last call of the conversation, of any tool. */
  latestOrder: number;
} {
  const store = useContext(ToolResultsContext);
  const revision = useSyncExternalStore(
    store.subscribe,
    store.getRevision,
    store.getRevision,
  );
  const key = names.join(',');
  return useMemo(
    () => ({
      calls: store.callsOf(names),
      generation: store.getGeneration(),
      latestOrder: store.latestOrder(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, revision, key],
  );
}

/** A workspace's side panel: what fills its slot for this application, closed to start with. */
export function useSidePanel(side: SidePanelSide): SidePanelState {
  const slot = useSlotComponents(
    SIDE_PANEL_SLOTS[side],
  ) as AgentSidePanelComponent[];
  const application = useContributions(AgentApplication)[0]?.value.app;
  const components = useMemo(
    () => sidePanelShown(slot, application),
    [slot, application],
  );
  const preferredWidth = sidePanelWidth(components);
  const [width, setWidthState] = useState(() =>
    clampSidePanelWidth(preferredWidth),
  );
  useEffect(() => {
    setWidthState(current =>
      current === SIDE_PANEL_WIDTH
        ? clampSidePanelWidth(preferredWidth)
        : current,
    );
  }, [preferredWidth]);
  const setWidth = useCallback(
    (next: number) => setWidthState(clampSidePanelWidth(next)),
    [],
  );
  const follows = useMemo(
    () => components.flatMap(component => component.panel?.follows ?? []),
    [components],
  );
  const { calls, generation, latestOrder } = useConversationCalls(
    useMemo(() => [OPEN_SIDE_PANEL, CLOSE_SIDE_PANEL, ...follows], [follows]),
  );
  const fromCalls = useMemo(
    () => sidePanelCallEvent(side, calls, follows),
    [side, calls, follows],
  );
  // The person acts after every call they have seen, of any tool: what
  // tells which of the two panels was opened last.
  const lastOrder = latestOrder;
  // The person's last word, forgotten when the conversation starts over.
  const [fromPerson, setFromPerson] = useState<{
    event: SidePanelEvent;
    generation: number;
  }>();
  const person =
    fromPerson && fromPerson.generation === generation
      ? fromPerson.event
      : undefined;
  const setOpen = useCallback(
    (open: boolean) => {
      PERSON_SEQ += 1;
      setFromPerson({
        event: { open, order: lastOrder, seq: PERSON_SEQ },
        generation,
      });
    },
    [lastOrder, generation],
  );
  const panelId = `agent-${side}-panel-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const open = sidePanelOpen(fromCalls, person);
  const latest =
    person && (!fromCalls || laterThan(person, fromCalls)) ? person : fromCalls;
  const tabs = useMemo<SidePanelTab[]>(
    () =>
      components.map(component => {
        const label = component.panel?.label;
        return {
          id: component.id,
          label:
            (typeof label === 'function' ? label(application) : label) ||
            component.id,
        };
      }),
    [components, application],
  );
  const requested = useMemo(() => {
    for (const call of [...calls].sort((a, b) => b.order - a.order)) {
      if (!succeeded(call)) {
        continue;
      }
      if (
        toolPattern(OPEN_SIDE_PANEL).test(call.toolName) &&
        call.args.side === side &&
        typeof call.args.tab === 'string'
      ) {
        const named = call.args.tab.trim().toLocaleLowerCase();
        const tab = tabs.find(
          candidate =>
            candidate.id.toLocaleLowerCase() === named ||
            candidate.label.toLocaleLowerCase() === named,
        );
        if (tab) {
          return { id: tab.id, order: call.order };
        }
      }
      // What a contribution builds belongs on its own tab: its first or
      // latest successful tool call both opens the panel and selects it.
      const component = components.find(candidate =>
        candidate.panel?.follows?.some(pattern =>
          toolPattern(pattern).test(call.toolName),
        ),
      );
      if (component) {
        return { id: component.id, order: call.order };
      }
    }
    return undefined;
  }, [calls, side, tabs, components]);
  const [tabFromPerson, setTabFromPerson] = useState<{
    id: string;
    event: SidePanelEvent;
    generation: number;
  }>();
  const personTab =
    tabFromPerson && tabFromPerson.generation === generation
      ? tabFromPerson
      : undefined;
  const activeTab =
    personTab && (!requested || personTab.event.order >= requested.order)
      ? personTab.id
      : (requested?.id ?? tabs[0]?.id ?? '');
  const setActiveTab = useCallback(
    (id: string) => {
      if (!tabs.some(tab => tab.id === id)) return;
      PERSON_SEQ += 1;
      setTabFromPerson({
        id,
        event: { open: true, order: latestOrder, seq: PERSON_SEQ },
        generation,
      });
    },
    [tabs, latestOrder, generation],
  );
  // A running call asking for its panel (sidePanelReveal): the side whose
  // component follows the tool opens and selects that tab.
  const reveal = useSyncExternalStore(subscribeReveal, lastReveal, lastReveal);
  const revealed = useRef(0);
  useEffect(() => {
    if (!reveal || reveal.seq === revealed.current) {
      return;
    }
    revealed.current = reveal.seq;
    const component = components.find(candidate =>
      candidate.panel?.follows?.some(pattern =>
        toolPattern(pattern).test(reveal.toolName),
      ),
    );
    if (component) {
      setOpen(true);
      setActiveTab(component.id);
    }
  }, [reveal, components, setOpen, setActiveTab]);
  return {
    side,
    components,
    application,
    // Nothing to show is nothing open.
    open: open && components.length > 0,
    setOpen,
    label: sidePanelLabel(components, application),
    icon: components[0]?.panel?.icon,
    panelId,
    toggleRef,
    width,
    setWidth,
    latest,
    activeTab,
    tabs,
    setActiveTab,
  };
}

/** An element's width, kept current. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(entries => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Whether a row is narrower than the width under which a panel opens over the view. */
export function useNarrow(ref: RefObject<HTMLElement | null>): boolean {
  const width = useWidth(ref);
  return width > 0 && width < SIDE_PANEL_NARROW;
}

/**
 * Whether two open panels leave the view too little room: then only the one
 * opened last stays open. In a narrow workspace each opens over the view,
 * one at a time.
 */
export function bothFit(
  rowWidth: number,
  left: Pick<SidePanelState, 'width'>,
  right: Pick<SidePanelState, 'width'>,
): boolean {
  return (
    rowWidth >= SIDE_PANEL_NARROW &&
    rowWidth >= left.width + right.width + SIDE_PANEL_VIEW_MIN
  );
}

/**
 * What each side holds in the workspace on the page, kept by its shell: what
 * the agent's `open_side_panel` is answered from (a panel with nothing in it
 * is not opened, and the agent is told so).
 */
export const SIDE_PANELS_SHOWN: Record<SidePanelSide, SidePanelTab[]> = {
  left: [],
  right: [],
};

/** The workspace's two side panels, decided together. */
export function useSidePanels(rowRef: RefObject<HTMLElement | null>): {
  left: SidePanelState;
  right: SidePanelState;
  narrow: boolean;
} {
  const left = useSidePanel('left');
  const right = useSidePanel('right');
  const width = useWidth(rowRef);
  const narrow = width > 0 && width < SIDE_PANEL_NARROW;
  const leftNames = left.tabs.map(tab => `${tab.id}:${tab.label}`).join(',');
  const rightNames = right.tabs.map(tab => `${tab.id}:${tab.label}`).join(',');
  useEffect(() => {
    SIDE_PANELS_SHOWN.left = left.tabs;
    SIDE_PANELS_SHOWN.right = right.tabs;
    return () => {
      SIDE_PANELS_SHOWN.left = [];
      SIDE_PANELS_SHOWN.right = [];
    };
    // The names carry both stable ids and labels; the arrays themselves may
    // be re-exposed by Reactor while their contents stay the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftNames, rightNames]);
  if (left.open && right.open && width > 0 && !bothFit(width, left, right)) {
    // The one opened last stays.
    const rightLast =
      !left.latest || (right.latest && laterThan(right.latest, left.latest));
    return {
      left: rightLast ? { ...left, open: false } : left,
      right: rightLast ? right : { ...right, open: false },
      narrow,
    };
  }
  return { left, right, narrow };
}

/**
 * A panel's toggle: an icon button that says what it opens and which element
 * it controls, there only while the panel is closed and something fills it.
 * The right one's icon is the left one's, mirrored.
 */
export function SidePanelToggle({
  panel,
}: {
  panel: SidePanelState;
}): JSX.Element | null {
  if (panel.components.length === 0 || panel.open) {
    return null;
  }
  const Icon = panel.icon ?? SidebarExpandIcon;
  return (
    <IconButton
      ref={panel.toggleRef}
      icon={Icon}
      aria-label={panel.label}
      aria-expanded={panel.open}
      aria-controls={panel.panelId}
      variant="invisible"
      size="small"
      onClick={() => panel.setOpen(true)}
      {...{ [`data-agent-${panel.side}-panel-toggle`]: '' }}
      sx={
        panel.side === 'right' && !panel.icon
          ? { svg: { transform: 'scaleX(-1)' } }
          : undefined
      }
    />
  );
}

export type SidePanelProps = {
  panel: SidePanelState;
  /** Whether the workspace is narrow: the panel opens over the view. */
  narrow: boolean;
  /** What each component is rendered with, beside the panel's own props. */
  props: Record<string, unknown>;
};

/** What can take the focus inside a panel, when no Close control is marked. */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function SidePanel({
  panel,
  narrow,
  props,
}: SidePanelProps): JSX.Element | null {
  const {
    components,
    open,
    setOpen,
    toggleRef,
    side,
    width,
    setWidth,
    activeTab,
    setActiveTab,
  } = panel;
  const panelRef = useRef<HTMLElement | null>(null);
  const resize = useRef<{ pointer: number; x: number; width: number } | null>(
    null,
  );
  // Mounted on the first opening, and kept: a panel nobody opens loads nothing.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (open) {
      setOpened(true);
    }
  }, [open]);
  // Closed by its Close control or by Escape: the focus goes back to the
  // toggle, which shows back once the panel has closed.
  const refocus = useRef(false);
  const close = useCallback(() => {
    refocus.current = true;
    setOpen(false);
  }, [setOpen]);
  const toggle = useCallback(() => {
    if (open) {
      close();
    } else {
      setOpen(true);
    }
  }, [open, close, setOpen]);
  useEffect(() => {
    if (open) {
      // The toggle is gone while it is open: the focus moves in, to its
      // Close control, else what first takes it, else the panel itself.
      const element = panelRef.current;
      const target =
        element?.querySelector<HTMLElement>(
          `[data-agent-${side}-panel-close]`,
        ) ??
        element?.querySelector<HTMLElement>(FOCUSABLE) ??
        element;
      target?.focus({ preventScroll: true });
    } else if (refocus.current) {
      refocus.current = false;
      toggleRef.current?.focus({ preventScroll: true });
    }
  }, [open, toggleRef, side]);
  if (components.length === 0) {
    return null;
  }
  // One Close control: the component's own when it draws one, else the shell's.
  const ownClose = !components.some(component => component.panel?.closes);
  const motion = SIDE_PANEL_MOTION;
  // The hairline on the edge it shares with the view.
  const edge = side === 'left' ? 'borderRight' : 'borderLeft';
  const edgeWidth = side === 'left' ? 'borderRightWidth' : 'borderLeftWidth';
  const resizeAt = (event: PointerEvent<HTMLDivElement>) => {
    const held = resize.current;
    if (!held || held.pointer !== event.pointerId) return;
    const delta = event.clientX - held.x;
    setWidth(held.width + (side === 'left' ? delta : -delta));
  };
  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    if (resize.current?.pointer !== event.pointerId) return;
    resize.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return (
    <Box
      ref={panelRef}
      as="aside"
      id={panel.panelId}
      role="region"
      aria-label={panel.label}
      // Focusable by script only, for a panel with nothing that takes the focus.
      tabIndex={-1}
      {...{
        [`data-agent-${side}-panel`]: '',
        'data-agent-side-panel': side,
      }}
      data-open={open ? '' : undefined}
      data-narrow={narrow ? '' : undefined}
      onKeyDown={(event: { key: string; stopPropagation: () => void }) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          close();
        }
      }}
      flex="0 0 auto"
      minWidth={0}
      minHeight={0}
      overflow="hidden"
      sx={{
        boxSizing: 'border-box',
        position: 'relative',
        width: 0,
        opacity: 0,
        // Out of the tab order and of the accessibility tree once it has closed.
        visibility: 'hidden',
        [edge]: '0 solid',
        borderColor: 'border.default',
        outline: 'none',
        transition: `width ${motion} ease, opacity ${motion} ease, visibility 0s linear ${motion}`,
        '&[data-open]': {
          width: `${width}px`,
          maxWidth: '100%',
          opacity: 1,
          visibility: 'visible',
          [edgeWidth]: 'var(--theme-hairline, 1px)',
          transition: `width ${motion} ease, opacity ${motion} ease, visibility 0s`,
        },
        // A narrow workspace: over the view, the whole of it.
        '&[data-narrow]': {
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          width: '100%',
          [edgeWidth]: 0,
          backgroundColor: 'var(--overlay-bgColor, var(--bgColor-default))',
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&[data-open]': { transition: 'none' },
        },
      }}
    >
      {!narrow && open ? (
        <Box
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize the ${side} panel`}
          aria-valuemin={SIDE_PANEL_MIN_WIDTH}
          aria-valuemax={SIDE_PANEL_MAX_WIDTH}
          aria-valuenow={Math.round(width)}
          tabIndex={0}
          {...{ [`data-agent-${side}-panel-resize`]: '' }}
          position="absolute"
          top={0}
          bottom={0}
          {...(side === 'left' ? { right: '-3px' } : { left: '-3px' })}
          width="7px"
          zIndex={3}
          cursor="col-resize"
          touchAction="none"
          onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
            resize.current = {
              pointer: event.pointerId,
              x: event.clientX,
              width,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={resizeAt}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onKeyDown={(event: { key: string; preventDefault: () => void }) => {
            const direction = side === 'left' ? 1 : -1;
            const next =
              event.key === 'Home'
                ? SIDE_PANEL_MIN_WIDTH
                : event.key === 'End'
                  ? SIDE_PANEL_MAX_WIDTH
                  : event.key === 'ArrowRight'
                    ? width + SIDE_PANEL_RESIZE_STEP * direction
                    : event.key === 'ArrowLeft'
                      ? width - SIDE_PANEL_RESIZE_STEP * direction
                      : null;
            if (next !== null) {
              event.preventDefault();
              setWidth(next);
            }
          }}
          sx={{
            '&::before': {
              content: '""',
              display: 'block',
              width: '1px',
              height: '100%',
              mx: 'auto',
              bg: 'border.default',
            },
            '&:hover::before, &:focus-visible::before': {
              width: '3px',
              bg: 'accent.emphasis',
            },
          }}
        />
      ) : null}
      <Box
        {...{ [`data-agent-${side}-panel-body`]: '' }}
        position="relative"
        height="100%"
        overflowY="auto"
        px={3}
        py={3}
        // Its open width while the column moves, so that its words do not reflow.
        width={narrow ? '100%' : `${width}px`}
        maxWidth={narrow ? '100%' : undefined}
        display="flex"
        flexDirection="column"
        sx={{ boxSizing: 'border-box', gap: 3 }}
      >
        {ownClose ? (
          <Box display="flex" justifyContent="flex-end" mb={-2}>
            <IconButton
              icon={XIcon}
              aria-label={`Close: ${panel.label}`}
              variant="invisible"
              size="small"
              onClick={close}
              {...{ [`data-agent-${side}-panel-close`]: '' }}
            />
          </Box>
        ) : null}
        {components.length > 1 ? (
          <ViewTabs
            tabs={panel.tabs}
            value={activeTab}
            onChange={setActiveTab}
            label={`${panel.label} views`}
            mb={0}
            data-testid={`agent-${side}-panel-tabs`}
          />
        ) : null}
        {/* Rendered with the opening itself, so that the focus finds its Close control. */}
        {opened || open
          ? components
              .filter(component => component.id === activeTab)
              .map(component => {
                const { Component } = component;
                return (
                  <Component
                    key={component.id}
                    {...props}
                    application={panel.application}
                    side={side}
                    open={open}
                    close={close}
                    toggle={toggle}
                    panelId={panel.panelId}
                  />
                );
              })
          : null}
      </Box>
    </Box>
  );
}

export default SidePanel;
