/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation's files as references (REACTOR_UI RU-6): what the page holds
 * of a file is uploaded before the run, which names the ref it answers; the
 * bytes never ride in the run.
 */

import { describe, expect, it, vi } from 'vitest';
import type { FileRef } from '@datalayer/reactor/ui';
import { blobOfDataUrl, namesFiles, withUploadedFiles } from '../uiFiles';

/** A Blob's text, read as jsdom can: its Blob has no `text()`. */
const textOf = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const held = (name: string, type: string, text: string) => ({
  name,
  type,
  size: text.length,
  data_url: `data:${type};base64,${btoa(text)}`,
});

describe('withUploadedFiles', () => {
  it('uploads what the page holds and names the refs, keeping a ref as it is', async () => {
    const kept: FileRef = {
      ref: 'r-0',
      name: 'kept.csv',
      media_type: 'text/csv',
      size: 1,
    };
    const upload = vi.fn(
      async (file: Blob & { name: string }): Promise<FileRef> => ({
        ref: `r-${file.name}`,
        name: file.name,
        media_type: file.type,
        size: file.size,
      }),
    );
    const given = {
      loop: {
        settings: { tone: 'Warm' },
        files: [held('orders.csv', 'text/csv', 'a,b\n1,2\n'), kept],
      },
      voice: { said: true },
    };
    expect(namesFiles(given)).toBe(true);
    const sent = await withUploadedFiles(given, upload);
    expect(sent).toEqual({
      loop: {
        settings: { tone: 'Warm' },
        files: [
          {
            ref: 'r-orders.csv',
            name: 'orders.csv',
            media_type: 'text/csv',
            size: 8,
          },
          kept,
        ],
      },
      voice: { said: true },
    });
    expect(JSON.stringify(sent)).not.toContain('data:');
    const [[uploaded]] = upload.mock.calls;
    expect(await textOf(uploaded)).toBe('a,b\n1,2\n');
    expect(namesFiles({ loop: {} })).toBe(false);
    expect(namesFiles(undefined)).toBe(false);
  });

  it('refuses what is neither, and says an upload refused', async () => {
    await expect(
      withUploadedFiles({ loop: { files: [{ name: 'x' }] } }, vi.fn()),
    ).rejects.toThrow('neither the page’s nor a ref');
    await expect(
      withUploadedFiles(
        {
          loop: { files: [held('big.bin', 'application/octet-stream', 'xx')] },
        },
        async () => {
          throw new Error('big.bin is 2 bytes: a file is at most 1');
        },
      ),
    ).rejects.toThrow('a file is at most 1');
    expect(() => blobOfDataUrl('not a data url', 'x')).toThrow(
      'x could not be read: it is not a data URL.',
    );
  });

  it('reads a plain data URL as its text', async () => {
    const blob = blobOfDataUrl('data:text/plain,hello%20there', 'a.txt');
    expect(blob.name).toBe('a.txt');
    expect(blob.type).toBe('text/plain');
    expect(await textOf(blob)).toBe('hello there');
  });
});
