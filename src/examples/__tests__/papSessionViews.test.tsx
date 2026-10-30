/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// @vitest-environment jsdom

/**
 * The PAP examples that run the real SDK in the page: each one runs when asked,
 * and what it shows is evidence, never a credential.
 */

import * as React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PapAuthorizationBoundaryView from '../pap/PapAuthorizationBoundaryView';
import PapGuidedJourneyView from '../pap/PapGuidedJourneyView';
import PapSessionJwtView from '../pap/PapSessionJwtView';
import PapSessionLifecycleView from '../pap/PapSessionLifecycleView';

afterEach(cleanup);

const run = async (View: React.FC, button: string): Promise<string> => {
  const view = render(<View />);
  fireEvent.click(screen.getByRole('button', { name: button }));
  await waitFor(() => {
    expect(view.container.textContent).toMatch(/Withheld/);
  });
  return view.container.textContent ?? '';
};

describe('the PAP examples that run in the page', () => {
  it('signs a fresh Session JWT per request, bound to it, with a key per User ID', async () => {
    const shown = await run(PapSessionJwtView, 'Create safely');
    for (const held of [
      'freshJwtPerRequest',
      'methodBound',
      'urlBoundWithoutQueryOrFragment',
      'accessTokenBound',
      'namesItsSession',
      'carriesItsDelegation',
      'oneKeyPerUserId',
      'jwtRedactedByDefault',
    ]) {
      expect(shown).toMatch(new RegExp(`${held}"?:? ?true`));
    }
    expect(shown).toContain('poppy-session+jwt');
    expect(shown).not.toContain('host-only');
  });

  it('starts a Session with no request and restarts it once on invalid_session', async () => {
    const shown = await run(PapSessionLifecycleView, 'Run lifecycle');
    expect(shown).toMatch(/requestsToStartASession"?:? ?0/);
    expect(shown).toMatch(/restartedOnce"?:? ?true/);
    expect(shown).toMatch(/resentRequestStatus"?:? ?200/);
    expect(shown).toMatch(/freshJwtPerRequest"?:? ?true/);
    expect(shown).not.toContain('host-only');
  });

  it('builds a Direct Sign-In that names no Session', async () => {
    const shown = await run(PapAuthorizationBoundaryView, 'Generate safely');
    expect(shown).toMatch(/namesNoSession"?:? ?true/);
    expect(shown).not.toContain('code_challenge');
  });

  it('runs the guided journey through the real conversation client', async () => {
    const view = render(<PapGuidedJourneyView />);
    await waitFor(
      () => {
        expect(view.container.textContent).toContain(
          'Live local PAP exchange complete',
        );
      },
      { timeout: 5000 },
    );
  });
});
