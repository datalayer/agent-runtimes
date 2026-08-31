/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the chat says when the visitor's trial key runs out.
 *
 * The end of a trial of anonymous inference is a fact worth stating plainly.
 * Left unsaid it arrives as an agent that has stopped answering, and a reader
 * with no account has no way to tell that apart from a broken one — so this
 * takes the conversation's place and says which of the two happened, and what
 * to do about it.
 *
 * The form is `SignInSimple`, the same one the examples and the landing use,
 * rather than a second sign-in written for this panel: a person who signs in
 * here should end up in exactly the state they would have been in had they
 * signed in first.
 *
 * Signing in is enough. The key is read from the IAM store on every render of
 * the chat, so a member's token replaces the dead trial one where it stands —
 * no reload, and the conversation is still underneath.
 *
 * @module components/anonymous/AnonymousKeyExpired
 */

import { useCallback } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { KeyIcon } from '@primer/octicons-react';
import { SignInSimple } from '@datalayer/core/lib/views/iam';

import { useCoreStore, iamStore } from '../../state';
import { useAnonymousSessionStore } from '../../runtimes/browser/anonymousToken';

export type AnonymousKeyExpiredProps = {
  /**
   * What the visitor was talking to, named so the panel is about their
   * conversation rather than about authentication in general.
   */
  agentName?: string;
  /**
   * Whether anything else on the page still works without a key.
   *
   * True where the code runs in the browser: the kernel owes nothing to the
   * inference service, so the notebook beside the chat is unaffected and
   * saying so is the difference between "the agent stopped" and "the page
   * broke".
   */
  sandboxStillRuns?: boolean;
  /**
   * Whether the credential that ran out was the anonymous trial key.
   *
   * It decides the wording, and the difference is not cosmetic. "Your
   * temporary key has expired" is true of a visitor who never signed in and
   * simply wrong for a member whose own session ran out — that reader would
   * go looking for a temporary key they never had, and conclude the page had
   * confused them with somebody else.
   *
   * Defaults to the trial, because that is the only credential this panel
   * could describe when it was written and every existing caller means it.
   */
  temporary?: boolean;
  /** Called after a successful sign-in, once the token is stored. */
  onSignedIn?: () => void;
};

export function AnonymousKeyExpired({
  agentName,
  sandboxStillRuns = false,
  temporary = true,
  onSignedIn,
}: AnonymousKeyExpiredProps): JSX.Element {
  const { configuration } = useCoreStore();

  const handleSignIn = useCallback(
    (token: string) => {
      /*
       * Through the store's own check, not by writing the token into it.
       *
       * `checkIAMToken` fetches the user the token belongs to and stores both,
       * which is what every other sign-in in the product does — setting the
       * token alone would have left the rest of the page believing nobody was
       * signed in, since what it looks at is the user. The agent works either
       * way; the header above it would not have noticed.
       */
      void iamStore.getState().checkIAMToken(token);
      // And the trial key goes: it is spent, and a session left sitting in
      // `expired` would keep this panel on screen over a working chat.
      useAnonymousSessionStore.getState().clear();
      onSignedIn?.();
    },
    [onSignedIn],
  );

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        bg: 'canvas.default',
        px: 4,
        py: 4,
      }}
    >
      <Box sx={{ maxWidth: 440, mx: 'auto' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            color: 'attention.fg',
            mb: 2,
          }}
        >
          <KeyIcon size={20} />
          <Text
            sx={{ fontSize: 2, fontWeight: 'semibold', color: 'fg.default' }}
          >
            {temporary
              ? 'Your temporary key has expired'
              : 'Your key has expired'}
          </Text>
        </Box>
        <Text
          as="p"
          sx={{
            fontSize: 1,
            color: 'fg.muted',
            textAlign: 'center',
            mb: 3,
          }}
        >
          {/*
            Two facts, and neither is the one in the heading above.

            That the key expired is already said, in larger type, an inch up —
            so this says who stopped and what did not. The second half is the
            one worth the words: a reader watching the agent go quiet has every
            reason to assume the page broke, and the notebook beside them is
            still perfectly alive.
          */}
          {agentName ?? 'The agent'}{' '}
          {temporary
            ? 'was answering on a trial key.'
            : 'stopped because your session ran out.'}
          {sandboxStillRuns
            ? ' Your notebook keeps running — it lives in this page.'
            : ''}
        </Text>

        <SignInSimple
          // The panel above has already said what happened and why; the form's
          // own hero would say it a second time, in a bigger font.
          hideHero
          fillHeight={false}
          calloutTitle="Sign in to keep going"
          // What an account is, in the terms the last minute made vivid: the
          // three things they just ran out of.
          calloutDescription="Your agents with hosted MCP, and no clock."
          /*
            The social providers, which is how most people will do this.

            Somebody whose trial just ran out mid-question is not going to
            invent a password: the fastest door is the only one worth putting
            first, and the form puts these above the handle-and-password
            fields. All three, because which one a person has is not something
            this panel can know.

            The flow leaves the page and comes back to the host's own
            `/iam/oauth2/<provider>/callback`. Both hosts that mount this
            workspace answer that route — the landing has it in its router and
            the examples shell handles it in `main.tsx` — so the buttons are on
            rather than configurable. A host that adds neither would strand
            somebody who clicked, and that is the thing to check before
            embedding this somewhere new.
          */
          github
          google
          linkedin
          /*
            And back to the page they were reading.

            The form only forwards the current route when it is not `/`, which
            is exactly the landing page this workspace sits on — so without
            saying it explicitly, a visitor who signed in from the home page
            would have been returned to the home page by accident rather than
            on purpose, and from anywhere else would have lost their place.
          */
          socialSignInNavigationTarget={
            typeof window === 'undefined'
              ? undefined
              : `${window.location.pathname}${window.location.search}`
          }
          // Where this deployment's IAM is. Left to the form when nothing says
          // — it reads the page's own config, which is right for a host that
          // has one and harmless for one that does not.
          loginUrl={
            configuration?.iamUrl
              ? `${configuration.iamUrl}/api/iam/v1/login`
              : undefined
          }
          onSignIn={handleSignIn}
        />
      </Box>
    </Box>
  );
}

export default AnonymousKeyExpired;
