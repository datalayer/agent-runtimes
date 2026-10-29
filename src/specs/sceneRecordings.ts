/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The scenes' recordings: each the transcript of a passing rehearsal, kept
 * beside its spec as `<id>/recording.json` (`loop scenes record`) and played
 * at its recorded pace when the scene cannot play live (`useSceneRecording`).
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 *
 * @module specs/sceneRecordings
 */

import type { SceneRecordingFile } from '../types/scenes';

export const SCENE_RECORDINGS: Record<string, SceneRecordingFile> = {};

/** A scene's recording, by its id or `id:version`; undefined when it has none. */
export function getSceneRecording(ref: string): SceneRecordingFile | undefined {
  const id = ref.split(':')[0];
  return Object.prototype.hasOwnProperty.call(SCENE_RECORDINGS, id)
    ? SCENE_RECORDINGS[id]
    : undefined;
}
