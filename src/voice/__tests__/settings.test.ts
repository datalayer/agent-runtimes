/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A person's own voice settings (VOICE.md VO-30) and what the chat's voice
 * becomes once they are taken into account (VO-14 the language, VO-25 the
 * voice, the rate and the volume).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatVoice } from '../index';
import { SILENCE_MS, settledVoice } from '../chatVoice';
import { PAUSE_CHOICES } from '../choices';
import { TURN_SILENCE_MS } from '../handsFree';
import {
  RATE_RANGE,
  VOICE_SETTINGS_KEY,
  keepVoiceSettings,
  keptVoiceSettings,
  saneVoiceSettings,
  voiceForPerson,
} from '../settings';

const APPLICATION: ChatVoice = {
  language: 'fr-FR',
  input: 'push_to_talk',
  output: 'always',
  voice: 'kokoro-ff-siwis',
  modelsUrl: 'https://cdn.datalayer.run/voice',
  engines: {} as ChatVoice['engines'],
  speechUrl: 'https://r1.datalayer.run',
  token: 'a-token',
};

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('What a person chose', () => {
  it('is kept and read back', () => {
    keepVoiceSettings({
      language: 'en-GB',
      voice: 'kokoro-af-heart',
      rate: 1.25,
    });
    expect(keptVoiceSettings()).toEqual({
      language: 'en-GB',
      voice: 'kokoro-af-heart',
      rate: 1.25,
    });
  });

  it('is forgotten when nothing is left of it', () => {
    keepVoiceSettings({ rate: 1.5 });
    keepVoiceSettings({});
    expect(window.localStorage.getItem(VOICE_SETTINGS_KEY)).toBeNull();
    expect(keptVoiceSettings()).toEqual({});
  });

  it('survives storage that is refused or holds something else', () => {
    window.localStorage.setItem(VOICE_SETTINGS_KEY, 'not json');
    expect(keptVoiceSettings()).toEqual({});
  });

  it('is held to what is intelligible and audible', () => {
    expect(saneVoiceSettings({ rate: 9, volume: -2 })).toEqual({
      rate: RATE_RANGE.max,
      volume: 0,
    });
    expect(saneVoiceSettings({ rate: Number.NaN })).toEqual({});
    expect(saneVoiceSettings({ output: 'shouted' as never })).toEqual({});
  });
});

describe('The voice a person hears', () => {
  it('is the application’s when they have chosen nothing', () => {
    const voice = voiceForPerson(APPLICATION, {}, 'de-DE');
    expect(voice.language).toBe('fr-FR');
    expect(voice.voice).toBe('kokoro-ff-siwis');
    expect(voice.output).toBe('always');
  });

  it('takes their language, voice, rate and volume where they chose', () => {
    const voice = voiceForPerson(
      APPLICATION,
      { language: 'en-GB', voice: 'kokoro-af-heart', rate: 1.25, volume: 0.4 },
      'de-DE',
    );
    expect(voice.language).toBe('en-GB');
    expect(voice.voice).toBe('kokoro-af-heart');
    expect(voice.rate).toBe(1.25);
    expect(voice.volume).toBe(0.4);
  });

  it('falls to the browser’s language when neither says one', () => {
    const voice = voiceForPerson({ ...APPLICATION, language: '' }, {}, 'de-DE');
    expect(voice.language).toBe('de-DE');
  });

  it('is English where nothing says a language at all', () => {
    const voice = voiceForPerson(
      { ...APPLICATION, language: '' },
      {},
      undefined,
    );
    expect(voice.language).toBe('en-US');
  });

  it('stays silent when the application is silent', () => {
    /* A menu may not turn on what the application did not offer. */
    const voice = voiceForPerson(
      { ...APPLICATION, output: 'off' },
      { output: 'always' },
    );
    expect(voice.output).toBe('off');
  });

  it('is read aloud on request when that is what they asked for', () => {
    expect(voiceForPerson(APPLICATION, { output: 'on_request' }).output).toBe(
      'on_request',
    );
  });

  it('asks the speech service nothing when they keep it on the device', () => {
    const voice = voiceForPerson(APPLICATION, { onDeviceOnly: true });
    expect(voice.speechUrl).toBeUndefined();
    expect(voice.token).toBeUndefined();
    // Answers are said by the service only (decision 1): not heard.
    expect(voice.output).toBe('off');
  });

  it('carries their microphone and “send what I say”', () => {
    const voice = voiceForPerson(APPLICATION, {
      microphoneId: 'mic-2',
      sendWhatISay: true,
    });
    expect(voice.microphoneId).toBe('mic-2');
    expect(voice.sendWhatISay).toBe(true);
  });

  it('leaves “send what I say” to the application when they said nothing', () => {
    const voice = voiceForPerson({ ...APPLICATION, sendWhatISay: true }, {});
    expect(voice.sendWhatISay).toBe(true);
  });
});

describe('A person who pauses longer before they are done (VO-69)', () => {
  const chat: ChatVoice = {
    input: 'hands_free',
    output: 'off',
    language: 'en-US',
  };

  it('keeps a pause between usual and four times as long', () => {
    expect(saneVoiceSettings({ pause: 2 })).toEqual({ pause: 2 });
    expect(saneVoiceSettings({ pause: 0.2 })).toEqual({ pause: 1 });
    expect(saneVoiceSettings({ pause: 40 })).toEqual({ pause: 4 });
    expect(saneVoiceSettings({ pause: Number.NaN })).toEqual({});
  });

  it('makes both silences longer: the microphone clicked on, and the hands-free turn', () => {
    const usual = settledVoice(chat, {});
    expect([usual.silenceMs, usual.turnSilenceMs]).toEqual([
      SILENCE_MS,
      TURN_SILENCE_MS,
    ]);
    const longer = settledVoice(chat, { pause: 2 });
    expect([longer.silenceMs, longer.turnSilenceMs]).toEqual([
      SILENCE_MS * 2,
      TURN_SILENCE_MS * 2,
    ]);
    // An application's own silence is made longer too, never shorter.
    const own = settledVoice(
      { ...chat, silenceMs: 1000, turnSilenceMs: 900 },
      {
        pause: 3,
      },
    );
    expect([own.silenceMs, own.turnSilenceMs]).toEqual([3000, 2700]);
  });

  it('is one of the menu’s choices, usual first', () => {
    expect(PAUSE_CHOICES.map(choice => choice.value)).toEqual([1, 2, 3]);
  });
});
