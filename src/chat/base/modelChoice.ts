/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which models a chat offers, and which one it opens on.
 *
 * Two rules, kept out of `ChatBase` so they can be read and tested without
 * rendering a chat:
 *
 * - **Only what can be called is offered.** A server answers with its whole
 *   catalogue and a flag per model, and the menu used to draw all of it, most
 *   rows greyed out with a reason. Thirty models to choose two from reads as
 *   a broken menu, and the one thing it guarantees is that a reader's first
 *   click lands on something that cannot answer.
 * - **The default has to be one of them.** A default naming a model this
 *   deployment cannot use — a spec claiming the default while marked
 *   unavailable — opened every chat on it, and the first message came back
 *   as the provider's complaint about a missing key.
 *
 * @module chat/base/modelChoice
 */

import type { ModelConfig } from '../../types/chat';

/** Whether a model can be picked: the flag says no, or says nothing. */
export const isUsable = (model: ModelConfig): boolean =>
  model.isAvailable !== false;

/**
 * The models to offer: the usable ones.
 *
 * When none is usable the list is kept whole. An empty menu says nothing,
 * while the rows and their reasons say which key is missing.
 */
export function usableModels(models: ModelConfig[]): ModelConfig[] {
  const usable = models.filter(isUsable);
  return usable.length > 0 ? usable : models;
}

/**
 * The models a chat offers, given what its runtime answered.
 *
 * The runtime's answer is the list: an agent's own models (its `model` and
 * `model_additionals`), each flagged with whether its inference serves it.
 * When the runtime answered, nothing else is added — not even when its list
 * is empty, which says the agent has nothing to switch to. `fallback` is
 * asked only when there is no runtime to answer (an in-page agent) or it
 * has not answered yet.
 */
export function offeredModels(
  fromRuntime: ModelConfig[] | undefined,
  fallback: () => ModelConfig[],
): ModelConfig[] {
  return usableModels(fromRuntime ?? fallback());
}

/** Whether `id` is on offer and usable — the selection may stand. */
export const isOffered = (offered: ModelConfig[], id?: string): boolean =>
  Boolean(id) && offered.some(m => m.id === id && isUsable(m));

/**
 * The model a chat opens on.
 *
 * The preferred one when it is offered *and* usable; otherwise the first
 * usable one; otherwise the first there is. `undefined` when there is none.
 */
export function initialModelId(
  offered: ModelConfig[],
  preferred?: string | null,
): string | undefined {
  if (preferred && offered.some(m => m.id === preferred && isUsable(m))) {
    return preferred;
  }
  const first = offered.find(isUsable) ?? offered[0];
  return first?.id;
}

/**
 * One row of `/api/v1/configure/models`, as the server writes it.
 *
 * Snake case and its own flag names: the route is read by more than this
 * chat, and its shape is the server's to keep.
 */
export type ServerCatalogueModel = {
  id: string;
  name?: string;
  available?: boolean;
  missing_env_vars?: string[];
  reason?: string | null;
  warning?: string | null;
};

/**
 * The typed-decision models a runtime lists apart (Jev).
 *
 * They answer a decision's typed questions, not a conversation: the menu
 * shows them read-only, under their own heading, with `note` saying so, and
 * never offers one as the agent's model.
 */
export type Decisions = {
  models: ModelConfig[];
  note: string;
};

/** The runtime's `/configure/models` answer, as far as the chat reads it. */
export type ServerCatalogue = {
  models?: ServerCatalogueModel[];
  source?: string;
  note?: string;
  decision_models: ServerCatalogueModel[];
  decisions_note: string;
};

/**
 * The server's catalogue in the chat's shape.
 *
 * The route says `available`; the chat, the menu and the rules above read
 * `isAvailable`. Handed over unmapped, every row looked usable, the menu
 * offered all thirty-one, and the first message of a chat that opened before
 * its spec was known went to the first row — Alibaba, and its missing key.
 */
export function readServerCatalogue(
  payload:
    | { models?: ServerCatalogueModel[]; source?: string; note?: string }
    | null
    | undefined,
): ModelConfig[] {
  return (payload?.models ?? []).map(readServerModel);
}

/**
 * The typed-decision models of the runtime's answer, in the chat's shape.
 *
 * Read apart from `readServerCatalogue`, so no list a chat picks its model
 * from ever holds one.
 */
export function readServerDecisions(payload: ServerCatalogue): Decisions {
  return {
    models: payload.decision_models.map(readServerModel),
    note: payload.decisions_note,
  };
}

/** One row of the runtime's answer, in the chat's shape. */
function readServerModel(model: ServerCatalogueModel): ModelConfig {
  const missing = model.missing_env_vars ?? [];
  const reason =
    model.reason ??
    (missing.length > 0 ? `Set ${missing.join(', ')}` : undefined) ??
    model.warning ??
    undefined;
  return {
    id: model.id,
    name: model.name ?? model.id,
    isAvailable: model.available !== false,
    ...(reason && model.available === false
      ? { unavailableReason: reason }
      : {}),
  };
}
