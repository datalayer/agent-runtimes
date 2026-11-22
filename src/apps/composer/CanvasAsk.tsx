/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Ask for a change* — the plan's *Ask the assistant* — above the Canvas's
 * layout: a request in
 * words, the change it makes said before it is kept — *Keep it* or
 * *Discard* — and, once kept, *Undo* puts the layout back as it was, in one
 * step, until another change is made.
 *
 * @module apps/composer/CanvasAsk
 */

import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import { Button, Flash, FormControl, Text, TextInput } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { AskModel } from './canvasAskModel';
import type { AppInterface } from './appInterface';
import {
  proposeLayout,
  type LayoutAskContext,
  type LayoutProposal,
} from './canvasAskModel';

export type CanvasAskProps = {
  context: LayoutAskContext;
  ask: AskModel;
  nameOf: (surface: AppInterface, id: string) => string;
  /** Write a layout: the one proposed, or the one before it. */
  onWrite: (next: AppInterface, said: string) => void;
  disabled?: boolean;
};

const same = (one: AppInterface, other: AppInterface): boolean =>
  JSON.stringify(one.components) === JSON.stringify(other.components);

export function CanvasAsk({
  context,
  ask,
  nameOf,
  onWrite,
  disabled = false,
}: CanvasAskProps): JSX.Element {
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  const [proposal, setProposal] = useState<LayoutProposal | null>(null);
  // What Undo puts back, while the layout is still the one kept.
  const [kept, setKept] = useState<{
    before: AppInterface;
    after: AppInterface;
  } | null>(null);
  const undoable = kept !== null && same(kept.after, context.surface);

  const submit = async () => {
    setBusy(true);
    setRefused('');
    setProposal(null);
    try {
      const outcome = await proposeLayout(request, context, ask, nameOf);
      if ('refused' in outcome) {
        setRefused(outcome.refused);
      } else {
        setProposal(outcome);
      }
    } catch (error) {
      setRefused(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      as="section"
      aria-label="Ask for a change"
      mb={3}
      p={3}
      bg="canvas.subtle"
      borderRadius="card"
    >
      <Box
        as="form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void submit();
        }}
        display="flex"
        gap={2}
        alignItems="flex-end"
        flexWrap="wrap"
      >
        <FormControl sx={{ flex: '1 1 320px' }} disabled={disabled || busy}>
          <FormControl.Label>Ask for a change</FormControl.Label>
          <TextInput
            block
            value={request}
            placeholder="Add a chart of the last ten runs"
            onChange={event => setRequest(event.target.value)}
          />
          <FormControl.Caption>
            The change is shown before it is kept.
          </FormControl.Caption>
        </FormControl>
        <Button type="submit" disabled={disabled || busy || !request.trim()}>
          {busy ? 'Asking…' : 'Ask'}
        </Button>
      </Box>
      {refused ? (
        <Flash variant="warning" sx={{ mt: 2 }} role="alert">
          {refused}
        </Flash>
      ) : null}
      {proposal ? (
        <Box role="region" aria-label="The change proposed" mt={2}>
          <Text as="p" sx={{ fontWeight: 'bold', mb: 1 }}>
            The change, before it is kept:
          </Text>
          <Box as="ul" mt={0} pl={3}>
            {proposal.changes.map(change => (
              <li key={change}>{change}</li>
            ))}
          </Box>
          <Box display="flex" gap={2}>
            <Button
              disabled={disabled}
              onClick={() => {
                setKept({ before: context.surface, after: proposal.proposed });
                onWrite(
                  proposal.proposed,
                  `The change asked for is kept: ${proposal.changes.join(' ')}`,
                );
                setProposal(null);
                setRequest('');
              }}
            >
              Keep it
            </Button>
            <Button onClick={() => setProposal(null)}>Discard</Button>
          </Box>
        </Box>
      ) : null}
      {undoable && kept ? (
        <Box mt={2} display="flex" gap={2} alignItems="center">
          <Text sx={{ color: 'fg.muted' }}>The change asked for is kept.</Text>
          <Button
            size="small"
            disabled={disabled}
            onClick={() => {
              onWrite(
                kept.before,
                'The layout is back as it was before the change asked for.',
              );
              setKept(null);
            }}
          >
            Undo
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}

export default CanvasAsk;
