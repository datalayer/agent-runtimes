/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The Lexical document an agent and a person edit together in a side-panel tab. */

import type { JSX } from 'react';
import { EphemeralDocument } from '../../../chat/document/EphemeralDocument';

export const PAGE_DOCUMENT_ID = 'page-document';

export default function PageDocumentEditor(): JSX.Element {
  return (
    <EphemeralDocument
      inheritTheme
      documentId={PAGE_DOCUMENT_ID}
      autoFocus={false}
      showToolbar
    />
  );
}
