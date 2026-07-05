/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useMemo, useState } from 'react';
import { CodeCellModel } from '@jupyterlab/cells';
import type { IMarkdownParser, IRenderMime } from '@jupyterlab/rendermime';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { FormControl, Select, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { Dialog } from '@primer/react/experimental';
import { Markdown } from '@datalayer/core/lib/components/display';
import type { ISnippet } from '../../models';

/**
 * {@link SnippetDialog} properties
 */
export interface ISnippetDialogProps {
  /**
   * Code cell model
   */
  model: CodeCellModel;

  /**
   * Callback request the dialog closure.
   */
  onClose: () => void;

  /**
   * Code snippets language
   */
  language: string;

  /**
   * Code snippets
   */
  snippets: ISnippet[];

  /**
   * Markdown parser
   */
  markdownParser?: IMarkdownParser;

  /**
   * HTML sanitizer
   */
  sanitizer?: IRenderMime.ISanitizer;

  /**
   * Application translator
   */
  translator?: ITranslator;
}

/**
 * Dialog to inject snippet in a cell.
 */
export function SnippetDialog(props: ISnippetDialogProps): JSX.Element {
  const {
    model,
    onClose,
    language,
    snippets,
    markdownParser,
    sanitizer,
    translator,
  } = props;

  const [selection, setSelection] = useState<ISnippet>(snippets[0]);

  const trans = useMemo(
    () => (translator ?? nullTranslator).load('jupyterlab'),
    [translator],
  );

  const onSelectionChange = useCallback(
    (e: any) => {
      const selection = (e.target as HTMLSelectElement).value;
      setSelection(snippets[parseInt(selection, 10)]);
    },
    [setSelection, snippets],
  );

  const injectSnippet = useCallback(() => {
    const size = model.sharedModel.getSource().length;
    model.sharedModel.updateSource(
      size,
      size,
      '\n'.repeat(size ? 2 : 0) + selection.code,
    );
    onClose();
  }, [model, selection, onClose]);

  return (
    <Dialog
      title={
        <span style={{ color: 'var(--fgColor-default)' }}>
          Pick a snippet to inject
        </span>
      }
      onClose={onClose}
      footerButtons={[
        {
          buttonType: 'default',
          content: trans.__('Cancel'),
          onClick: onClose,
        },
        {
          buttonType: 'primary',
          content: trans.__('Inject snippet'),
          onClick: injectSnippet,
          autoFocus: true,
        },
      ]}
    >
      <Box as="form">
        <FormControl>
          <FormControl.Label></FormControl.Label>
          <Select block onChange={onSelectionChange}>
            {snippets.map((snippet, index) => (
              <Select.Option value={`${index}`} key={index}>
                {snippet.title}
              </Select.Option>
            ))}
          </Select>
          <FormControl.Caption>
            {selection.description && (
              <Text as="p">{selection.description}</Text>
            )}
            {markdownParser ? (
              <Markdown
                markdownParser={markdownParser}
                sanitizer={sanitizer}
                text={`\`\`\`${language}\n${selection.code}\`\`\``}
              />
            ) : (
              <code>{selection.code}</code>
            )}
          </FormControl.Caption>
        </FormControl>
      </Box>
    </Dialog>
  );
}

export default SnippetDialog;
