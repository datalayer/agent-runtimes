/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Push-to-talk in the composer (VOICE.md VO-10, VO-61, VO-62, VO-65 to VO-68).
 *
 * The microphone button: pressed and held, or clicked to start and clicked
 * to stop; `Ctrl`+`Space` held does the same, and `Esc` cancels. While it
 * listens the button says *Listening* and a meter shows the level (still,
 * and said in words, for a reader who asks for reduced motion). Released,
 * what was said is heard on the device and given to `onTranscript`: put in
 * the composer, or sent at once when *Send what I say* is on. The first time,
 * one sentence says where the audio goes before the browser asks.
 *
 * @module voice/VoiceInput
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, IconButton, Text, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { MicrophoneIcon } from '@datalayer/icons-react';
import { MuteIcon } from '@primer/octicons-react';
import { MicrophoneRefused, openMicrophone, type Capture } from './capture';
import { CONSENT_SENTENCE, consent, consented } from './consent';
import type { DeviceHearing } from './hearing';
import type { Transcript } from './types';

/** What the microphone is doing, said in words (VO-67, VO-68). */
export type ListeningState =
  'idle' | 'asking' | 'loading' | 'listening' | 'hearing';

const WORDS: Record<ListeningState, string> = {
  idle: '',
  asking: '',
  loading: 'Getting ready to listen…',
  listening: 'Listening… let go to stop, Esc to cancel',
  hearing: 'Hearing what you said…',
};

/** A press shorter than this is a click: it starts, and the next click stops. */
const CLICK_MS = 300;

export interface VoiceInputProps {
  hearing: DeviceHearing;
  /** The language listened to, BCP 47. */
  language: string;
  /** What was said, once heard. */
  onTranscript: (transcript: Transcript) => void;
  /** The microphone opens: the agent stops speaking (VO-13). */
  onListen?: () => void;
  /** Whose consent is remembered: the application's id. */
  consentKey: string;
  disabled?: boolean;
  /** The agent is speaking: offer to stop it. */
  speaking?: boolean;
  onStopSpeaking?: () => void;
}

function prefersStill(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export function VoiceInput({
  hearing,
  language,
  onTranscript,
  onListen,
  consentKey,
  disabled = false,
  speaking = false,
  onStopSpeaking,
}: VoiceInputProps): JSX.Element {
  const [state, setState] = useState<ListeningState>('idle');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [progress, setProgress] = useState<number | undefined>();
  const capture = useRef<Capture | undefined>(undefined);
  const pressedAt = useRef(0);
  const stopOnRelease = useRef(false);
  const meter = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const start = useCallback(async () => {
    if (disabled || stateRef.current !== 'idle') {
      return;
    }
    if (!consented(consentKey)) {
      setState('asking');
      return;
    }
    setProblem(undefined);
    onListen?.();
    try {
      setState('loading');
      // The models load once, on first use, with their progress shown.
      await hearing.ready(language, (loaded, total) =>
        setProgress(total ? Math.round((loaded / total) * 100) : undefined),
      );
      setProgress(undefined);
      if ((stateRef.current as ListeningState) !== 'loading') {
        return;
      }
      capture.current = await openMicrophone();
      setState('listening');
      setSaid('Listening');
    } catch (error) {
      setState('idle');
      setProgress(undefined);
      setProblem(
        error instanceof MicrophoneRefused || error instanceof Error
          ? error.message
          : 'The microphone could not be opened.',
      );
    }
  }, [consentKey, disabled, hearing, language, onListen]);

  const stop = useCallback(async () => {
    const open = capture.current;
    capture.current = undefined;
    if (!open) {
      if (stateRef.current === 'loading') {
        setState('idle');
      }
      return;
    }
    setState('hearing');
    try {
      const audio = await open.stop();
      const transcript = await hearing.hear(audio, language);
      setState('idle');
      if (!transcript) {
        setSaid('Nothing was heard.');
        return;
      }
      setSaid(`Heard: ${transcript.text}`);
      onTranscript(transcript);
    } catch (error) {
      setState('idle');
      setProblem(
        error instanceof Error
          ? error.message
          : 'What you said could not be heard.',
      );
    }
  }, [hearing, language, onTranscript]);

  const cancel = useCallback(() => {
    capture.current?.cancel();
    capture.current = undefined;
    if (stateRef.current !== 'idle') {
      setState('idle');
      setSaid('Cancelled.');
    }
  }, []);

  // The key: Ctrl+Space held listens; Esc cancels, or stops the voice.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && event.ctrlKey && !event.repeat) {
        event.preventDefault();
        pressedAt.current = Date.now();
        void start();
      } else if (event.key === 'Escape') {
        if (stateRef.current !== 'idle') {
          cancel();
        } else if (speaking) {
          onStopSpeaking?.();
        }
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === 'Control') {
        if (
          stateRef.current === 'listening' ||
          stateRef.current === 'loading'
        ) {
          void stop();
        }
      }
    };
    // A hidden tab closes the microphone (VO-62).
    const hidden = () => {
      if (document.hidden) {
        cancel();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [cancel, onStopSpeaking, speaking, start, stop]);

  // The level meter, moving while it listens — still under reduced motion.
  useEffect(() => {
    if (state !== 'listening' || prefersStill()) {
      return;
    }
    let frame = 0;
    const draw = () => {
      const level = capture.current?.level() ?? 0;
      if (meter.current) {
        meter.current.style.transform = `scaleX(${Math.max(0.04, level)})`;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  // Never left open behind the page.
  useEffect(() => () => capture.current?.cancel(), []);

  const listening = state === 'listening';
  const label = listening
    ? 'Listening — let go to stop'
    : 'Hold to talk (Ctrl+Space)';
  return (
    <Box
      data-voice-input={state}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        position: 'relative',
      }}
    >
      {speaking && onStopSpeaking && (
        <Tooltip text="Stop speaking (Esc)" direction="n">
          <IconButton
            icon={MuteIcon}
            aria-label="Stop speaking"
            size="small"
            variant="invisible"
            data-voice-stop=""
            onClick={onStopSpeaking}
          />
        </Tooltip>
      )}
      {listening && (
        <Box
          aria-hidden="true"
          sx={{
            width: 40,
            height: 4,
            borderRadius: 2,
            bg: 'neutral.muted',
            overflow: 'hidden',
          }}
        >
          <Box
            ref={meter}
            sx={{
              width: '100%',
              height: '100%',
              bg: 'danger.emphasis',
              transformOrigin: 'left',
              transform: prefersStill() ? 'scaleX(1)' : 'scaleX(0.04)',
            }}
          />
        </Box>
      )}
      {(state === 'loading' || state === 'hearing') && (
        <Text sx={{ fontSize: 0, color: 'fg.muted' }} data-voice-progress="">
          {state === 'loading' && progress !== undefined ? `${progress}%` : '…'}
        </Text>
      )}
      <Tooltip text={label} direction="n">
        <IconButton
          icon={() => <MicrophoneIcon size={16} />}
          aria-label={label}
          aria-pressed={listening}
          size="small"
          variant={listening ? 'danger' : 'invisible'}
          disabled={disabled || state === 'hearing'}
          data-voice-mic=""
          onPointerDown={event => {
            if (event.button !== 0) {
              return;
            }
            pressedAt.current = Date.now();
            // A second press of click-to-talk stops at its release.
            stopOnRelease.current = stateRef.current === 'listening';
            if (stateRef.current === 'idle') {
              void start();
            }
          }}
          onPointerUp={() => {
            // Held: letting go stops. A click: it goes on until the next one.
            if (
              stopOnRelease.current ||
              Date.now() - pressedAt.current >= CLICK_MS
            ) {
              stopOnRelease.current = false;
              void stop();
            }
          }}
          onKeyDown={event => {
            // Enter or Space on the focused button toggles, for the keyboard (VO-66).
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (stateRef.current === 'listening') {
                void stop();
              } else {
                void start();
              }
            }
          }}
        />
      </Tooltip>
      {state === 'asking' && (
        <Box
          role="dialog"
          aria-label="Talk instead of typing"
          data-voice-consent=""
          sx={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            mb: 2,
            width: 280,
            p: 3,
            bg: 'canvas.overlay',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            boxShadow: 'shadow.large',
            zIndex: 10,
          }}
        >
          <Text as="p" sx={{ fontSize: 1, mb: 2 }}>
            {CONSENT_SENTENCE}
          </Text>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => setState('idle')}>
              Not now
            </Button>
            <Button
              size="small"
              variant="primary"
              data-voice-consent-yes=""
              onClick={() => {
                consent(consentKey);
                // Asked, and said yes: listen now, without another press.
                stateRef.current = 'idle';
                setState('idle');
                void start();
              }}
            >
              Use the microphone
            </Button>
          </Box>
        </Box>
      )}
      {/* What the microphone does, and what was heard, for a screen reader. */}
      <Box
        as="span"
        role="status"
        aria-live="polite"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {WORDS[state] || said}
      </Box>
      {problem && (
        <Text
          role="alert"
          sx={{ fontSize: 0, color: 'danger.fg', maxWidth: 220 }}
          data-voice-problem=""
        >
          {problem}
        </Text>
      )}
    </Box>
  );
}

export default VoiceInput;
