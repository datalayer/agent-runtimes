/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { uiFrontendToolNamed } from '../specs/uiFrontendTools';
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

/**
 * What the model must know about page-local editors.
 *
 * Their upstream schemas speak about notebook and `.dlex` files because the
 * same operations also run in persisted editors. In an application they are
 * bound to the live tab instead: a public demo can populate that temporary
 * notebook or document without an account or a filesystem. Leaving that
 * distinction implicit makes a model refuse exactly the work the page put in
 * front of it.
 */
function pageEditorAvailability(name: string): string {
  if (name === 'documentInsertBlock') {
    return 'This tool creates content in the current in-page Document tab, including in a public demo. When the user asks to create a document, call it immediately with afterId BOTTOM instead of refusing, asking them to sign in, or merely drafting in chat. It needs no filesystem access.';
  }
  if (name.startsWith('document')) {
    return 'This tool runs on the current in-page Document tab, including in a public demo. It needs no sign-in or filesystem access; creating a document means inserting content into that already-mounted document.';
  }
  // The notebook header's tool sets the chat's title bar, not a cell.
  if (name.startsWith('notebook') && name !== 'notebookSetHeader') {
    return 'This tool runs on the current in-page Notebook tab, including in a public demo. It needs no sign-in or filesystem access; creating a notebook means inserting and running cells in that already-mounted notebook.';
  }
  return '';
}

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
  const availability = pageEditorAvailability(name);
  // A tool handed over without words of its own takes its UI plugin's.
  const description =
    tool.description?.trim() ||
    uiFrontendToolNamed(name)?.description ||
    `${name} runs in the visible application.`;
  return {
    ...tool,
    name,
    description: availability
      ? `${/[.!?)]$/.test(description) ? description : `${description}.`} ${availability}`
      : description,
  };
}

export function namedFrontendTools(
  tools: readonly FrontendToolDefinition[],
  domain?: string,
): FrontendToolDefinition[] {
  return tools.map(tool => namedFrontendTool(tool, domain));
}
