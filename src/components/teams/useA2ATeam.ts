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
 * state its character acts and what its balloon says — the peer's last
 * answer as the report, and the way
 * the link carries a message as the flow ({@link flowAfter}). What the peer
 * gives besides words — the formats the page accepts (`accept`), such as a
 * Jupyter notebook — is kept as its artifacts, and its latest notebook kept
 * until another one comes ({@link A2ATeam.notebook}). The tools the
 * peer calls on its connections (its MCP servers), told over A2A as it calls
 * them, are kept as the calls running now ({@link callsAfter}).
 *
 * Given the Agent Inspector's tracer (`inspector`), the entry's turns (an
 * `invoke_agent` span: its model, its tokens) and its call to the peer (an
 * `execute_tool` span under it) are recorded there as OpenTelemetry spans;
 * the A2A traffic itself, under that call, is recorded by the peer's fetch
 * (`traceA2AFetch`).
 *
 * What `A2ATeamGraph` draws, and what a page's composer sends.
 *
 * @module components/teams/useA2ATeam
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stepCountIs, ToolLoopAgent, type ModelMessage } from 'ai';
import type { AssistantState } from '../../chat/assistant/state';
import type { ChatMessage } from '../../types/messages';
import type { DisplayItem, ToolCallMessage } from '../../types/chat';
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
import type {
  OtelLiveSpan,
  OtelLiveTracer,
} from '@datalayer/core/lib/otel/live';
import {
  endAgentTurn,
  endToolCall,
  startAgentTurn,
  startToolCall,
} from '../inspector/agentSpans';
import {
  callsAfter,
  flowAfter,
  toolOwnName,
  pruneCalls,
  type A2ATeamCall,
  type A2ATeamConnection,
  type A2ATeamFlow,
} from './a2aTeamFlow';
import {
  toolLineOfStep,
  type BalloonToolLine,
} from '../../chat/assistant/toolLine';

const NO_CONNECTIONS: A2ATeamConnection[] = [];

/** What one member's character does: its state, its balloon, and whether it was sent away. */
export type A2ATeamPersona = {
  state: AssistantState;
  /** What its balloon says. */
  saying?: string;
  /** What it says, uncut, when `saying` was cut to fit: the balloon's *more*. */
  full?: string;
  /** Whether the balloon shows without the pointer over it. */
  insist: boolean;
  away: boolean;
  /**
   * The tool it calls now, or just called (LOOP T-23): "Using
   * list_invoices…", "Asking Accounting…"; said in place of its words.
   */
  tool?: BalloonToolLine;
  /** A notebook it was given: in its balloon, read-only, under its words. */
  notebook?: A2APeerArtifact;
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

/** What the peer gave, in words: its words, and each of its artifacts. */
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
  /**
   * The Agent Inspector's tracer: the entry's turns and its call to the
   * peer are recorded there as spans.
   */
  inspector?: OtelLiveTracer | null;
};

export type A2ATeam = {
  entryPersona: A2ATeamPersona;
  peerPersona: A2ATeamPersona;
  setEntryAway: (away: boolean) => void;
  setPeerAway: (away: boolean) => void;
  turns: A2ATeamTurn[];
  /**
   * The entry's conversation, in the chat's model (its messages): what its
   * `history` balloon draws with the chat's components.
   */
  entryHistory: DisplayItem[];
  /**
   * What the peer was asked, the tools it called and what it answered, in
   * the chat's model (messages and tool calls).
   */
  peerHistory: DisplayItem[];
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
    inspector = null,
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
    full: entry.interface.welcome ?? '',
    insist: Boolean(entry.interface.welcome),
  }));
  const [peerPersona, setPeerPersona] = useState<A2ATeamPersona>(AT_REST);
  const [turns, setTurns] = useState<A2ATeamTurn[]>([]);
  const [peerHistory, setPeerHistory] = useState<DisplayItem[]>([]);
  const told = useRef(0);
  const tell = useCallback((role: 'user' | 'assistant', text: string) => {
    told.current += 1;
    const message: ChatMessage = {
      id: `peer-${told.current}`,
      role,
      content: text,
      createdAt: new Date(),
    };
    setPeerHistory(prev => [...prev, message]);
  }, []);
  // A tool the peer calls, as the chat holds one: added when it starts,
  // updated when it ends.
  const toolCalled = useCallback(
    (step: { id?: string; name: string; ended: boolean; error?: string }) => {
      const id = step.id ?? step.name;
      const call: ToolCallMessage = {
        id: `peer-tool:${id}`,
        type: 'tool-call',
        toolCallId: id,
        toolName: toolOwnName(step.name, peerConnections),
        args: {},
        status: step.error ? 'error' : step.ended ? 'complete' : 'executing',
        ...(step.error ? { error: step.error } : {}),
      };
      setPeerHistory(prev =>
        prev.some(item => item.id === call.id)
          ? prev.map(item => (item.id === call.id ? call : item))
          : [...prev, call],
      );
    },
    [peerConnections],
  );
  const [report, setReport] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<A2APeerArtifact[]>([]);
  const [notebook, setNotebook] = useState<A2APeerArtifact | null>(null);
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
        tell('user', event.request);
        setPeerPersona(prev => ({
          ...prev,
          state: 'greeting',
          saying: 'On it. Let me read the books.',
          full: undefined,
          insist: true,
          tool: undefined,
        }));
      } else if (event.phase === 'working') {
        if (event.tool) {
          toolCalled(event.tool);
        }
        setPeerPersona(prev => ({
          ...prev,
          state: 'working',
          saying: event.note ? balloonLine(event.note) : prev.saying,
          full: event.note ?? prev.full,
          insist: Boolean(event.note) || Boolean(event.tool) || prev.insist,
          // The tool it calls, in plain words, from the step it told; a
          // step without a tool (its own words) puts the tool line away.
          tool: event.tool
            ? toolLineOfStep(
                event.tool,
                toolOwnName(event.tool.name, peerConnections),
              )
            : undefined,
        }));
      } else if (event.phase === 'answered') {
        tell('assistant', event.answer);
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
          full: event.answer,
          insist: true,
          tool: undefined,
        }));
        // The entry was given a notebook: in its balloon, read-only.
        if (given) {
          setEntryPersona(prev => ({ ...prev, notebook: given }));
        }
      } else {
        tell('assistant', `Could not answer: ${event.error}`);
        setPeerPersona(prev => ({
          ...prev,
          state: 'idle',
          saying: balloonLine(event.error),
          full: event.error,
          insist: true,
          tool: undefined,
        }));
      }
    },
    [peerApp.id, peerConnections, tell, toolCalled],
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
      // The turn, as a span: the entry's model, from the question to the
      // answer, and its tokens; its calls to the peer under it.
      const turnSpan = inspector
        ? startAgentTurn(inspector, {
            agent: entry.name,
            prompt: asked,
            model: entry.model || undefined,
          })
        : undefined;
      const toolSpans = new Map<string, OtelLiveSpan>();
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
            // Its tool runs here, in the page, and asks the peer over A2A.
            if (inspector && turnSpan) {
              toolSpans.set(
                part.toolCallId,
                startToolCall(inspector, {
                  agent: entry.name,
                  name: askTool,
                  id: part.toolCallId,
                  args: part.input,
                  tool: { kind: 'frontend' },
                  parent: turnSpan.context,
                }),
              );
            }
            setEntryPersona(prev => ({
              ...prev,
              state: 'waiting',
              saying: balloonLine(`${peerApp.name}, could you: ${request}`),
              full: `${peerApp.name}, could you: ${request}`,
              insist: true,
              // Its one tool, in its own words: it asks its peer.
              tool: {
                id: part.toolCallId,
                tool: askTool,
                name: askTool,
                phase: 'running',
                words: `Asking ${peerApp.name}…`,
              },
            }));
          } else if (part.type === 'tool-result' && part.toolName === askTool) {
            const output = part.output as { error?: string } | undefined;
            const toolSpan = toolSpans.get(part.toolCallId);
            if (toolSpan) {
              toolSpans.delete(part.toolCallId);
              endToolCall(toolSpan, {
                result: part.output,
                ...(output?.error ? { error: String(output.error) } : {}),
              });
            }
            setEntryPersona(prev => ({
              ...prev,
              state: 'thinking',
              saying: 'Thanks!',
              full: undefined,
              tool: undefined,
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
              full: said,
              insist: true,
              tool: undefined,
            }));
          } else if (part.type === 'tool-error' && part.toolName === askTool) {
            const toolSpan = toolSpans.get(part.toolCallId);
            if (toolSpan) {
              toolSpans.delete(part.toolCallId);
              endToolCall(toolSpan, {
                error:
                  part.error instanceof Error
                    ? part.error.message
                    : String(part.error),
              });
            }
            setEntryPersona(prev => ({
              ...prev,
              state: 'thinking',
              tool: prev.tool
                ? { ...prev.tool, phase: 'failed', words: undefined }
                : undefined,
            }));
          } else if (part.type === 'error') {
            throw part.error;
          }
        }
        history.current = [
          ...history.current,
          { role: 'assistant', content: said },
        ];
        if (turnSpan) {
          const usage = await Promise.resolve(result.totalUsage).catch(
            () => undefined,
          );
          endAgentTurn(turnSpan, { text: said, usage });
        }
        setTurns(prev => [...prev, { role: 'assistant', text: said }]);
        setEntryPersona(prev => ({
          ...prev,
          state: 'idle',
          saying: balloonLine(said),
          full: said,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toolSpans.forEach(toolSpan =>
          endToolCall(toolSpan, { error: message }),
        );
        if (turnSpan) {
          endAgentTurn(turnSpan, { error: message });
        }
        setTurns(prev => [
          ...prev,
          { role: 'assistant', text: `Something went wrong: ${message}` },
        ]);
        setEntryPersona(prev => ({
          ...prev,
          state: 'idle',
          saying: balloonLine(`Something went wrong: ${message}`),
          full: `Something went wrong: ${message}`,
          insist: true,
          tool: undefined,
        }));
        setFlow('still');
        callsNow.current = [];
        setCalls([]);
      } finally {
        abort.current = null;
        setBusy(false);
        // However the turn ended, neither member is still at work.
        setPeerPersona(prev =>
          prev.state === 'idle' && !prev.tool
            ? prev
            : { ...prev, state: 'idle', tool: undefined },
        );
      }
    },
    [agent, busy, askTool, peerApp.name, entry, inspector],
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

  const entryHistory = useMemo<DisplayItem[]>(
    () =>
      turns.map((turn, index): ChatMessage => ({
        id: `turn-${index}`,
        role: turn.role,
        content: turn.text,
        createdAt: new Date(0),
      })),
    [turns],
  );

  return {
    entryHistory,
    peerHistory,
    entryPersona,
    peerPersona,
    setEntryAway,
    setPeerAway,
    turns,
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
