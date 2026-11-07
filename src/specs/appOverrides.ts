/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application as an appearance on stage plays it (the user, 7 November
 * 2026): its spec with what a Battle's contestant or a scene's cast member
 * overrides — the model, the instructions, the skills, the context — each
 * whole when said, the rest the application's own. Pure.
 *
 * @module specs/appOverrides
 */

import type { AppOverridesSpec, AppSpec } from '../types/agentspecs';

/** Whether anything is overridden. */
export const hasOverrides = (
  overrides: AppOverridesSpec | undefined,
): overrides is AppOverridesSpec =>
  Boolean(
    overrides &&
    (overrides.model ||
      overrides.instructions ||
      overrides.skills?.length ||
      overrides.context?.length),
  );

/** The application with its overrides applied; the same object when nothing is overridden. */
export function withAppOverrides(
  app: AppSpec,
  overrides: AppOverridesSpec | undefined,
): AppSpec {
  if (!hasOverrides(overrides)) {
    return app;
  }
  return {
    ...app,
    ...(overrides.model ? { model: overrides.model } : {}),
    ...(overrides.instructions ? { instructions: overrides.instructions } : {}),
    ...(overrides.skills?.length ? { skills: [...overrides.skills] } : {}),
    ...(overrides.context?.length ? { context: [...overrides.context] } : {}),
  };
}

/** What is overridden, said: `model alibaba:qwen-max · instructions`; empty for nothing. */
export function overridesWords(
  overrides: AppOverridesSpec | undefined,
): string {
  if (!hasOverrides(overrides)) {
    return '';
  }
  return [
    overrides.model ? `model ${overrides.model}` : '',
    overrides.instructions ? 'instructions' : '',
    overrides.skills?.length ? `skills ${overrides.skills.join(', ')}` : '',
    overrides.context?.length ? `context ${overrides.context.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
