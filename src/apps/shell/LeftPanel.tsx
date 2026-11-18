/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The left panel: what a host says *about* the work, on the leading edge of
 * the workspace (`LoopSlots.leftPanel`) — its presentation of the
 * application, a guide.
 *
 * Closed to start with, always: the view has the whole width, and a toggle
 * (an icon button leading the chat's title bar, before the agent's name, or
 * leading the workspace's header when it has one) opens and closes it. Open, it takes a column beside the view;
 * in a narrow workspace (a phone) it opens over the view instead, with a
 * close button of its own since it covers the toggle. Its width and its
 * opacity move as it opens and closes, and nothing moves when the person
 * asked for reduced motion. Closed, it is out of the tab order and of the
 * accessibility tree (`visibility: hidden`), and its components are mounted
 * on the first opening only, so that a panel nobody opens loads nothing.
 *
 * A component names its toggle and says whether it has anything to show for
 * the application the workspace draws with its `panel`
 * (`LoopLeftPanelComponent`): with nothing to show, no toggle and no panel.
 *
 * @module apps/shell/LeftPanel
 */

import type { ElementType, JSX, RefObject } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconButton } from '@primer/react';
import {
  SidebarCollapseIcon,
  SidebarExpandIcon,
  XIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import {
  useContributions,
  useSlotComponents,
  type ReactorSlotComponent,
} from '@datalayer/reactor/react';
import type { AppSpec } from '../../types/agentspecs';
import { LoopApplication, LoopSlots } from '../core';

/** How a left panel's component shows: its toggle's name, and whether it has anything to show. */
export type LoopLeftPanel = {
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
};

/** A component of the left panel's slot, with how it shows. */
export type LoopLeftPanelComponent = ReactorSlotComponent & {
  panel?: LoopLeftPanel;
};

/** The panel's width when open beside the view, in pixels. */
export const LEFT_PANEL_WIDTH = 400;

/** Under this width, in pixels, the workspace is narrow: the panel opens over the view. */
export const LEFT_PANEL_NARROW = 720;

/** How long the panel takes to open or close. */
export const LEFT_PANEL_MOTION = '200ms';

/** The components that have something to show for an application, in the slot's order. */
export function leftPanelShown(
  components: ReadonlyArray<LoopLeftPanelComponent>,
  application: AppSpec | undefined,
): LoopLeftPanelComponent[] {
  return components.filter(component =>
    component.panel?.when ? component.panel.when(application) : true,
  );
}

/** The toggle's name: the first component's, or *Panel* when it names none. */
export function leftPanelLabel(
  components: ReadonlyArray<LoopLeftPanelComponent>,
  application: AppSpec | undefined,
): string {
  const label = components[0]?.panel?.label;
  return (typeof label === 'function' ? label(application) : label) || 'Panel';
}

/** The left panel of a workspace, as its shell keeps it. */
export type LeftPanelState = {
  /** What has something to show: empty, there is no toggle and no panel. */
  components: LoopLeftPanelComponent[];
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
};

/** The workspace's left panel: what fills its slot for this application, closed to start with. */
export function useLeftPanel(): LeftPanelState {
  const slot = useSlotComponents(
    LoopSlots.leftPanel,
  ) as LoopLeftPanelComponent[];
  const application = useContributions(LoopApplication)[0]?.value.app;
  const components = useMemo(
    () => leftPanelShown(slot, application),
    [slot, application],
  );
  // Closed to start with, whatever it was on another visit.
  const [open, setOpen] = useState(false);
  const panelId = `loop-left-panel-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  return {
    components,
    application,
    // Nothing to show is nothing open.
    open: open && components.length > 0,
    setOpen,
    label: leftPanelLabel(components, application),
    icon: components[0]?.panel?.icon,
    panelId,
    toggleRef,
  };
}

/** The panel's toggle: an icon button that says what it opens, and whether it is open. */
export function LeftPanelToggle({
  panel,
}: {
  panel: LeftPanelState;
}): JSX.Element | null {
  if (panel.components.length === 0) {
    return null;
  }
  const Icon =
    panel.icon ?? (panel.open ? SidebarCollapseIcon : SidebarExpandIcon);
  return (
    <IconButton
      ref={panel.toggleRef}
      icon={Icon}
      aria-label={panel.label}
      aria-expanded={panel.open}
      aria-controls={panel.panelId}
      variant="invisible"
      size="small"
      onClick={() => panel.setOpen(!panel.open)}
      data-loop-left-panel-toggle=""
    />
  );
}

/** Whether an element is narrower than the width under which the panel opens over the view. */
function useNarrow(ref: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      setNarrow(width > 0 && width < LEFT_PANEL_NARROW);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return narrow;
}

export type LeftPanelProps = {
  panel: LeftPanelState;
  /** The row the panel and the view share: its width says whether the workspace is narrow. */
  rowRef: RefObject<HTMLElement | null>;
  /** What each component is rendered with, beside the application. */
  props: Record<string, unknown>;
};

export function LeftPanel({
  panel,
  rowRef,
  props,
}: LeftPanelProps): JSX.Element | null {
  const { components, open, setOpen, toggleRef } = panel;
  const narrow = useNarrow(rowRef);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Mounted on the first opening, and kept: a panel nobody opens loads nothing.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (open) {
      setOpened(true);
    }
  }, [open]);
  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  }, [setOpen, toggleRef]);
  // Over the view it covers its toggle: the focus goes to its own close button.
  useEffect(() => {
    if (open && narrow) {
      closeRef.current?.focus({ preventScroll: true });
    }
  }, [open, narrow]);
  if (components.length === 0) {
    return null;
  }
  const motion = LEFT_PANEL_MOTION;
  return (
    <Box
      as="aside"
      id={panel.panelId}
      role="region"
      aria-label={panel.label}
      data-loop-left-panel=""
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
        width: 0,
        opacity: 0,
        // Out of the tab order and of the accessibility tree once it has closed.
        visibility: 'hidden',
        borderRight: '0 solid',
        borderColor: 'border.default',
        transition: `width ${motion} ease, opacity ${motion} ease, visibility 0s linear ${motion}`,
        '&[data-open]': {
          width: `${LEFT_PANEL_WIDTH}px`,
          maxWidth: '100%',
          opacity: 1,
          visibility: 'visible',
          borderRightWidth: 'var(--theme-hairline, 1px)',
          transition: `width ${motion} ease, opacity ${motion} ease, visibility 0s`,
        },
        // A narrow workspace: over the view, the whole of it.
        '&[data-narrow]': {
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          width: '100%',
          borderRightWidth: 0,
          backgroundColor: 'var(--overlay-bgColor, var(--bgColor-default))',
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&[data-open]': { transition: 'none' },
        },
      }}
    >
      <Box
        data-loop-left-panel-body=""
        position="relative"
        height="100%"
        overflowY="auto"
        px={3}
        py={3}
        // Its open width while the column moves, so that its words do not reflow.
        width={narrow ? '100%' : `${LEFT_PANEL_WIDTH}px`}
        maxWidth={narrow ? '100%' : undefined}
        sx={{ boxSizing: 'border-box' }}
      >
        {narrow ? (
          <Box display="flex" justifyContent="flex-end" mb={1}>
            <IconButton
              ref={closeRef}
              icon={XIcon}
              aria-label={`Close: ${panel.label}`}
              variant="invisible"
              size="small"
              onClick={close}
              data-loop-left-panel-close=""
            />
          </Box>
        ) : null}
        {opened
          ? components.map(component => {
              const { Component } = component;
              return (
                <Component
                  key={component.id}
                  {...props}
                  application={panel.application}
                />
              );
            })
          : null}
      </Box>
    </Box>
  );
}

export default LeftPanel;
