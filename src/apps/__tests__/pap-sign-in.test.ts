/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Sign in at a company* in the chat (AGENT_PROTOCOLS PI-56): the gateway's
 * `pap_sign_in` answer read whole, whatever wraps it, and only an `https`
 * page ever shown.
 */

import { describe, expect, it } from 'vitest';
import {
  PAP_SIGN_IN_WORDS,
  isPapSignInTool,
  readPapSignIn,
  safeSignInUrl,
} from '../plugins/pap-sign-in/signIn';

const DEVICE = {
  status: 'waiting_for_the_person',
  mode: 'device',
  open: 'https://manzanita.example/device?user_code=WDJB-MJHT',
  code: 'WDJB-MJHT',
  expires_at: '2026-10-11T12:15:00+00:00',
};

describe('pap_sign_in in the chat', () => {
  it('knows the tool by its name, with or without a prefix', () => {
    expect(isPapSignInTool('pap_sign_in')).toBe(true);
    expect(isPapSignInTool('datalayer__pap_sign_in')).toBe(true);
    expect(isPapSignInTool('pap.pap_sign_in')).toBe(true);
    expect(isPapSignInTool('pap_sign_in_status')).toBe(false);
    expect(isPapSignInTool('notpap_sign_in')).toBe(false);
  });

  it('reads a device sign-in: the page, its domain, the code, until when', () => {
    expect(readPapSignIn(DEVICE)).toEqual({
      mode: 'device',
      open: 'https://manzanita.example/device?user_code=WDJB-MJHT',
      host: 'manzanita.example',
      code: 'WDJB-MJHT',
      expiresAt: '2026-10-11T12:15:00+00:00',
    });
  });

  it('reads it as JSON, as MCP text content, or as structured content', () => {
    const expected = readPapSignIn(DEVICE);
    expect(readPapSignIn(JSON.stringify(DEVICE))).toEqual(expected);
    expect(
      readPapSignIn({
        content: [{ type: 'text', text: JSON.stringify(DEVICE) }],
      }),
    ).toEqual(expected);
    expect(readPapSignIn({ structuredContent: DEVICE })).toEqual(expected);
    expect(readPapSignIn({ result: DEVICE })).toEqual(expected);
  });

  it('reads a direct sign-in, with no code', () => {
    expect(
      readPapSignIn({
        status: 'waiting_for_the_person',
        mode: 'direct',
        open: 'https://manzanita.example/authorize?x=1',
      }),
    ).toEqual({
      mode: 'direct',
      open: 'https://manzanita.example/authorize?x=1',
      host: 'manzanita.example',
    });
  });

  it('leaves any other answer to the chat’s own row', () => {
    expect(readPapSignIn({ status: 'unavailable', reason: 'no' })).toBeNull();
    expect(readPapSignIn({ ...DEVICE, mode: 'mediated' })).toBeNull();
    expect(readPapSignIn({ ...DEVICE, code: '' })).toBeNull();
    expect(readPapSignIn('not json')).toBeNull();
    expect(readPapSignIn(undefined)).toBeNull();
  });

  it('never shows a page that is not https', () => {
    for (const open of [
      'http://manzanita.example/device',
      'javascript:alert(1)',
      'data:text/html,x',
      '',
    ]) {
      expect(readPapSignIn({ ...DEVICE, open })).toEqual({
        refused: PAP_SIGN_IN_WORDS.refused,
      });
    }
    expect(safeSignInUrl('https://manzanita.example/x')?.hostname).toBe(
      'manzanita.example',
    );
    expect(safeSignInUrl(42)).toBeNull();
  });
});
