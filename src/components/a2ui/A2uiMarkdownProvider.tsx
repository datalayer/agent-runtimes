/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { MarkdownContext } from '@a2ui/react/v0_9';
import { renderMarkdown } from '@a2ui/markdown-it';

/**
 * Provides the A2UI v0.9 markdown renderer to every `A2uiSurface` beneath
 * it. Without it, `Text` components fall back to the raw markdown string
 * (`## Title` instead of a rendered heading).
 *
 * In the library rather than the examples: the loop's own surface plugin
 * draws surfaces, and needs the same context the examples had.
 */
export const A2uiMarkdownProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => (
  <MarkdownContext.Provider value={renderMarkdown}>
    {children}
  </MarkdownContext.Provider>
);

export default A2uiMarkdownProvider;
