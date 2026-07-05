/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import dynamic from 'next/dynamic';

// Disable SSR for this component to avoid document is not defined errors
const NotebooksPageContent = dynamic(() => import('./NotebooksPageContent'), {
  ssr: false,
});

export default function NotebooksPage() {
  return <NotebooksPageContent />;
}
