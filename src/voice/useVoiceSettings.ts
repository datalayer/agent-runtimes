/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A person's voice settings, as a React state that follows every change —
 * the composer's menu, a settings page, another tab (VOICE.md VO-30).
 *
 * @module voice/useVoiceSettings
 */

import { useCallback, useEffect, useState } from 'react';
import {
  heldVoiceSettings,
  keepVoiceSettings,
  onVoiceSettingsChange,
  type VoiceSettings,
} from './settings';

/** The person's settings, and a setter that keeps them and tells every chat. */
export function useVoiceSettings(): [
  VoiceSettings,
  (settings: VoiceSettings) => void,
] {
  const [settings, setSettings] = useState<VoiceSettings>(heldVoiceSettings);
  useEffect(() => {
    // A change between the first draw and this subscription is read here.
    setSettings(heldVoiceSettings());
    return onVoiceSettingsChange(setSettings);
  }, []);
  const keep = useCallback((next: VoiceSettings) => {
    keepVoiceSettings(next);
  }, []);
  return [settings, keep];
}
