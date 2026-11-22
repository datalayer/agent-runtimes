/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's face, on the principle of a person's: the
 * avatar a profile chooses at `/settings/profile`, from the same set
 * of drawings, on the same tinted disc, drawn by core's
 * `PrincipalAvatar` — an application is a principal, and is drawn as one.
 *
 * Unchosen, the avatar is the application's `emoji` on that disc, and the
 * banner is the one its id seeds, as a person's is seeded by their handle.
 * An application that kept the default face (the eyes) is drawn with the
 * apps icon instead, the mark the header and the sidebar give applications.
 *
 * @module apps/composer/AppAvatar
 */

import type { JSX } from 'react';
import { AppsIcon } from '@primer/octicons-react';
import { EntityAvatar } from '@datalayer/primer-addons';
import { loopShapeVars } from '@datalayer/primer-addons/lib/theme';
import {
  PRINCIPAL_BANNERS,
  PrincipalAvatar,
  getPrincipalBannerForSeed,
  principalAvatarOf,
} from '@datalayer/core/lib/components/principal';
import { emojiAvatar } from '@datalayer/core/lib/components/avatars/avatarChoice';
import { DEFAULT_EMOJI } from '../apps/appspec';
import type { AppSpec } from '../../types/agentspecs';

export type AppFace = {
  /** The application's id: what seeds its banner. */
  id: string;
  name?: string;
  /** Its emoji: the avatar until one is chosen, and its face where only text goes. */
  emoji?: string;
  /**
   * The avatar chosen for it, as it is kept: `emoji:…` or
   * `@datalayer/icons-react:…` (core's `avatarChoice`).
   */
  avatar?: string;
  /** The banner chosen for it, by name, from the profile's set. */
  banner?: string;
};

/**
 * The three sizes of a face, and no other: the page, a header or
 * a card, a line of a list — read from the `loop` theme's tokens.
 */
export type FaceSize = 'large' | 'medium' | 'small';

export const FACE_SIZES: Record<FaceSize, number> = {
  large: parseInt(loopShapeVars['--loop-face-large'] ?? '72', 10),
  medium: parseInt(loopShapeVars['--loop-face-medium'] ?? '40', 10),
  small: parseInt(loopShapeVars['--loop-face-small'] ?? '20', 10),
};

/** The avatar chosen, when it is one (an emoji or a drawing of the set); otherwise none. */
export const avatarOf = (face: AppFace): string | undefined =>
  principalAvatarOf(face.avatar) ? face.avatar : undefined;

/** The banner chosen, or the one its id seeds. */
export const bannerOf = (face: AppFace): string =>
  face.banner && PRINCIPAL_BANNERS.some(option => option.name === face.banner)
    ? face.banner
    : getPrincipalBannerForSeed(face.id);

/** An application's face, as its Appspec gives it. */
export const faceOfAppspec = (
  spec: Pick<AppSpec, 'id' | 'name' | 'emoji' | 'avatar' | 'banner'>,
): AppFace => ({
  id: spec.id || 'app',
  name: spec.name,
  emoji: spec.emoji || DEFAULT_EMOJI,
  avatar: spec.avatar,
  banner: spec.banner,
});

export function AppAvatar({
  face,
  size = 'small',
  ring = false,
}: {
  face: AppFace;
  size?: FaceSize;
  ring?: boolean;
}): JSX.Element {
  const avatar = avatarOf(face);
  const px = FACE_SIZES[size];
  if (!avatar && (!face.emoji || face.emoji === DEFAULT_EMOJI)) {
    return (
      <EntityAvatar
        alt={face.name}
        data-app-icon
        size={px}
        // An application is not a person: the theme's corner, not a circle.
        shape="rounded"
        ring={ring}
      >
        <AppsIcon size={Math.max(12, Math.round(px * 0.55))} />
      </EntityAvatar>
    );
  }
  return (
    <PrincipalAvatar
      kind="service"
      // Unchosen, the avatar is the application's emoji.
      avatar={avatar ?? (face.emoji ? emojiAvatar(face.emoji) : undefined)}
      alt={face.name}
      size={px}
      // An application's face takes the theme's corner, as an agent's does.
      square
      ring={ring}
    />
  );
}

export default AppAvatar;
