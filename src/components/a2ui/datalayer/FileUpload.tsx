/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * File upload (LOOP C-18): a file a person gives the application — chosen
 * with *Choose a file*, or dropped on the block. One of a kind it does not
 * accept, or larger than it takes, is refused in words and never sent. What
 * it takes is read and written where its `files` binding points, as a list
 * of `{name, type, size, data_url}` — the content as a data URL, which any
 * transport carries — and then its action is dispatched, so the action's
 * context reads the files just given, as a basic input's action reads its
 * value.
 *
 * @module components/a2ui/datalayer/FileUpload
 */

import { useId, useRef, useState, type DragEvent } from 'react';
import { Button, Text } from '@primer/react';
import { UploadIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { BlockFrame, CARD_RADIUS, Problem, Quiet, isRecord } from './parts';
import { ownImplementation, type OwnCommon } from './implementation';
import { acceptsFile } from '../../../loop/apps/uploads';

export type FileUploadProps = OwnCommon & {
  label: string;
  accept?: string[];
  multiple?: boolean;
  max_mb?: number;
  files?: unknown;
  setFiles: (files: GivenFile[]) => void;
};

/** A file as the application receives it. */
export type GivenFile = {
  name: string;
  type: string;
  size: number;
  data_url: string;
};

/** The default the catalog gives `max_mb`. */
const MAX_MB = 25;

/**
 * Why a file is refused, or `null` when it is taken: its kinds are
 * extensions (`.csv`), media types (`application/pdf`) or families
 * (`image/*`), as the Appspec's uploads say them (LOOP P-21).
 */
export function refusal(
  file: Pick<File, 'name' | 'size'> & { type?: string },
  accept: string[] | undefined,
  maxMb: number,
): string | null {
  if (!acceptsFile(accept, { name: file.name, type: file.type ?? '' })) {
    return `${file.name} is not one it takes (${(accept ?? []).join(', ')}).`;
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `${file.name} is larger than ${maxMb} MB.`;
  }
  return null;
}

/** A file as the application receives it: its content as a data URL. */
export const readFile = (file: File): Promise<GivenFile> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        data_url: String(reader.result),
      });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function FileUploadView({ props }: { props: FileUploadProps }) {
  const { label, accept, multiple = false, setFiles, action } = props;
  const maxMb = props.max_mb ?? MAX_MB;
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [over, setOver] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const given = Array.isArray(props.files)
    ? props.files.filter(isRecord).map(file => String(file.name ?? ''))
    : [];

  const give = async (list: FileList | File[]) => {
    const files = Array.from(list);
    const chosen = multiple ? files : files.slice(0, 1);
    const refused = chosen
      .map(file => refusal(file, accept, maxMb))
      .filter((reason): reason is string => reason !== null);
    if (!multiple && files.length > 1) {
      refused.push('It takes one file at a time.');
    }
    setProblems(refused);
    if (refused.length) {
      return;
    }
    setFiles(await Promise.all(chosen.map(readFile)));
    action?.();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void give(event.dataTransfer.files);
  };

  const hint = [
    accept?.length ? `Takes ${accept.join(', ')}` : 'Takes any file',
    `up to ${maxMb} MB`,
    multiple ? 'several at once' : 'one at a time',
  ].join(', ');

  return (
    <BlockFrame label={label} weight={props.weight} testId="a2ui-fileupload">
      <Box
        onDragOver={(event: DragEvent) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-testid="a2ui-fileupload-drop"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          p: 3,
          border: '1px dashed',
          borderColor: over ? 'accent.fg' : 'border.default',
          borderRadius: CARD_RADIUS,
          bg: over ? 'accent.subtle' : 'canvas.subtle',
          textAlign: 'center',
        }}
      >
        <Text sx={{ fontWeight: 'semibold' }}>{label}</Text>
        <Button
          leadingVisual={UploadIcon}
          aria-describedby={hintId}
          onClick={() => input.current?.click()}
        >
          {multiple ? 'Choose files' : 'Choose a file'}
        </Button>
        <Text id={hintId} sx={{ fontSize: 0, color: 'fg.muted' }}>
          or drop {multiple ? 'them' : 'it'} here. {hint}.
        </Text>
        <input
          ref={input}
          type="file"
          hidden
          aria-label={label}
          accept={accept?.join(',')}
          multiple={multiple}
          onChange={event => {
            if (event.target.files) {
              void give(event.target.files);
            }
            event.target.value = '';
          }}
        />
      </Box>
      {problems.map(problem => (
        <Problem key={problem}>{problem}</Problem>
      ))}
      {given.length ? <Quiet>Given: {given.join(', ')}</Quiet> : null}
    </BlockFrame>
  );
}

export const FileUpload = ownImplementation<FileUploadProps>(
  'FileUpload',
  FileUploadView,
);
