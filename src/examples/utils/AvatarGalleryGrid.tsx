/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant's avatars, every one in every pose, small, for
 * a quick visual check (T-16, T-22, T-24 to T-27): Datalayer's five (its
 * four drawings and its orb) and the owl as the enabled plugins contribute them to
 * `loop.assistant.character`, a test sprite read through the clippy.js
 * reader, and the 3D robot. Each cell is the real `AssistantStage`, set in
 * the grid's flow rather than fixed to the window; stepped aside is the real
 * `useKeepClear` stepping it aside from a composer laid over the cell. The
 * cards (`AvatarGalleryCards`) show each avatar once, in the pose asked.
 *
 * @module examples/utils/AvatarGalleryGrid
 */

import type React from 'react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { AssistantStage } from '../../chat/assistant/AssistantStage';
import type { AssistantCharacter } from '../../chat/assistant/characters';
import type { AssistantCharacterData } from '../../chat/assistant/formats/types';
import {
  assistantModel3D,
  type AssistantModel3D,
} from '../../chat/assistant/avatar3dModel';
import {
  AssistantCharactersPlugin,
  assistantCharactersOf,
} from '../../apps/plugins/assistant-characters';
import { OWL_CHARACTER, OwlCharacterPlugin } from './owlCharacterPlugin';
import { NotebookPreview } from '../../components/teams/NotebookPreview';
import { notebookBalloonVisual } from '../../components/teams/TeamNotebook';
import type { BalloonDisplay } from '../../chat/assistant/toolLine';
import { readTestSpriteCharacter } from './testSpriteCharacter';
import {
  GALLERY_POSES,
  GALLERY_POSE_LABELS,
  SAMPLE_NOTEBOOK,
  SAMPLE_NOTEBOOK_ARTIFACT,
  SAMPLE_NOTEBOOK_SAYING,
  sampleHistory,
  sampleSaying,
  sampleToolLine,
  stateOfPose,
  type GalleryPose,
} from './avatarGallery';

/** A character of the gallery: by id, with its name, as contributed. */
export interface GalleryCharacter {
  id: string;
  name: string;
  character: AssistantCharacter | AssistantCharacterData | AssistantModel3D;
  /** Where it comes from, as the gallery says it. */
  from: string;
}

/**
 * The 3D avatar, the default robot: three.js, loaded when it is drawn. Each
 * one drawn is a WebGL context of its own, of which a page has few: shown
 * once (on a stage, or as a card), never in every cell of the grid.
 */
export const MODEL_3D_CHARACTER: GalleryCharacter = (() => {
  const model = assistantModel3D();
  return { id: model.id, name: model.name, character: model, from: 'three.js' };
})();

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
      position="absolute"
      display="flex"
      alignItems="center"
      justifyContent="center"
      border="1px dashed"
      borderColor="border.default"
      borderRadius={2}
      bg="canvas.subtle"
      color="fg.muted"
      fontSize={0}
      textAlign="center"
      p={1}
      sx={sx}
    >
      composer
    </Box>
  );
}

export function GalleryCell({
  character,
  pose,
  size,
  replay,
}: {
  character: GalleryCharacter;
  pose: GalleryPose;
  size: number;
  /** A count: changed, a 3D avatar plays its pose again, not drawn again. */
  replay?: number;
}): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <Box
      data-gallery-cell={`${character.id}-${pose}`}
      position="relative"
      width={size + 16}
      height={size + 16}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <AssistantStage
        character={character.character}
        state={stateOfPose(pose)}
        size={size}
        replay={replay}
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
export function AvatarGalleryGrid({
  characters,
  size = 48,
}: {
  characters: readonly GalleryCharacter[];
  size?: number;
}): JSX.Element {
  return (
    <Box
      as="table"
      data-avatar-gallery-grid=""
      borderCollapse="collapse"
      sx={{
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
              textAlign="left !important"
              pr="12px !important"
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

/**
 * Each avatar once, as a card, in the pose asked: its name and where it
 * comes from under it. A new `key` replays the drawn motions; a 3D avatar
 * is replayed by `replay` instead — a new key would load its model again,
 * and it would blink out while it loads.
 */
export function AvatarGalleryCards({
  characters,
  pose,
  size = 72,
  replay,
}: {
  characters: readonly GalleryCharacter[];
  pose: GalleryPose;
  size?: number;
  /** A count: changed, a 3D avatar plays its pose again. */
  replay?: number;
}): JSX.Element {
  return (
    <Box
      data-avatar-gallery-cards=""
      data-avatar-pose={pose}
      display="grid"
      gridTemplateColumns={`repeat(auto-fill, minmax(${size + 88}px, 1fr))`}
      gap={3}
    >
      {characters.map(character => (
        <Box
          key={character.id}
          data-avatar-card={character.id}
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap={1}
          p={2}
          bg="canvas.default"
          color="fg.default"
          border="1px solid"
          borderColor="border.default"
          borderRadius={2}
        >
          <GalleryCell
            character={character}
            pose={pose}
            size={size}
            replay={replay}
          />
          <Text sx={{ fontWeight: 600, fontSize: 1, textAlign: 'center' }}>
            {character.name}
          </Text>
          <Text sx={{ fontSize: 0, color: 'fg.muted', textAlign: 'center' }}>
            {character.from}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/** How tall the notebook in a balloon is, in the stage and in the grid. */
export const GALLERY_NOTEBOOK_HEIGHT = 160;

/** The notebook a balloon holds in the gallery: jupyter-react's, read-only. */
export function GalleryNotebook({
  onOpen,
}: {
  onOpen?: () => void;
}): JSX.Element {
  return (
    <NotebookPreview
      notebook={SAMPLE_NOTEBOOK}
      title="Accounting’s notebook"
      maxHeight={GALLERY_NOTEBOOK_HEIGHT}
      onOpen={onOpen}
    />
  );
}

/**
 * The sample notebook as the balloon's large visual: expanded, the notebook
 * that runs and is edited on the browser sandbox (`TeamNotebook`).
 */
export function galleryNotebookVisual() {
  return notebookBalloonVisual(
    SAMPLE_NOTEBOOK_ARTIFACT,
    'Accounting’s notebook',
    420,
  );
}

/** One balloon display, pictured: a character with what its balloon says. */
function BalloonCell({
  character,
  label,
  display,
  balloon,
  height,
}: {
  character: GalleryCharacter;
  label: string;
  display: BalloonDisplay;
  balloon: NonNullable<React.ComponentProps<typeof AssistantStage>['balloon']>;
  height: number;
}): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <Box
      data-gallery-cell={`balloon-${label.toLowerCase().replace(/\W+/g, '-')}`}
      position="relative"
      width={330}
      height={height}
      border="1px solid"
      borderColor="border.muted"
      borderRadius={2}
    >
      <Text
        sx={{
          position: 'absolute',
          top: 1,
          right: 2,
          fontSize: 0,
          fontWeight: 600,
          color: 'fg.muted',
        }}
      >
        {label}
      </Text>
      <AssistantStage
        character={character.character}
        state={balloon.tool ? 'working' : 'speaking'}
        size={48}
        place={{ position: 'absolute', left: '12px', bottom: '8px' }}
        stageRef={stageRef}
        onDragStart={() => undefined}
        open={false}
        onToggle={() => undefined}
        onDismiss={() => undefined}
        balloon={balloon}
        balloonDisplay={display}
        insist
      />
    </Box>
  );
}

/**
 * The balloon's displays (T-23), one character: the history, every message listed, the
 * current balloon with a tool line, and with a notebook given — the same
 * read-only jupyter-react notebook as in the stage, loaded when drawn.
 */
export function GalleryBalloons({
  character,
}: {
  character: GalleryCharacter;
}): JSX.Element {
  return (
    <Box data-gallery-balloons="" display="flex" gap={3} flexWrap="wrap" mt={3}>
      <BalloonCell
        character={character}
        label="History"
        display="history"
        height={340}
        balloon={{
          ...sampleSaying(1),
          history: sampleHistory(2),
          onDismiss: () => undefined,
        }}
      />
      <BalloonCell
        character={character}
        label="Current · tool"
        display="current"
        height={180}
        balloon={{
          text: 'Using list_invoices…',
          tool: sampleToolLine('running'),
          busy: true,
        }}
      />
      <BalloonCell
        character={character}
        label="Current · notebook"
        display="current"
        height={GALLERY_NOTEBOOK_HEIGHT + 210}
        balloon={{
          text: SAMPLE_NOTEBOOK_SAYING,
          attachment: <GalleryNotebook />,
          visual: galleryNotebookVisual(),
        }}
      />
    </Box>
  );
}

export default AvatarGalleryGrid;
