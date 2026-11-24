/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A Lexical document in a named chat side-panel tab. It uses the same rich
 * document and stable block tools as a document managed in a Space, while
 * keeping this draft in the conversation until it is saved explicitly.
 *
 * @module apps/plugins/page-document
 */

import { lazy, Suspense, type JSX } from 'react';
import { FileIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import { createLexicalTools } from '../../../tools/adapters/agent-runtimes/lexicalHooks';
import { beforeEachCall } from '../../pageTools/untilMounted';
import { revealPanelFor } from '../../shell/sidePanelReveal';
import {
  PAGE_DOCUMENT_ID as MEMORY_DOCUMENT_ID,
  pageDocumentEditor,
  pageDocumentKernel,
} from './memoryDocument';
import { CallLine, cardRole, toolOf } from '../../pageTools/cards';
import {
  defineToolCardPlugin,
  type ToolCardPluginOptions,
} from '../../toolCards/kit';
import type { SidePlacement } from '../../toolCards/chrome';

export const PAGE_DOCUMENT_PLUGIN_NAME =
  '@datalayer/agent-plugin-page-document';
export const PAGE_DOCUMENT_ID = 'page-document';

const Editor = lazy(() => import('./PageDocumentEditor'));
/**
 * The tools that run code: they wait for the document's kernel, which the
 * panel binds once the page's Python (or the workspace's runtime) is up. A
 * run before that ran on nothing and came back with no output.
 */
const RUNS_CODE = /run(all)?blocks?$|executecode/;

// The tools act on the in-memory document (memoryDocument), built on the
// first call; the call also shows the panel that mirrors it, without waiting for it.
const FRONTEND_TOOLS = beforeEachCall(
  createLexicalTools(MEMORY_DOCUMENT_ID),
  async tool => {
    await pageDocumentEditor();
    revealPanelFor(tool.name);
    if (RUNS_CODE.test(tool.name.toLowerCase().replace(/_/g, ''))) {
      await pageDocumentKernel();
    }
  },
);
export const PAGE_DOCUMENT_TOOL_NAMES = FRONTEND_TOOLS.map(tool => tool.name);
/** The tools as the agent calls them: on the in-memory document, runs on its kernel. */
export const PAGE_DOCUMENT_FRONTEND_TOOLS = FRONTEND_TOOLS;

function DocumentPanel(): JSX.Element {
  return (
    <Suspense fallback={<Box minHeight={240} aria-busy="true" />}>
      <Editor />
    </Suspense>
  );
}

export function PageDocumentCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const role = cardRole(context, undefined);
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const tool = toolOf(context, PAGE_DOCUMENT_TOOL_NAMES);
  return (
    <CallLine icon={FileIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending' ? 'Writing the document…' : 'Updated the document'}
    </CallLine>
  );
}

const PAGE_DOCUMENT: ToolCardPluginOptions = {
  id: 'page-document',
  displayName: 'Document in the page',
  description:
    'A Lexical rich-text document the agent creates and edits with stable block tools in a chat tab.',
  octicon: 'file',
  emoji: '\u{1F4C4}',
  tools: PAGE_DOCUMENT_TOOL_NAMES,
  Card: PageDocumentCard,
  frontendTools: FRONTEND_TOOLS,
  Panel: DocumentPanel,
  panelWidth: 720,
};

export const PageDocumentPlugin = defineToolCardPlugin(PAGE_DOCUMENT);

export const pageDocumentSidePlugin = (side: SidePlacement, tab?: string) =>
  defineToolCardPlugin(
    { ...PAGE_DOCUMENT, ...(tab ? { panelLabel: tab } : {}) },
    side,
  );

export default PageDocumentPlugin;
