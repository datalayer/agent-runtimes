/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team of two applications over A2A, as a page runs it: the entry's loop
 * turns in the page and asks its peer over A2A with one tool.
 *
 * The entry (Sales) talks to the person: its instructions and its model run
 * here (the Vercel AI SDK's loop), its model reached through ai-inference
 * with whatever `inference` holds — a signed-in person's token, or a
 * visitor's trial key. Its one tool asks the peer (Accounting) with
 * {@link a2aPeerTool}. What each of them does is kept as a persona — the
 * state its character acts and what its balloon says — and the exchange
 * between them as a log, the peer's last answer as the report, and the way
 * the link carries a message as the flow ({@link flowAfter}). What the peer
 * gives besides words — the formats the page accepts (`accept`), such as a
 * Jupyter notebook — is kept as its artifacts, and its latest notebook kept
 * until another one comes ({@link A2ATeam.notebook}). The tools the
 * peer calls on its connections (its MCP servers), told over A2A as it calls
 * them, are kept as the calls running now ({@link callsAfter}).
 *
 * What `A2ATeamGraph` draws, and what a page's composer sends.
 *
 * @module components/teams/useA2ATeam
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stepCountIs, ToolLoopAgent, type ModelMessage } from 'ai';
import type { AssistantState } from '../../chat/assistant/state';
import {
  createBrowserModel,
  type BrowserModelOptions,
} from '../../runtimes/browser/model';
import {
  a2aPeerTool,
  NOTEBOOK_MEDIA_TYPE,
  type A2APeer,
  type A2APeerArtifact,
  type A2APeerEvent,
} from '../../runtimes/browser/a2aPeer';
import type { AppSpec } from '../../types/agentspecs';
import {
  callsAfter,
  flowAfter,
  pruneCalls,
  type A2ATeamCall,
  type A2ATeamConnection,
  type A2ATeamFlow,
} from './a2aTeamFlow';

const NO_CONNECTIONS: A2ATeamConnection[] = [];

/** What one member's character does: its state, its balloon, and whether it was sent away. */
export type A2ATeamPersona = {
  state: AssistantState;
  /** What its balloon says. */
  saying?: string;
  /** Whether the balloon shows without the pointer over it. */
  insist: boolean;
  away: boolean;
};

export const AT_REST: A2ATeamPersona = {
  state: 'idle',
  insist: false,
  away: false,
};

/** One turn of the conversation with the entry. */
export type A2ATeamTurn = { role: 'user' | 'assistant'; text: string };

/** What a page that shows notebooks accepts: a notebook, and words in Markdown. */
export const NOTEBOOK_AND_WORDS: readonly string[] = [
  NOTEBOOK_MEDIA_TYPE,
  'text/markdown',
];

/** What an exchange line calls what the peer gave: its words, and each of its artifacts. */
export function answeredLine(artifacts: A2APeerArtifact[]): string {
  const besides = artifacts.map(artifact =>
    artifact.mediaType === NOTEBOOK_MEDIA_TYPE
      ? `a notebook, ${artifact.name}`
      : artifact.name,
  );
  return besides.length ? `the report and ${besides.join(', ')}` : 'the report';
}

/** The latest notebook among what a peer gave, or none. */
export function notebookAmong(
  artifacts: A2APeerArtifact[],
): A2APeerArtifact | null {
  return (
    [...artifacts]
      .reverse()
      .find(artifact => artifact.mediaType === NOTEBOOK_MEDIA_TYPE) ?? null
  );
}

/** A line short enough for a balloon. */
export function balloonLine(text: string, length = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

export type UseA2ATeamOptions = {
  /** The member that talks to the person and asks: it runs in this page. */
  entry: AppSpec;
  /** The member it asks over A2A. */
  peerApp: AppSpec;
  /** The peer, once its card is read; `null` until then. */
  peer: A2APeer | null;
  /** Where the entry's model is asked, and with whose token. */
  inference: Omit<BrowserModelOptions, 'model'>;
  /** The name of the entry's tool, as its instructions call it: `ask_<peer id>`. */
  askTool?: string;
  /** The most steps of one turn. */
  maxSteps?: number;
  /** The peer's connections (`teamConnectionsOf(peerApp)`): the calls to them are kept. */
  peerConnections?: A2ATeamConnection[];
  /**
   * The media types the page accepts from the peer (`acceptedOutputModes`):
   * words, and the formats it can show, such as a notebook. Unsaid, words alone.
   */
  accept?: readonly string[];
};

export type A2ATeam = {
  entryPersona: A2ATeamPersona;
  peerPersona: A2ATeamPersona;
  setEntryAway: (away: boolean) => void;
  setPeerAway: (away: boolean) => void;
  turns: A2ATeamTurn[];
  /** The exchange between the two, a line a step. */
  exchange: string[];
  /** The peer's last answer, as it gave it. */
  report: string | null;
  /** What the peer gave besides words with its last answer, by media type. */
  artifacts: A2APeerArtifact[];
  /** The latest notebook the peer gave, kept until another one comes. */
  notebook: A2APeerArtifact | null;
  /** Which way the link carries a message now. */
  flow: A2ATeamFlow;
  /** The tool calls the peer's connections are answering now. */
  calls: A2ATeamCall[];
  /** Whether a turn is under way. */
  busy: boolean;
  /** Whether the entry can be asked: its peer is connected. */
  ready: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
};

/** Run a team of two over A2A in the page. */
export function useA2ATeam(options: UseA2ATeamOptions): A2ATeam {
  const {
    entry,
    peerApp,
    peer,
    inference,
    maxSteps = 6,
    peerConnections = NO_CONNECTIONS,
  } = options;
  // By what it names, so that a page passing a new array of the same media
  // types does not make the agent again.
  const acceptKey = options.accept?.join('\n');
  const accept = useMemo(
    () => (acceptKey ? acceptKey.split('\n') : undefined),
    [acceptKey],
  );
  const askTool = options.askTool ?? `ask_${peerApp.id.replace(/-/g, '_')}`;
  const [entryPersona, setEntryPersona] = useState<A2ATeamPersona>(() => ({
    ...AT_REST,
    state: 'greeting',
    saying: balloonLine(entry.interface.welcome ?? ''),
    insist: Boolean(entry.interface.welcome),
  }));
  const [peerPersona, setPeerPersona] = useState<A2ATeamPersona>(AT_REST);
  const [turns, setTurns] = useState<A2ATeamTurn[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<A2APeerArtifact[]>([]);
  const [notebook, setNotebook] = useState<A2APeerArtifact | null>(null);
  const [exchange, setExchange] = useState<string[]>([]);
  const [flow, setFlow] = useState<A2ATeamFlow>('still');
  const [calls, setCalls] = useState<A2ATeamCall[]>([]);
  const callsNow = useRef<A2ATeamCall[]>([]);
  const callTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const history = useRef<ModelMessage[]>([]);
  const abort = useRef<AbortController | null>(null);
  const flowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // What the peer does, as it does it: its own state and balloon, and the link.
  const onPeerEvent = useCallback(
    (event: A2APeerEvent) => {
      const next = flowAfter(event);
      clearTimeout(flowTimer.current);
      setFlow(next.flow);
      if (next.holdMs) {
        flowTimer.current = setTimeout(() => setFlow('still'), next.holdMs);
      }
      // The calls to the peer's connections: a call's end, when it came
      // quickly, is shown a moment longer.
      const after = callsAfter(
        callsNow.current,
        event,
        peerApp.id,
        peerConnections,
        Date.now(),
      );
      callsNow.current = after.calls;
      setCalls(after.calls);
      if (after.holdMs) {
        clearTimeout(callTimer.current);
        callTimer.current = setTimeout(() => {
          callsNow.current = pruneCalls(callsNow.current, Date.now());
          setCalls(callsNow.current);
        }, after.holdMs);
      }
      if (event.phase === 'asked') {
        setExchange(prev => [
          ...prev,
          `${entry.name} → ${peerApp.name}: ${event.request}`,
        ]);
        setPeerPersona(prev => ({
          ...prev,
          state: 'greeting',
          saying: 'On it. Let me read the books.',
          insist: true,
        }));
      } else if (event.phase === 'working') {
        if (event.note) {
          setExchange(prev => [...prev, `${peerApp.name}: ${event.note}`]);
        }
        setPeerPersona(prev => ({
          ...prev,
          state: 'working',
          saying: event.note ? balloonLine(event.note) : prev.saying,
          insist: Boolean(event.note) || prev.insist,
        }));
      } else if (event.phase === 'answered') {
        setExchange(prev => [
          ...prev,
          `${peerApp.name} → ${entry.name}: ${answeredLine(event.artifacts)}`,
        ]);
        setReport(event.answer);
        setArtifacts(event.artifacts);
        const given = notebookAmong(event.artifacts);
        if (given) {
          setNotebook(given);
        }
        setPeerPersona(prev => ({
          ...prev,
          state: 'speaking',
          saying: balloonLine(event.answer),
          insist: true,
        }));
      } else {
        setExchange(prev => [
          ...prev,
          `${peerApp.name} could not answer: ${event.error}`,
        ]);
        setPeerPersona(prev => ({
          ...prev,
          state: 'idle',
          saying: balloonLine(event.error),
          insist: true,
        }));
      }
    },
    [entry.name, peerApp.id, peerApp.name, peerConnections],
  );

  const agent = useMemo(() => {
    if (!peer) {
      return null;
    }
    return new ToolLoopAgent({
      id: entry.id,
      model: createBrowserModel({
        ...inference,
        model: entry.model || undefined,
      }),
      instructions: entry.instructions,
      tools: {
        [askTool]: a2aPeerTool({ peer, onEvent: onPeerEvent, accept }),
      },
      stopWhen: stepCountIs(maxSteps),
    });
  }, [peer, inference, onPeerEvent, entry, askTool, maxSteps, accept]);

  const send = useCallback(
    async (text: string) => {
      const asked = text.trim();
      if (!asked || !agent || busy) {
        return;
      }
      setBusy(true);
      setReport(null);
      setArtifacts([]);
      setExchange([]);
      setTurns(prev => [...prev, { role: 'user', text: asked }]);
      setEntryPersona({
        ...AT_REST,
        state: 'thinking',
        saying: 'Let me see…',
        insist: true,
      });
      setPeerPersona(AT_REST);
      history.current = [...history.current, { role: 'user', content: asked }];
      abort.current = new AbortController();
      let said = '';
      try {
        const result = await agent.stream({
          messages: history.current,
          abortSignal: abort.current.signal,
        });
        for await (const part of result.fullStream) {
          if (part.type === 'tool-call' && part.toolName === askTool) {
            const request = String(
              (part.input as { request?: string } | undefined)?.request ?? '',
            );
            setEntryPersona(prev => ({
              ...prev,
              state: 'waiting',
              saying: balloonLine(`${peerApp.name}, could you: ${request}`),
              insist: true,
            }));
          } else if (part.type === 'tool-result' && part.toolName === askTool) {
            setEntryPersona(prev => ({
              ...prev,
              state: 'thinking',
              saying: 'Thanks!',
            }));
            // Accounting has handed its answer over: back at rest, its last
            // words still in its balloon.
            setPeerPersona(prev => ({ ...prev, state: 'idle' }));
          } else if (part.type === 'text-delta') {
            said += part.text;
            setEntryPersona(prev => ({
              ...prev,
              state: 'speaking',
              saying: balloonLine(said),
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
        setEntryPersona(prev => ({
          ...prev,
          state: 'idle',
          saying: balloonLine(said),
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTurns(prev => [
          ...prev,
          { role: 'assistant', text: `Something went wrong: ${message}` },
        ]);
        setEntryPersona(prev => ({
          ...prev,
          state: 'idle',
          saying: balloonLine(`Something went wrong: ${message}`),
          insist: true,
        }));
        setFlow('still');
        callsNow.current = [];
        setCalls([]);
      } finally {
        abort.current = null;
        setBusy(false);
        // However the turn ended, neither member is still at work.
        setPeerPersona(prev =>
          prev.state === 'idle' ? prev : { ...prev, state: 'idle' },
        );
      }
    },
    [agent, busy, askTool, peerApp.name],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  useEffect(
    () => () => {
      abort.current?.abort();
      clearTimeout(flowTimer.current);
      clearTimeout(callTimer.current);
    },
    [],
  );

  const setEntryAway = useCallback(
    (away: boolean) => setEntryPersona(prev => ({ ...prev, away })),
    [],
  );
  const setPeerAway = useCallback(
    (away: boolean) => setPeerPersona(prev => ({ ...prev, away })),
    [],
  );

  return {
    entryPersona,
    peerPersona,
    setEntryAway,
    setPeerAway,
    turns,
    exchange,
    report,
    artifacts,
    notebook,
    flow,
    calls,
    busy,
    ready: agent !== null,
    send,
    stop,
  };
}
