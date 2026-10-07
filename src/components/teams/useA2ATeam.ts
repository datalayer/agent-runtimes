/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team of applications over A2A, as a page runs it: the entry's loop
 * turns in the page and asks each of its peers over A2A with a tool of its
 * own.
 *
 * The entry (Sales) talks to the person: its instructions and its model run
 * here (the Vercel AI SDK's loop), its model reached through ai-inference
 * with whatever `inference` holds — a signed-in person's token, or a
 * visitor's trial key. Its tools ask its peers (Accounting; Disaster
 * assessment and Change detection), one `ask_<peer>` tool per peer, with
 * {@link a2aPeerTool}. A team of two names its peer as `peerApp`; a team of
 * N names them as `peers` (LOOP A-08). An entry that runs on a runtime
 * itself (a scene of one member: Month-end close, Crop monitoring) is asked
 * over A2A from the page, with no agent in the browser: `entryPeer`.
 *
 * What each of them does is kept as a persona — the state its character
 * acts and what its balloon says — each peer's last answer as the report,
 * and the way each link carries a message as its flow ({@link flowAfter}).
 * What a peer gives besides words — the formats the page accepts
 * (`accept`), such as a Jupyter notebook — is kept as its artifacts, and
 * the latest notebook kept until another one comes ({@link A2ATeam.notebook}),
 * and each surface of components of the catalog a peer shows
 * (`application/json+a2ui`) kept with the peer that gave it, in the order
 * they came ({@link A2ATeam.surfaces}, STUDIO H-02). A button pressed on
 * one is a turn of the conversation ({@link A2ATeam.pressAction}): the
 * person's line to that member, its answer from it, in the entry's history.
 * The tools a peer calls on its connections (its MCP servers), told over
 * A2A as it calls them, are kept as the calls running now ({@link callsAfter}).
 *
 * Given the Agent Inspector's tracer (`inspector`), the entry's turns (an
 * `invoke_agent` span: its model, its tokens) and its calls to its peers
 * (`execute_tool` spans under it) are recorded there as OpenTelemetry
 * spans; the A2A traffic itself, under those calls, is recorded by each
 * peer's fetch (`traceA2AFetch`).
 *
 * What `A2ATeamGraph` draws, and what a page's composer sends.
 *
 * @module components/teams/useA2ATeam
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stepCountIs, ToolLoopAgent, type ModelMessage, type Tool } from 'ai';
import type { AssistantState } from '../../chat/assistant/state';
import type { ChatMessage } from '../../types/messages';
import type { DisplayItem, ToolCallMessage } from '../../types/chat';
import {
  createBrowserModel,
  type BrowserModelOptions,
} from '../../runtimes/browser/model';
import {
  a2aPeerTool,
  askA2APeer,
  A2UI_MEDIA_TYPE,
  NOTEBOOK_MEDIA_TYPE,
  type A2APeer,
  type A2APeerAction,
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
import { PERSON } from './sceneTranscript';
import {
  toolLineOfStep,
  type BalloonToolLine,
} from '../../chat/assistant/toolLine';

const NO_CONNECTIONS: A2ATeamConnection[] = [];
const NO_PEERS: readonly A2ATeamPeerOptions[] = [];

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

/**
 * One turn of the conversation with the entry. A button pressed on what
 * another member showed is a turn of it too: the person's line addressed to
 * that member, and its answer from it (`member`, STUDIO H-02).
 */
export type A2ATeamTurn = {
  role: 'user' | 'assistant';
  text: string;
  /**
   * The member other than the entry this turn is with: the one whose
   * button the person pressed, and who answered it.
   */
  member?: { id: string; name: string };
};

/**
 * A button pressed on a surface a member showed (`AnswerSurfaces`'
 * `AnswerPressed`): its words, the person's turn, and its action.
 */
export type A2ATeamPress = {
  message: string;
  action: A2APeerAction;
};

/** What a page that shows notebooks accepts: a notebook, and words in Markdown. */
export const NOTEBOOK_AND_WORDS: readonly string[] = [
  NOTEBOOK_MEDIA_TYPE,
  'text/markdown',
];

/**
 * What a page that draws an answer's components accepts besides: the
 * catalog's surfaces, a notebook, and words in Markdown (STUDIO H-02).
 */
export const COMPONENTS_NOTEBOOK_AND_WORDS: readonly string[] = [
  A2UI_MEDIA_TYPE,
  ...NOTEBOOK_AND_WORDS,
];

/** A surface of components a member showed with an answer: who gave it, and the surface. */
export type A2ATeamSurface = {
  /** Its surface's id: `answer-…`. */
  id: string;
  /** The member that showed it, by its id. */
  giver: string;
  artifact: A2APeerArtifact;
};

/**
 * The surfaces among what a member gave, each once by its surface's id,
 * after those already kept.
 */
export function surfacesAfter(
  kept: A2ATeamSurface[],
  giver: string,
  artifacts: A2APeerArtifact[],
): A2ATeamSurface[] {
  const found = artifacts
    .filter(artifact => artifact.mediaType === A2UI_MEDIA_TYPE)
    .map(artifact => {
      const data = artifact.data as { surfaceId?: unknown } | null;
      return {
        id:
          data && typeof data.surfaceId === 'string'
            ? data.surfaceId
            : `${giver}-${kept.length}`,
        giver,
        artifact,
      };
    })
    .filter(
      (surface, index, all) =>
        !kept.some(one => one.id === surface.id) &&
        all.findIndex(one => one.id === surface.id) === index,
    );
  return found.length ? [...kept, ...found] : kept;
}

/** What the peer gave, in words: its words, and each of its artifacts. */
export function answeredLine(artifacts: A2APeerArtifact[]): string {
  const besides = artifacts.map(artifact =>
    artifact.mediaType === NOTEBOOK_MEDIA_TYPE
      ? `a notebook, ${artifact.name}`
      : artifact.mediaType === A2UI_MEDIA_TYPE
        ? `what it shows, ${artifact.name}`
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

/** The name of the entry's tool for a peer, as its instructions call it: `ask_<peer id>`. */
export function askToolOf(peerId: string): string {
  return `ask_${peerId.replace(/-/g, '_')}`;
}

/**
 * What a member says when it is asked, before it works: the books when it
 * reaches Odoo, the system it reaches otherwise, or just that it is on it.
 */
export function askedLine(connections: readonly A2ATeamConnection[]): string {
  if (connections.some(connection => connection.id.startsWith('odoo'))) {
    return 'On it. Let me read the books.';
  }
  const systems = [...new Set(connections.map(connection => connection.label))];
  return systems.length
    ? `On it. Let me look in ${systems.join(' and ')}.`
    : 'On it.';
}

/**
 * The entry's instructions for a team of more than one peer: its own, and
 * which tool asks whom, so that it names each. A team of two keeps the
 * entry's instructions as they are.
 */
export function teamInstructions(
  entry: Pick<AppSpec, 'instructions'>,
  peers: readonly { app: Pick<AppSpec, 'name'>; askTool: string }[],
): string {
  if (peers.length < 2) {
    return entry.instructions;
  }
  const who = peers
    .map(peer => `${peer.app.name} with \`${peer.askTool}\``)
    .join(', ');
  return `${entry.instructions}\n\nYour team, over A2A: ask ${who}. Each answers one request on its own.`;
}

/** A member the entry asks over A2A. */
export type A2ATeamPeerOptions = {
  /** The member asked. */
  app: AppSpec;
  /** The peer, once its card is read; `null` until then. */
  peer: A2APeer | null;
  /** The name of the entry's tool for it; `ask_<its id>` unsaid. */
  askTool?: string;
  /** Its connections (`teamConnectionsOf(app)`): the calls to them are kept. */
  connections?: A2ATeamConnection[];
  /**
   * What its balloon says before it is asked (a scene's `opens_first`, its
   * persona's line); unsaid, it waits quietly.
   */
  greeting?: string;
};

export type UseA2ATeamOptions = {
  /** The member that talks to the person and asks: it runs in this page. */
  entry: AppSpec;
  /** A team of two: the member it asks over A2A. */
  peerApp?: AppSpec;
  /** A team of two: the peer, once its card is read; `null` until then. */
  peer?: A2APeer | null;
  /** A team of two: the name of the entry's tool, as its instructions call it: `ask_<peer id>`. */
  askTool?: string;
  /** A team of two: the peer's connections (`teamConnectionsOf(peerApp)`). */
  peerConnections?: A2ATeamConnection[];
  /**
   * A team of N: the members the entry asks, in the order its tools are
   * offered. Give the same array while nothing changed (memoised): a new
   * one makes the entry's agent again.
   */
  peers?: readonly A2ATeamPeerOptions[];
  /**
   * The entry itself, when it runs on a runtime and is asked over A2A from
   * the page: no agent turns in the browser, `send` asks it directly, and
   * its persona follows what it tells (asked, working, its tools, answered).
   * `null` until its card is read.
   */
  entryPeer?: A2APeer | null;
  /** Where the entry's model is asked, and with whose token. */
  inference: Omit<BrowserModelOptions, 'model'>;
  /** The most steps of one turn. */
  maxSteps?: number;
  /**
   * The media types the page accepts from the peers (`acceptedOutputModes`):
   * words, and the formats it can show, such as a notebook. Unsaid, words alone.
   */
  accept?: readonly string[];
  /**
   * The Agent Inspector's tracer: the entry's turns and its calls to the
   * peers are recorded there as spans.
   */
  inspector?: OtelLiveTracer | null;
};

/** One peer of the team, as the team keeps it. */
export type A2ATeamPeer = {
  /** Its id: its application's. */
  id: string;
  app: AppSpec;
  /** The name of the entry's tool for it. */
  askTool: string;
  connections: A2ATeamConnection[];
  /** Whether it is reached: its card was read. */
  connected: boolean;
  persona: A2ATeamPersona;
  /** What it was asked, the tools it called and what it answered. */
  history: DisplayItem[];
  /** Its last answer, as it gave it. */
  report: string | null;
  /** What it gave besides words with its last answer. */
  artifacts: A2APeerArtifact[];
  /** Which way its link carries a message now. */
  flow: A2ATeamFlow;
  setAway: (away: boolean) => void;
};

export type A2ATeam = {
  entryPersona: A2ATeamPersona;
  /** The first peer's persona: the peer of a team of two. */
  peerPersona: A2ATeamPersona;
  setEntryAway: (away: boolean) => void;
  /** Sends the first peer away, or calls it back. */
  setPeerAway: (away: boolean) => void;
  turns: A2ATeamTurn[];
  /**
   * The entry's conversation, in the chat's model (its messages): what its
   * `history` balloon draws with the chat's components.
   */
  entryHistory: DisplayItem[];
  /**
   * What the first peer was asked, the tools it called and what it
   * answered, in the chat's model (messages and tool calls).
   */
  peerHistory: DisplayItem[];
  /** The peers, in their order, each as the team keeps it. */
  peers: A2ATeamPeer[];
  /** Which way each peer's link carries a message now, by the peer's id. */
  flows: Record<string, A2ATeamFlow>;
  /** The last answer a peer gave, as it gave it. */
  report: string | null;
  /** What a peer gave besides words with the last answer, by media type. */
  artifacts: A2APeerArtifact[];
  /** The latest notebook a peer gave, kept until another one comes. */
  notebook: A2APeerArtifact | null;
  /**
   * Every surface of components the members showed in this conversation,
   * in the order they came, with who showed it (STUDIO H-02).
   */
  surfaces: A2ATeamSurface[];
  /** Which way the first peer's link carries a message now. */
  flow: A2ATeamFlow;
  /** The tool calls the peers' connections are answering now. */
  calls: A2ATeamCall[];
  /** Whether a turn is under way. */
  busy: boolean;
  /** Whether the entry can be asked: every peer is connected, or the entry is. */
  ready: boolean;
  send: (text: string) => Promise<void>;
  /**
   * A button pressed on what a member showed (its id: the entry's, or a
   * peer's), as a turn of the conversation (STUDIO H-02): the person's line
   * in the entry's history, the member asked directly over A2A with the
   * button's action beside its words (`askA2APeer({ action })`), and its
   * reply landing as an `ask_<peer>` answer does — in its history, its
   * balloon, its flow, the team's report, surfaces and notebook — and in
   * the entry's history as that member's answer. Answers its words; throws
   * when the member is not reached, a turn is under way, or it failed.
   */
  pressAction: (memberId: string, pressed: A2ATeamPress) => Promise<string>;
  stop: () => void;
};

type ResolvedPeer = {
  id: string;
  app: AppSpec;
  peer: A2APeer | null;
  askTool: string;
  connections: A2ATeamConnection[];
  greeting?: string;
};

/** A persona at rest, or greeting with a line when it has one. */
function restingPersona(greeting: string | undefined): A2ATeamPersona {
  return greeting
    ? {
        ...AT_REST,
        state: 'greeting',
        saying: balloonLine(greeting),
        full: greeting,
        insist: true,
      }
    : AT_REST;
}

/** Run a team over A2A in the page. */
export function useA2ATeam(options: UseA2ATeamOptions): A2ATeam {
  const {
    entry,
    peerApp,
    peer = null,
    peerConnections = NO_CONNECTIONS,
    peers: given = NO_PEERS,
    entryPeer = null,
    inference,
    maxSteps = 6,
    inspector = null,
  } = options;
  // By what it names, so that a page passing a new array of the same media
  // types does not make the agent again.
  const acceptKey = options.accept?.join('\n');
  const accept = useMemo(
    () => (acceptKey ? acceptKey.split('\n') : undefined),
    [acceptKey],
  );
  const askTool = options.askTool ?? (peerApp ? askToolOf(peerApp.id) : '');
  // The peers, resolved: the one of a team of two, then those of a team of N.
  const peerList = useMemo<ResolvedPeer[]>(
    () => [
      ...(peerApp
        ? [
            {
              id: peerApp.id,
              app: peerApp,
              peer,
              askTool,
              connections: peerConnections,
            },
          ]
        : []),
      ...given.map(one => ({
        id: one.app.id,
        app: one.app,
        peer: one.peer,
        askTool: one.askTool ?? askToolOf(one.app.id),
        connections: one.connections ?? NO_CONNECTIONS,
        ...(one.greeting ? { greeting: one.greeting } : {}),
      })),
    ],
    [peerApp, peer, askTool, peerConnections, given],
  );
  // Read by the event handlers, so that they need not be made again when
  // a peer connects.
  const peersNow = useRef(peerList);
  peersNow.current = peerList;
  const peerOf = useCallback(
    (id: string) => peersNow.current.find(one => one.id === id),
    [],
  );

  const [entryPersona, setEntryPersona] = useState<A2ATeamPersona>(() => ({
    ...AT_REST,
    state: 'greeting',
    saying: balloonLine(entry.interface.welcome ?? ''),
    full: entry.interface.welcome ?? '',
    insist: Boolean(entry.interface.welcome),
  }));
  const [personas, setPersonas] = useState<Record<string, A2ATeamPersona>>(() =>
    Object.fromEntries(
      peerList.map(one => [one.id, restingPersona(one.greeting)]),
    ),
  );
  const personaOf = useCallback(
    (id: string): A2ATeamPersona =>
      personas[id] ?? restingPersona(peerOf(id)?.greeting),
    [personas, peerOf],
  );
  /** Change a member's persona: the entry's, or a peer's by id. */
  const setPersona = useCallback(
    (id: string, next: (prev: A2ATeamPersona) => A2ATeamPersona) => {
      if (id === entry.id) {
        setEntryPersona(next);
      } else {
        setPersonas(prev => ({
          ...prev,
          [id]: next(prev[id] ?? restingPersona(peerOf(id)?.greeting)),
        }));
      }
    },
    [entry.id, peerOf],
  );
  const [turns, setTurns] = useState<A2ATeamTurn[]>([]);
  const [histories, setHistories] = useState<Record<string, DisplayItem[]>>({});
  const told = useRef(0);
  const tell = useCallback(
    (id: string, role: 'user' | 'assistant', text: string) => {
      if (id === entry.id) {
        // The entry's history is its turns.
        return;
      }
      told.current += 1;
      const message: ChatMessage = {
        id: `peer-${told.current}`,
        role,
        content: text,
        createdAt: new Date(),
      };
      setHistories(prev => ({ ...prev, [id]: [...(prev[id] ?? []), message] }));
    },
    [entry.id],
  );
  // A tool a peer calls, as the chat holds one: added when it starts,
  // updated when it ends.
  const toolCalled = useCallback(
    (
      id: string,
      step: { id?: string; name: string; ended: boolean; error?: string },
    ) => {
      if (id === entry.id) {
        return;
      }
      const connections = peerOf(id)?.connections ?? NO_CONNECTIONS;
      const callId = step.id ?? step.name;
      const call: ToolCallMessage = {
        id: `peer-tool:${callId}`,
        type: 'tool-call',
        toolCallId: callId,
        toolName: toolOwnName(step.name, connections),
        args: {},
        status: step.error ? 'error' : step.ended ? 'complete' : 'executing',
        ...(step.error ? { error: step.error } : {}),
      };
      setHistories(prev => {
        const history = prev[id] ?? [];
        return {
          ...prev,
          [id]: history.some(item => item.id === call.id)
            ? history.map(item => (item.id === call.id ? call : item))
            : [...history, call],
        };
      });
    },
    [entry.id, peerOf],
  );
  const [report, setReport] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, string | null>>({});
  const [artifacts, setArtifacts] = useState<A2APeerArtifact[]>([]);
  const [givens, setGivens] = useState<Record<string, A2APeerArtifact[]>>({});
  const [notebook, setNotebook] = useState<A2APeerArtifact | null>(null);
  const [surfaces, setSurfaces] = useState<A2ATeamSurface[]>([]);
  const [flows, setFlows] = useState<Record<string, A2ATeamFlow>>({});
  const [calls, setCalls] = useState<A2ATeamCall[]>([]);
  const callsNow = useRef<A2ATeamCall[]>([]);
  const callTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const history = useRef<ModelMessage[]>([]);
  const abort = useRef<AbortController | null>(null);
  const flowTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // What a member does, as it does it: its own state and balloon, and its
  // link. A peer's when the entry asks it; the entry's own when the entry
  // is asked over A2A.
  const onMemberEvent = useCallback(
    (id: string, event: A2APeerEvent) => {
      const connections =
        id === entry.id
          ? NO_CONNECTIONS
          : (peerOf(id)?.connections ?? NO_CONNECTIONS);
      if (id !== entry.id) {
        const next = flowAfter(event);
        clearTimeout(flowTimers.current.get(id));
        setFlows(prev => ({ ...prev, [id]: next.flow }));
        if (next.holdMs) {
          flowTimers.current.set(
            id,
            setTimeout(
              () => setFlows(prev => ({ ...prev, [id]: 'still' })),
              next.holdMs,
            ),
          );
        }
        // The calls to its connections: a call's end, when it came
        // quickly, is shown a moment longer. Another peer's calls are its own.
        const others = callsNow.current.filter(call => call.member !== id);
        const after = callsAfter(
          callsNow.current.filter(call => call.member === id),
          event,
          id,
          connections,
          Date.now(),
        );
        callsNow.current = [...others, ...after.calls];
        setCalls(callsNow.current);
        if (after.holdMs) {
          clearTimeout(callTimer.current);
          callTimer.current = setTimeout(() => {
            callsNow.current = pruneCalls(callsNow.current, Date.now());
            setCalls(callsNow.current);
          }, after.holdMs);
        }
      }
      if (event.phase === 'asked') {
        tell(id, 'user', event.request);
        setPersona(id, prev => ({
          ...prev,
          state: 'greeting',
          saying: askedLine(connections),
          full: undefined,
          insist: true,
          tool: undefined,
        }));
      } else if (event.phase === 'working') {
        if (event.tool) {
          toolCalled(id, event.tool);
        }
        setPersona(id, prev => ({
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
                toolOwnName(event.tool.name, connections),
              )
            : undefined,
        }));
      } else if (event.phase === 'answered') {
        tell(id, 'assistant', event.answer);
        setReport(event.answer);
        setReports(prev => ({ ...prev, [id]: event.answer }));
        setArtifacts(event.artifacts);
        setGivens(prev => ({ ...prev, [id]: event.artifacts }));
        setSurfaces(prev => surfacesAfter(prev, id, event.artifacts));
        const given = notebookAmong(event.artifacts);
        if (given) {
          setNotebook(given);
        }
        setPersona(id, prev => ({
          ...prev,
          state: 'speaking',
          saying: balloonLine(event.answer),
          full: event.answer,
          insist: true,
          tool: undefined,
        }));
        // The entry was given a notebook: in its balloon, read-only.
        if (given && id !== entry.id) {
          setEntryPersona(prev => ({ ...prev, notebook: given }));
        }
      } else {
        tell(id, 'assistant', `Could not answer: ${event.error}`);
        setPersona(id, prev => ({
          ...prev,
          state: 'idle',
          saying: balloonLine(event.error),
          full: event.error,
          insist: true,
          tool: undefined,
        }));
      }
    },
    [entry.id, peerOf, setPersona, tell, toolCalled],
  );

  // The peers' ids and whether each is reached: the agent is made again
  // when one connects, not when a peer's state changes.
  const agent = useMemo(() => {
    if (entryPeer || !peerList.length || peerList.some(one => !one.peer)) {
      return null;
    }
    const tools: Record<string, Tool> = {};
    for (const one of peerList) {
      tools[one.askTool] = a2aPeerTool({
        peer: one.peer as A2APeer,
        onEvent: event => onMemberEvent(one.id, event),
        accept,
      });
    }
    return new ToolLoopAgent({
      id: entry.id,
      model: createBrowserModel({
        ...inference,
        model: entry.model || undefined,
      }),
      instructions: teamInstructions(entry, peerList),
      tools,
      stopWhen: stepCountIs(maxSteps),
    });
  }, [entryPeer, peerList, inference, onMemberEvent, entry, maxSteps, accept]);

  /** Every peer at rest again, its greeting gone. */
  const peersAtRest = useCallback(() => {
    setPersonas(
      Object.fromEntries(peersNow.current.map(one => [one.id, AT_REST])),
    );
  }, []);

  // The entry on a runtime: asked over A2A from the page, as the person.
  const sendOverA2A = useCallback(
    async (asked: string, to: A2APeer) => {
      setBusy(true);
      setReport(null);
      setArtifacts([]);
      setTurns(prev => [...prev, { role: 'user', text: asked }]);
      abort.current = new AbortController();
      try {
        const { answer } = await askA2APeer(to, asked, {
          signal: abort.current.signal,
          onEvent: event => onMemberEvent(entry.id, event),
          accept,
        });
        setTurns(prev => [...prev, { role: 'assistant', text: answer }]);
        setEntryPersona(prev => ({ ...prev, state: 'idle' }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTurns(prev => [
          ...prev,
          { role: 'assistant', text: `Could not answer: ${message}` },
        ]);
        setEntryPersona(prev => ({
          ...prev,
          state: 'idle',
          saying: balloonLine(message),
          full: message,
          insist: true,
          tool: undefined,
        }));
      } finally {
        abort.current = null;
        setBusy(false);
      }
    },
    [entry.id, onMemberEvent, accept],
  );

  const send = useCallback(
    async (text: string) => {
      const asked = text.trim();
      if (!asked || busy) {
        return;
      }
      if (entryPeer) {
        return sendOverA2A(asked, entryPeer);
      }
      if (!agent) {
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
      peersAtRest();
      history.current = [...history.current, { role: 'user', content: asked }];
      abort.current = new AbortController();
      let said = '';
      // The turn, as a span: the entry's model, from the question to the
      // answer, and its tokens; its calls to the peers under it.
      const turnSpan = inspector
        ? startAgentTurn(inspector, {
            agent: entry.name,
            prompt: asked,
            model: entry.model || undefined,
          })
        : undefined;
      const toolSpans = new Map<string, OtelLiveSpan>();
      // The peer a tool asks, by the tool's name.
      const askedPeer = (toolName: string) =>
        peersNow.current.find(one => one.askTool === toolName);
      try {
        const result = await agent.stream({
          messages: history.current,
          abortSignal: abort.current.signal,
        });
        for await (const part of result.fullStream) {
          const to =
            part.type === 'tool-call' ||
            part.type === 'tool-result' ||
            part.type === 'tool-error'
              ? askedPeer(part.toolName)
              : undefined;
          if (part.type === 'tool-call' && to) {
            const request = String(
              (part.input as { request?: string } | undefined)?.request ?? '',
            );
            // Its tool runs here, in the page, and asks the peer over A2A.
            if (inspector && turnSpan) {
              toolSpans.set(
                part.toolCallId,
                startToolCall(inspector, {
                  agent: entry.name,
                  name: to.askTool,
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
              saying: balloonLine(`${to.app.name}, could you: ${request}`),
              full: `${to.app.name}, could you: ${request}`,
              insist: true,
              // Its tool, in its own words: it asks its peer.
              tool: {
                id: part.toolCallId,
                tool: to.askTool,
                name: to.askTool,
                phase: 'running',
                words: `Asking ${to.app.name}…`,
              },
            }));
          } else if (part.type === 'tool-result' && to) {
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
            // The peer has handed its answer over: back at rest, its last
            // words still in its balloon.
            setPersona(to.id, prev => ({ ...prev, state: 'idle' }));
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
          } else if (part.type === 'tool-error' && to) {
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
        setFlows({});
        callsNow.current = [];
        setCalls([]);
      } finally {
        abort.current = null;
        setBusy(false);
        // However the turn ended, no member is still at work.
        setPersonas(prev =>
          Object.fromEntries(
            Object.entries(prev).map(([id, one]) => [
              id,
              one.state === 'idle' && !one.tool
                ? one
                : { ...one, state: 'idle', tool: undefined },
            ]),
          ),
        );
      }
    },
    [
      agent,
      busy,
      entry,
      inspector,
      entryPeer,
      sendOverA2A,
      setPersona,
      peersAtRest,
    ],
  );

  const pressAction = useCallback(
    async (memberId: string, pressed: A2ATeamPress): Promise<string> => {
      const words = pressed.message.trim();
      const isEntry = memberId === entry.id;
      const one = isEntry ? undefined : peerOf(memberId);
      const name = isEntry ? entry.name : (one?.app.name ?? memberId);
      const to = isEntry ? entryPeer : (one?.peer ?? null);
      if (!to) {
        throw new Error(`${name} is not reached: it cannot be asked.`);
      }
      if (busy) {
        throw new Error('Wait for the answer under way, then choose.');
      }
      if (!words) {
        throw new Error('This button says nothing to send.');
      }
      // The entry's own button is a turn with it; another member's is
      // addressed to that member, and answered by it.
      const member = isEntry ? undefined : { id: memberId, name };
      const withMember = member ? { member } : {};
      setBusy(true);
      setTurns(prev => [...prev, { role: 'user', text: words, ...withMember }]);
      abort.current = new AbortController();
      try {
        const { answer } = await askA2APeer(to, words, {
          signal: abort.current.signal,
          action: pressed.action,
          accept,
          onEvent: event => onMemberEvent(memberId, event),
        });
        setTurns(prev => [
          ...prev,
          { role: 'assistant', text: answer, ...withMember },
        ]);
        if (!entryPeer) {
          // The entry's model reads it at its next turn: what was chosen,
          // and what the member answered.
          history.current = [
            ...history.current,
            { role: 'user', content: words },
            {
              role: 'assistant',
              content: `${name} answered the person directly: ${answer}`,
            },
          ];
        }
        // Answered: back at rest, its words still in its balloon.
        setPersona(memberId, prev => ({ ...prev, state: 'idle' }));
        return answer;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTurns(prev => [
          ...prev,
          {
            role: 'assistant',
            text: `Could not answer: ${message}`,
            ...withMember,
          },
        ]);
        throw error;
      } finally {
        abort.current = null;
        setBusy(false);
      }
    },
    [entry, entryPeer, peerOf, busy, accept, onMemberEvent, setPersona],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  useEffect(
    () => () => {
      abort.current?.abort();
      flowTimers.current.forEach(timer => clearTimeout(timer));
      clearTimeout(callTimer.current);
    },
    [],
  );

  const setEntryAway = useCallback(
    (away: boolean) => setEntryPersona(prev => ({ ...prev, away })),
    [],
  );
  const setAwayOf = useCallback(
    (id: string, away: boolean) => setPersona(id, prev => ({ ...prev, away })),
    [setPersona],
  );
  const setPeerAway = useCallback(
    (away: boolean) => {
      const first = peersNow.current[0];
      if (first) {
        setAwayOf(first.id, away);
      }
    },
    [setAwayOf],
  );

  const entryHistory = useMemo<DisplayItem[]>(
    () =>
      turns.map((turn, index): ChatMessage => ({
        id: `turn-${index}`,
        role: turn.role,
        content: turn.text,
        createdAt: new Date(0),
        // A button pressed on another member's surface: the person's line
        // to it, and its answer, said by it.
        ...(turn.member
          ? turn.role === 'user'
            ? {
                speaker: { id: 'person', name: PERSON },
                directedTo: { id: turn.member.id, name: turn.member.name },
              }
            : {
                speaker: { id: turn.member.id, name: turn.member.name },
              }
          : {}),
      })),
    [turns],
  );

  const NONE: DisplayItem[] = useMemo(() => [], []);
  const teamPeers = useMemo<A2ATeamPeer[]>(
    () =>
      peerList.map(one => ({
        id: one.id,
        app: one.app,
        askTool: one.askTool,
        connections: one.connections,
        connected: one.peer !== null,
        persona: personaOf(one.id),
        history: histories[one.id] ?? NONE,
        report: reports[one.id] ?? null,
        artifacts: givens[one.id] ?? [],
        flow: flows[one.id] ?? 'still',
        setAway: (away: boolean) => setAwayOf(one.id, away),
      })),
    [peerList, personaOf, histories, reports, givens, flows, setAwayOf, NONE],
  );
  const first = teamPeers[0];

  return {
    entryHistory,
    peerHistory: first?.history ?? NONE,
    entryPersona,
    peerPersona: first?.persona ?? AT_REST,
    setEntryAway,
    setPeerAway,
    turns,
    peers: teamPeers,
    flows,
    report,
    artifacts,
    notebook,
    surfaces,
    flow: first?.flow ?? 'still',
    calls,
    busy,
    ready: entryPeer ? true : agent !== null,
    send,
    pressAction,
    stop,
  };
}
