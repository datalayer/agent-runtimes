/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The picker a session action asks with (`SessionActionContext.choose`):
 * one of several — the agent a session is switched to — and, under the
 * pick, what it does: the sentence the new agent will be told, shown
 * before it is sent (MH-27). Declined, nothing is sent.
 *
 * @module apps/plugins/chat/SessionChooseDialog
 */

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { FormControl, Select, Text } from '@primer/react';
import { Dialog } from '@primer/react/experimental';
import { Box } from '@datalayer/primer-addons';
import type { SessionActionContext } from '../../core';

/** What a `choose` asks, as the context hands it over. */
export type SessionChoice = Parameters<
  NonNullable<SessionActionContext['choose']>
>[0];

export const CHOOSE_WORDS = {
  confirm: 'Switch',
  cancel: 'Keep it',
} as const;

export function SessionChooseDialog({
  question,
  onPick,
}: {
  question: SessionChoice;
  /** The pick, or `undefined` when declined. */
  onPick: (id: string | undefined) => void;
}): JSX.Element {
  const [picked, setPicked] = useState(question.options[0]?.id ?? '');
  const [says, setSays] = useState('');
  useEffect(() => {
    let current = true;
    if (!question.says || !picked) {
      setSays('');
      return undefined;
    }
    question.says(picked).then(
      sentence => current && setSays(sentence),
      () => current && setSays(''),
    );
    return () => {
      current = false;
    };
  }, [picked, question]);
  const chosen = question.options.find(option => option.id === picked);
  return (
    <Dialog
      title={question.title}
      onClose={() => onPick(undefined)}
      width="medium"
      footerButtons={[
        {
          buttonType: 'default',
          content: CHOOSE_WORDS.cancel,
          onClick: () => onPick(undefined),
        },
        {
          buttonType: 'primary',
          content: CHOOSE_WORDS.confirm,
          disabled: !picked,
          onClick: () => onPick(picked || undefined),
        },
      ]}
    >
      <Box display="grid" gap={3} data-session-choose="">
        <FormControl>
          <FormControl.Label>{question.title}</FormControl.Label>
          <Select
            value={picked}
            onChange={event => setPicked(event.target.value)}
            block
          >
            {question.options.map(option => (
              <Select.Option key={option.id} value={option.id}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        </FormControl>
        {chosen?.description ? (
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
            {chosen.description}
          </Text>
        ) : null}
        {says ? (
          <Text
            as="p"
            sx={{ m: 0, fontSize: 1, fontStyle: 'italic' }}
            data-session-choose-says=""
          >
            {says}
          </Text>
        ) : null}
      </Box>
    </Dialog>
  );
}

export default SessionChooseDialog;
