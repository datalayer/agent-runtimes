/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A member's face, as a figure `AssistantStage` draws: its emoji, large;
 * else its character drawn small inside a frame; else its initial. The
 * `hero` backdrop frames it in a ring, the `plain` one in a box, the
 * `space` one shrinks it to a glowing mark inside an orbit — the
 * frame is the backdrop's (`FaceFrame`), the face is the member's.
 *
 * It is an `AssistantCharacter`, so the stage keeps everything it does for
 * a character — the balloon, the menu, the drag, the description *Its
 * avatar: …* — and only the drawing changes.
 *
 * @module components/teams/backdrops/faces
 */

import type { CSSProperties, JSX } from 'react';
import type {
  AssistantCharacter,
  AssistantDrawingProps,
} from '../../../chat/assistant/characters';
import { shippedAssistantCharacter } from '../../../chat/assistant/catalogue';
import type { SceneBackdropFace } from './types';

/** How a backdrop frames a face. */
export interface FaceFrame {
  /** The figure's id, for the stage. */
  id: string;
  /** The frame's style: its corners, its border, its colours. */
  ring: CSSProperties;
  /**
   * The face's share of the figure, `1` unsaid: below it the face is a
   * mark in the middle of the figure (`space`), and the room round it is
   * the frame's halo and orbit.
   */
  scale?: number;
  /** A ring round the whole figure, about the smaller face (`space`'s orbit); none unsaid. */
  orbit?: CSSProperties;
}

/** The character a member's `character` id names, when one does; none for a 3D model or an id the catalogue does not know. */
function drawnCharacter(
  member: SceneBackdropFace,
): AssistantCharacter | undefined {
  if (typeof member.character !== 'string') {
    return undefined;
  }
  try {
    return shippedAssistantCharacter(member.character);
  } catch {
    return undefined;
  }
}

/** A member's face in a frame, as a character the stage draws. */
export function faceCharacter(
  member: SceneBackdropFace,
  frame: FaceFrame,
): AssistantCharacter {
  const inner = member.emoji ? undefined : drawnCharacter(member);
  const initial = member.name.trim().charAt(0).toUpperCase() || '?';
  const scale = frame.scale ?? 1;
  const Face = ({ size, mode, state }: AssistantDrawingProps): JSX.Element => (
    <span
      data-scene-face={member.emoji ? 'emoji' : inner ? 'character' : 'initial'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontSize: Math.round(size * (member.emoji ? 0.5 : 0.42)),
        fontWeight: 600,
        lineHeight: 1,
        userSelect: 'none',
        ...frame.ring,
      }}
    >
      {member.emoji ? (
        <span aria-hidden="true">{member.emoji}</span>
      ) : inner ? (
        <inner.Drawing
          size={Math.round(size * 0.72)}
          mode={mode}
          state={state}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
  const Drawing = (props: AssistantDrawingProps): JSX.Element =>
    scale >= 1 ? (
      <Face {...props} />
    ) : (
      <span
        data-scene-mark=""
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: props.size,
          height: props.size,
        }}
      >
        {frame.orbit && (
          <span
            aria-hidden="true"
            data-scene-orbit=""
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              ...frame.orbit,
            }}
          />
        )}
        <Face {...props} size={Math.round(props.size * scale)} />
      </span>
    );
  return {
    id: frame.id,
    name: `${member.name}’s face`,
    Drawing,
  };
}
