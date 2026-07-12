/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';

/**
 * Props for {@link ExampleErrorBoundary}.
 */
export interface ExampleErrorBoundaryProps {
  /** Child example tree to protect. */
  children: React.ReactNode;
}

interface ExampleErrorBoundaryState {
  error: Error | null;
}

/**
 * Generic error boundary that surfaces render-time exceptions thrown by any
 * example in the UI instead of leaving a blank screen with a console error.
 *
 * Reset it per example by passing a `key` (e.g. the example id) so switching
 * examples clears a previous error.
 */
export class ExampleErrorBoundary extends React.Component<
  ExampleErrorBoundaryProps,
  ExampleErrorBoundaryState
> {
  /**
   * Create the boundary with a clean error state.
   *
   * @param props - The boundary props.
   */
  constructor(props: ExampleErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  /**
   * Capture a thrown error into state so it can be rendered.
   *
   * @param error - The error thrown by a descendant.
   * @returns The next boundary state.
   */
  static getDerivedStateFromError(error: Error): ExampleErrorBoundaryState {
    return { error };
  }

  /**
   * Log the error for debugging while it is surfaced in the UI.
   *
   * @param error - The error thrown by a descendant.
   */
  componentDidCatch(error: Error): void {
    console.error('Example rendering failed:', error);
  }

  /**
   * Render either the protected children or the error surface.
   *
   * @returns The rendered tree.
   */
  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <Box sx={{ p: 4 }}>
        <Box
          sx={{
            p: 3,
            border: '1px solid',
            borderColor: 'danger.muted',
            borderRadius: 2,
            bg: 'danger.subtle',
            color: 'danger.fg',
          }}
        >
          <Box sx={{ fontWeight: 600, mb: 2 }}>This example failed to load</Box>
          <Box
            as="pre"
            sx={{
              m: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'mono',
              fontSize: 0,
            }}
          >
            {error.message || String(error)}
          </Box>
        </Box>
      </Box>
    );
  }
}
