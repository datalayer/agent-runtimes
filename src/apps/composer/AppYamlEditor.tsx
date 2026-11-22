/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The YAML editor of an application: its Appspec as a file, edited in place,
 * with the instant checks under it on every change.
 *
 * What the editor knows of the spec — the fields and values where the cursor
 * is, references from the catalogues, what a field means, and every check
 * underlined on its line — comes from `appSpecLanguage` and `specEditing`,
 * on each change, with no model.
 *
 * Controlled: the host holds the text (`value`) and is handed each change
 * with what it reads as (`onChange`), so that it can keep the text its
 * builder wrote beside the application it says. Without `onChange` the
 * editor is read only.
 *
 * @module apps/composer/AppYamlEditor
 */

import type { JSX } from 'react';
import { useMemo, useRef } from 'react';
import { Heading, Text } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { AppSpec } from '../../types/agentspecs';
import {
  NEEDS_ATTENTION,
  NOT_READY,
  PASSES,
  checkApp,
  type AppCheck,
} from '../apps/checks';
import { readAppspecYaml } from '../apps/yaml';
import { CodeEditor } from './CodeEditor';
import { completionsAt, hoverAt } from './appSpecLanguage';
import { specExtensions } from './specEditing';

/** What a text reads as: its Appspec, `null` while YAML cannot read it, and its instant checks. */
export type AppYamlRead = {
  app: AppSpec | null;
  check: AppCheck;
};

/**
 * A text read as an Appspec, with its instant checks: one YAML cannot read
 * gives no Appspec, and its checks say where it is wrong; one that reads,
 * even with problems, gives its Appspec, and the checks say what stands in
 * the way.
 */
export function readAppYaml(text: string): AppYamlRead {
  const { app, problems } = readAppspecYaml(text);
  const check = checkApp(app, problems);
  if (problems.some(problem => /^Line \d+:/.test(problem))) {
    return { app: null, check: { ...check, verdict: NOT_READY } };
  }
  return { app, check };
}

const VERDICTS = {
  [NOT_READY]: { icon: XCircleIcon, color: 'danger.fg' },
  [NEEDS_ATTENTION]: { icon: AlertIcon, color: 'attention.fg' },
  [PASSES]: { icon: CheckCircleIcon, color: 'success.fg' },
} as const;

export type AppYamlEditorProps = {
  /** The text shown. */
  value: string;
  /** A change of the person's, and what it reads as. Without one, read only. */
  onChange?: (text: string, read: AppYamlRead) => void;
  /**
   * How a text is read and checked: `readAppYaml` unless the host checks
   * more (an application whose accounts are not connected yet, say).
   */
  read?: (text: string) => AppYamlRead;
  /** Read only, even with an `onChange`: while the host saves. */
  readOnly?: boolean;
  /** An instant check to open at, on the line it is about. */
  reveal?: string;
  /** The checks under the text: drawn unless `false`. */
  checks?: boolean;
  /** CSS height of the editor; it scrolls inside. */
  height?: string;
  ariaLabel?: string;
};

export function AppYamlEditor({
  value,
  onChange,
  read = readAppYaml,
  readOnly = false,
  reveal = '',
  checks = true,
  height = '520px',
  ariaLabel = "The application's spec, in YAML",
}: AppYamlEditorProps): JSX.Element {
  // The latest reader, for the linter: the editor is built once.
  const reader = useRef(read);
  reader.current = read;
  // Built once: the check it opened at is the one of its first drawing.
  const extensions = useMemo(
    () =>
      specExtensions({
        completionsAt,
        hoverAt,
        checkOf: text => reader.current(text).check,
        reveal,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const edit = useMemo(() => read(value), [read, value]);
  const verdict =
    VERDICTS[edit.check.verdict as keyof typeof VERDICTS] ??
    VERDICTS[NOT_READY];
  const Icon = verdict.icon;
  const lines = [...edit.check.problems, ...edit.check.attention];
  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{ gap: 3 }}
      data-app-yaml-editor=""
    >
      <CodeEditor
        language="yaml"
        extensions={extensions}
        value={value}
        height={height}
        readOnly={readOnly || !onChange}
        ariaLabel={ariaLabel}
        onChange={
          onChange ? next => onChange(next, reader.current(next)) : undefined
        }
      />
      {checks ? (
        <Box
          role="status"
          aria-live="polite"
          border="1px solid"
          borderColor="border.default"
          borderRadius={2}
          p={3}
        >
          <Heading
            as="h3"
            sx={{
              fontSize: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mb: 2,
            }}
          >
            <Box as="span" color={verdict.color} display="inline-flex">
              <Icon />
            </Box>
            {edit.check.verdict}
          </Heading>
          {lines.length === 0 ? (
            <Text sx={{ color: 'fg.muted' }}>
              Its tests decide whether it is ready.
            </Text>
          ) : (
            <Box
              as="ul"
              m={0}
              pl={3}
              display="flex"
              flexDirection="column"
              sx={{ gap: 1 }}
            >
              {edit.check.problems.map(line => (
                <li key={`p-${line}`}>{line}</li>
              ))}
              {edit.check.attention.map(line => (
                <li key={`a-${line}`}>{line}</li>
              ))}
            </Box>
          )}
          {edit.check.setup.length > 0 ? (
            <Text as="p" sx={{ color: 'fg.muted', mt: 2, mb: 0 }}>
              To set up: {edit.check.setup.join(' ')}
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

export default AppYamlEditor;
