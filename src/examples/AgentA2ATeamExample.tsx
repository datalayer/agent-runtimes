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
 * Accounting the wizard, as their Appspecs say, in a graph (`A2ATeamGraph`)
 * whose one edge is the A2A link. The exchange is shown as it happens: Sales
 * asks — the edge flows toward Accounting — Accounting works and then answers
 * — the edge flows back — each in its own state and balloon. Under
 * Accounting hangs Odoo, its connection (the odoo-accounting MCP server, from
 * its Appspec): the edge to it flows while Accounting calls one of its tools,
 * the tool's name on it. Each balloon shows only what its member says or
 * does now (`current`): "Asking Accounting…" for Sales' one tool, "Using
 * list_invoices…" while Accounting calls Odoo. Then the report appears. The
 * page's own state is `useA2ATeam`'s, which the landing's home page runs too.
 *
 * Under the graph, each member has its own Agent Inspector: Sales' — its
 * model turns, its `ask_accounting` call, the A2A messages it sends and
 * receives — and Accounting's — what it received over A2A, its Odoo MCP
 * calls, `write_notebook`, its status updates and artifacts, as the A2A
 * stream tells them. Both read one record (`useAgentInspector`), fed by the
 * team (`useA2ATeam`'s `inspector`) and by the fetch the A2A client sends
 * with (`inspectA2AFetch`); an A2A message shows in both, sent in one and
 * received in the other. Right-click a member for its menu: *Inspect the
 * agent…* opens its inspector over the page.
 *
 * Sales' suggestions — its Appspec's starters — are chips in its balloon
 * while it waits for a question: one clicked is asked, as if typed.
 *
 * Sales accepts a Jupyter notebook from Accounting besides its words
 * (`acceptedOutputModes`, `NOTEBOOK_AND_WORDS`). When Accounting gives one,
 * Sales' balloon shows it read-only (`NotebookPreview`: no kernel), and it
 * opens right under the team, in place of the report, on the browser
 * sandbox — a Pyodide kernel in this page — to run, change and download
 * (`TeamNotebook`, loaded only then): the graph draws it into the area
 * under it (`expandTarget`), and a click on the one in the balloon, or its
 * *Expand*, comes to it.
 *
 * Where Accounting is: `VITE_A2A_ACCOUNTING_URL`, else the examples' local
 * server (`…:8765/api/v1/a2a/agents/accounting`), which answers this machine
 * without a key. A cloud runtime needs a key granted to its route:
 * `VITE_A2A_ACCOUNTING_KEY`, which `examples/sales-accounting-a2a/make_temp_key.py`
 * writes to `.env.local`, never committed.
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Flash, Heading, Text, Textarea } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AnonymousKeyExpired } from '@datalayer/core/lib/components/anonymous/AnonymousKeyExpired';
import { AnonymousKeyTimer } from '@datalayer/core/lib/components/anonymous/AnonymousKeyTimer';
import { Streamdown } from 'streamdown';
import { ThemedProvider } from './utils/themedProvider';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useBrowserInference } from '../hooks/useBrowserInference';
import {
  readJwtClaims,
  tokenLifetimeMs,
  useAnonymousSessionStore,
} from '../runtimes/browser/anonymousToken';
import { connectA2APeer, type A2APeer } from '../runtimes/browser/a2aPeer';
import {
  A2ATeamGraph,
  NOTEBOOK_AND_WORDS,
  teamConnectionsOf,
  teamToolClassifier,
  useA2ATeam,
} from '../components/teams';
import { ACCOUNTING_APP_0_0_1, SALES_APP_0_0_1 } from '../specs/apps';
import {
  AgentInspector,
  classifyToolCall,
  inspectA2AFetch,
  useAgentInspector,
} from '../components/inspector';
import { SALES_AND_ACCOUNTING_TEAM_SPEC_0_0_1 } from '../specs/teams/teams';

const TEAM = SALES_AND_ACCOUNTING_TEAM_SPEC_0_0_1;
const SALES = SALES_APP_0_0_1;
const ACCOUNTING = ACCOUNTING_APP_0_0_1;
/** What Accounting reaches, from its Appspec: Odoo, through the odoo-accounting MCP server. */
const ACCOUNTING_CONNECTIONS = teamConnectionsOf(ACCOUNTING);

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

  // One record of what both members do, each inspector showing its own.
  const { sink: inspector } = useAgentInspector();
  const [peer, setPeer] = useState<A2APeer | null>(null);
  const [peerError, setPeerError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  // Under the graph: where the notebook Accounting gives runs.
  const notebookArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    setPeer(null);
    setPeerError(null);
    connectA2APeer({
      url: accountingUrl,
      key: accountingKey,
      // The A2A traffic, recorded: Sales sends, Accounting answers.
      fetch: inspectA2AFetch(globalThis.fetch.bind(globalThis), {
        sink: inspector,
        asker: SALES.name,
        peer: ACCOUNTING.name,
        classifyTool: teamToolClassifier(
          ACCOUNTING_CONNECTIONS,
          classifyToolCall,
        ),
      }),
    })
      .then(found => current && setPeer(found))
      .catch(
        error =>
          current &&
          setPeerError(error instanceof Error ? error.message : String(error)),
      );
    return () => {
      current = false;
    };
  }, [accountingUrl, accountingKey, inspector]);

  // Sales runs here and asks Accounting over A2A: the conversation, the
  // exchange, the report and the way the link carries a message.
  const team = useA2ATeam({
    entry: SALES,
    peerApp: ACCOUNTING,
    peer,
    inference,
    askTool: 'ask_accounting',
    peerConnections: ACCOUNTING_CONNECTIONS,
    // Its words, and a notebook to run here when it gives one.
    accept: NOTEBOOK_AND_WORDS,
    inspector,
  });
  // Sales' starters, in its balloon while it waits for a question.
  const suggestions = useMemo(
    () =>
      (SALES.interface.starters ?? []).map(starter => ({
        label: starter.label,
        prompt: starter.message,
      })),
    [],
  );
  const send = (text: string) => {
    setDraft('');
    void team.send(text);
  };

  const accountingWhere = accountingKey
    ? `on a runtime, ${new URL(accountingUrl).host}, with a temporary key`
    : `on a runtime, ${new URL(accountingUrl).host}`;

  return (
    <Box sx={{ p: 4, maxWidth: 1080, mx: 'auto' }}>
      <Heading as="h2" sx={{ fontSize: 4, mb: 1 }}>
        Agents A2A Team
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', mt: 0 }}>
        {TEAM.emoji} <strong>{TEAM.name}</strong>: {TEAM.description}
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
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          bg: 'canvas.subtle',
          px: 2,
          pt: 2,
          mb: 3,
        }}
      >
        <A2ATeamGraph
          entry={{
            id: SALES.id,
            name: SALES.name,
            emoji: SALES.emoji,
            character: SALES.interface.assistant ?? 'paperclip',
            where:
              salesMember.runsIn === 'browser'
                ? 'in your browser'
                : 'on a runtime',
            persona: team.entryPersona,
            onToggle: () => composer.current?.focus(),
            conversationLabel: `Ask ${SALES.name}`,
            onAway: team.setEntryAway,
            history: team.entryHistory,
            expandTarget: notebookArea,
            notebookTitle: `${ACCOUNTING.name}\u2019s notebook`,
            suggestions: team.ready && !team.busy ? suggestions : undefined,
            onSuggestion: suggestion => send(suggestion.prompt),
            inspector,
            onStop: team.busy ? team.stop : undefined,
            about: {
              name: SALES.name,
              spec: `${SALES.id}:${SALES.version}`,
              model: SALES.model || undefined,
              where: 'in your browser',
            },
          }}
          peer={{
            id: ACCOUNTING.id,
            name: ACCOUNTING.name,
            emoji: ACCOUNTING.emoji,
            character: ACCOUNTING.interface.assistant ?? 'wizard',
            where: accountingWhere,
            persona: team.peerPersona,
            onAway: team.setPeerAway,
            history: team.peerHistory,
            connections: ACCOUNTING_CONNECTIONS,
            inspector,
            about: {
              name: ACCOUNTING.name,
              spec: `${ACCOUNTING.id}:${ACCOUNTING.version}`,
              model: ACCOUNTING.model || undefined,
              where: accountingWhere,
            },
          }}
          flow={team.flow}
          calls={team.calls}
          // Room for the balloons: suggestions, *more* and a notebook.
          balloonRoom={320}
          connected={peer !== null}
          label={peer ? `A2A · ${peer.skill.name}` : 'A2A · not connected'}
        />
      </Box>

      {/* The notebook Accounting gave, right under the team, to run and
          edit here: the graph draws it into this area as it arrives, and
          Sales' balloon shows it read-only, a click there coming here. */}
      <Box
        ref={notebookArea}
        sx={{ mb: team.notebook ? 3 : 0 }}
        data-team-notebook-placement="under-graph"
      />

      {/* Each member's Agent Inspector, under it: Sales on the left. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: ['1fr', '1fr', '1fr 1fr'],
          gap: 3,
          mb: 3,
        }}
        data-team-inspectors=""
      >
        {[SALES, ACCOUNTING].map(member => (
          <Box
            key={member.id}
            sx={{ minWidth: 0 }}
            data-team-inspector={member.id}
          >
            <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
              {member.emoji} {member.name}&rsquo;s Agent Inspector
            </Heading>
            <AgentInspector
              sink={inspector}
              agent={member.name}
              maxHeight={360}
              exportName={`agent-inspector-${member.id}`}
              emptyText={
                member === SALES
                  ? 'Its model turns, its call to Accounting and the A2A messages it sends and receives show here.'
                  : 'What it receives over A2A, its Odoo MCP calls and what it sends back show here.'
              }
            />
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 420px', minWidth: 0 }}>
          <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
            Ask {SALES.name}
          </Heading>
          <Text as="p" sx={{ color: 'fg.muted', fontSize: 1, mt: 0 }}>
            Or choose one of {SALES.name}&rsquo;s suggestions in its balloon.
          </Text>
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
                send(draft);
              }
            }}
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button
              variant="primary"
              disabled={!team.ready || team.busy || !draft.trim()}
              onClick={() => send(draft)}
            >
              Ask
            </Button>
            {team.busy && <Button onClick={team.stop}>Stop</Button>}
          </Box>
          <Box sx={{ mt: 3 }} data-team-conversation="">
            {team.turns.map((turn, index) => (
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
          {/* The notebook, when Accounting gave one, takes the report's place. */}
          {!team.notebook && (
            <>
              <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
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
                {team.report ? (
                  <Streamdown>{team.report}</Streamdown>
                ) : (
                  <Text sx={{ color: 'fg.muted' }}>
                    The report Accounting returns appears here, as it returned
                    it, or as a notebook to run when it gives one.
                  </Text>
                )}
              </Box>
            </>
          )}
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
