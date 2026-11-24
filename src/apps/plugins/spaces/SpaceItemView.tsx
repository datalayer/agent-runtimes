/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An open Space item in its tab: a document in the Lexical editor the page's
 * Document tab uses (`EphemeralDocument`), a notebook in the notebook view
 * the page's Notebook tab uses (`EphemeralNotebook`). Their cells run on the
 * page's kernel, the workspace's or Python in this browser
 * (`usePageDocumentServices`). The view starts from what the item holds
 * (`openItems`) and tells it each change, which a save writes back.
 *
 * Loaded with the tab, not with the chat: the editors are heavy.
 *
 * @module apps/plugins/spaces/SpaceItemView
 */

import { useCallback, useState, type JSX } from 'react';
import type { INotebookContent } from '@jupyterlab/nbformat';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { EphemeralDocument } from '../../../chat/document/EphemeralDocument';
import { EphemeralNotebook } from '../../../chat/notebook/EphemeralNotebook';
import { conversationScopedId } from '../../pageTools/conversationScope';
import { usePageDocumentServices } from '../page-document/usePageDocumentServices';
import { updateSpaceItemContent, type OpenSpaceItem } from './openItems';

/** The id an open item's editor is registered under, in this conversation. */
export const spaceItemViewId = (uid: string, conversation = ''): string =>
  conversationScopedId(`spaces-${uid}`, conversation);

const NOTEBOOK_SX = {
  height: '100%',
  minHeight: 0,
  '& .jp-NotebookPanel': { height: '100% !important', minHeight: 0 },
  '& .dla-Box-Notebook': {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
};

export default function SpaceItemView({
  item,
  conversation = '',
}: {
  item: OpenSpaceItem;
  conversation?: string;
}): JSX.Element {
  const { services } = usePageDocumentServices();
  // What it held when the tab was drawn: the editor starts from it once.
  const [initial] = useState(() => item.current);
  const onChange = useCallback(
    (content: string | INotebookContent) =>
      updateSpaceItemContent(item.uid, content, conversation),
    [item.uid, conversation],
  );
  const viewId = spaceItemViewId(item.uid, conversation);
  if (item.type === 'document') {
    return (
      <Box data-spaces-item-document={item.uid} height="100%" minHeight={0}>
        <EphemeralDocument
          documentId={viewId}
          content={(initial as string) || undefined}
          onContentChange={onChange}
          serviceManager={services?.serviceManager}
          kernelId={services?.kernelId}
          awaitingKernel={!services}
          withoutRuntime
          inheritTheme
          showToolbar
          autoFocus={false}
        />
      </Box>
    );
  }
  if (!services) {
    return (
      <Box
        minHeight={320}
        display="flex"
        alignItems="center"
        justifyContent="center"
        aria-busy="true"
        data-spaces-item-starting={item.uid}
      >
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          Starting Python for the notebook…
        </Text>
      </Box>
    );
  }
  return (
    <Box sx={NOTEBOOK_SX} data-spaces-item-notebook={item.uid}>
      <EphemeralNotebook
        notebookId={viewId}
        nbformat={initial as INotebookContent}
        onNbformatChange={onChange}
        serviceManager={services.serviceManager}
        kernelId={services.kernelId}
        inheritTheme
        showToolbar
      />
    </Box>
  );
}
