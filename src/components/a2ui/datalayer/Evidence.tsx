/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Evidence (LOOP C-18): what an answer rests on — the sources it opened,
 * each with its link and the passage cited from it. A source is
 * `{title, url, passage}` (a title or a link at least); the first
 * `max_items` show, the rest behind *more*. Opening a source opens its link
 * in a new tab and dispatches the block's action (its `open` event), when it
 * has one.
 *
 * @module components/a2ui/datalayer/Evidence
 */

import { useMemo, useState } from 'react';
import { Button, Link, Text } from '@primer/react';
import { LinkExternalIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { BlockFrame, Problem, Quiet, asWords, isRecord } from './parts';
import { ownImplementation, type OwnCommon } from './implementation';

export type EvidenceProps = OwnCommon & {
  title?: string;
  show_passages?: boolean;
  max_items?: number;
  sources?: unknown;
};

export type Source = { title: string; url: string; passage: string };

/** The defaults the catalog gives. */
const TITLE = 'Sources';
const MAX_ITEMS = 5;

/** The sources a block can show, or why it cannot. */
export function evidenceSources(
  sources: unknown,
): { sources: Source[] } | { problem: string } {
  if (sources === undefined || sources === null) {
    return { sources: [] };
  }
  if (!Array.isArray(sources)) {
    return { problem: 'What it shows is not a list of sources.' };
  }
  const read: Source[] = [];
  for (const [index, source] of sources.entries()) {
    if (!isRecord(source) || (!source.title && !source.url)) {
      return {
        problem: `Source ${index + 1} has neither a title nor a link.`,
      };
    }
    read.push({
      title: asWords(source.title) || asWords(source.url),
      url: asWords(source.url),
      passage: asWords(source.passage),
    });
  }
  return { sources: read };
}

export function EvidenceView({ props }: { props: EvidenceProps }) {
  const { show_passages: showPassages = true, action } = props;
  const title = props.title ?? TITLE;
  const maxItems = props.max_items ?? MAX_ITEMS;
  const read = useMemo(() => evidenceSources(props.sources), [props.sources]);
  const [all, setAll] = useState(false);
  const sources = 'sources' in read ? read.sources : [];
  const shown = all ? sources : sources.slice(0, maxItems);
  const hidden = sources.length - shown.length;
  return (
    <BlockFrame
      title={title}
      label="Evidence"
      weight={props.weight}
      testId="a2ui-evidence"
    >
      {'problem' in read ? (
        <Problem>{read.problem}</Problem>
      ) : sources.length === 0 ? (
        <Quiet>Nothing cited yet.</Quiet>
      ) : (
        <Box as="ol" m={0} pl={3} display="flex" flexDirection="column" gap={2}>
          {shown.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              {source.url ? (
                <Link
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => action?.()}
                  sx={{ fontWeight: 'semibold' }}
                >
                  {source.title}{' '}
                  <LinkExternalIcon size={12} aria-label="opens in a new tab" />
                </Link>
              ) : (
                <Text sx={{ fontWeight: 'semibold' }}>{source.title}</Text>
              )}
              {showPassages && source.passage ? (
                <Box
                  as="blockquote"
                  m={0}
                  mt={1}
                  pl={2}
                  borderLeft="3px solid"
                  borderColor="border.default"
                  color="fg.muted"
                  fontSize={1}
                >
                  {source.passage}
                </Box>
              ) : null}
            </li>
          ))}
        </Box>
      )}
      {hidden > 0 ? (
        <Box>
          <Button size="small" variant="invisible" onClick={() => setAll(true)}>
            {hidden} more
          </Button>
        </Box>
      ) : null}
    </BlockFrame>
  );
}

export const Evidence = ownImplementation<EvidenceProps>(
  'Evidence',
  EvidenceView,
);
