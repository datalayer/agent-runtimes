/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace shell: a prompt at the bottom, one view above it.
 *
 * @module apps/shell
 */

export {
  LoopWorkspace,
  buildLoopReactor,
  type LoopWorkspaceProps,
} from './LoopWorkspace';
export { ViewSwitcher, type ViewSwitcherProps } from './ViewSwitcher';
export { PluginToggles, type PluginTogglesProps } from './PluginToggles';
export {
  fullScreenNode,
  useWorkspaceFullScreen,
  type WorkspaceFullScreen,
} from './useWorkspaceFullScreen';
export { WorkspaceFullScreenAction } from './WorkspaceFullScreenAction';
export {
  SidebarRail,
  RAIL_WIDTH,
  railChoiceAfter,
  railItemsOf,
  type LoopSidebarComponent,
  type LoopSidebarRail,
  type RailItem,
  type SidebarRailProps,
} from './SidebarRail';
export {
  paneOpening,
  paneOpenAnimation,
  paneOpenKeyframes,
} from './paneMotion';
export {
  LeftPanel,
  LeftPanelToggle,
  LEFT_PANEL_MOTION,
  LEFT_PANEL_NARROW,
  LEFT_PANEL_WIDTH,
  leftPanelLabel,
  leftPanelShown,
  useLeftPanel,
  type LeftPanelProps,
  type LeftPanelState,
  type LoopLeftPanel,
  type LoopLeftPanelComponent,
  type LoopLeftPanelProps,
} from './LeftPanel';
export {
  CLOSE_SIDE_PANEL,
  OPEN_SIDE_PANEL,
  SIDE_PANEL_NARROW,
  SIDE_PANEL_SIDES,
  SIDE_PANEL_SLOTS,
  SIDE_PANEL_VIEW_MIN,
  SIDE_PANEL_WIDTH,
  SidePanel,
  SidePanelToggle,
  bothFit,
  sidePanelCallEvent,
  sidePanelLabel,
  sidePanelOpen,
  sidePanelShown,
  sidePanelWidth,
  useSidePanel,
  useSidePanels,
  type LoopSidePanel,
  type LoopSidePanelComponent,
  type LoopSidePanelProps,
  type SidePanelEvent,
  type SidePanelSide,
  type SidePanelState,
} from './SidePanel';
