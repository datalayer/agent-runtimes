/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Why an AG-UI run was not answered, in the page's own words (LOOP F-15):
 * the page says the agent is not on this runtime instead of
 * `AG-UI request failed: 404`, and says the platform's own sentence
 * whenever the refusal carried one.
 */

import { describe, expect, it } from 'vitest';
import {
  AG_UI_NOT_ALLOWED,
  AG_UI_NOT_ON_RUNTIME,
  agUiRefusal,
  refusalBody,
  refusalDetail,
} from '../agUiRefusal';

describe('what the page says of an AG-UI refusal (F-15)', () => {
  it('says the agent is not on this runtime, never the bare status, on a 404', () => {
    expect(agUiRefusal(404, 'Not Found')).toBe(AG_UI_NOT_ON_RUNTIME);
    expect(agUiRefusal(404, 'Not Found')).not.toContain('AG-UI request failed');
    // What the person is told to do about it.
    expect(AG_UI_NOT_ON_RUNTIME).toContain('runs its code in the browser');
    expect(AG_UI_NOT_ON_RUNTIME).toContain('run it in the page');
    expect(AG_UI_NOT_ON_RUNTIME).toContain('eval, jupyter-server');
  });

  it('says it on the page’s own origin too, where the 404 is HTML and carries no detail', () => {
    const html = '<!doctype html><title>404</title>';
    expect(agUiRefusal(404, 'Not Found', html)).toBe(AG_UI_NOT_ON_RUNTIME);
  });

  it('says the platform’s own sentence when the refusal carried one', () => {
    // What the runtime answers for an agent whose sandbox is the page's
    // (`browser_sandbox_refusal`): about this agent, so it wins over ours.
    const said =
      'jupyter-notebook-reviewer runs its code in the browser: it is not started on a runtime. ' +
      'Give it a sandbox a runtime has (eval, jupyter-server), or run it in the page.';
    expect(
      agUiRefusal(
        422,
        'Unprocessable Entity',
        JSON.stringify({ detail: said }),
      ),
    ).toBe(said);
    expect(
      agUiRefusal(404, 'Not Found', JSON.stringify({ detail: said })),
    ).toBe(said);
  });

  it('says the caller was refused on a 401 and a 403', () => {
    expect(agUiRefusal(401, 'Unauthorized')).toBe(AG_UI_NOT_ALLOWED);
    expect(agUiRefusal(403, 'Forbidden')).toBe(AG_UI_NOT_ALLOWED);
  });

  it('keeps the status for anything it has nothing better for', () => {
    expect(agUiRefusal(500, 'Internal Server Error')).toBe(
      'AG-UI request failed: 500 Internal Server Error',
    );
    expect(agUiRefusal(502, '')).toBe('AG-UI request failed: 502');
  });

  it('reads a detail only out of a JSON object that has one', () => {
    expect(refusalDetail(undefined)).toBe('');
    expect(refusalDetail('')).toBe('');
    expect(refusalDetail('not json')).toBe('');
    expect(refusalDetail('[]')).toBe('');
    expect(refusalDetail('null')).toBe('');
    expect(refusalDetail('{"detail": 7}')).toBe('');
    expect(refusalDetail('{"detail": "  said  "}')).toBe('said');
  });

  it('reads the body without letting the reading throw', async () => {
    expect(await refusalBody({ text: async () => 'said' })).toBe('said');
    expect(
      await refusalBody({
        text: async () => {
          throw new Error('already read');
        },
      }),
    ).toBeUndefined();
  });
});
