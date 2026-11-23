/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { FrontendToolDefinition } from '../types/tools';

const SPECIAL: Readonly<Record<string, string>> = {
  preview_status: 'limitedPreviewGetStatus',
  preview_indicator_update: 'limitedPreviewUpdateIndicator',
  show_notice: 'noticeShow',
  open_side_panel: 'sidePanelOpen',
  close_side_panel: 'sidePanelClose',
  search_public_library: 'publicLibrarySearch',
  list_public_library: 'publicLibraryList',
  publish_library_item: 'publicLibraryPublishItem',
  list_shapes: 'reactFlowListShapes',
  insert_shape: 'reactFlowInsertShape',
  link_shapes: 'reactFlowLinkShapes',
  move_shape: 'reactFlowMoveShape',
  set_notebook_header: 'notebookSetHeader',
};

const upperFirst = (value: string): string =>
  value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;

/** The public, model-facing name of a frontend tool. */
export function frontendToolName(name: string, domain?: string): string {
  const special = SPECIAL[name];
  if (special) {
    return special;
  }
  const withoutVendor = name.replace(/^datalayer_/, '');
  const camel = withoutVendor.replace(/_+([a-zA-Z0-9])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
  if (!domain || camel.startsWith(domain)) {
    return camel;
  }
  return `${domain}${upperFirst(camel)}`;
}

/** Rename a tool without changing the implementation behind it. */
export function namedFrontendTool(
  tool: FrontendToolDefinition,
  domain?: string,
): FrontendToolDefinition {
  const name = frontendToolName(tool.name, domain);
  return {
    ...tool,
    name,
    description:
      tool.description?.trim() || `${name} runs in the visible application.`,
  };
}

export function namedFrontendTools(
  tools: readonly FrontendToolDefinition[],
  domain?: string,
): FrontendToolDefinition[] {
  return tools.map(tool => namedFrontendTool(tool, domain));
}
