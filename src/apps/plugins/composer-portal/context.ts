/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the Composer's portal draws where no workspace hosts the chat (a
 * `Chat` on its own, outside any reactor): its host's view, handed through
 * React's context rather than a slot (the user, 21 November 2026: every
 * Datalayer page shows the Studio's own views, a host's agent page too).
 * A slot's contribution (`LoopSlots.composerView`) comes first; with
 * neither, the portal draws its own (`ComposerSource`).
 *
 * @module apps/plugins/composer-portal/context
 */

import { createContext, type ComponentType } from 'react';
import type { AppSpec } from '../../../types/agentspecs';

/** A host's Composer view: given the Appspec shown. */
export type ComposerViewComponent = ComponentType<{ app: AppSpec }>;

export const ComposerViewContext = createContext<
  ComposerViewComponent | undefined
>(undefined);

/** Hands the portal its host's view, for the chats under it. */
export const ComposerViewProvider = ComposerViewContext.Provider;
