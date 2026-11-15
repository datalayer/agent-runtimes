/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Sign in to LinkedIn*, beside the composer, when the runtime's agents use
 * the linkedin server and it holds no live session (the user, 15 November
 * 2026), and the dialog that draws the runtime's own browser at LinkedIn's
 * login: its screenshot, refreshed while it is open, where the person clicks,
 * types and presses keys as on any page; *Done* keeps the session for the
 * server, *Cancel* keeps nothing. Never for an anonymous visitor.
 *
 * @module apps/plugins/browser-session/BrowserSessionButton
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
} from 'react';
import { Button, Flash, Text, TextInput } from '@primer/react';
import { Dialog, SkeletonText } from '@primer/react/experimental';
import { Box } from '@datalayer/primer-addons';
import { useReactorPlatform } from '@datalayer/reactor/react';
import { useIAMStore } from '../../../state';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../chat';
import { agentServerOf, type LoopWorkspaceContext } from '../../core';
import {
  BROWSER_SESSION_WORDS as WORDS,
  cancelSession,
  finishSession,
  offersSignIn,
  pagePoint,
  sessionScreenshot,
  sessionStatus,
  startSession,
  stepSession,
  type BrowserSessionPlace,
  type BrowserSessionProvider,
  type BrowserSessionStatus,
  type BrowserSessionStep,
} from './browserSession';

/** How often the open page is drawn again, in milliseconds. */
const REFRESH_MS = 1200;

/** How often the session's state is asked while nothing is open. */
const STATUS_MS = 30_000;

/**
 * The button in a LOOP workspace's chat title bar (`LoopSlots.chatHeader`):
 * the runtime its agent is on, asked with the person's token; nothing for an
 * anonymous visitor's chat.
 */
export function BrowserSessionSlot({
  workspace,
}: {
  workspace?: LoopWorkspaceContext;
}): JSX.Element | null {
  const reactor = useReactorPlatform();
  const anonymous = Boolean(
    reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME)?.anonymous,
  );
  const token = useIAMStore(state => state.token) ?? '';
  const serverUrl = workspace
    ? agentServerOf(workspace.sandbox, workspace.serverUrl)
    : undefined;
  return serverUrl && !anonymous ? (
    <BrowserSessionButton place={{ serverUrl, ...(token ? { token } : {}) }} />
  ) : null;
}

/**
 * *Sign in to <provider>* for the runtime at `place`, drawn only while its
 * agents use the provider's server and it holds no live session; what the
 * plugin's slot and `Chat`'s `browserSessions` draw.
 */
export function BrowserSessionButton({
  place,
  provider = 'linkedin',
}: {
  place: BrowserSessionPlace;
  provider?: BrowserSessionProvider;
}): JSX.Element | null {
  const [status, setStatus] = useState<BrowserSessionStatus>();
  const [open, setOpen] = useState(false);
  const placeKey = `${place.serverUrl}|${place.token ?? ''}`;
  // A runtime without the routes (older, or a deployment's, which answers
  // its application's alone) is asked once: no button, and no more asking.
  const answers = useRef(true);
  const refresh = useCallback(async () => {
    if (!answers.current) {
      return;
    }
    try {
      setStatus(await sessionStatus(place, provider));
    } catch {
      answers.current = false;
      setStatus(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, provider]);
  useEffect(() => {
    answers.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), STATUS_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  // The slot and `Chat` leave an anonymous visitor's chat out before this.
  if (!offersSignIn(status, false) && !open) {
    return null;
  }
  const name = status?.name ?? 'LinkedIn';
  return (
    <>
      <Button
        size="small"
        variant={status?.state === 'expired' ? 'danger' : 'default'}
        onClick={() => setOpen(true)}
        data-browser-session-sign-in={provider}
        title={
          status?.state === 'expired' ? WORDS.expired(name) : WORDS.why(name)
        }
      >
        {status?.state === 'expired'
          ? WORDS.signInAgain(name)
          : WORDS.signIn(name)}
      </Button>
      {open ? (
        <BrowserSessionDialog
          place={place}
          provider={provider}
          name={name}
          onClose={next => {
            setOpen(false);
            if (next) {
              setStatus(next);
            } else {
              void refresh();
            }
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The sign-in dialog nearly as wide as the window, so the provider's page is
 * read at close to its own size (1280 × 800), not shrunk into xlarge's 960
 * pixels (the user, 15 November 2026: "showing the linkedin page too small").
 */
export const BROWSER_SESSION_DIALOG_SX = {
  '&&&': {
    width: 'min(1400px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 32px)',
  },
} as const;

/**
 * The runtime's browser at the provider's login, drawn from its screenshots,
 * the person's steps sent back.
 */
export function BrowserSessionDialog({
  place,
  provider,
  name,
  onClose,
}: {
  place: BrowserSessionPlace;
  provider: BrowserSessionProvider;
  name: string;
  onClose: (status?: BrowserSessionStatus) => void;
}): JSX.Element {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [said, setSaid] = useState('');
  const [text, setText] = useState('');
  const [keeping, setKeeping] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const live = useRef(true);
  const shown = useRef('');
  const draw = useCallback(async () => {
    try {
      const blob = await sessionScreenshot(place, provider);
      if (!live.current) {
        return;
      }
      const url = URL.createObjectURL(blob);
      if (shown.current) {
        URL.revokeObjectURL(shown.current);
      }
      shown.current = url;
      setImage(url);
    } catch (failed) {
      if (live.current) {
        setError(failed instanceof Error ? failed.message : String(failed));
      }
    }
  }, [place, provider]);
  useEffect(() => {
    live.current = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    startSession(place, provider).then(
      () => {
        void draw();
        timer = setInterval(() => void draw(), REFRESH_MS);
      },
      (failed: unknown) =>
        live.current &&
        setError(failed instanceof Error ? failed.message : String(failed)),
    );
    return () => {
      live.current = false;
      if (timer) {
        clearInterval(timer);
      }
      if (shown.current) {
        URL.revokeObjectURL(shown.current);
      }
    };
    // Opened once per dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const step = useCallback(
    async (next: BrowserSessionStep) => {
      try {
        setError('');
        await stepSession(place, provider, next);
        await draw();
      } catch (failed) {
        setError(failed instanceof Error ? failed.message : String(failed));
      }
    },
    [place, provider, draw],
  );
  const onImageClick = (event: MouseEvent<HTMLImageElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const point = pagePoint(
      { x: event.clientX - box.left, y: event.clientY - box.top },
      { width: box.width, height: box.height },
    );
    void step({ kind: 'click', ...point });
  };
  const done = async () => {
    setKeeping(true);
    setError('');
    try {
      const kept = await finishSession(place, provider);
      setSaid(kept.restarted ? WORDS.kept(name) : WORDS.keptNotStarted(name));
      onClose(kept);
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : String(failed));
    } finally {
      setKeeping(false);
    }
  };
  const cancel = async () => {
    try {
      onClose(await cancelSession(place, provider));
    } catch {
      onClose();
    }
  };
  return (
    <Dialog
      title={WORDS.signIn(name)}
      onClose={() => void cancel()}
      width="xlarge"
      sx={BROWSER_SESSION_DIALOG_SX}
      footerButtons={[
        { content: WORDS.cancel, onClick: () => void cancel() },
        {
          content: keeping ? WORDS.keeping : WORDS.done,
          buttonType: 'primary',
          onClick: () => void done(),
          disabled: keeping,
        },
      ]}
    >
      <Box display="flex" flexDirection="column" gap={2}>
        <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.muted' }}>
          {WORDS.why(name)}
        </Text>
        {error ? <Flash variant="danger">{error}</Flash> : null}
        {said ? <Flash variant="success">{said}</Flash> : null}
        <Box
          border="1px solid"
          borderColor="border.default"
          borderRadius={2}
          overflow="hidden"
          width="100%"
          mx="auto"
          sx={{
            aspectRatio: '1280 / 800',
            // As large as the window's height leaves room for, the page's own shape kept.
            maxWidth: 'calc((100vh - 300px) * 1.6)',
          }}
          data-browser-session-page={provider}
        >
          {image ? (
            <img
              ref={imageRef}
              src={image}
              alt={WORDS.opening(name)}
              onClick={onImageClick}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                cursor: 'pointer',
              }}
            />
          ) : (
            <Box p={3} aria-busy="true" aria-label={WORDS.opening(name)}>
              <SkeletonText lines={6} />
            </Box>
          )}
        </Box>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextInput
            aria-label={WORDS.typeHere}
            placeholder={WORDS.typeHere}
            value={text}
            onChange={event => setText(event.target.value)}
            sx={{ flex: '1 1 240px' }}
            // Hidden as typed: a password goes through here too.
            type="password"
            autoComplete="off"
          />
          <Button
            onClick={() => {
              const typed = text;
              setText('');
              void step({ kind: 'type', text: typed });
            }}
            disabled={!text}
          >
            {WORDS.sendText}
          </Button>
          <Button onClick={() => void step({ kind: 'key', key: 'Tab' })}>
            {WORDS.tab}
          </Button>
          <Button onClick={() => void step({ kind: 'key', key: 'Backspace' })}>
            {WORDS.back}
          </Button>
          <Button onClick={() => void step({ kind: 'key', key: 'Enter' })}>
            {WORDS.enter}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

export default BrowserSessionButton;
