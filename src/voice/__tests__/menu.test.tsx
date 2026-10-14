/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The person's voice menu (VOICE.md VO-14, VO-21, VO-25, VO-30): what it
 * offers from the catalogue, the choice kept and heard at once by every chat
 * on the page, and the words in the box greyed until final (VO-11).
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, BaseStyles } from '@primer/react';
import {
  OUTPUT_CHOICES,
  catalogueVoiceSpeaks,
  voiceLanguages,
  voicesSpeaking,
} from '../choices';
import {
  heldVoiceSettings,
  keepVoiceSettings,
  onVoiceSettingsChange,
  withVoiceSetting,
} from '../settings';
import { settledVoice } from '../chatVoice';
import { VoiceMenu } from '../VoiceMenu';
import { ComposerVoice } from '../ComposerVoice';
import { InputPrompt } from '../../chat/prompt/InputPrompt';
import { useVoiceSettings } from '../useVoiceSettings';
import type { ChatVoice } from '../index';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SPEAKS: ChatVoice = {
  language: 'en-US',
  input: 'push_to_talk',
  output: 'on_request',
  speechUrl: 'https://r1.datalayer.run',
  consentKey: 'menu-test',
};

afterEach(() => {
  keepVoiceSettings({});
  window.localStorage.clear();
});

describe('what a person may choose (VO-30)', () => {
  it('offers the languages a voice speaks and the device hears', () => {
    const languages = voiceLanguages().map(language => language.value);
    expect(languages).toEqual(['en-US', 'en-GB', 'fr-FR']);
    expect(voiceLanguages()[2].label).toBe('French (France)');
  });

  it('offers the voices of a language, and knows which speak it', () => {
    expect(voicesSpeaking('fr-FR').map(voice => voice.id)).toEqual([
      'kokoro-ff-siwis',
    ]);
    expect(catalogueVoiceSpeaks('kokoro-af-heart', 'fr-FR')).toBe(false);
    expect(catalogueVoiceSpeaks('kokoro-ff-siwis', 'fr-FR')).toBe(true);
  });

  it('changes one choice, forgets one given back, and drops a voice the new language does not speak', () => {
    const chosen = withVoiceSetting(
      { voice: 'kokoro-af-heart', rate: 1.25 },
      'language',
      'fr-FR',
      catalogueVoiceSpeaks,
    );
    expect(chosen).toEqual({ language: 'fr-FR', rate: 1.25 });
    expect(withVoiceSetting(chosen, 'rate', undefined)).toEqual({
      language: 'fr-FR',
    });
    expect(
      withVoiceSetting(
        { voice: 'kokoro-bf-emma' },
        'language',
        'en-US',
        catalogueVoiceSpeaks,
      ),
    ).toEqual({ language: 'en-US', voice: 'kokoro-bf-emma' });
  });

  it('tells every chat on the page when they change, and holds them', () => {
    const told: unknown[] = [];
    const stop = onVoiceSettingsChange(settings => told.push(settings));
    keepVoiceSettings({ output: 'always' });
    stop();
    keepVoiceSettings({ output: 'off' });
    expect(told).toEqual([{ output: 'always' }]);
    expect(heldVoiceSettings()).toEqual({ output: 'off' });
  });

  it('settles a chat’s voice on the settings held, by default', () => {
    keepVoiceSettings({ output: 'always', rate: 1.5 });
    const voice = settledVoice(SPEAKS);
    expect(voice.output).toBe('always');
    expect(voice.rate).toBe(1.5);
  });
});

describe('the composer’s voice menu (VO-14, VO-21, VO-25, VO-30)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'built-in', label: 'Built-in' },
          { kind: 'audioinput', deviceId: 'headset', label: 'Headset' },
          { kind: 'audiooutput', deviceId: 'speakers', label: 'Speakers' },
        ],
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  /** A chat as `ChatBase` settles it: on the settings it follows. */
  function Chat({ given, answers }: { given: ChatVoice; answers: boolean }) {
    const [person] = useVoiceSettings();
    const voice = settledVoice(given, person);
    return (
      <div data-heard={`${voice.language} ${voice.output} ${voice.voice}`}>
        <VoiceMenu voice={voice} answers={answers} />
      </div>
    );
  }

  function draw(given: ChatVoice, answers: boolean) {
    act(() => {
      root.render(
        <ThemeProvider>
          <BaseStyles>
            <Chat given={given} answers={answers} />
          </BaseStyles>
        </ThemeProvider>,
      );
    });
  }

  async function open() {
    await act(async () => {
      (container.querySelector('[data-voice-menu]') as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }

  async function pick(selector: string) {
    await act(async () => {
      (document.querySelector(selector) as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }

  const heard = () =>
    container.querySelector('[data-heard]')!.getAttribute('data-heard');

  it('chooses when answers are heard, kept and heard at once by the chat', async () => {
    draw(SPEAKS, true);
    expect(heard()).toBe('en-US on_request kokoro-af-heart');
    await open();
    expect(
      [...document.querySelectorAll('[data-voice-output]')].map(item =>
        item.getAttribute('data-voice-output'),
      ),
    ).toEqual(OUTPUT_CHOICES.map(choice => choice.value));
    await pick('[data-voice-output="always"]');
    expect(heard()).toBe('en-US always kokoro-af-heart');
    expect(
      JSON.parse(window.localStorage.getItem('datalayer-voice-settings')!),
    ).toEqual({ output: 'always' });
  });

  it('chooses the language, and the voice follows it', async () => {
    draw(SPEAKS, true);
    await open();
    await pick('[data-voice-language="fr-FR"]');
    expect(heard()).toBe('fr-FR on_request kokoro-ff-siwis');
  });

  it('lists the microphones once named, and keeps the one chosen', async () => {
    draw(SPEAKS, true);
    await open();
    await pick('[data-voice-microphone="headset"]');
    expect(heldVoiceSettings().microphoneId).toBe('headset');
  });

  it('offers no choice of answers where the application is silent', async () => {
    draw({ ...SPEAKS, output: 'off' }, false);
    await open();
    expect(document.querySelector('[data-voice-output]')).toBeNull();
    expect(document.querySelector('[data-voice-voice]')).toBeNull();
    expect(document.querySelector('[data-voice-language]')).not.toBeNull();
  });

  it('keeps speech on the device: no answers heard, nothing asked of the service', async () => {
    draw(SPEAKS, true);
    await open();
    await pick('[data-voice-on-device]');
    expect(heard()).toBe('en-US off kokoro-af-heart');
    expect(settledVoice(SPEAKS).speechUrl).toBeUndefined();
  });

  it('gives every choice back to the application', async () => {
    keepVoiceSettings({ output: 'always', language: 'fr-FR' });
    draw(SPEAKS, true);
    expect(heard()).toBe('fr-FR always kokoro-ff-siwis');
    await open();
    await pick('[data-voice-settings-reset]');
    expect(heard()).toBe('en-US on_request kokoro-af-heart');
    expect(window.localStorage.getItem('datalayer-voice-settings')).toBeNull();
  });
});

describe('the words in the box, greyed until final (VO-11)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('marks the composer while the words are being heard, and only then', () => {
    const prompt = (interim: boolean) => (
      <ThemeProvider>
        <BaseStyles>
          <InputPrompt
            input="What is the weather"
            setInput={() => undefined}
            isLoading={false}
            connectionConfirmed
            autoFocus={false}
            padding={2}
            onSend={() => undefined}
            onStop={() => undefined}
            interim={interim}
          />
        </BaseStyles>
      </ThemeProvider>
    );
    act(() => root.render(prompt(true)));
    const box = container.querySelector('textarea, [contenteditable]');
    expect(container.querySelector('[data-voice-interim]')).not.toBeNull();
    expect(box && getComputedStyle(box).fontStyle).toBe('italic');
    act(() => root.render(prompt(false)));
    expect(container.querySelector('[data-voice-interim]')).toBeNull();
    // The same editor, not mounted again.
    expect(container.querySelector('textarea, [contenteditable]')).toBe(box);
  });
});
