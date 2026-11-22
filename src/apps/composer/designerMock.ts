/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The application the designer draws when it is a picture (`<AppCanvasEditor
 * mock />`): on a slide, in the documentation. It is the catalogue's
 * Accounting example, read from its Appspec as the generated catalogue
 * holds it (agentspecs `apps/accounting.yaml`) — its agent, its Odoo
 * accounting server read only, its two rules, its four tests, and the UI
 * plugins its file lists: the chat, and the surfaces its
 * answers draw in the conversation, exposed through A2UI — the paper clip
 * on its agent, and with what its own file says it speaks placed as the
 * designer places a part: Agent2Agent, the route it is served on.
 *
 * Built in memory, once: nothing is fetched, nothing is kept.
 *
 * @module apps/composer/designerMock
 */

import { APP_SOURCES } from '../../specs/apps';
import { dumpAppspec, parseAppspec } from '../apps/appspec';
import { AVATAR_PARTS, PROTOCOL_PARTS } from '../plugins/canvas-parts';
import type { CanvasPartContribution } from '../core/canvasParts';
import type { AppAccent } from '../../types/agentspecs';
import { draftOfAppspec, type AppDraft } from './draft';
import { withPartAdded } from './appDesign';

/** The catalogue's example the mock designer draws. */
export const MOCK_DESIGNER_EXAMPLE = 'accounting';

/**
 * The parts its Appspec's own file says it speaks, by their toolbox ids: placed as a Maker would drop them —
 * and the paper clip on the agent, the avatar the picture shows (asked 13 October 2026). Its UI plugins
 * are its file's own (`ui`), placed as they are.
 */
export const MOCK_DESIGNER_PARTS = [
  'protocol:a2a',
  'avatar:paperclip',
] as const;

const contributed = (id: string): CanvasPartContribution => {
  const part = [...PROTOCOL_PARTS, ...AVATAR_PARTS].find(
    each => each.id === id,
  );
  if (!part) {
    throw new Error(
      `The toolbox offers no part "${id}": the mock designer cannot place it.`,
    );
  }
  return part;
};

/** The mock designer's application: the example, its parts placed. Refused, not patched, when the catalogue changes under it. */
export function mockDesignerDefinition(): AppDraft {
  const source = APP_SOURCES[MOCK_DESIGNER_EXAMPLE];
  if (!source) {
    throw new Error(
      `The catalogue has no example "${MOCK_DESIGNER_EXAMPLE}": the mock designer has nothing to draw.`,
    );
  }
  const example = draftOfAppspec(source);
  if (!example.spec) {
    throw new Error(
      `The example "${MOCK_DESIGNER_EXAMPLE}" has no Appspec the designer reads.`,
    );
  }
  const data = MOCK_DESIGNER_PARTS.reduce<unknown>(
    (placed, id) => withPartAdded(placed, contributed(id)).data,
    dumpAppspec(example.spec),
  );
  const read = parseAppspec(data);
  if (read.problems.length) {
    throw new Error(
      `The mock designer's application is refused: ${read.problems[0]}`,
    );
  }
  return { ...example, spec: read.app };
}

/** An example of the catalogue as the designer draws it, read only: its own Appspec, nothing placed (its example page). */
export function exampleDesigner(id: string): AppDraft {
  const source = APP_SOURCES[id];
  if (!source) {
    throw new Error(
      `The catalogue has no example "${id}": the designer has nothing to draw.`,
    );
  }
  const example = draftOfAppspec(source);
  if (!example.spec) {
    throw new Error(`The example "${id}" has no Appspec the designer reads.`);
  }
  return example;
}

let MOCK: AppDraft | null = null;

/** The mock designer's application, built once. */
export const mockDesigner = (): AppDraft => (MOCK ??= mockDesignerDefinition());

/** The accent its Appspec gives its page: a picture of it wears it. */
export function mockDesignerAccent(): AppAccent {
  const accent = mockDesigner().spec?.interface?.accent;
  if (!accent) {
    throw new Error(
      `The example "${MOCK_DESIGNER_EXAMPLE}" names no accent for the mock designer to wear.`,
    );
  }
  return accent;
}
