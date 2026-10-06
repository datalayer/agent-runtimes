/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The rail (LOOP T-07): the workspace's sidebar as a narrow column of line
 * icons, one per panel, and the one panel chosen beside it.
 *
 * The sidebar stacks every panel its plugins contribute — an application's
 * rules and approvals, its activity, its computer — one under the other.
 * With the rail, each is an icon: one weight, no colour, the chosen one on a
 * grey rounded square, as the reference screens draw their rail. A click
 * shows that panel, a click on the chosen one closes the column, and the
 * panel opens at the theme's pace (T-10).
 *
 * A panel names itself on the rail by the `rail` its plugin gives its
 * component (`LoopSidebarComponent`); without one it is shown by its id
 * under a generic icon. Every panel stays mounted while another is shown,
 * so a feed keeps its place and a live computer its connection.
 *
 * @module loop/shell/SidebarRail
 */

import type { ElementType, JSX } from 'react';
import { useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { SidebarExpandIcon } from '@primer/octicons-react';
import type { ReactorSlotComponent } from '@datalayer/reactor/react';
import { paneOpening } from './paneMotion';

/** How a sidebar panel shows on the rail. */
export type LoopSidebarRail = {
  /** Its name, said to a screen reader and shown on hover. */
  label: string;
  /** A line icon (an octicon). */
  icon: ElementType;
};

/** A component of the sidebar slot, with how it shows on the rail. */
export type LoopSidebarComponent = ReactorSlotComponent & {
  rail?: LoopSidebarRail;
};

/** One entry of the rail. */
export type RailItem = {
  id: string;
  label: string;
  icon: ElementType;
};

/** The rail's entries, in the slot's order. */
export function railItemsOf(
  components: ReadonlyArray<LoopSidebarComponent>,
): RailItem[] {
  return components.map(component => ({
    id: component.id,
    label: component.rail?.label ?? component.id,
    icon: component.rail?.icon ?? SidebarExpandIcon,
  }));
}

/** What a click on an entry leaves chosen: it, or nothing when it was. */
export function railChoiceAfter(
  chosen: string | null,
  clicked: string,
): string | null {
  return chosen === clicked ? null : clicked;
}

/** The rail's width: one icon and its air. */
export const RAIL_WIDTH = 48;

export type SidebarRailProps = {
  /** The sidebar's components, as the slot gives them. */
  components: ReadonlyArray<LoopSidebarComponent>;
  /** What each panel is rendered with. */
  props: Record<string, unknown>;
  /** The panel's width when open. */
  width: number;
};

export function SidebarRail({
  components,
  props,
  width,
}: SidebarRailProps): JSX.Element {
  const items = railItemsOf(components);
  // The first panel open to start with: what the column is for.
  const [chosen, setChosen] = useState<string | null>(items[0]?.id ?? null);
  // A panel that left the slot is no longer chosen.
  const open = items.some(item => item.id === chosen) ? chosen : null;
  return (
    <Box
      as="aside"
      data-loop-rail-sidebar=""
      sx={{ flex: '0 0 auto', display: 'flex', minHeight: 0 }}
    >
      <Box
        data-loop-rail-panel={open ?? undefined}
        sx={{
          display: open ? 'block' : 'none',
          width: `${width}px`,
          minWidth: 0,
          borderLeft: 'var(--theme-hairline, 1px) solid',
          borderColor: 'border.default',
          overflowY: 'auto',
          px: 3,
          py: 3,
        }}
      >
        {components.map(component => {
          const { Component } = component;
          const shown = component.id === open;
          return (
            <Box
              key={component.id}
              id={`loop-rail-panel-${component.id}`}
              role="region"
              aria-label={railItemsOf([component])[0].label}
              hidden={!shown}
              sx={shown ? paneOpening('right') : undefined}
            >
              <Component {...props} />
            </Box>
          );
        })}
      </Box>
      <Box
        as="nav"
        aria-label="Panels"
        sx={{
          width: `${RAIL_WIDTH}px`,
          flex: `0 0 ${RAIL_WIDTH}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          py: 2,
          borderLeft: 'var(--theme-hairline, 1px) solid',
          borderColor: 'border.default',
        }}
      >
        {items.map(item => {
          const Icon = item.icon;
          const active = item.id === open;
          return (
            <Box
              key={item.id}
              as="button"
              type="button"
              data-loop-rail-item={item.id}
              aria-label={item.label}
              title={item.label}
              aria-pressed={active}
              aria-controls={`loop-rail-panel-${item.id}`}
              onClick={() => setChosen(railChoiceAfter(open, item.id))}
              sx={{
                width: 32,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 0,
                border: 'none',
                borderRadius: 2,
                cursor: 'pointer',
                // One weight, no colour: the ink, quieter when not chosen.
                color: active ? 'fg.default' : 'fg.muted',
                bg: active ? 'neutral.muted' : 'transparent',
                '&:hover': { color: 'fg.default', bg: 'neutral.subtle' },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'var(--focus-outlineColor, #0969da)',
                  outlineOffset: '1px',
                },
              }}
            >
              <Icon size={16} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default SidebarRail;
