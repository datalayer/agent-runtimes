/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's computer, beside its page (LOOP R-23, R-01b): the sandbox
 * its agent runs on, live.
 *
 * - its **parts** — browse, files, shell — on or off, as its permissions say;
 *   a part off gives its agent no tool, and is said to be off;
 * - **what ran on it**: the code its agent ran and the files it read and
 *   wrote, each with what came back, streamed from the conversation's tool
 *   calls;
 * - its **files**, read-only, each to download, read again as each turn ends;
 * - its **browser**, when browse is on: the page it has open, live — a
 *   screenshot read again every moment;
 * - **Take over**: what runs on it is interrupted and its agent's calls to it
 *   wait while the person runs code on it themselves, and clicks and types
 *   in its page — a click on the screenshot is a click there; **Hand back**
 *   lets its agent go on.
 *
 * @module apps/plugins/app-computer/AppComputer
 */

import type { JSX, KeyboardEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Heading,
  Label,
  Spinner,
  Text,
  TextInput,
  Textarea,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import { useIAMStore } from '@datalayer/core/lib/state/substates/IAMState';
import type { AppSpec } from '../../../types/agentspecs';
import { useChatWords } from '../../../chat/ChatLanguage';
import {
  LoopChatTurn,
  agentServerOf,
  noRuntimeSaid,
  IDLE_SANDBOX_SNAPSHOT,
  type ChatTurnSnapshot,
  type ConversationEntry,
  type LoopWorkspaceContext,
} from '../../core';
import {
  BROWSER_KEYS,
  COMPUTER_PARTS,
  COMPUTER_WORDS,
  clickOnBrowser,
  computerParts,
  downloadComputerFile,
  handBackComputer,
  hasComputer,
  listComputerFiles,
  openOnBrowser,
  parentOf,
  partsOff,
  pointOnPage,
  pressOnBrowser,
  readBrowserScreenshot,
  readComputer,
  runOnComputer,
  scrollBrowser,
  takeOverComputer,
  terminalEntries,
  typeOnBrowser,
  type BrowserPage,
  type ComputerContext,
  type ComputerFile,
  type ComputerState,
  type RunOutput,
} from '../../apps/computer';

const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });
const NO_CONVERSATION = signal<ConversationEntry[]>([]);

const MONO_FACE =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

const MONO = {
  fontFamily: MONO_FACE,
  fontSize: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  m: 0,
} as const;

function Parts({ app }: { app: AppSpec }): JSX.Element {
  const parts = computerParts(app);
  const off = partsOff(parts);
  return (
    <Box data-testid="computer-parts">
      <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
        {COMPUTER_PARTS.map(part => (
          <Label
            key={part}
            variant={parts[part] ? 'success' : 'secondary'}
            data-part={part}
            data-on={parts[part] ? 'true' : 'false'}
          >
            {COMPUTER_WORDS.part[part]}:{' '}
            {parts[part] ? COMPUTER_WORDS.on : COMPUTER_WORDS.off}
          </Label>
        ))}
      </Box>
      {off.length > 0 && off.length < COMPUTER_PARTS.length ? (
        <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
          {COMPUTER_WORDS.offSaid(off)}
        </Text>
      ) : null}
    </Box>
  );
}

function Terminal({
  conversation,
}: {
  conversation: readonly ConversationEntry[];
}): JSX.Element {
  const entries = terminalEntries(conversation);
  return (
    <Box data-testid="computer-terminal">
      <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 1 }}>
        {COMPUTER_WORDS.terminal}
      </Heading>
      {entries.length === 0 ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {COMPUTER_WORDS.nothingRan}
        </Text>
      ) : (
        <Box
          bg="canvas.inset"
          border="1px solid"
          borderColor="border.muted"
          borderRadius={2}
          p={2}
          maxHeight={320}
          overflow="auto"
        >
          {entries.map((entry, index) => (
            <Box key={index} mb={2}>
              <Text as="p" sx={{ ...MONO, fontWeight: 'semibold' }}>
                {`$ ${entry.tool}${entry.command ? `: ${entry.command}` : ''}`}
              </Text>
              {entry.output === undefined ? (
                <Spinner size="small" />
              ) : (
                <Text as="pre" sx={{ ...MONO, color: 'fg.muted' }}>
                  {entry.output}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function save(blob: Blob, name: string): void {
  // A file of its computer is saved, never opened: its address on this page's
  // origin carries no type a browser would draw (STUDIO D-22).
  const url = URL.createObjectURL(
    new Blob([blob], { type: 'application/octet-stream' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Files({
  context,
  state,
  ended,
}: {
  context: ComputerContext;
  state: ComputerState;
  ended: number;
}): JSX.Element {
  const [path, setPath] = useState('.');
  const [entries, setEntries] = useState<ComputerFile[] | undefined>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!state.started) {
      return undefined;
    }
    let cancelled = false;
    listComputerFiles(context, path).then(
      found => {
        if (!cancelled) {
          setEntries(found);
          setError('');
        }
      },
      (failed: unknown) =>
        !cancelled &&
        setError(failed instanceof Error ? failed.message : String(failed)),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.serverUrl,
    context.agentId,
    context.token,
    path,
    state.started,
    ended,
  ]);
  return (
    <Box data-testid="computer-files">
      <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 1 }}>
        {COMPUTER_WORDS.files}
        {path !== '.' ? (
          <Text sx={{ fontWeight: 'normal', color: 'fg.muted' }}>
            {` · ${path}`}
          </Text>
        ) : null}
      </Heading>
      {!state.started ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {COMPUTER_WORDS.notStarted}
        </Text>
      ) : error ? (
        <Text as="p" sx={{ fontSize: 1, color: 'danger.fg', m: 0 }}>
          {error}
        </Text>
      ) : !entries ? (
        <Spinner size="small" />
      ) : (
        <Box as="ul" listStyle="none" p={0} m={0}>
          {path !== '.' ? (
            <Box as="li">
              <Button
                size="small"
                variant="invisible"
                onClick={() => setPath(parentOf(path))}
              >
                {COMPUTER_WORDS.up}
              </Button>
            </Box>
          ) : null}
          {entries.length === 0 ? (
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
              {COMPUTER_WORDS.emptyDirectory}
            </Text>
          ) : null}
          {entries.map(entry => (
            <Box
              as="li"
              key={entry.path}
              data-path={entry.path}
              display="flex"
              alignItems="center"
              gap={2}
              fontSize={1}
              py={1}
              borderTop="1px solid"
              borderColor="border.muted"
            >
              {entry.type === 'directory' ? (
                <Button
                  size="small"
                  variant="invisible"
                  onClick={() => setPath(entry.path)}
                >
                  {`${entry.name}/`}
                </Button>
              ) : (
                <>
                  <Text sx={{ flex: 1, fontFamily: MONO_FACE, fontSize: 0 }}>
                    {entry.name}
                  </Text>
                  <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                    {`${entry.size.toLocaleString('en')} bytes`}
                  </Text>
                  <Button
                    size="small"
                    aria-label={`${COMPUTER_WORDS.download} ${entry.name}`}
                    onClick={() => {
                      downloadComputerFile(context, entry.path).then(
                        blob => save(blob, entry.name),
                        (failed: unknown) =>
                          setError(
                            failed instanceof Error
                              ? failed.message
                              : String(failed),
                          ),
                      );
                    }}
                  >
                    {COMPUTER_WORDS.download}
                  </Button>
                </>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** How often the page its browser shows is read again, in milliseconds. */
export const BROWSER_POLL_MS = 1500;

function BrowserView({
  context,
  state,
  mine,
}: {
  context: ComputerContext;
  state: ComputerState;
  mine: boolean;
}): JSX.Element {
  const [shot, setShot] = useState<string | undefined>();
  const [none, setNone] = useState(false);
  const [page, setPage] = useState<BrowserPage | null | undefined>(state.page);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [address, setAddress] = useState('');
  const [asked, setAsked] = useState(0);
  const shown = useRef<string | undefined>(undefined);
  useEffect(() => setPage(state.page), [state.page]);
  useEffect(() => {
    if (!state.browser) {
      return undefined;
    }
    let cancelled = false;
    const look = () =>
      readBrowserScreenshot(context).then(
        blob => {
          if (cancelled) {
            return;
          }
          setError('');
          setNone(!blob);
          if (shown.current) {
            URL.revokeObjectURL(shown.current);
          }
          shown.current = blob ? URL.createObjectURL(blob) : undefined;
          setShot(shown.current);
        },
        (failed: unknown) =>
          !cancelled &&
          setError(failed instanceof Error ? failed.message : String(failed)),
      );
    void look();
    const every = setInterval(look, BROWSER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.serverUrl, context.agentId, context.token, state.browser, asked]);
  useEffect(
    () => () => {
      if (shown.current) {
        URL.revokeObjectURL(shown.current);
      }
    },
    [],
  );
  const act = (step: Promise<BrowserPage>) =>
    step.then(
      found => {
        setPage(found);
        setError('');
        setAsked(previous => previous + 1);
      },
      (failed: unknown) =>
        setError(failed instanceof Error ? failed.message : String(failed)),
    );
  const onClick = (event: MouseEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const box = image.getBoundingClientRect();
    const point = pointOnPage(
      { x: event.clientX - box.left, y: event.clientY - box.top },
      { width: box.width, height: box.height },
      { width: image.naturalWidth, height: image.naturalHeight },
    );
    image.focus();
    void act(clickOnBrowser(context, point.x, point.y));
  };
  const onKey = (event: KeyboardEvent<HTMLImageElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if ((BROWSER_KEYS as readonly string[]).includes(event.key)) {
      event.preventDefault();
      void act(pressOnBrowser(context, event.key));
    } else if (event.key.length === 1) {
      event.preventDefault();
      void act(typeOnBrowser(context, event.key));
    }
  };
  return (
    <Box data-testid="computer-browser">
      <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 1 }}>
        {COMPUTER_WORDS.browser}
        {page ? (
          <Text sx={{ fontWeight: 'normal', color: 'fg.muted' }}>
            {` · ${page.title || page.url}`}
          </Text>
        ) : null}
      </Heading>
      {!state.browser ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {COMPUTER_WORDS.noBrowser}
        </Text>
      ) : none || !shot ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {none ? COMPUTER_WORDS.noPage : null}
        </Text>
      ) : (
        <>
          {page ? (
            <Text
              as="p"
              sx={{
                fontFamily: MONO_FACE,
                fontSize: 0,
                color: 'fg.muted',
                m: 0,
                mb: 1,
                wordBreak: 'break-all',
              }}
            >
              {page.url}
            </Text>
          ) : null}
          <img
            src={shot}
            alt={COMPUTER_WORDS.pageAlt(page?.title || page?.url || '')}
            data-testid="computer-browser-page"
            tabIndex={mine ? 0 : -1}
            onClick={mine ? onClick : undefined}
            onKeyDown={mine ? onKey : undefined}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              border: '1px solid var(--borderColor-muted, #d0d7de)',
              borderRadius: 6,
              cursor: mine ? 'pointer' : 'default',
            }}
          />
        </>
      )}
      {error ? (
        <Text as="p" sx={{ fontSize: 1, color: 'danger.fg', m: 0, mt: 1 }}>
          {error}
        </Text>
      ) : null}
      {mine && state.browser ? (
        <Box mt={2} data-testid="computer-browser-controls">
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0, mb: 1 }}>
            {COMPUTER_WORDS.clickToAct}
          </Text>
          <Box display="flex" gap={1} mb={1}>
            <TextInput
              size="small"
              aria-label={COMPUTER_WORDS.typeOnPage}
              placeholder={COMPUTER_WORDS.typeOnPage}
              value={text}
              onChange={event => setText(event.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              size="small"
              disabled={!text}
              onClick={() => {
                void act(typeOnBrowser(context, text));
                setText('');
              }}
            >
              {COMPUTER_WORDS.type}
            </Button>
            <Button
              size="small"
              onClick={() => void act(pressOnBrowser(context, 'Enter'))}
            >
              Enter
            </Button>
          </Box>
          <Box display="flex" gap={1} mb={1}>
            <TextInput
              size="small"
              aria-label={COMPUTER_WORDS.address}
              placeholder={COMPUTER_WORDS.address}
              value={address}
              onChange={event => setAddress(event.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              size="small"
              disabled={!address.trim()}
              onClick={() => void act(openOnBrowser(context, address.trim()))}
            >
              {COMPUTER_WORDS.open}
            </Button>
          </Box>
          <Box display="flex" gap={1}>
            <Button
              size="small"
              onClick={() => void act(scrollBrowser(context, -400))}
            >
              {COMPUTER_WORDS.scrollUp}
            </Button>
            <Button
              size="small"
              onClick={() => void act(scrollBrowser(context, 400))}
            >
              {COMPUTER_WORDS.scrollDown}
            </Button>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

function YourTerminal({ context }: { context: ComputerContext }): JSX.Element {
  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<
    Array<{ code: string; output: RunOutput }>
  >([]);
  const run = () => {
    setRunning(true);
    runOnComputer(context, code).then(
      output => {
        setOutputs(previous => [...previous, { code, output }]);
        setCode('');
        setRunning(false);
      },
      (failed: unknown) => {
        setOutputs(previous => [
          ...previous,
          {
            code,
            output: {
              stdout: '',
              stderr: '',
              error: failed instanceof Error ? failed.message : String(failed),
            },
          },
        ]);
        setRunning(false);
      },
    );
  };
  return (
    <Box data-testid="computer-your-terminal" mt={2}>
      {outputs.map((each, index) => (
        <Box key={index} mb={2}>
          <Text as="p" sx={{ ...MONO, fontWeight: 'semibold' }}>
            {`>>> ${each.code}`}
          </Text>
          <Text as="pre" sx={{ ...MONO, color: 'fg.muted' }}>
            {[each.output.stdout, each.output.stderr, each.output.error]
              .filter(Boolean)
              .join('\n')}
          </Text>
        </Box>
      ))}
      <Textarea
        aria-label={COMPUTER_WORDS.yourCode}
        placeholder={COMPUTER_WORDS.yourCode}
        value={code}
        onChange={event => setCode(event.target.value)}
        sx={{ width: '100%', fontFamily: MONO_FACE }}
        rows={3}
      />
      <Button
        size="small"
        sx={{ mt: 1 }}
        disabled={running || !code.trim()}
        onClick={run}
      >
        {COMPUTER_WORDS.run}
      </Button>
    </Box>
  );
}

export function AppComputer({
  app,
  workspace,
}: {
  app: AppSpec;
  workspace?: LoopWorkspaceContext;
}): JSX.Element {
  const token = useIAMStore(state => state.token) ?? '';
  const turnEntries = useContributions(LoopChatTurn);
  const turn = useSignalValue(turnEntries[0]?.value.turn ?? NO_TURN);
  const conversation = useSignalValue(
    turnEntries[0]?.value.conversation ?? NO_CONVERSATION,
  );
  const settled = turn.status !== 'thinking' && turn.status !== 'streaming';
  const [ended, setEnded] = useState(0);
  useEffect(() => {
    if (settled) {
      setEnded(turn.id);
    }
  }, [settled, turn.id]);
  const chatText = useChatWords();
  /*
   * The runtime its agent is on, or nothing while none is assigned: then the
   * computer is asked nothing and says why, rather than asking the host's
   * server (on a hosted page, the page's own origin). Outside a workspace
   * there is none either.
   */
  const serverUrl = workspace
    ? agentServerOf(workspace.sandbox, workspace.serverUrl)
    : undefined;
  const noRuntime =
    serverUrl === undefined
      ? noRuntimeSaid(workspace?.sandbox ?? IDLE_SANDBOX_SNAPSHOT, chatText)
      : undefined;
  const agentId = workspace?.agentId || app.id;
  const [state, setState] = useState<ComputerState | undefined>();
  /*
   * Where its files come from (STUDIO D-22).
   *
   * The runtime says it when the plane keeps a host for what applications
   * serve (`servedFrom`, `DATALAYER_USER_APPS_URL`): a file is then fetched
   * from that origin rather than from the runtimes' host, which is every
   * runtime's and so same-origin with all of them. Read from the computer's
   * own answer rather than configured here, because it is the runtime that
   * knows which names it answers to; unsaid, nothing changes.
   */
  const servedFrom = state?.servedFrom ?? '';
  const context = useMemo<ComputerContext | undefined>(
    () =>
      serverUrl === undefined
        ? undefined
        : {
            serverUrl,
            agentId,
            token: token || undefined,
            userAppsUrl: servedFrom || undefined,
          },
    [serverUrl, agentId, token, servedFrom],
  );
  const parts = computerParts(app);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Nothing is set once it is gone: an answer may come back after.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const read = useCallback(() => {
    if (!context) {
      return;
    }
    readComputer(context).then(
      found => {
        if (alive.current) {
          setState(found);
          setError('');
        }
      },
      (failed: unknown) =>
        alive.current &&
        setError(failed instanceof Error ? failed.message : String(failed)),
    );
  }, [context]);
  const used = hasComputer(parts);
  useEffect(() => {
    if (used && context) {
      read();
    }
  }, [used, context, read, ended]);
  const act = (step: (context: ComputerContext) => Promise<unknown>) => {
    if (!context) {
      return;
    }
    setBusy(true);
    step(context).then(
      () => {
        if (alive.current) {
          setBusy(false);
          read();
        }
      },
      (failed: unknown) => {
        if (alive.current) {
          setBusy(false);
          setError(failed instanceof Error ? failed.message : String(failed));
        }
      },
    );
  };
  const me = Boolean(state?.yours);
  return (
    <Box data-testid="app-computer">
      <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
        {COMPUTER_WORDS.title}
      </Heading>
      <Parts app={app} />
      {!used ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0, mt: 1 }}>
          {COMPUTER_WORDS.none}
        </Text>
      ) : (
        <>
          {noRuntime ? (
            <Text
              as="p"
              role="status"
              sx={{ fontSize: 1, color: 'fg.default', m: 0, mt: 2 }}
            >
              {noRuntime}
            </Text>
          ) : null}
          {error ? (
            <Text as="p" sx={{ fontSize: 1, color: 'danger.fg', m: 0, mt: 2 }}>
              {error}
            </Text>
          ) : null}
          {state && context ? (
            <Box mt={2} data-testid="computer-holder">
              <Text as="p" sx={{ fontSize: 1, m: 0, mb: 1 }}>
                {!state.held
                  ? COMPUTER_WORDS.agentHas
                  : me
                    ? COMPUTER_WORDS.youHave
                    : COMPUTER_WORDS.someoneHas}
              </Text>
              {!state.held ? (
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() => act(takeOverComputer)}
                >
                  {COMPUTER_WORDS.takeOver}
                </Button>
              ) : me ? (
                <>
                  <Button
                    size="small"
                    variant="primary"
                    disabled={busy}
                    onClick={() => act(handBackComputer)}
                  >
                    {COMPUTER_WORDS.handBack}
                  </Button>
                  <YourTerminal context={context} />
                </>
              ) : null}
            </Box>
          ) : null}
          {parts.browse && state && context ? (
            <BrowserView context={context} state={state} mine={me} />
          ) : null}
          <Terminal conversation={conversation} />
          {state && context ? (
            <Files context={context} state={state} ended={ended} />
          ) : null}
        </>
      )}
    </Box>
  );
}

export default AppComputer;
