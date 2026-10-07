/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A file to download (STUDIO P-04): what an application gives to save — a
 * report, a sheet, an export — by its name and its link, an http(s) link or
 * the file itself as a `data:` URL. Its kind and size are said beside its
 * name, its description under it. Pressing it saves the file under its name
 * and dispatches the block's action (its `download` event), when it has one.
 * A link of any other scheme is not followed: the block says so.
 *
 * @module components/a2ui/datalayer/Download
 */

import { useMemo } from 'react';
import { Link, Text } from '@primer/react';
import { DownloadIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { BlockFrame, Problem } from './parts';
import { ownImplementation, type OwnCommon } from './implementation';

export type DownloadProps = OwnCommon & {
  name?: string;
  url?: string;
  media_type?: string;
  size?: number;
  description?: string;
};

/** The schemes a file is fetched by: the web's, or the file itself. */
const SCHEMES = /^(https?:\/\/|data:)/i;

/** How large a file is, in words. */
export function sizeInWords(size: number | undefined): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return '';
  }
  if (size < 1024) {
    return size === 1 ? '1 byte' : `${size} bytes`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** The file a block offers, or why it cannot offer it. */
export function downloadOf(
  props: Pick<DownloadProps, 'name' | 'url'>,
): { name: string; url: string } | { problem: string } {
  const name = typeof props.name === 'string' ? props.name.trim() : '';
  const url = typeof props.url === 'string' ? props.url.trim() : '';
  if (!name) {
    return { problem: 'This file has no name.' };
  }
  if (!url) {
    return { problem: `${name} has no link.` };
  }
  if (!SCHEMES.test(url)) {
    return {
      problem: `${name} is not offered: its link is neither an http(s) link nor a data: URL.`,
    };
  }
  return { name, url };
}

export function DownloadView({ props }: { props: DownloadProps }) {
  const { action } = props;
  const offered = useMemo(
    () => downloadOf({ name: props.name, url: props.url }),
    [props.name, props.url],
  );
  const said = [props.media_type, sizeInWords(props.size)]
    .filter(Boolean)
    .join(' · ');
  return (
    <BlockFrame
      label="File to download"
      weight={props.weight}
      testId="a2ui-download"
    >
      {'problem' in offered ? (
        <Problem>{offered.problem}</Problem>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Box sx={{ color: 'fg.muted', pt: '2px' }}>
            <DownloadIcon size={16} aria-hidden="true" />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box>
              <Link
                href={offered.url}
                download={offered.name}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => action?.()}
                sx={{ fontWeight: 'semibold', wordBreak: 'break-word' }}
              >
                {offered.name}
              </Link>
              {said ? (
                <Text sx={{ color: 'fg.muted', fontSize: 1, ml: 2 }}>
                  {said}
                </Text>
              ) : null}
            </Box>
            {props.description ? (
              <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                {props.description}
              </Text>
            ) : null}
          </Box>
        </Box>
      )}
    </BlockFrame>
  );
}

export const Download = ownImplementation<DownloadProps>(
  'Download',
  DownloadView,
);
