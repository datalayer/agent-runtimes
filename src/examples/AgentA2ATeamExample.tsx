/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team of two applications over A2A (agentspecs `sales-and-accounting`).
 *
 * Sales runs here, in the browser: its instructions and model turn in the
 * page (the Vercel AI SDK's loop, the in-browser harness), and its one tool
 * asks Accounting over A2A with `@a2a-js/sdk` 1.x. Accounting runs on a
 * runtime, served with fasta2a: its agent reads the Odoo books through the
 * `odoo-accounting` toolset, and only reads them.
 *
 * Both are on screen as Office Assistant characters, Sales the paper clip and
 * Accounting the wizard, as their Appspecs say. The exchange is shown as it
 * happens: Sales asks, Accounting works and then answers, each in its own
 * state and balloon. Then the report appears.
 *
 * Where Accounting is: `VITE_A2A_ACCOUNTING_URL`, else the examples' local
 * server (`…:8765/api/v1/a2a/agents/accounting`), which answers this machine
 * without a key. A cloud runtime needs a key granted to its route:
 * `VITE_A2A_ACCOUNTING_KEY`, which `examples/sales-accounting-a2a/make_temp_key.py`
 * writes to `.env.local`, never committed.
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Flash, Heading, Label, Text, Textarea } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AnonymousKeyExpired } from '@datalayer/core/lib/components/anonymous/AnonymousKeyExpired';
import { AnonymousKeyTimer } from '@datalayer/core/lib/components/anonymous/AnonymousKeyTimer';
import { stepCountIs, ToolLoopAgent, type ModelMessage } from 'ai';
import { Streamdown } from 'streamdown';
import { ThemedProvider } from './utils/themedProvider';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { AssistantStage } from '../chat/assistant/AssistantStage';
import type { AssistantState } from '../chat/assistant/state';
import { useBrowserInference } from '../hooks/useBrowserInference';
import { createBrowserModel } from '../runtimes/browser/model';
import {
  readJwtClaims,
  tokenLifetimeMs,
  useAnonymousSessionStore,
} from '../runtimes/browser/anonymousToken';
import {
  a2aPeerTool,
  connectA2APeer,
  type A2APeer,
  type A2APeerEvent,
} from '../runtimes/browser/a2aPeer';
import { ACCOUNTING_APP_0_0_1, SALES_APP_0_0_1 } from '../specs/apps';
import { SALES_AND_ACCOUNTING_TEAM_SPEC_0_0_1 } from '../specs/teams/teams';

const TEAM = SALES_AND_ACCOUNTING_TEAM_SPEC_0_0_1;
const SALES = SALES_APP_0_0_1;
const ACCOUNTING = ACCOUNTING_APP_0_0_1;

/** The name Sales's tool goes by, as its instructions call it. */
const ASK_TOOL = 'ask_accounting';
const STAGE_SIZE = 104;
const STAGE_HEIGHT = 300;

type Persona = {
  state: AssistantState;
  /** What its balloon says, and whether it is new. */
  saying?: string;
  insist: boolean;
  away: boolean;
};

const AT_REST: Persona = { state: 'idle', insist: false, away: false };

type Turn = { role: 'user' | 'assistant'; text: string };

/** A line short enough for a balloon. */
function line(text: string, length = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/** The members of the team, as the team spec says them. */
function members() {
  const sales = TEAM.agents.find(member => member.id === TEAM.entry);
  const asked = sales?.talksTo?.find(link => link.over === 'a2a');
  const accounting = TEAM.agents.find(member => member.id === asked?.member);
  if (!sales || !accounting) {
    throw new Error(
      `The team ${TEAM.id} does not say who a person talks to and whom it asks over A2A.`,
    );
  }
  return { sales, accounting };
}

/** One persona at its desk, with its name and where it runs under it. */
function Desk({
  app,
  persona,
  where,
  left,
  onToggle,
  onAway,
}: {
  app: typeof SALES;
  persona: Persona;
  where: string;
  left: string;
  onToggle: () => void;
  onAway: (away: boolean) => void;
}): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const character = app.interface.assistant ?? 'paperclip';
  return (
    <Box
      sx={{
        position: 'absolute',
        left,
        top: 0,
        width: 220,
        height: STAGE_HEIGHT,
      }}
      data-team-member={app.id}
      data-member-state={persona.state}
    >
      {persona.away ? (
        <Button
          size="small"
          sx={{ position: 'absolute', top: STAGE_HEIGHT - 150 }}
          onClick={() => onAway(false)}
        >
          Call {app.name} back
        </Button>
      ) : (
        <AssistantStage
          character={character}
          state={persona.state}
          size={STAGE_SIZE}
          place={{ position: 'absolute', left: 56, top: STAGE_HEIGHT - 170 }}
          stageRef={stageRef}
          onDragStart={() => undefined}
          open={false}
          onToggle={onToggle}
          balloon={
            persona.saying
              ? { text: persona.saying, more: persona.saying.endsWith('…') }
              : undefined
          }
          insist={persona.insist}
          onDismiss={away => onAway(away !== 'none')}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <Text sx={{ fontWeight: 600, display: 'block' }}>
          {app.emoji} {app.name}
        </Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{where}</Text>
      </Box>
    </Box>
  );
}

function AgentA2ATeam(): JSX.Element {
  const { sales: salesMember } = useMemo(members, []);
  const runtimeUrl = useExampleAgentRuntimesUrl();
  const accountingUrl =
    import.meta.env.VITE_A2A_ACCOUNTING_URL ||
    `${runtimeUrl}/api/v1/a2a/agents/${ACCOUNTING.id}`;
  const accountingKey = import.meta.env.VITE_A2A_ACCOUNTING_KEY || undefined;
  const { inference, needsSignIn, anonymous } = useBrowserInference(true);
  // The temporary key's own clock, read out of it: when it ends and how long
  // it was signed for, as core's countdown draws them.
  const accountingKeyClock = useMemo(() => {
    const exp = accountingKey ? readJwtClaims(accountingKey)?.exp : undefined;
    return accountingKey && exp
      ? { expiresAt: exp * 1000, grantedMs: tokenLifetimeMs(accountingKey) }
      : undefined;
  }, [accountingKey]);
  const [accountingKeyEnded, setAccountingKeyEnded] = useState(
    () =>
      accountingKeyClock !== undefined &&
      accountingKeyClock.expiresAt <= Date.now(),
  );

  const [peer, setPeer] = useState<A2APeer | null>(null);
  const [peerError, setPeerError] = useState<string | null>(null);
  const [sales, setSales] = useState<Persona>({
    ...AT_REST,
    state: 'greeting',
    saying: line(SALES.interface.welcome ?? ''),
    insist: true,
  });
  const [accounting, setAccounting] = useState<Persona>(AT_REST);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [exchange, setExchange] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const history = useRef<ModelMessage[]>([]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let current = true;
    setPeer(null);
    setPeerError(null);
    connectA2APeer({ url: accountingUrl, key: accountingKey })
      .then(found => current && setPeer(found))
      .catch(
        error =>
          current &&
          setPeerError(error instanceof Error ? error.message : String(error)),
      );
    return () => {
      current = false;
    };
  }, [accountingUrl, accountingKey]);

  // What Accounting does, as it does it: its own state and balloon.
  const onPeerEvent = useCallback((event: A2APeerEvent) => {
    if (event.phase === 'asked') {
      setExchange(prev => [...prev, `Sales → Accounting: ${event.request}`]);
      setAccounting(prev => ({
        ...prev,
        state: 'greeting',
        saying: 'On it. Let me read the books.',
        insist: true,
      }));
    } else if (event.phase === 'working') {
      if (event.note) {
        setExchange(prev => [...prev, `Accounting: ${event.note}`]);
      }
      setAccounting(prev => ({
        ...prev,
        state: 'working',
        saying: event.note ? line(event.note) : prev.saying,
        insist: Boolean(event.note) || prev.insist,
      }));
    } else if (event.phase === 'answered') {
      setExchange(prev => [...prev, 'Accounting → Sales: the report']);
      setReport(event.answer);
      setAccounting(prev => ({
        ...prev,
        state: 'speaking',
        saying: line(event.answer),
        insist: true,
      }));
    } else {
      setExchange(prev => [
        ...prev,
        `Accounting could not answer: ${event.error}`,
      ]);
      setAccounting(prev => ({
        ...prev,
        state: 'idle',
        saying: line(event.error),
        insist: true,
      }));
    }
  }, []);

  const agent = useMemo(() => {
    if (!peer) {
      return null;
    }
    return new ToolLoopAgent({
      id: SALES.id,
      model: createBrowserModel({
        ...inference,
        model: SALES.model || undefined,
      }),
      instructions: SALES.instructions,
      tools: { [ASK_TOOL]: a2aPeerTool({ peer, onEvent: onPeerEvent }) },
      stopWhen: stepCountIs(6),
    });
  }, [peer, inference, onPeerEvent]);

  const send = useCallback(
    async (text: string) => {
      const asked = text.trim();
      if (!asked || !agent || busy) {
        return;
      }
      setBusy(true);
      setDraft('');
      setReport(null);
      setExchange([]);
      setTurns(prev => [...prev, { role: 'user', text: asked }]);
      setSales({
        ...AT_REST,
        state: 'thinking',
        saying: 'Let me see…',
        insist: true,
      });
      setAccounting(AT_REST);
      history.current = [...history.current, { role: 'user', content: asked }];
      abort.current = new AbortController();
      let said = '';
      try {
        const result = await agent.stream({
          messages: history.current,
          abortSignal: abort.current.signal,
        });
        for await (const part of result.fullStream) {
          if (part.type === 'tool-call' && part.toolName === ASK_TOOL) {
            const request = String(
              (part.input as { request?: string } | undefined)?.request ?? '',
            );
            setSales(prev => ({
              ...prev,
              state: 'waiting',
              saying: line(`Accounting, could you: ${request}`),
              insist: true,
            }));
          } else if (
            part.type === 'tool-result' &&
            part.toolName === ASK_TOOL
          ) {
            setSales(prev => ({
              ...prev,
              state: 'thinking',
              saying: 'Thanks!',
            }));
          } else if (part.type === 'text-delta') {
            said += part.text;
            setSales(prev => ({
              ...prev,
              state: 'speaking',
              saying: line(said),
              insist: true,
            }));
          } else if (part.type === 'error') {
            throw part.error;
          }
        }
        history.current = [
          ...history.current,
          { role: 'assistant', content: said },
        ];
        setTurns(prev => [...prev, { role: 'assistant', text: said }]);
        setSales(prev => ({ ...prev, state: 'idle', saying: line(said) }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTurns(prev => [
          ...prev,
          { role: 'assistant', text: `Something went wrong: ${message}` },
        ]);
        setSales(prev => ({
          ...prev,
          state: 'idle',
          saying: line(`Something went wrong: ${message}`),
          insist: true,
        }));
      } finally {
        abort.current = null;
        setBusy(false);
      }
    },
    [agent, busy],
  );

  useEffect(() => () => abort.current?.abort(), []);

  const accountingWhere = accountingKey
    ? `on a runtime, ${new URL(accountingUrl).host}, with a temporary key`
    : `on a runtime, ${new URL(accountingUrl).host}`;

  return (
    <Box sx={{ p: 4, maxWidth: 1080, mx: 'auto' }}>
      <Heading as="h2" sx={{ fontSize: 4, mb: 1 }}>
        {TEAM.emoji} {TEAM.name}
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', mt: 0 }}>
        {TEAM.description}
      </Text>
      {((anonymous.status === 'active' && anonymous.expiresAt) ||
        (accountingKeyClock && !accountingKeyEnded)) && (
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 3 }}>
          {anonymous.status === 'active' && anonymous.expiresAt && (
            <AnonymousKeyTimer
              expiresAt={anonymous.expiresAt}
              grantedMs={anonymous.grantedMs}
              label={`${SALES.name}'s trial key`}
              onExpire={() => useAnonymousSessionStore.getState().expire()}
            />
          )}
          {accountingKeyClock && !accountingKeyEnded && (
            <AnonymousKeyTimer
              expiresAt={accountingKeyClock.expiresAt}
              grantedMs={accountingKeyClock.grantedMs}
              label={`${ACCOUNTING.name}'s temporary key`}
              onExpire={() => setAccountingKeyEnded(true)}
            />
          )}
        </Box>
      )}
      {anonymous.status === 'expired' && (
        <Box sx={{ mb: 3 }}>
          <AnonymousKeyExpired
            agentName={SALES.name}
            // Sales runs in this page: what ended is its model's key, and
            // signing in gives it the person's own.
            onSignedIn={() => useAnonymousSessionStore.getState().clear()}
          />
        </Box>
      )}
      {accountingKeyEnded && (
        <Flash variant="danger" sx={{ mb: 3 }}>
          {ACCOUNTING.name}&rsquo;s temporary key has ended: it no longer
          answers. Make a new one with{' '}
          <code>examples/sales-accounting-a2a/make_temp_key.py</code> and
          reload.
        </Flash>
      )}
      {needsSignIn && (
        <Flash variant="warning" sx={{ mb: 3 }}>
          Sales asks its model through the Datalayer inference service: sign in,
          or wait for a visitor's trial key.
        </Flash>
      )}
      {peerError && (
        <Flash variant="danger" sx={{ mb: 3 }}>
          Accounting is not reachable at {accountingUrl}: {peerError} Serve it
          with{' '}
          <code>python examples/sales-accounting-a2a/serve_accounting.py</code>{' '}
          on the local server, or{' '}
          <code>loop apps run accounting.yaml --cloud --a2a</code> and set{' '}
          <code>VITE_A2A_ACCOUNTING_URL</code>.
        </Flash>
      )}

      <Box
        sx={{
          position: 'relative',
          height: STAGE_HEIGHT,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          bg: 'canvas.subtle',
          overflow: 'visible',
          mb: 3,
        }}
      >
        <Desk
          app={SALES}
          persona={sales}
          where={
            salesMember.runsIn === 'browser'
              ? 'in your browser'
              : 'on a runtime'
          }
          left="8%"
          onToggle={() => composer.current?.focus()}
          onAway={away => setSales(prev => ({ ...prev, away }))}
        />
        <Box
          sx={{
            position: 'absolute',
            left: '38%',
            right: '38%',
            top: STAGE_HEIGHT / 2,
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              borderTop: '2px dashed',
              borderColor: peer ? 'accent.emphasis' : 'border.muted',
            }}
          />
          <Label variant={peer ? 'accent' : 'secondary'} sx={{ mt: 2 }}>
            A2A {peer ? `· ${peer.skill.name}` : '· not connected'}
          </Label>
        </Box>
        <Desk
          app={ACCOUNTING}
          persona={accounting}
          where={accountingWhere}
          left="66%"
          onToggle={() => undefined}
          onAway={away => setAccounting(prev => ({ ...prev, away }))}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 420px', minWidth: 0 }}>
          <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
            Ask {SALES.name}
          </Heading>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            {(SALES.interface.starters ?? []).map(starter => (
              <Button
                key={starter.label}
                size="small"
                disabled={!agent || busy}
                onClick={() => void send(starter.message)}
              >
                {starter.label}
              </Button>
            ))}
          </Box>
          <Textarea
            ref={composer}
            block
            rows={3}
            value={draft}
            placeholder="Ask for a financial report…"
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button
              variant="primary"
              disabled={!agent || busy || !draft.trim()}
              onClick={() => void send(draft)}
            >
              Ask
            </Button>
            {busy && (
              <Button onClick={() => abort.current?.abort()}>Stop</Button>
            )}
          </Box>
          <Box sx={{ mt: 3 }} data-team-conversation="">
            {turns.map((turn, index) => (
              <Box
                key={index}
                sx={{
                  p: 2,
                  mb: 2,
                  borderRadius: 2,
                  bg: turn.role === 'user' ? 'accent.subtle' : 'canvas.subtle',
                }}
              >
                <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                  {turn.role === 'user' ? 'You' : SALES.name}
                </Text>
                <Streamdown>{turn.text}</Streamdown>
              </Box>
            ))}
          </Box>
        </Box>
        <Box sx={{ flex: '1 1 360px', minWidth: 0 }}>
          <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
            The exchange
          </Heading>
          <Box
            as="ol"
            sx={{ pl: 3, color: 'fg.muted', fontSize: 1 }}
            data-team-exchange=""
          >
            {exchange.length === 0 ? (
              <Text as="li">Nothing asked yet.</Text>
            ) : (
              exchange.map((step, index) => (
                <Text as="li" key={index}>
                  {step}
                </Text>
              ))
            )}
          </Box>
          <Heading as="h3" sx={{ fontSize: 2, mt: 3, mb: 2 }}>
            The report
          </Heading>
          <Box
            sx={{
              p: 3,
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              minHeight: 120,
            }}
            data-team-report=""
          >
            {report ? (
              <Streamdown>{report}</Streamdown>
            ) : (
              <Text sx={{ color: 'fg.muted' }}>
                The report Accounting returns appears here, as it returned it.
              </Text>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function AgentA2ATeamExample(): JSX.Element {
  return (
    <ThemedProvider>
      <AgentA2ATeam />
    </ThemedProvider>
  );
}

export default AgentA2ATeamExample;
