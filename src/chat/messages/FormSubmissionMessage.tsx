/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A submitted form, as a card in the transcript.
 *
 * Drawn where the reader's turn would be, in the shape a tool call has: a
 * header that names the form and says how many fields it carried, a chevron
 * that opens it, and the fields as a two-column table underneath. The JSON
 * the agent reads stays in the turn's text; the reader sees the form they
 * filled in.
 *
 * @module chat/messages/FormSubmissionMessage
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  ChecklistIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@primer/octicons-react';
import {
  displayValue,
  labelOfFieldId,
  type FormSubmission,
} from './formSubmission';

export function FormSubmissionMessage({
  submission,
}: {
  submission: FormSubmission;
}): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const entries = Object.entries(submission.values);
  const count = entries.length;

  return (
    <Box
      sx={{
        width: '100%',
        minWidth: 280,
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: 'canvas.default',
        color: 'fg.default',
      }}
    >
      <Box
        as="button"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: 2,
          backgroundColor: 'canvas.subtle',
          border: 'none',
          borderBottom: expanded ? '1px solid' : 'none',
          borderColor: 'border.default',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'fg.default',
          '&:hover': { backgroundColor: 'neutral.muted' },
        }}
      >
        <Box sx={{ color: 'fg.muted', flexShrink: 0 }}>
          {expanded ? (
            <ChevronDownIcon size={16} />
          ) : (
            <ChevronRightIcon size={16} />
          )}
        </Box>
        <Box sx={{ color: 'fg.muted', flexShrink: 0 }}>
          <ChecklistIcon size={16} />
        </Box>
        <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
          Submitted {submission.title}
        </Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted', ml: 'auto' }}>
          {count} field{count === 1 ? '' : 's'}
        </Text>
      </Box>
      {expanded ? (
        <Box as="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
          <Box as="tbody">
            {entries.map(([id, value]) => (
              <Box
                as="tr"
                key={id}
                sx={{
                  '& + tr td': {
                    borderTop: '1px solid',
                    borderColor: 'border.muted',
                  },
                }}
              >
                <Box
                  as="td"
                  sx={{
                    px: 3,
                    py: 1,
                    fontSize: 0,
                    color: 'fg.muted',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'top',
                    width: '40%',
                  }}
                >
                  {labelOfFieldId(id)}
                </Box>
                <Box
                  as="td"
                  sx={{ px: 3, py: 1, fontSize: 1, wordBreak: 'break-word' }}
                >
                  {displayValue(value)}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

export default FormSubmissionMessage;
