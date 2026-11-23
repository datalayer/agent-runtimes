/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { PAGE_TOOL_RESULTS } from '../toolCards/toolResults';
import {
  PAGE_REACT_FLOW,
  REACT_FLOW_TOOL_NAMES,
  addUserShape,
  pageReactFlowTools,
} from '../plugins/page-react-flow/store';

const call = (name: string, args: Record<string, unknown> = {}) =>
  pageReactFlowTools().find(tool => tool.name === name)!.handler!(
    args,
  ) as Promise<Record<string, unknown>>;

afterEach(() => {
  PAGE_TOOL_RESULTS.clear();
  PAGE_REACT_FLOW.reset();
});

describe('the React Flow tools in the page', () => {
  it('offer the four requested tools', () => {
    expect(pageReactFlowTools().map(tool => tool.name)).toEqual([
      ...REACT_FLOW_TOOL_NAMES,
    ]);
  });

  it('return stable shape IDs which subsequent calls move and link', async () => {
    const source = await call('insert_shape', {
      label: 'Browser',
      x: 20,
      y: 30,
    });
    const target = await call('insert_shape', { label: 'API' });
    expect(source).toMatchObject({ ok: true, id: 'shape-1' });
    expect(target).toMatchObject({ ok: true, id: 'shape-2' });

    expect(
      await call('link_shapes', {
        source_id: source.id,
        target_id: target.id,
        label: 'HTTPS',
      }),
    ).toMatchObject({ ok: true, id: 'link-1' });
    expect(
      await call('move_shape', { shape_id: target.id, x: 420, y: 80 }),
    ).toMatchObject({
      ok: true,
      shape: { id: 'shape-2', position: { x: 420, y: 80 } },
    });
  });

  it('lists shapes the person added or moved on the same canvas', async () => {
    expect(addUserShape({ x: 75, y: 125 })).toBe('shape-1');
    const listed = await call('list_shapes');
    expect(listed).toMatchObject({
      ok: true,
      shapes: [
        {
          id: 'shape-1',
          label: 'Shape 1',
          position: { x: 75, y: 125 },
        },
      ],
    });
  });

  it('refuses links and moves whose stable ID is not on the canvas', async () => {
    expect(
      await call('link_shapes', {
        source_id: 'shape-404',
        target_id: 'shape-405',
      }),
    ).toMatchObject({ ok: false, error: "There is no shape 'shape-404'." });
    expect(
      await call('move_shape', { shape_id: 'shape-404', x: 0, y: 0 }),
    ).toMatchObject({ ok: false, error: "There is no shape 'shape-404'." });
  });
});
