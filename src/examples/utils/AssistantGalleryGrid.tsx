/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant's characters, every one in every pose, small, for
 * a quick visual check (LOOP T-16, T-22, T-24 to T-27): Datalayer's four and
 * the owl as the enabled plugins contribute them to
 * `loop.assistant.character`, and a test sprite read through the clippy.js
 * reader. Each cell is the real `AssistantStage`, set in the grid's flow
 * rather than fixed to the window; stepped aside is the real `useKeepClear`
 * stepping it aside from a composer laid over the cell.
 *
 * @module examples/utils/AssistantGalleryGrid
 */

import type { JSX, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { AssistantStage } from '../../chat/assistant/AssistantStage';
import type { AssistantCharacter } from '../../chat/assistant/characters';
import type { AssistantCharacterData } from '../../chat/assistant/formats/types';
import {
  AssistantCharactersPlugin,
  assistantCharactersOf,
} from '../../loop/plugins/assistant-characters';
import { OWL_CHARACTER, OwlCharacterPlugin } from './owlCharacterPlugin';
import { readTestSpriteCharacter } from './testSpriteCharacter';
import {
  GALLERY_POSES,
  GALLERY_POSE_LABELS,
  stateOfPose,
  type GalleryPose,
} from './assistantGallery';

/** A character of the gallery: by id, with its name, as contributed. */
export interface GalleryCharacter {
  id: string;
  name: string;
  character: AssistantCharacter | AssistantCharacterData;
  /** Where it comes from, as the gallery says it. */
  from: string;
}

/** The plugins the gallery enables: Datalayer's characters and the owl's. */
const reactor = buildReactorFromPlugins([
  AssistantCharactersPlugin,
  OwlCharacterPlugin,
]);
reactor.start();

/** What the enabled plugins contribute, in contribution order. */
export const CONTRIBUTED_CHARACTERS: readonly GalleryCharacter[] =
  assistantCharactersOf(reactor).map(entry => ({
    id: entry.id,
    name: entry.character.name,
    character: entry.character,
    from: entry.id === OWL_CHARACTER.id ? 'Example plugin' : 'Datalayer',
  }));

/** The id the test sprite is shown under. */
export const SPRITE_CHARACTER_ID = 'sprite';

/**
 * The gallery's characters: the contributed ones at once, and the test
 * sprite once its files are read; `ready` once they all are.
 */
export function useGalleryCharacters(): {
  characters: readonly GalleryCharacter[];
  ready: boolean;
  problem?: string;
} {
  const [sprite, setSprite] = useState<AssistantCharacterData>();
  const [problem, setProblem] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    readTestSpriteCharacter().then(
      read => {
        if (!cancelled) {
          setSprite(read);
        }
      },
      error => {
        if (!cancelled) {
          setProblem(error instanceof Error ? error.message : String(error));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  // The object URL lives as long as the gallery does.
  useEffect(
    () => () => {
      if (sprite) {
        URL.revokeObjectURL(sprite.sprite);
      }
    },
    [sprite],
  );
  return {
    characters: sprite
      ? [
          ...CONTRIBUTED_CHARACTERS,
          {
            id: SPRITE_CHARACTER_ID,
            name: `${sprite.name} (sprite)`,
            character: sprite,
            from: 'clippy.js reader',
          },
        ]
      : CONTRIBUTED_CHARACTERS,
    ready: !!sprite || !!problem,
    problem,
  };
}

/** Its children without motion, as a reader asking for reduced motion sees them. */
export function Still({
  still,
  children,
}: {
  still: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <Box
      data-gallery-still={still ? '' : undefined}
      sx={still ? { '& *': { animation: 'none !important' } } : undefined}
    >
      {children}
    </Box>
  );
}

/**
 * What the assistant steps aside from (T-27): a composer laid over it. The
 * stage's own `useKeepClear` finds it and steps aside.
 */
export function GalleryObstacle({
  sx,
}: {
  sx?: Record<string, unknown>;
}): JSX.Element {
  return (
    <Box
      data-chat-composer=""
      aria-label="A composer over the assistant"
      sx={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px dashed',
        borderColor: 'border.default',
        borderRadius: 2,
        bg: 'canvas.subtle',
        color: 'fg.muted',
        fontSize: 0,
        textAlign: 'center',
        p: 1,
        ...sx,
      }}
    >
      composer
    </Box>
  );
}

function GalleryCell({
  character,
  pose,
  size,
}: {
  character: GalleryCharacter;
  pose: GalleryPose;
  size: number;
}): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <Box
      data-gallery-cell={`${character.id}-${pose}`}
      sx={{
        position: 'relative',
        width: size + 16,
        height: size + 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AssistantStage
        character={character.character}
        state={stateOfPose(pose)}
        size={size}
        place={{ position: 'relative', zIndex: 0 }}
        stageRef={stageRef}
        onDragStart={() => undefined}
        open={false}
        onToggle={() => undefined}
        onDismiss={() => undefined}
      />
      {pose === 'aside' && <GalleryObstacle sx={{ inset: 0 }} />}
    </Box>
  );
}

/** Every character in every pose: a row per character, a column per pose. */
export function AssistantGalleryGrid({
  characters,
  size = 48,
}: {
  characters: readonly GalleryCharacter[];
  size?: number;
}): JSX.Element {
  return (
    <Box
      as="table"
      data-assistant-gallery-grid=""
      sx={{
        borderCollapse: 'collapse',
        color: 'fg.default',
        '& th': {
          fontSize: 0,
          fontWeight: 600,
          color: 'fg.muted',
          px: 1,
          py: 1,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        },
        '& td': { p: 0, textAlign: 'center' },
      }}
    >
      <thead>
        <tr>
          <th />
          {GALLERY_POSES.map(pose => (
            <th key={pose} scope="col">
              {GALLERY_POSE_LABELS[pose]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {characters.map(character => (
          <tr key={character.id}>
            <Box
              as="th"
              scope="row"
              sx={{ textAlign: 'left !important', pr: '12px !important' }}
            >
              <Text sx={{ display: 'block', color: 'fg.default' }}>
                {character.name}
              </Text>
              <Text sx={{ fontWeight: 400 }}>{character.from}</Text>
            </Box>
            {GALLERY_POSES.map(pose => (
              <td key={pose}>
                <GalleryCell character={character} pose={pose} size={size} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

export default AssistantGalleryGrid;
