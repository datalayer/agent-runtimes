/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * One `render_a2ui_surface` result in the transcript: the surface, and what
 * pressing its Submit does.
 *
 * The values are checked against the rules the tool sent with the surface —
 * a missing required field is said under the form — and, when they pass,
 * handed back to the agent as the reader's next turn, so the confirmation
 * arrives in the conversation where the form was asked for. A host that
 * wants to know is told too (`onRendered`, `onSubmitted`): the A2UI Agent
 * example mirrors the surface on a canvas beside the chat.
 *
 * @module loop/plugins/a2ui-surface/SurfaceToolResult
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import type { ToolCallRenderContext } from '../../../types/chat';
import { encodeFormSubmission } from '../../../chat/messages/formSubmission';
import { InlineSurface, SURFACE_CATALOG_ID } from './InlineSurface';
import {
  readA2uiToolResult,
  validateA2uiSubmission,
  type A2uiToolResult,
} from './toolResult';

export type SurfaceRendered = {
  toolCallId: string;
  surfaceId?: string;
  title: string;
  messages: A2uiMessage[];
  result: A2uiToolResult;
};

export type SurfaceSubmitted = {
  surfaceId: string;
  title: string;
  values: Record<string, unknown>;
};

export type SurfaceToolResultProps = {
  context: ToolCallRenderContext;
  /** Say something as the reader; `false` when the chat cannot take it. */
  send: (message: string) => boolean;
  onRendered?: (rendered: SurfaceRendered) => void;
  onSubmitted?: (submitted: SurfaceSubmitted) => void;
};

export function SurfaceToolResult({
  context,
  send,
  onRendered,
  onSubmitted,
}: SurfaceToolResultProps): JSX.Element {
  const parsed = useMemo(
    () =>
      context.status === 'complete'
        ? readA2uiToolResult(context.result, SURFACE_CATALOG_ID)
        : null,
    [context.status, context.result],
  );
  const title = parsed?.title ?? 'the form';
  const [validationError, setValidationError] = useState<string | null>(null);

  // Told once per result, when it is there to be told about.
  useEffect(() => {
    if (parsed?.messages && parsed.messages.length > 0) {
      onRendered?.({
        toolCallId: context.toolCallId,
        surfaceId: parsed.surfaceId,
        title,
        messages: parsed.messages,
        result: parsed,
      });
    }
    // The result is what changes; the callback's identity is the host's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, context.toolCallId]);

  const handleAction = useCallback(
    (action: A2uiClientAction) => {
      if (action.name !== 'submit_a2ui_form') {
        return;
      }
      const values = (action.context ?? {}) as Record<string, unknown>;
      const errors = validateA2uiSubmission(parsed?.fieldRules ?? [], values);
      if (errors.length > 0) {
        setValidationError(errors.join(' '));
        return;
      }
      setValidationError(null);
      onSubmitted?.({ surfaceId: action.surfaceId, title, values });
      const sent = send(
        encodeFormSubmission({
          title,
          surfaceId: action.surfaceId,
          values,
        }),
      );
      if (!sent) {
        setValidationError('The chat is not ready to take the submission yet.');
      }
    },
    [parsed, title, send, onSubmitted],
  );

  if (!parsed?.messages || parsed.messages.length === 0) {
    return (
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          px: 3,
          py: 2,
          bg: 'canvas.default',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Spinner size="small" />
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          Rendering A2UI surface...
        </Text>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Text sx={{ fontWeight: 'bold' }}>{title}</Text>
      <InlineSurface
        messages={parsed.messages}
        onAction={handleAction}
        validationError={validationError}
      />
    </Box>
  );
}

export default SurfaceToolResult;
