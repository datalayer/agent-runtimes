/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat's speaker (VOICE.md VO-20, VO-21, VO-33): its answers said by
 * Datalayer's speech service — `POST /api/ai-agents/v1/speech/syntheses` on
 * ai-agents, `datalayer-speech` — while its voice's `output` is not `off`.
 * One for `ChatFloating` and for `ChatBase` alone, so that a chat given a
 * `voice` speaks wherever it is drawn.
 *
 * @module voice/useVoiceSpeaker
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { readAloud } from './ReadAloud';
import { ServerSpeaker, type SpeakerState } from './speaker';
import type { SettledVoice } from './chatVoice';

/** What a chat's speaker gives the chat. */
export interface VoiceSpeaker {
  /** The speaker, while answers are heard; `undefined` otherwise. */
  speaker?: ServerSpeaker;
  /** What it is doing: speaking, the sentence said, why it could not. */
  state: SpeakerState;
  /** Stop at once (`Esc`, *Stop speaking*, the microphone opening). */
  stop: () => void;
  /** Read an answer aloud from its start (VO-21). */
  read: (answer: string) => void;
  /** How loud what plays is, for the assistant's mouth (VO-23). */
  level?: () => number;
}

/**
 * The speaker of a chat's voice, or none: `voice` undefined, its `output`
 * `off`, or `on` false (a host that speaks for the chat).
 */
export function useVoiceSpeaker(
  voice: SettledVoice | undefined,
  on = true,
): VoiceSpeaker {
  const [state, setState] = useState<SpeakerState>({ speaking: false });
  const heard = on && !!voice && voice.output !== 'off' && !!voice.speechUrl;
  const speaker = useMemo(
    () =>
      heard && voice?.speechUrl
        ? new ServerSpeaker({
            speechUrl: voice.speechUrl,
            voice: voice.voice,
            language: voice.language,
            token: voice.token,
            deployment: voice.deployment,
            rate: voice.rate,
            volume: voice.volume,
            onState: setState,
          })
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heard, voice?.speechUrl],
  );
  useEffect(() => {
    speaker?.update({
      voice: voice?.voice,
      language: voice?.language,
      token: voice?.token,
      deployment: voice?.deployment,
      rate: voice?.rate,
      volume: voice?.volume,
    });
  }, [
    speaker,
    voice?.voice,
    voice?.language,
    voice?.token,
    voice?.deployment,
    voice?.rate,
    voice?.volume,
  ]);
  useEffect(() => () => speaker?.close(), [speaker]);
  // A browser plays only what a gesture allowed: the first one does.
  useEffect(() => {
    if (!speaker) {
      return;
    }
    const unlock = () => speaker.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [speaker]);
  const stop = useCallback(() => speaker?.stop(), [speaker]);
  const read = useCallback(
    (answer: string) => {
      if (speaker) {
        readAloud(speaker, answer);
      }
    },
    [speaker],
  );
  const level = useMemo(
    () => (speaker ? () => speaker.level() : undefined),
    [speaker],
  );
  return { speaker, state, stop, read, level };
}
