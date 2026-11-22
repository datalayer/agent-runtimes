/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The left panel: the leading side of the workspace's side panels
 * (`apps/shell/SidePanel`, `AgentSlots.leftPanel`) — what a host says about
 * the work, its presentation of the application, and the agent's UI placed
 * `left`. The right one is the same panel on the trailing side
 * (`AgentSlots.rightPanel`).
 *
 * Its names here are those of the left side, which a host's plugin writes
 * (`AgentLeftPanelComponent`, `AgentLeftPanelProps`, the
 * `data-agent-left-panel-close` mark on its own Close control).
 *
 * @module apps/shell/LeftPanel
 */

import type { JSX, RefObject } from 'react';
import {
  SIDE_PANEL_MOTION,
  SIDE_PANEL_NARROW,
  SIDE_PANEL_WIDTH,
  SidePanel,
  SidePanelToggle,
  sidePanelLabel,
  sidePanelShown,
  useNarrow,
  useSidePanel,
  type AgentSidePanel,
  type AgentSidePanelComponent,
  type AgentSidePanelProps,
  type SidePanelState,
} from './SidePanel';

/** How a left panel's component shows (`AgentSidePanel`). */
export type AgentLeftPanel = AgentSidePanel;

/** What a component of the left panel is rendered with (`AgentSidePanelProps`). */
export type AgentLeftPanelProps = AgentSidePanelProps;

/** A component of the left panel's slot (`AgentSidePanelComponent`). */
export type AgentLeftPanelComponent = AgentSidePanelComponent;

/** The left panel, as its shell keeps it. */
export type LeftPanelState = SidePanelState;

export const LEFT_PANEL_WIDTH = SIDE_PANEL_WIDTH;
export const LEFT_PANEL_NARROW = SIDE_PANEL_NARROW;
export const LEFT_PANEL_MOTION = SIDE_PANEL_MOTION;

export const leftPanelShown = sidePanelShown;
export const leftPanelLabel = sidePanelLabel;

/** The workspace's left panel, closed to start with. */
export function useLeftPanel(): LeftPanelState {
  return useSidePanel('left');
}

/** The left panel's toggle, leading the chat's title bar. */
export function LeftPanelToggle({
  panel,
}: {
  panel: LeftPanelState;
}): JSX.Element | null {
  return <SidePanelToggle panel={panel} />;
}

export type LeftPanelProps = {
  panel: LeftPanelState;
  /** The row the panel and the view share: its width says whether the workspace is narrow. */
  rowRef: RefObject<HTMLElement | null>;
  /** What each component is rendered with, beside the application. */
  props: Record<string, unknown>;
};

/** The left panel, beside the view, or over it in a narrow workspace. */
export function LeftPanel({
  panel,
  rowRef,
  props,
}: LeftPanelProps): JSX.Element | null {
  const narrow = useNarrow(rowRef);
  return <SidePanel panel={panel} narrow={narrow} props={props} />;
}

export default LeftPanel;
