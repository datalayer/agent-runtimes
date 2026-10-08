/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a person sends (LOOP P-21): the kinds and sizes an application takes
 * in its composer without asking, read and written as agentspecs says them,
 * checked as it checks them, refused in the runtime's sentences before
 * anything is read, and sent once with the next message.
 */

import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { LoopRunProps, runForwardedProps } from '../core';
import { defineAppComposerPlugin, holdUploads } from '../apps/AppComposer';
import { appPreset } from '../apps/AppRenderer';
import { dumpAppspec, parseAppspec } from '../apps/appspec';
import { checkAppspec } from '../apps/checks';
import {
  acceptsFile,
  kindTakes,
  uploadsAccept,
  uploadsInWords,
  uploadsRefusal,
} from '../apps/uploads';
import { refusal } from '../../components/a2ui/datalayer/FileUpload';
import type { GivenFile } from '../../components/a2ui/datalayer/FileUpload';

const BASE = {
  schema: 'loop.app/v1',
  id: 'desk',
  name: 'Desk',
  kind: 'chat',
  agent: 'cog-crawler:0.0.1',
};

const UPLOADS = {
  kinds: [
    { type: 'image/*', max_mb: 5 },
    { type: 'application/pdf' },
    { type: '.csv', max_mb: 1.5 },
  ],
  max_files: 2,
};

const DESK = { ...BASE, interface: { uploads: UPLOADS } };

const MB = 1024 * 1024;

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const sent = (name: string, type: string, size = 10) => ({ name, type, size });

describe('what a person sends', () => {
  it('is read and written as the spec says it', () => {
    const app = parseAppspec(DESK).app;
    expect(app.interface.uploads).toEqual({
      kinds: [
        { type: 'image/*', maxMb: 5 },
        { type: 'application/pdf', maxMb: 10 },
        { type: '.csv', maxMb: 1.5 },
      ],
      maxFiles: 2,
    });
    expect(dumpAppspec(app).interface).toEqual({ uploads: UPLOADS });
    expect(parseAppspec(dumpAppspec(app)).app).toEqual(app);
    expect(parseAppspec(BASE).app.interface.uploads).toBeUndefined();
    expect(checkAppspec(DESK).problems).toEqual([]);
  });

  it('takes a kind by its type, its family or its extension', () => {
    expect(kindTakes('image/*', { name: 'a.png', type: 'image/png' })).toBe(
      true,
    );
    expect(
      kindTakes('application/pdf', {
        name: 'a',
        type: 'application/pdf; charset=binary',
      }),
    ).toBe(true);
    expect(
      kindTakes('.csv', { name: 'Orders.CSV', type: 'application/x' }),
    ).toBe(true);
    expect(
      kindTakes('audio/*', { name: 'talk.webm', type: 'video/webm' }),
    ).toBe(false);
    expect(acceptsFile(undefined, { name: 'x', type: '' })).toBe(true);
  });

  it('refuses in the runtime’s sentences', () => {
    const app = parseAppspec(DESK).app;
    expect(uploadsRefusal(app, [sent('p.png', 'image/png', 5 * MB)])).toBe(
      null,
    );
    expect(uploadsRefusal(app, [sent('p.png', 'image/png', 6 * MB)])).toBe(
      'p.png is 6.0 MB: Desk takes image/* of at most 5 MB.',
    );
    expect(uploadsRefusal(app, [sent('a.zip', 'application/zip')])).toBe(
      'a.zip is not a kind of file Desk takes: it takes image/*, application/pdf, .csv.',
    );
    expect(
      uploadsRefusal(app, [
        sent('a.csv', 'text/csv'),
        sent('b.csv', 'text/csv'),
        sent('c.csv', 'text/csv'),
      ]),
    ).toBe('3 files were sent at once: Desk takes at most 2.');
    expect(
      uploadsRefusal(parseAppspec(BASE).app, [sent('a.csv', 'text/csv')]),
    ).toBe(
      'Desk takes no file sent with a message: its Appspec names none it takes (interface.uploads).',
    );
    const uploads = app.interface.uploads!;
    expect(uploadsAccept(uploads)).toBe('image/*,application/pdf,.csv');
    expect(uploadsInWords(uploads)).toBe(
      'Takes image/* up to 5 MB, application/pdf up to 10 MB, .csv up to 1.5 MB; 2 at most at once.',
    );
  });

  it('refuses what agentspecs refuses', () => {
    const said = (uploads: unknown) =>
      checkAppspec({ ...BASE, interface: { uploads } }).problems;
    expect(said({ kinds: [] })).toContain(
      'interface.uploads.kinds: are one at least.',
    );
    expect(said({ max_files: 2 })).toContain(
      'interface.uploads.kinds: is missing.',
    );
    expect(said({ kinds: [{ type: 'Image/*' }] })).toContain(
      'interface.uploads.kinds.0.type: is a media type (application/pdf), a family (image/*) or an extension (.csv), lowercase.',
    );
    expect(
      said({ kinds: [{ type: 'image/*' }, { type: 'image/*' }] }),
    ).toContain('interface.uploads.kinds.1.type: names image/* a second time.');
    expect(said({ kinds: [{ type: 'image/*', max_mb: 26 }] })).toContain(
      'interface.uploads.kinds.0.max_mb: is more than 0 and 25 at most.',
    );
    expect(said({ kinds: [{ type: 'image/*' }], max_files: 0 })).toContain(
      'interface.uploads.max_files: is a whole number from 1 to 20.',
    );
    expect(said({ kinds: [{ type: 'image/*', accept: 'x' }] })).toContain(
      'interface.uploads.kinds.0.accept: is not a key of a kind of upload: type, max_mb.',
    );
  });

  it('reads nothing when one file is refused, and holds the rest', async () => {
    const app = parseAppspec(DESK).app;
    const read = async (file: File): Promise<GivenFile> => ({
      name: file.name,
      type: file.type,
      size: file.size,
      data_url: `data:${file.type};base64,eA==`,
    });
    const png = new File(['x'], 'p.png', { type: 'image/png' });
    const first = await holdUploads(app, [], [png], read);
    expect(first.refused).toBeNull();
    expect(first.files.map(file => file.name)).toEqual(['p.png']);
    const zip = new File(['x'], 'a.zip', { type: 'application/zip' });
    const second = await holdUploads(app, first.files, [zip], read);
    expect(second).toEqual({
      files: first.files,
      refused:
        'a.zip is not a kind of file Desk takes: it takes image/*, application/pdf, .csv.',
    });
    const third = await holdUploads(app, first.files, [png, png], read);
    expect(third.refused).toBe(
      '3 files were sent at once: Desk takes at most 2.',
    );
  });

  it('is offered in the composer only by an application that names uploads', () => {
    const names = (spec: unknown) =>
      appPreset(parseAppspec(spec).app).plugins.map(
        item => (item as { name: string }).name,
      );
    expect(names(DESK)).toContain('@datalayer/loop-plugin-app-composer-desk');
    expect(names(BASE)).not.toContain(
      '@datalayer/loop-plugin-app-composer-desk',
    );
    const plugin = defineAppComposerPlugin(parseAppspec(DESK).app);
    const props = (plugin.contributes ?? []).filter(
      (item: { point?: unknown }) => item.point === LoopRunProps,
    ) as Array<{ value: { props: () => Record<string, unknown> } }>;
    expect(props).toHaveLength(1);
    // Nothing held: nothing goes with the run.
    expect(runForwardedProps(props.map(entry => entry.value))).toEqual({});
    const plain = defineAppComposerPlugin(parseAppspec(BASE).app);
    expect(
      (plain.contributes ?? []).filter(
        (item: { point?: unknown }) => item.point === LoopRunProps,
      ),
    ).toEqual([]);
  });

  it('lets a File upload block take kinds as the spec says them', () => {
    expect(
      refusal({ name: 'p.png', size: 1, type: 'image/png' }, ['image/*'], 1),
    ).toBeNull();
    expect(
      refusal({ name: 'a.CSV', size: 1, type: '' }, ['.csv', 'image/*'], 1),
    ).toBeNull();
    expect(
      refusal({ name: 'a.txt', size: 1, type: 'text/plain' }, ['image/*'], 1),
    ).toBe('a.txt is not one it takes (image/*).');
  });

  it('holds what is attached, says a refusal, and sends the files once', async () => {
    const plugin = defineAppComposerPlugin(parseAppspec(DESK).app);
    const built = (
      plugin as unknown as {
        build: () => {
          components: Array<{ id: string; Component: () => unknown }>;
        };
      }
    ).build();
    const attach = built.components.find(item => item.id === 'app-uploads')!;
    const [props] = (plugin.contributes ?? []).filter(
      (item: { point?: unknown }) => item.point === LoopRunProps,
    ) as Array<{ value: { props: () => Record<string, unknown> } }>;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(attach.Component as () => null));
    });
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toBe('image/*,application/pdf,.csv');
    expect(input.multiple).toBe(true);
    const give = async (file: File) => {
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      });
      await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // FileReader reports on a later task.
      await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    };
    await give(new File(['x'], 'a.zip', { type: 'application/zip' }));
    expect(container.textContent).toContain(
      'a.zip is not a kind of file Desk takes',
    );
    expect(props.value.props()).toEqual({});
    await give(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    expect(container.textContent).toContain('a.pdf');
    expect(container.textContent).not.toContain('is not a kind');
    let sentNow: Record<string, unknown> = {};
    await act(async () => {
      sentNow = props.value.props();
    });
    const files = (sentNow.loop as { files: GivenFile[] }).files;
    expect(files.map(file => [file.name, file.type])).toEqual([
      ['a.pdf', 'application/pdf'],
    ]);
    expect(files[0].data_url.startsWith('data:application/pdf;base64,')).toBe(
      true,
    );
    // Sent once: the next message carries none.
    expect(props.value.props()).toEqual({});
    await act(async () => root.unmount());
    container.remove();
  });
});
