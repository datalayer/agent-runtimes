/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The composer's voice menu (VOICE.md VO-14, VO-21, VO-25, VO-30): beside
 * the microphone, what a person chooses for themselves — the language they
 * speak and hear, when answers are heard, the voice, its speed and loudness,
 * how long they pause before they are done (VO-69), *Send what I say*, the
 * microphone, and *Keep speech on this device*. Each
 * choice is kept in the person's settings and heard at once by every chat
 * on the page; *Use the application's* forgets them all.
 *
 * When answers are heard is offered only where the application lets them be
 * heard: a menu may not turn on what the application turned off.
 *
 * @module voice/VoiceMenu
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { ActionList, ActionMenu, IconButton } from '@primer/react';
import { GearIcon } from '@primer/octicons-react';
import {
  OUTPUT_CHOICES,
  PAUSE_CHOICES,
  RATE_CHOICES,
  VOLUME_CHOICES,
  catalogueVoiceSpeaks,
  voiceLanguages,
  voicesSpeaking,
} from './choices';
import type { SettledVoice } from './chatVoice';
import { withVoiceSetting, type VoiceSettings } from './settings';
import { useVoiceSettings } from './useVoiceSettings';

export interface VoiceMenuProps {
  /** The chat's voice as it is heard now (`settledVoice`). */
  voice: SettledVoice;
  /**
   * The application lets its answers be heard (its own `output` is not
   * `off`, and it names the speech service): the menu offers when.
   */
  answers: boolean;
  disabled?: boolean;
}

/** The microphones the browser lists; named only once one was allowed. */
async function microphones(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
  } catch {
    return [];
  }
}

export function VoiceMenu({
  voice,
  answers,
  disabled = false,
}: VoiceMenuProps): JSX.Element {
  const [settings, keep] = useVoiceSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const choose = <K extends keyof VoiceSettings>(
    key: K,
    value: VoiceSettings[K] | undefined,
  ) => keep(withVoiceSetting(settings, key, value, catalogueVoiceSpeaks));
  const onDevice = Boolean(settings.onDeviceOnly);
  const detect = Boolean(settings.detectLanguage);
  const voices = voicesSpeaking(voice.language);
  const named = devices.filter(device => device.label);
  return (
    <ActionMenu
      onOpenChange={open => {
        if (open) {
          void microphones().then(setDevices);
        }
      }}
    >
      <ActionMenu.Anchor>
        <IconButton
          icon={GearIcon}
          size="small"
          variant="invisible"
          aria-label="Voice settings"
          data-voice-menu=""
          disabled={disabled}
        />
      </ActionMenu.Anchor>
      <ActionMenu.Overlay width="medium">
        <ActionList>
          <ActionList.Group selectionVariant="single">
            <ActionList.GroupHeading>Language</ActionList.GroupHeading>
            {voiceLanguages().map(language => (
              <ActionList.Item
                key={language.value}
                selected={language.value === voice.language}
                onSelect={() => choose('language', language.value)}
                data-voice-language={language.value}
              >
                {language.label}
              </ActionList.Item>
            ))}
          </ActionList.Group>
          {answers && !onDevice ? (
            <>
              <ActionList.Divider />
              <ActionList.Group selectionVariant="single">
                <ActionList.GroupHeading>Answers heard</ActionList.GroupHeading>
                {OUTPUT_CHOICES.map(output => (
                  <ActionList.Item
                    key={output.value}
                    selected={output.value === voice.output}
                    onSelect={() => choose('output', output.value)}
                    data-voice-output={output.value}
                  >
                    {output.label}
                  </ActionList.Item>
                ))}
              </ActionList.Group>
              {voices.length > 0 ? (
                <ActionList.Group selectionVariant="single">
                  <ActionList.GroupHeading>Voice</ActionList.GroupHeading>
                  {voices.map(spoken => (
                    <ActionList.Item
                      key={spoken.id}
                      selected={spoken.id === voice.voice}
                      onSelect={() => choose('voice', spoken.id)}
                      data-voice-voice={spoken.id}
                    >
                      {spoken.name}
                    </ActionList.Item>
                  ))}
                </ActionList.Group>
              ) : null}
              <ActionList.Group selectionVariant="single">
                <ActionList.GroupHeading>Speed</ActionList.GroupHeading>
                {RATE_CHOICES.map(rate => (
                  <ActionList.Item
                    key={rate.value}
                    selected={rate.value === (voice.rate ?? 1)}
                    onSelect={() => choose('rate', rate.value)}
                    data-voice-rate={rate.value}
                  >
                    {rate.label}
                  </ActionList.Item>
                ))}
              </ActionList.Group>
              <ActionList.Group selectionVariant="single">
                <ActionList.GroupHeading>Loudness</ActionList.GroupHeading>
                {VOLUME_CHOICES.map(volume => (
                  <ActionList.Item
                    key={volume.value}
                    selected={volume.value === (voice.volume ?? 1)}
                    onSelect={() => choose('volume', volume.value)}
                    data-voice-volume={volume.value}
                  >
                    {volume.label}
                  </ActionList.Item>
                ))}
              </ActionList.Group>
            </>
          ) : null}
          {named.length > 1 ? (
            <>
              <ActionList.Divider />
              <ActionList.Group selectionVariant="single">
                <ActionList.GroupHeading>Microphone</ActionList.GroupHeading>
                {named.map(device => (
                  <ActionList.Item
                    key={device.deviceId}
                    selected={
                      device.deviceId ===
                      (voice.microphoneId ?? named[0].deviceId)
                    }
                    onSelect={() => choose('microphoneId', device.deviceId)}
                    data-voice-microphone={device.deviceId}
                  >
                    {device.label}
                  </ActionList.Item>
                ))}
              </ActionList.Group>
            </>
          ) : null}
          <ActionList.Divider />
          <ActionList.Group selectionVariant="single">
            <ActionList.GroupHeading>
              Pauses before I am done
            </ActionList.GroupHeading>
            {PAUSE_CHOICES.map(pause => (
              <ActionList.Item
                key={pause.value}
                selected={pause.value === (settings.pause ?? 1)}
                onSelect={() =>
                  choose('pause', pause.value === 1 ? undefined : pause.value)
                }
                data-voice-pause={pause.value}
              >
                {pause.label}
              </ActionList.Item>
            ))}
          </ActionList.Group>
          <ActionList.Divider />
          <ActionList.Group selectionVariant="multiple">
            <ActionList.Item
              selected={Boolean(voice.sendWhatISay)}
              onSelect={() => choose('sendWhatISay', !voice.sendWhatISay)}
              data-voice-send-what-i-say=""
            >
              Send what I say
              <ActionList.Description variant="block">
                Sent as soon as it is heard, not left in the box.
              </ActionList.Description>
            </ActionList.Item>
            {voice.speechUrl && !onDevice ? (
              <ActionList.Item
                selected={detect}
                onSelect={() => choose('detectLanguage', !detect)}
                data-voice-detect=""
              >
                Detect the language I speak
                <ActionList.Description variant="block">
                  Heard on Datalayer’s servers by Whisper, which finds the
                  language; nothing is kept there.
                </ActionList.Description>
              </ActionList.Item>
            ) : null}
            <ActionList.Item
              selected={onDevice}
              onSelect={() => choose('onDeviceOnly', !onDevice)}
              data-voice-on-device=""
            >
              Keep speech on this device
              <ActionList.Description variant="block">
                Nothing is sent to Datalayer’s speech service: you are heard in
                the browser, answers are not spoken.
              </ActionList.Description>
            </ActionList.Item>
          </ActionList.Group>
          {Object.keys(settings).length > 0 ? (
            <>
              <ActionList.Divider />
              <ActionList.Item
                onSelect={() => keep({})}
                data-voice-settings-reset=""
              >
                Use the application’s
              </ActionList.Item>
            </>
          ) : null}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

export default VoiceMenu;
