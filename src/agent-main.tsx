/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createRoot } from 'react-dom/client';
import Agent from './Agent';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<Agent />);
}
