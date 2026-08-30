/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A spec, as the YAML somebody would have written.
 *
 * The agentspecs example grew this to show what it was about to launch, and
 * the agent details pane wants the same thing for what is already running —
 * "here is the spec, in the form it is written in" is one question, and two
 * renderings of it would drift.
 *
 * The serialiser is deliberately small and local. A YAML library would be a
 * dependency for a read-only preview of data this application produced itself,
 * and the shapes here are plain objects, arrays, strings and numbers.
 *
 * @module components/specs/SpecPayloadPreview
 */

import { useEffect } from 'react';
import { IconButton, Text } from '@primer/react';
import { XIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const yamlScalar = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const str = String(value);
  if (str === '') {
    return "''";
  }
  if (/^[a-zA-Z0-9._/-]+$/.test(str)) {
    return str;
  }
  return JSON.stringify(str);
};

const toYaml = (value: unknown, indent = 0): string => {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return value
      .map(item => {
        if (isPlainObject(item) || Array.isArray(item)) {
          return `${pad}-\n${toYaml(item, indent + 1)}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join('\n');
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return '{}';
    }
    return entries
      .map(([key, val]) => {
        if (isPlainObject(val) || Array.isArray(val)) {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
        }
        return `${pad}${key}: ${yamlScalar(val)}`;
      })
      .join('\n');
  }
  return `${pad}${yamlScalar(value)}`;
};

/** A spec rendered as YAML. Exported for callers that only want the text. */
export function specToYaml(value: unknown): string {
  return toYaml(value);
}

export type SpecPayloadPreviewProps = {
  /** The spec to render. */
  spec: unknown;
  /** Called when the reader dismisses it. */
  onClose: () => void;
  /** What the panel calls itself. */
  title?: string;
};

/**
 * The preview, as a panel over whatever is behind it.
 *
 * Escape closes it as well as the button, because a panel that covers the
 * view and can only be dismissed by finding one control is a panel people
 * feel trapped in.
 */
export function SpecPayloadPreview({
  spec,
  onClose,
  title = 'Spec Payload Preview (YAML)',
}: SpecPayloadPreviewProps): JSX.Element {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <Box
      role="dialog"
      aria-label={title}
      aria-modal="true"
      sx={{
        position: 'fixed',
        inset: 24,
        zIndex: 300,
        bg: 'canvas.default',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 1,
        boxShadow: 'shadow.large',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Text sx={{ fontWeight: 'bold' }}>{title}</Text>
        <IconButton
          icon={XIcon}
          aria-label="Close spec preview"
          size="small"
          variant="invisible"
          onClick={onClose}
        />
      </Box>
      <Box sx={{ p: 3, overflow: 'auto', flex: 1 }}>
        {/* `pre` with no wrapping: YAML is significant whitespace, and a line
            re-wrapped to fit the panel is a line that no longer parses. */}
        <Box
          as="pre"
          sx={{
            m: 0,
            whiteSpace: 'pre',
            fontFamily: 'monospace',
            fontSize: 0,
            lineHeight: '20px',
          }}
        >
          {specToYaml(spec)}
        </Box>
      </Box>
    </Box>
  );
}

export default SpecPayloadPreview;
