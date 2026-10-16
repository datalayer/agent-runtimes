/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The microphone of a composer whose text its host holds (VOICE.md VO-10,
 * VO-11): `ChatBase`'s own, and the workspace's (an application's page,
 * whose composer is a plugin of its own). What the box held when the
 * microphone opened stays; the words heard go after it as they come, and the
 * whole of what was heard replaces them once it stops. Put there for the
 * person to edit and send — or sent at once with *Send what I say*. While
 * the words are still being heard the host is told (`onInterimChange`), to
 * grey them until they are final (VO-11). Beside the microphone, the
 * person's voice menu (`VoiceMenu`, VO-30). Where the application's voice
 * says `hands_free`, *Talk with it* too (`HandsFree`, VO-12, VO-13): a turn
 * is sent by itself and the agent's answer may be spoken over.
 *
 * @module voice/ComposerVoice
 */

import type { JSX } from 'react';
import { useMemo, useRef } from 'react';
import { DeviceHearing, type Hearing } from './hearing';
import { HandsFree } from './HandsFree';
import { AutoHearing, ServerHearing, hearingPlace } from './serverHearing';
import { VoiceInput } from './VoiceInput';
import { VoiceMenu } from './VoiceMenu';
import type { SettledVoice } from './chatVoice';
import type { SpokenMetadata, Transcript } from './types';

export interface ComposerVoiceProps {
  /** The chat's voice, settled (`settledVoice`). */
  voice: SettledVoice;
  /** What the composer holds now. */
  input: string;
  setInput: (text: string) => void;
  /** What was heard is in the box: how it was heard, for when it is sent (VO-27). */
  onSpoken: (metadata: SpokenMetadata) => void;
  /** *Send what I say*: what was heard, sent at once. */
  send: (text: string, metadata: SpokenMetadata) => void;
  disabled?: boolean;
  /** The agent is speaking: the composer offers *Stop speaking*. */
  speaking?: boolean;
  /** Stops the agent's voice, also when the microphone opens (VO-13). */
  onStopSpeaking?: () => void;
  /** How loud the agent's voice plays now, 0 to 1: hands-free's barge-in is gated on it (VO-13). */
  playbackLevel?: () => number;
  /** The agent is answering: a run is in progress (hands-free, VO-12). */
  running?: boolean;
  /** Stops the run while the answer is still being written (barge-in, VO-13). */
  onStopRun?: () => void;
  /** The answer being written was spoken over: marked in the conversation (VO-13). */
  onInterrupted?: () => void;
  /**
   * The words in the box are still being heard (`true`), or final
   * (`false`): the host greys them until they are (VO-11).
   */
  onInterimChange?: (interim: boolean) => void;
  /**
   * The application lets its answers be heard: the voice menu offers when,
   * the voice, its speed and loudness (VO-21, VO-25, VO-30).
   */
  answers?: boolean;
}

/** Whether something rides on a run as a spoken message's metadata (VO-27). */
export function spokenOf(value: unknown): SpokenMetadata | undefined {
  const said = value as Partial<SpokenMetadata> | undefined;
  return said?.input === 'voice' &&
    typeof said.language === 'string' &&
    typeof said.engine === 'string' &&
    (said.where === 'device' || said.where === 'server')
    ? (said as SpokenMetadata)
    : undefined;
}

export function ComposerVoice({
  voice,
  input,
  setInput,
  onSpoken,
  send,
  disabled = false,
  speaking = false,
  onStopSpeaking,
  playbackLevel,
  running = false,
  onStopRun,
  onInterrupted,
  onInterimChange,
  answers = false,
}: ComposerVoiceProps): JSX.Element | null {
  // In the browser, or on Datalayer's servers where the application, the
  // language or the person's detection asks for it (§5, VO-14, VO-34).
  const place = hearingPlace(voice);
  const hearing = useMemo((): Hearing | undefined => {
    if (voice.input === 'off') {
      return undefined;
    }
    const device = new DeviceHearing(voice.modelsUrl, voice.engines);
    const server = voice.speechUrl
      ? new ServerHearing(device, {
          speechUrl: voice.speechUrl,
          token: voice.token,
          detect: voice.detect,
        })
      : undefined;
    // `where: auto` (§5): the device when it hears the language and its model
    // loads, the server otherwise — and back to the device when the server
    // refuses (a visitor's day spent).
    if (server && !voice.detect && (voice.where ?? 'auto') === 'auto') {
      return new AutoHearing(device, server, voice.language);
    }
    return place === 'server' && server ? server : device;
  }, [
    voice.input,
    voice.modelsUrl,
    voice.engines,
    place,
    voice.speechUrl,
    voice.token,
    voice.detect,
    voice.where,
    voice.language,
  ]);
  // What the box held when the microphone opened: the words heard go after it.
  const base = useRef('');
  const afterBase = (words: string) =>
    [base.current, words].filter(Boolean).join(' ');
  if (!hearing) {
    return null;
  }
  return (
    <span
      data-composer-voice=""
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
    >
      <VoiceMenu voice={voice} answers={answers} disabled={disabled} />
      {voice.input === 'hands_free' ? (
        <HandsFree
          hearing={hearing}
          language={voice.language}
          consentKey={voice.consentKey ?? 'chat'}
          microphoneId={voice.microphoneId}
          turnSilenceMs={voice.turnSilenceMs}
          disabled={disabled}
          running={running}
          speaking={speaking}
          playbackLevel={playbackLevel}
          onStopSpeaking={onStopSpeaking}
          onStopRun={onStopRun}
          onInterrupted={onInterrupted}
          onInterim={(words: string) => {
            setInput(words ? afterBase(words) : base.current);
            onInterimChange?.(words !== '');
          }}
          send={(text, metadata) => {
            onInterimChange?.(false);
            setInput(base.current);
            send(text, metadata);
          }}
        />
      ) : null}
      <VoiceInput
        hearing={hearing}
        language={voice.language}
        consentKey={voice.consentKey ?? 'chat'}
        silenceMs={voice.silenceMs}
        microphoneId={voice.microphoneId}
        disabled={disabled}
        speaking={speaking}
        onStopSpeaking={onStopSpeaking}
        onListen={() => {
          base.current = input.trim();
          onStopSpeaking?.();
        }}
        // The words as they are heard, in the box (VO-11), greyed until
        // final; '' gives it back.
        onInterim={(words: string) => {
          setInput(afterBase(words));
          onInterimChange?.(words !== '');
        }}
        onTranscript={(transcript: Transcript) => {
          onInterimChange?.(false);
          if (voice.sendWhatISay) {
            setInput(base.current);
            send(transcript.text, transcript.metadata);
            return;
          }
          // In the box, for the person to edit and send: never sent here.
          onSpoken(transcript.metadata);
          setInput(afterBase(transcript.text));
        }}
      />
    </span>
  );
}

export default ComposerVoice;
