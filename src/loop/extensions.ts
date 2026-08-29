/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Loop plugins, grouped the way they are installed.
 *
 * Splitting the editors from their toolbars bought a real thing — a toolbar
 * can be switched off, and the chat can fill one without the editor knowing —
 * but it also doubled the length of the plugin list, and a list of peers is a
 * worse way to read a system than a list of capabilities.
 *
 * An extension fixes exactly that and nothing else: it groups, and it has no
 * lifecycle of its own. Each member is still enabled and disabled on its own,
 * still appears on the graph as itself, and still contributes as itself. The
 * grouping is only how a reader is told "these arrived together, and this is
 * what you would uninstall to lose the capability".
 *
 * @module loop/extensions
 */

import { defineExtension } from '@datalayer/reactor';
import { DocumentPlugin } from './plugins/document';
import { DocumentToolbarPlugin } from './plugins/document-toolbar';
import { NotebookPlugin } from './plugins/notebook';
import { NotebookToolbarPlugin } from './plugins/notebook-toolbar';

/**
 * The notebook capability: the editor, and the toolbar that reports on it.
 *
 * The sandbox plugin is deliberately absent even though the editor depends on
 * it. It arrives as a dependency, and a package should not claim to deliver
 * something it merely relies on — the whole workspace runs on that sandbox.
 */
export const NotebookExtension = defineExtension({
  name: '@datalayer/loop-extension-notebook',
  displayName: 'Notebooks',
  description: 'A notebook beside the chat, and the toolbar that reports on it.',
  octicon: 'rows',
  emoji: '\u{1F4D3}',
  plugins: [NotebookPlugin, NotebookToolbarPlugin],
});

/** The document capability: the same arrangement, for prose. */
export const DocumentExtension = defineExtension({
  name: '@datalayer/loop-extension-document',
  displayName: 'Documents',
  description:
    'A rich-text document beside the chat, and the toolbar that reports on it.',
  octicon: 'file',
  emoji: '\u{1F4C4}',
  plugins: [DocumentPlugin, DocumentToolbarPlugin],
});
