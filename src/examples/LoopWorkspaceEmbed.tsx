/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The LOOP workspace, ready to drop into somebody else's page.
 *
 * `LoopWorkspaceExample` is the workspace; this is everything a host has to do
 * around it, done once here instead of once per host:
 *
 * - **Loaded lazily, fetched eagerly.** The workspace pulls in a notebook
 *   editor and a Python runtime measured in megabytes, so it must not be in
 *   the bundle a page needs before it can paint. Downloading it only when it
 *   first renders turns that saving into a wait, so the chunk is requested as
 *   soon as this module evaluates and is usually there before anyone scrolls
 *   to it.
 * - **Fenced off.** An old browser, a blocked worker, a network that dropped
 *   the Python payload: none of those should cost the host the rest of its
 *   page, so a failure inside the workspace stops here.
 * - **Honest while it waits**, and honest when it cannot start.
 *
 * The landing page had all three, written against a package it embeds — which
 * is the wrong side of the boundary for them to live on: a change to how the
 * workspace boots would have had to be made in a repository that only
 * *renders* it. What a host keeps is the frame it puts around the thing and
 * where a failure should send its readers.
 *
 * @module examples/LoopWorkspaceEmbed
 */

import { Component, Suspense, type ReactNode } from 'react';
import { Spinner, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { lazyWithPreload } from '@datalayer/core/lib/utils';

import type { LoopWorkspaceExampleProps } from './LoopWorkspaceExample';

/**
 * The workspace itself, split out of the host's bundle.
 *
 * The real one — plugins, views, chat, sandbox and all, exactly as the
 * examples app runs it. Reaching for it rather than rebuilding a smaller one
 * for embedding is the whole point: a second implementation drifts from the
 * first by the following release.
 */
const LazyLoopWorkspace = lazyWithPreload(async () => {
  const module = await import('./LoopWorkspaceExample');
  return { default: module.LoopWorkspaceExample };
});

// Requested now, rendered later. See the note at the top of the file.
LazyLoopWorkspace.preload();

/** Ask for the workspace's code before anything renders it. */
export function preloadLoopWorkspace(): void {
  void LazyLoopWorkspace.preload();
}

export type LoopWorkspaceEmbedProps = LoopWorkspaceExampleProps & {
  /**
   * What to show in place of the workspace when it cannot run.
   *
   * The default says what happened and nothing else. A host with somewhere
   * useful to send a reader — a gallery, a sign-up — should say so here: this
   * package does not know what else that page has to offer.
   */
  fallback?: ReactNode;
  /** What to show while the workspace is on its way. */
  loading?: ReactNode;
};

/** Rendered while the editor and its runtime are arriving. */
function WorkspaceLoading(): JSX.Element {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
      }}
    >
      <Spinner />
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
        Starting the workspace…
      </Text>
    </Box>
  );
}

/** Said when the workspace will not start, and the host offered nothing better. */
function WorkspaceUnavailable(): JSX.Element {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 4,
        textAlign: 'center',
      }}
    >
      <Text sx={{ fontSize: 2, fontWeight: 'semibold' }}>
        The live workspace could not start in this browser.
      </Text>
      <Text sx={{ color: 'fg.muted', fontSize: 1, maxWidth: 420 }}>
        It needs a modern browser that can run Python in a worker.
      </Text>
    </Box>
  );
}

type BoundaryProps = { children: ReactNode; fallback: ReactNode };
type BoundaryState = { failed: boolean };

/** Keeps a failing workspace from taking its host's page with it. */
class WorkspaceBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Worth a console line for whoever is debugging it; not worth a banner on
    // somebody's landing page.
    console.warn('The embedded agent workspace could not start.', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The workspace, framed by whoever is embedding it.
 *
 * Fills its container: give it a height. Every other prop is the example's own
 * — see {@link LoopWorkspaceExampleProps}.
 */
export function LoopWorkspaceEmbed({
  fallback,
  loading,
  ...workspace
}: LoopWorkspaceEmbedProps): JSX.Element {
  const waiting = loading ?? <WorkspaceLoading />;
  return (
    <WorkspaceBoundary fallback={fallback ?? <WorkspaceUnavailable />}>
      <Suspense fallback={waiting}>
        <LazyLoopWorkspace {...workspace} />
      </Suspense>
    </WorkspaceBoundary>
  );
}

export default LoopWorkspaceEmbed;
