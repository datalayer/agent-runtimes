/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The results a page receives for a sign-in (REACTOR_UI RU-1), as Agent
 * Runtimes sends them: a display's model view with the whole display beside
 * it in `_meta`, or a plain `pap_sign_in` answer. Fictional company, no
 * credential.
 */

import { DISPLAY_META_KEY } from '@datalayer/reactor/ui';
import { PAP_SIGN_IN_TYPE } from '../../apps/plugins/pap-sign-in';

const EXPIRES_AT = '2026-10-12T12:15:00+00:00';
const DEVICE_PAGE = 'https://manzanita.example/device?user_code=WDJB-MJHT';
const DEVICE_CODE = 'WDJB-MJHT';

export type PapSignInCase = {
  id: string;
  label: string;
  toolName: string;
  /** What the page receives for the tool call. */
  result: Record<string, unknown>;
  explanation: string;
};

/** The results a page receives for a sign-in, as Agent Runtimes sends them. */
export const PAP_SIGN_IN_CASES: PapSignInCase[] = [
  {
    id: 'device',
    label: 'Device sign-in',
    toolName: 'pap_manzanita_example_pap_sign_in',
    explanation:
      'The model view the model read, with the whole display beside it in _meta: the page gets the link and the code, the model got neither.',
    result: {
      type: PAP_SIGN_IN_TYPE,
      text: 'Sign in at manzanita.example: open its sign-in page, shown here, and enter the code shown with it.',
      data: { mode: 'device', expires_at: EXPIRES_AT, sent_to: null },
      _meta: {
        [DISPLAY_META_KEY]: {
          type: PAP_SIGN_IN_TYPE,
          version: 1,
          id: 'sign-in-device',
          text: 'Sign in at manzanita.example: open its sign-in page, shown here, and enter the code shown with it.',
          data: {
            mode: 'device',
            open: DEVICE_PAGE,
            code: DEVICE_CODE,
            expires_at: EXPIRES_AT,
            sent_to: null,
          },
          actions: [],
        },
      },
    },
  },
  {
    id: 'direct',
    label: 'Direct sign-in',
    toolName: 'pap_manzanita_example_pap_sign_in',
    explanation:
      'A Direct Sign-In: the company’s own page, then back. No code; the page alone gets the link.',
    result: {
      type: PAP_SIGN_IN_TYPE,
      text: 'Sign in at manzanita.example: open its sign-in page, shown here, sign in there, and come back.',
      data: { mode: 'direct', expires_at: EXPIRES_AT, sent_to: null },
      _meta: {
        [DISPLAY_META_KEY]: {
          type: PAP_SIGN_IN_TYPE,
          version: 1,
          id: 'sign-in-direct',
          text: 'Sign in at manzanita.example: open its sign-in page, shown here, sign in there, and come back.',
          data: {
            mode: 'direct',
            open: 'https://manzanita.example/authorize?request_uri=urn%3Aexample',
            expires_at: EXPIRES_AT,
            sent_to: null,
          },
          actions: [],
        },
      },
    },
  },
  {
    id: 'plain',
    label: 'Plain result',
    toolName: 'pap_sign_in',
    explanation:
      'A pap_sign_in answer that carries no display: the plugin’s tool binding claims the tool by its name, and the card reads the answer itself.',
    result: {
      status: 'waiting_for_the_person',
      mode: 'device',
      open: DEVICE_PAGE,
      code: DEVICE_CODE,
      expires_at: EXPIRES_AT,
    },
  },
];

/** What the model read: the result without the page's `_meta`. */
export function modelRead(result: Record<string, unknown>): unknown {
  return Object.fromEntries(
    Object.entries(result).filter(([key]) => key !== '_meta'),
  );
}
