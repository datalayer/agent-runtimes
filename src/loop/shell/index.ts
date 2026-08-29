/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace shell: a prompt at the bottom, one view above it.
 *
 * @module loop/shell
 */

export {
  LoopWorkspace,
  buildLoopReactor,
  type LoopWorkspaceProps,
} from './LoopWorkspace';
export { ViewSwitcher, type ViewSwitcherProps } from './ViewSwitcher';
export { PluginToggles, type PluginTogglesProps } from './PluginToggles';
