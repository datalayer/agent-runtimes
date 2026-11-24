/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an anonymous visitor's conversation draws (the user, 15 November
 * 2026), so that every host that runs one gets it without drawing it:
 *
 * - **the temporary key's clock** in the header (core's `AnonymousKeyTimer`):
 *   held full until the first question, counting the conversation's minutes
 *   after it; beside the limited-preview indicator when the chat draws no
 *   header;
 * - **Sign in to use <tool>** under a tool call refused for want of an
 *   account.
 *
 * The limited preview itself — *Limited preview · N/M turns today*, what
 * signing in keeps, what is disabled, *Sign in* or the host's call to action
 * — is no box on top any more but an indicator beside the composer, a plugin
 * of its own (`apps/plugins/limited-preview`, the user, 20 November 2026).
 *
 * The conversation's state is held by the chat (`useAnonymousTurns`) and
 * handed down through {@link AnonymousChatProvider}, which the tool cards
 * deep in the transcript and the limited-preview indicator read.
 *
 * @module chat/anonymous/AnonymousChat
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
/* By file, not through the barrel: the barrel reaches the sign-in form. */
import { AnonymousKeyTimer } from '@datalayer/core/lib/components/anonymous/AnonymousKeyTimer';
import {
  ANONYMOUS_MINUTES,
  ANONYMOUS_WORDS,
  anonymousRefusal,
  isAuthRefusal,
  readTurns,
  signInTarget,
  takeTurn,
  turnsToday,
  writeTurns,
  type ChatAnonymous,
} from './anonymousMode';

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/** A visitor's turns, as the chat counts them. */
export type AnonymousTurns = {
  /** Turns taken today. */
  taken: number;
  /** When this conversation's first turn was taken (epoch ms), or none yet. */
  startedAt: number | null;
  /** Why no turn is left, or `''`. */
  refused: string;
  /** Take one: the agent set to work on a question. */
  take: () => void;
};

/**
 * The visitor's turns today and this conversation's minutes, ticking while
 * the conversation runs, so that the prompt closes when they are spent.
 */
export function useAnonymousTurns(
  maxTurns: number | undefined,
  minutes: number = ANONYMOUS_MINUTES,
  countTurns = true,
): AnonymousTurns {
  const [taken, setTaken] = useState(() =>
    turnsToday(readTurns(storage()), Date.now()),
  );
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const take = useCallback(() => {
    const at = Date.now();
    if (countTurns) {
      const kept = takeTurn(readTurns(storage()), at);
      writeTurns(storage(), kept);
      setTaken(kept.taken);
    }
    setStartedAt(current => current ?? at);
    setNow(at);
  }, [countTurns]);
  const refused = anonymousRefusal({
    taken,
    maxTurns,
    startedAt,
    now,
    minutes,
  });
  return { taken, startedAt, refused, take };
}

/** An anonymous conversation, as the chat holds it. */
export type AnonymousChatState = AnonymousTurns & {
  /** What the host said. */
  config: ChatAnonymous;
  /** Who is answering: what the trial key is for. */
  name: string;
  /** Whether the temporary key is still being asked for and checked. */
  validating: boolean;
  /** Whether the chat draws a header, where the clock goes. */
  headerShown: boolean;
  /** The conversation's minutes. */
  minutes: number;
  /** Go to sign in, as the host said. */
  signIn: () => void;
};

const AnonymousChatContext = createContext<AnonymousChatState | null>(null);

/** The anonymous conversation, for whatever the chat draws below it. */
export function AnonymousChatProvider({
  value,
  children,
}: {
  value: AnonymousChatState | null;
  children: ReactNode;
}): JSX.Element {
  return (
    <AnonymousChatContext.Provider value={value}>
      {children}
    </AnonymousChatContext.Provider>
  );
}

/** The anonymous conversation, or none for a signed-in one. */
export function useAnonymousChat(): AnonymousChatState | null {
  return useContext(AnonymousChatContext);
}

/** *Sign in*, as the host said: its function, its address, else Datalayer's. */
export function useAnonymousSignIn(config: ChatAnonymous): () => void {
  const { onSignIn, signInUrl } = config;
  return useCallback(() => {
    if (onSignIn) {
      onSignIn();
      return;
    }
    window.location.assign(signInTarget(signInUrl, window.location.href));
  }, [onSignIn, signInUrl]);
}

/**
 * The temporary key's clock: full and still until the first question, then
 * the conversation's minutes counting down.
 */
export function AnonymousKeyClock({
  state,
}: {
  state: Pick<AnonymousChatState, 'startedAt' | 'minutes' | 'name'>;
}): JSX.Element {
  const granted = state.minutes * 60_000;
  // Read once while paused, so that the full ring does not re-render each tick.
  const [openedAt] = useState(() => Date.now());
  return (
    <Box
      display="inline-flex"
      alignItems="center"
      data-anonymous-key-clock={
        state.startedAt === null ? 'waiting' : 'running'
      }
    >
      <AnonymousKeyTimer
        expiresAt={(state.startedAt ?? openedAt) + granted}
        grantedMs={granted}
        paused={state.startedAt === null}
        label={ANONYMOUS_WORDS.trialKey(state.name)}
      />
    </Box>
  );
}

/**
 * *Sign in to use <tool>*, under a tool call refused for want of an account
 * — only in an anonymous conversation, and only for a call that ran: a
 * failed discovery of the tools is no call.
 */
export function AnonymousToolSignIn({
  call,
}: {
  call: {
    toolName: string;
    status?: string;
    error?: unknown;
    executionError?: unknown;
    result?: unknown;
  };
}): JSX.Element | null {
  const state = useAnonymousChat();
  if (!state || !isAuthRefusal(call)) {
    return null;
  }
  return (
    <Box my={1} data-anonymous-tool-sign-in={call.toolName}>
      <Button size="small" variant="primary" onClick={state.signIn}>
        {ANONYMOUS_WORDS.signInToUse(call.toolName)}
      </Button>
    </Box>
  );
}
