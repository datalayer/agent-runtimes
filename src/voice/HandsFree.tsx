/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Talk with it*: a conversation by voice, hands-free (VOICE.md VO-12,
 * VO-13), beside the composer's microphone where the application's voice
 * says `input: hands_free`.
 *
 * On, the microphone stays open. The words are written in the composer as
 * they are heard (VO-11); once the person has spoken and been silent for the
 * turn's silence (`turnSilenceMs`, 700 ms unless said), what was said is
 * heard whole and **sent** — nothing waits for a click. The answer is said as
 * it is written (hands-free implies `output: always`), and listening goes
 * on through it: speech heard while the agent thinks or speaks is
 * **barge-in** (VO-13) — its voice stops at once, the run is stopped while
 * the answer is still being written, the interrupted answer is marked in
 * the conversation, and what was heard starts the next turn. The state is
 * shown at all times: *Listening…*, *Thinking…*, *Speaking…*, *Paused*.
 * `Esc` or *Pause* pauses it; the toggle again turns it off.
 *
 * The microphone is opened anew when the agent begins answering, so what it
 * holds then is the person's; the browser's echo cancellation keeps the
 * answer's own sound out (`openMicrophone`). The first use asks for the
 * microphone as the click-to-talk does (VO-61), under the same consent.
 *
 * @module voice/HandsFree
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, IconButton, Text, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { openMicrophone, type Capture } from './capture';
import {
  CONSENT_SENTENCE,
  SERVER_CONSENT_SENTENCE,
  consent,
  consentKeyFor,
  consented,
} from './consent';
import {
  HANDS_FREE_WORDS,
  IDLE_PAUSE_MS,
  TURN_SILENCE_MS,
  bargedIn,
  handsFreeState,
  turnEnded,
} from './handsFree';
import type { Hearing } from './hearing';
import { INTERIM_MS } from './VoiceInput';
import type { SpokenMetadata } from './types';

export interface HandsFreeProps {
  hearing: Hearing;
  /** The language listened to, BCP 47. */
  language: string;
  /** Whose consent to the microphone is remembered: the application's id. */
  consentKey: string;
  /** The microphone the person chose (VO-30); the browser's own when unsaid. */
  microphoneId?: string;
  /** The silence after speech that ends a turn, in ms; 700 unless said (VO-12). */
  turnSilenceMs?: number;
  /** A turn, heard whole: sent at once. */
  send: (text: string, metadata: SpokenMetadata) => void;
  /** The words heard so far, for the composer (VO-11); `''` gives it back. */
  onInterim?: (text: string) => void;
  /** The agent is answering: a run is in progress. */
  running?: boolean;
  /** The agent's answer is being said. */
  speaking?: boolean;
  /** Stops the agent's voice at once (barge-in, VO-13). */
  onStopSpeaking?: () => void;
  /** Stops the run while the answer is still being written (barge-in, VO-13). */
  onStopRun?: () => void;
  /** The answer being written was interrupted: marked in the conversation (VO-13). */
  onInterrupted?: () => void;
  disabled?: boolean;
}

/** Waits. */
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function HandsFree({
  hearing,
  language,
  consentKey,
  microphoneId,
  turnSilenceMs = TURN_SILENCE_MS,
  send,
  onInterim,
  running = false,
  speaking = false,
  onStopSpeaking,
  onStopRun,
  onInterrupted,
  disabled = false,
}: HandsFreeProps): JSX.Element {
  const [on, setOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const state = handsFreeState({ on, paused, speaking, running });
  const stateRef = useRef(state);
  stateRef.current = state;
  const runningRef = useRef(running);
  runningRef.current = running;
  const capture = useRef<Capture | undefined>(undefined);
  const latest = useRef({
    send,
    onInterim,
    onStopSpeaking,
    onStopRun,
    onInterrupted,
  });
  latest.current = {
    send,
    onInterim,
    onStopSpeaking,
    onStopRun,
    onInterrupted,
  };
  const key = consentKeyFor(consentKey, hearing.where);

  const turnOn = useCallback(() => {
    if (!consented(key)) {
      setAsking(true);
      return;
    }
    setProblem(undefined);
    setPaused(false);
    setOn(true);
  }, [key]);

  const turnOff = useCallback(() => {
    setOn(false);
    setPaused(false);
    capture.current?.cancel();
    capture.current = undefined;
    latest.current.onInterim?.('');
  }, []);

  /*
   * The loop: while on and not paused, the microphone is open and what it
   * heard so far is looked at every INTERIM_MS. Listening, the turn ends on
   * the silence and is sent; thinking or speaking, speech is barge-in. The
   * microphone is opened anew when the agent begins answering, and after
   * each turn, so what it holds is only what came since.
   */
  const heardWhile = useRef<'listening' | 'answering'>('listening');
  useEffect(() => {
    if (!on || paused) {
      return;
    }
    let alive = true;
    let quietSince = Date.now();
    void (async () => {
      try {
        await hearing.ready(language);
        capture.current = await openMicrophone(microphoneId);
      } catch (error) {
        if (alive) {
          setProblem(
            error instanceof Error
              ? error.message
              : 'The microphone could not be opened.',
          );
          setOn(false);
        }
        return;
      }
      heardWhile.current =
        stateRef.current === 'listening' ? 'listening' : 'answering';
      while (alive) {
        await pause(INTERIM_MS);
        const open = capture.current;
        if (!alive || !open) {
          return;
        }
        const now = stateRef.current;
        const answering = now === 'thinking' || now === 'speaking';
        // The agent began answering, or finished: hear anew from here.
        if (
          (answering && heardWhile.current === 'listening') ||
          (!answering && heardWhile.current === 'answering')
        ) {
          open.cancel();
          try {
            capture.current = await openMicrophone(microphoneId);
          } catch {
            return;
          }
          heardWhile.current = answering ? 'answering' : 'listening';
          quietSince = Date.now();
          continue;
        }
        let so: Awaited<ReturnType<Hearing['hearSoFar']>> | undefined;
        try {
          so = await hearing.hearSoFar(open.peek(), language);
        } catch {
          so = undefined;
        }
        if (!alive || capture.current !== open || !so) {
          continue;
        }
        if (so.text) {
          latest.current.onInterim?.(so.text);
        }
        if (so.spoke) {
          quietSince = Date.now();
        }
        if (bargedIn(now, so)) {
          // The person speaks over the agent (VO-13): its voice and its run
          // stop; what was heard goes on as the next turn.
          latest.current.onStopSpeaking?.();
          if (now === 'thinking' || runningRef.current) {
            latest.current.onStopRun?.();
          }
          latest.current.onInterrupted?.();
          heardWhile.current = 'listening';
          continue;
        }
        if (now === 'listening' && turnEnded(so, turnSilenceMs)) {
          capture.current = undefined;
          const audio = await open.stop();
          let heard: Awaited<ReturnType<Hearing['hear']>>;
          try {
            heard = await hearing.hear(audio, language);
          } catch (error) {
            heard = undefined;
            if (alive) {
              setProblem(
                error instanceof Error
                  ? error.message
                  : 'What you said could not be heard.',
              );
            }
          }
          if (!alive) {
            return;
          }
          latest.current.onInterim?.('');
          if (heard) {
            latest.current.send(heard.text, heard.metadata);
          }
          try {
            capture.current = await openMicrophone(microphoneId);
          } catch {
            return;
          }
          heardWhile.current = 'listening';
          quietSince = Date.now();
          continue;
        }
        if (now === 'listening' && Date.now() - quietSince >= IDLE_PAUSE_MS) {
          setPaused(true);
          return;
        }
      }
    })();
    return () => {
      alive = false;
      capture.current?.cancel();
      capture.current = undefined;
    };
    // The loop reads the state through a ref: it is not restarted on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, paused, hearing, language, microphoneId, turnSilenceMs]);

  // Esc pauses it.
  useEffect(() => {
    if (!on) {
      return;
    }
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !paused) {
        setPaused(true);
        capture.current?.cancel();
        capture.current = undefined;
        latest.current.onInterim?.('');
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [on, paused]);

  return (
    <Box
      display="inline-flex"
      alignItems="center"
      sx={{ gap: 1, position: 'relative' }}
      data-hands-free={state}
    >
      <Tooltip
        text={
          on
            ? 'Stop talking with it'
            : 'Talk with it: speak, it answers, and listens on (hands-free)'
        }
        direction="n"
      >
        <Button
          size="small"
          variant={on ? 'primary' : 'invisible'}
          aria-pressed={on}
          aria-label={on ? 'Stop talking with it' : 'Talk with it'}
          disabled={disabled}
          data-hands-free-toggle=""
          onClick={() => (on ? turnOff() : turnOn())}
        >
          {HANDS_FREE_WORDS.off}
        </Button>
      </Tooltip>
      {on ? (
        <>
          <Text
            sx={{ fontSize: 0, color: 'fg.muted' }}
            role="status"
            aria-live="polite"
            data-hands-free-state={state}
          >
            {HANDS_FREE_WORDS[state]}
          </Text>
          {paused ? (
            <IconButton
              icon={() => <span aria-hidden="true">▶</span>}
              size="small"
              variant="invisible"
              aria-label="Resume listening"
              data-hands-free-resume=""
              onClick={() => setPaused(false)}
            />
          ) : (
            <IconButton
              icon={() => <span aria-hidden="true">❚❚</span>}
              size="small"
              variant="invisible"
              aria-label="Pause listening (Esc)"
              data-hands-free-pause=""
              onClick={() => {
                setPaused(true);
                capture.current?.cancel();
                capture.current = undefined;
                latest.current.onInterim?.('');
              }}
            />
          )}
        </>
      ) : null}
      {problem ? (
        <Text
          sx={{ fontSize: 0, color: 'danger.fg' }}
          data-hands-free-problem=""
        >
          {problem}
        </Text>
      ) : null}
      {asking ? (
        <Box
          role="dialog"
          aria-label="The microphone"
          data-hands-free-consent=""
          position="absolute"
          bottom="100%"
          left={0}
          width={280}
          p={3}
          bg="canvas.overlay"
          border="1px solid"
          borderColor="border.default"
          borderRadius={2}
          boxShadow="shadow.large"
          zIndex={10}
        >
          <Text as="p" sx={{ fontSize: 1, mb: 2 }}>
            {hearing.where === 'server'
              ? SERVER_CONSENT_SENTENCE
              : CONSENT_SENTENCE}
          </Text>
          <Box display="flex" gap={2} justifyContent="flex-end">
            <Button size="small" onClick={() => setAsking(false)}>
              Not now
            </Button>
            <Button
              size="small"
              variant="primary"
              data-hands-free-consent-yes=""
              onClick={() => {
                consent(key);
                setAsking(false);
                setProblem(undefined);
                setPaused(false);
                setOn(true);
              }}
            >
              Use the microphone
            </Button>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

export default HandsFree;
