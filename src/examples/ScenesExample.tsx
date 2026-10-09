/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The scenes of the catalogue (agentspecs `scenes`, LOOP A-15), in tabs:
 * each scene's face and name, its `assumes` line under them, its graph and
 * its transcript behind *Graph · Transcript* (`SceneView`), its members
 * standing where its stage directions put them (`positions`), the entry's
 * balloon open first (`opens_first`), and the script's cues as the entry's
 * suggestions. A scene is tried here before it is deployed anywhere.
 *
 * Played against the local servers (`npm run examples`): the entry in the
 * browser asks its model through the examples' inference — a signed-in
 * person's token or a visitor's trial key — and the members on a runtime
 * are served over A2A by `examples/sales-accounting-a2a/serve_scenes.py`,
 * Accounting on :8767 as before and each other member on a runtime of its
 * own from :8768 (`sceneRuntimePorts`), or wherever `VITE_A2A_<MEMBER>_URL`
 * says. A scene whose entry runs on a runtime itself (Month-end Close, Crop
 * monitoring) is asked over A2A from the page, as the person
 * (`useA2ATeam`'s `entryPeer`). A member that is not reached is drawn all
 * the same, and the box says what its application needs (`setup`) and how
 * to serve it, rather than failing.
 *
 * Right-click a member for its menu: *Inspect the agent…* opens its Agent
 * Inspector over the page, on the one tracer every member records into.
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Flash,
  Heading,
  Text,
  Textarea,
  UnderlineNav,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AnonymousKeyExpired } from '@datalayer/core/lib/components/anonymous/AnonymousKeyExpired';
import { AnonymousKeyTimer } from '@datalayer/core/lib/components/anonymous/AnonymousKeyTimer';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
import { Streamdown } from 'streamdown';
import { ThemedProvider } from './utils/themedProvider';
import { useBrowserInference } from '../hooks/useBrowserInference';
import { useAnonymousSessionStore } from '../runtimes/browser/anonymousToken';
import { connectA2APeer, type A2APeer } from '../runtimes/browser/a2aPeer';
import {
  A2ATeamGraph,
  NOTEBOOK_AND_WORDS,
  PERSON,
  SceneView,
  sceneCuesOf,
  sceneMemberUrl,
  sceneRuntimePorts,
  sceneStageOf,
  teamConnectionsOf,
  teamToolClassifier,
  useA2ATeam,
  type A2ATeamConnection,
  type A2ATeamPeerOptions,
  type SceneStage,
  type SceneStageMember,
} from '../components/teams';
import { listSceneSpecs } from '../specs/scenes';
import type { SceneSpec } from '../types/scenes';
import {
  classifyToolCall,
  traceA2AFetch,
  useAgentInspector,
} from '../components/inspector';

/** Where the members on a runtime are, by application id: the local ports, unless a variable says. */
const PORTS = sceneRuntimePorts();

/** A member reached over A2A: its peer once its card is read, or why not. */
type Reached = { peer: A2APeer | null; error: string | null };

/**
 * Reach a member on a runtime: read its card at `url`, its traffic recorded
 * as spans for the inspectors and the transcript, as asked by `asker`.
 */
function useReached(
  url: string,
  asker: string,
  name: string,
  connections: A2ATeamConnection[],
  tracer: OtelLiveTracer,
): Reached {
  const [reached, setReached] = useState<Reached>({ peer: null, error: null });
  useEffect(() => {
    let current = true;
    setReached({ peer: null, error: null });
    connectA2APeer({
      url,
      fetch: traceA2AFetch(globalThis.fetch.bind(globalThis), {
        tracer,
        asker,
        peer: name,
        classifyTool: teamToolClassifier(connections, classifyToolCall),
      }),
    })
      .then(peer => current && setReached({ peer, error: null }))
      .catch(
        error =>
          current &&
          setReached({
            peer: null,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    return () => {
      current = false;
    };
  }, [url, asker, name, connections, tracer]);
  return reached;
}

/** A member on a runtime, as the page reaches it. */
type RuntimeMember = SceneStageMember & {
  url: string;
  connections: A2ATeamConnection[];
};

/** The members of a scene that run on a runtime, each with its address and connections. */
function runtimeMembersOf(stage: SceneStage): RuntimeMember[] {
  const env = import.meta.env as Record<string, string | undefined>;
  return stage.members
    .filter(member => member.runsIn === 'runtime')
    .map(member => ({
      ...member,
      url: sceneMemberUrl(member.app.id, env, PORTS),
      connections: teamConnectionsOf(member.app),
    }));
}

/** One member on a runtime: reached, and told to the scene. */
function ReachMember({
  member,
  asker,
  tracer,
  onReached,
}: {
  member: RuntimeMember;
  asker: string;
  tracer: OtelLiveTracer;
  onReached: (id: string, reached: Reached) => void;
}): null {
  const reached = useReached(
    member.url,
    asker,
    member.app.name,
    member.connections,
    tracer,
  );
  useEffect(
    () => onReached(member.id, reached),
    [member.id, reached, onReached],
  );
  return null;
}

/** What a member not reached needs: its application's setup, and how to serve it. */
function memberNeeds(member: RuntimeMember, error: string): string[] {
  return [
    `${member.app.name} is not reachable at ${member.url}: ${error}`,
    ...member.setup,
    `Serve it with python examples/sales-accounting-a2a/serve_scenes.py (npm run examples does), or set VITE_A2A_${member.app.id
      .replace(/-/g, '_')
      .toUpperCase()}_URL to where it runs.`,
  ];
}

function Scene({ scene }: { scene: SceneSpec }): JSX.Element {
  const stage = useMemo(() => sceneStageOf(scene), [scene]);
  const entry = stage.entry;
  const entryInBrowser = entry.runsIn === 'browser';
  const runtimeMembers = useMemo(() => runtimeMembersOf(stage), [stage]);
  const { inference, needsSignIn, anonymous } =
    useBrowserInference(entryInBrowser);
  // One tracer of what every member does: each inspector shows its own.
  const { tracer: inspector } = useAgentInspector();
  const [reached, setReached] = useState<Record<string, Reached>>({});
  const onReached = useMemo(
    () => (id: string, found: Reached) =>
      setReached(prev =>
        prev[id]?.peer === found.peer && prev[id]?.error === found.error
          ? prev
          : { ...prev, [id]: found },
      ),
    [],
  );
  const reachedOf = (id: string): Reached =>
    reached[id] ?? { peer: null, error: null };

  // The entry's peers over A2A, in the cast's order; the entry itself when
  // it runs on a runtime.
  const peerOptions = useMemo<A2ATeamPeerOptions[]>(
    () =>
      stage.peers.map(peer => {
        const member = runtimeMembers.find(one => one.id === peer.id);
        return {
          app: peer.app,
          peer: reached[peer.id]?.peer ?? null,
          connections: member?.connections ?? [],
          ...(stage.opensFirst === peer.id
            ? { greeting: peer.cast.persona.line }
            : {}),
        };
      }),
    [stage, runtimeMembers, reached],
  );
  const team = useA2ATeam({
    entry: entry.app,
    peers: peerOptions,
    entryPeer: entryInBrowser ? undefined : reachedOf(entry.id).peer,
    inference,
    accept: NOTEBOOK_AND_WORDS,
    inspector,
  });
  // The script's cues, labelled by the entry's starters (A-13): chips in
  // its balloon while it waits for a question.
  const suggestions = useMemo(
    () => sceneCuesOf(scene, entry.app.interface.starters ?? []),
    [scene, entry.app],
  );
  const [draft, setDraft] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  // Under the graph: where a notebook a member gives runs.
  const notebookArea = useRef<HTMLDivElement>(null);
  const send = (text: string) => {
    setDraft('');
    void team.send(text);
  };
  // The members as the transcript names them: the spans' services, and the
  // connections a tool call is of.
  const transcriptMembers = useMemo(
    () =>
      stage.members.map(member => ({
        id: member.app.id,
        name: member.app.name,
        connections:
          runtimeMembers.find(one => one.id === member.id)?.connections ?? [],
      })),
    [stage, runtimeMembers],
  );
  const whereOf = (member: SceneStageMember): string =>
    member.runsIn === 'browser'
      ? 'in your browser'
      : `on a runtime, ${new URL(runtimeMembers.find(one => one.id === member.id)?.url ?? 'http://runtime').host}`;
  const aboutOf = (member: SceneStageMember) => {
    const peer = reachedOf(member.id).peer;
    const url = runtimeMembers.find(one => one.id === member.id)?.url;
    return {
      name: member.app.name,
      spec: `${member.app.id}:${member.app.version}`,
      model: member.app.model || undefined,
      where: whereOf(member),
      description:
        peer?.card.description || member.app.description || undefined,
      skills: peer?.card.skills.map(skill => skill.name),
      protocol: peer ? ('a2a' as const) : undefined,
      url: peer ? url : undefined,
    };
  };
  const notReached = runtimeMembers.filter(
    member => reachedOf(member.id).error,
  );
  const notebookGiver = stage.peers[0] ?? entry;

  return (
    <Box data-scene-example={scene.id}>
      <Text as="p" sx={{ color: 'fg.muted', mt: 0 }} data-scene-assumes="">
        {stage.assumes}
      </Text>
      {anonymous.status === 'active' && anonymous.expiresAt && (
        <Box mb={3}>
          <AnonymousKeyTimer
            expiresAt={anonymous.expiresAt}
            grantedMs={anonymous.grantedMs}
            label={`${entry.app.name}'s trial key`}
            onExpire={() => useAnonymousSessionStore.getState().expire()}
          />
        </Box>
      )}
      {anonymous.status === 'expired' && (
        <Box mb={3}>
          <AnonymousKeyExpired
            agentName={entry.app.name}
            onSignedIn={() => useAnonymousSessionStore.getState().clear()}
          />
        </Box>
      )}
      {entryInBrowser && needsSignIn && (
        <Flash variant="warning" sx={{ mb: 3 }}>
          {entry.app.name} asks its model through the Datalayer inference
          service: sign in, or wait for a visitor&rsquo;s trial key.
        </Flash>
      )}
      {notReached.map(member => (
        <Flash
          key={member.id}
          variant="danger"
          sx={{ mb: 3 }}
          data-scene-needs={member.app.id}
        >
          {memberNeeds(member, reachedOf(member.id).error ?? '').map(line => (
            <Text as="p" key={line} sx={{ m: 0 }}>
              {line}
            </Text>
          ))}
        </Flash>
      ))}
      {runtimeMembers.map(member => (
        <ReachMember
          key={member.id}
          member={member}
          // Its requests are the entry's, or the person's own when the
          // page asks it itself.
          asker={member.entry ? PERSON : entry.app.name}
          tracer={inspector}
          onReached={onReached}
        />
      ))}

      <Box
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
        bg="canvas.subtle"
        px={2}
        pt={2}
        mb={3}
      >
        <SceneView
          members={transcriptMembers}
          tracer={inspector}
          emptyText={`Nothing said yet: ask ${entry.app.name} with one of the suggestions.`}
        >
          <A2ATeamGraph
            entry={{
              id: entry.app.id,
              name: entry.app.name,
              emoji: entry.cast.persona.face || entry.app.emoji,
              character: entry.app.interface.assistant ?? 'paperclip',
              where: whereOf(entry),
              persona: team.entryPersona,
              onToggle: () => composer.current?.focus(),
              conversationLabel: `Ask ${entry.app.name}`,
              onAway: team.setEntryAway,
              history: team.entryHistory,
              connections: runtimeMembers.find(one => one.id === entry.id)
                ?.connections,
              expandTarget: notebookArea,
              notebookTitle: `${notebookGiver.app.name}’s notebook`,
              suggestions: team.ready && !team.busy ? suggestions : undefined,
              onSuggestion: suggestion => send(suggestion.prompt),
              inspector,
              onStop: team.busy ? team.stop : undefined,
              about: aboutOf(entry),
            }}
            peers={stage.peers.map(peer => {
              const kept = team.peers.find(one => one.id === peer.app.id);
              return {
                id: peer.app.id,
                name: peer.app.name,
                emoji:
                  reachedOf(peer.id).peer?.face?.emoji ||
                  peer.cast.persona.face ||
                  peer.app.emoji,
                character: peer.app.interface.assistant ?? 'wizard',
                where: whereOf(peer),
                persona: kept?.persona ?? team.peerPersona,
                onAway: kept?.setAway,
                history: kept?.history,
                connections: runtimeMembers.find(one => one.id === peer.id)
                  ?.connections,
                inspector,
                about: aboutOf(peer),
              };
            })}
            flows={team.flows}
            calls={team.calls}
            links={stage.links.map(link => ({
              from:
                stage.members.find(m => m.id === link.from)?.app.id ??
                link.from,
              to: stage.members.find(m => m.id === link.to)?.app.id ?? link.to,
            }))}
            positions={Object.fromEntries(
              stage.members
                .filter(member => stage.positions[member.id])
                .map(member => [member.app.id, stage.positions[member.id]]),
            )}
            connected={Object.fromEntries(
              stage.peers.map(peer => [
                peer.app.id,
                reachedOf(peer.id).peer !== null,
              ]),
            )}
            labels={Object.fromEntries(
              stage.peers.map(peer => {
                const found = reachedOf(peer.id).peer;
                return [
                  peer.app.id,
                  found ? `A2A · ${found.skill.name}` : 'A2A · not connected',
                ];
              }),
            )}
            // Room for the balloons: suggestions, *more* and a notebook.
            balloonRoom={320}
          />
        </SceneView>
      </Box>

      {/* The notebook a member gave, right under the scene, to run here. */}
      <Box
        ref={notebookArea}
        mb={team.notebook ? 3 : 0}
        data-team-notebook-placement="under-graph"
      />

      <Box display="flex" gap={3} flexWrap="wrap">
        <Box flex="1 1 420px" minWidth={0}>
          <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
            Ask {entry.app.name}
          </Heading>
          <Text as="p" sx={{ color: 'fg.muted', fontSize: 1, mt: 0 }}>
            Or choose one of its suggestions in its balloon: the script&rsquo;s
            cues.
          </Text>
          <Textarea
            ref={composer}
            block
            rows={3}
            value={draft}
            placeholder={suggestions[0]?.prompt ?? 'Ask…'}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send(draft);
              }
            }}
          />
          <Box display="flex" gap={2} mt={2}>
            <Button
              variant="primary"
              disabled={!team.ready || team.busy || !draft.trim()}
              onClick={() => send(draft)}
            >
              Ask
            </Button>
            {team.busy && <Button onClick={team.stop}>Stop</Button>}
          </Box>
          <Box mt={3} data-team-conversation="">
            {team.turns.map((turn, index) => (
              <Box
                key={index}
                p={2}
                mb={2}
                borderRadius={2}
                bg={turn.role === 'user' ? 'accent.subtle' : 'canvas.subtle'}
              >
                <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                  {turn.role === 'user' ? PERSON : entry.app.name}
                </Text>
                <Streamdown>{turn.text}</Streamdown>
              </Box>
            ))}
          </Box>
        </Box>
        <Box flex="1 1 360px" minWidth={0}>
          {!team.notebook && stage.peers.length > 0 && (
            <>
              <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
                The report
              </Heading>
              <Box
                p={3}
                border="1px solid"
                borderColor="border.default"
                borderRadius={2}
                minHeight={120}
                data-team-report=""
              >
                {team.report ? (
                  <Streamdown>{team.report}</Streamdown>
                ) : (
                  <Text sx={{ color: 'fg.muted' }}>
                    What the last member asked returns appears here, as it
                    returned it, or as a notebook to run when it gives one.
                  </Text>
                )}
              </Box>
            </>
          )}
          {scene.setup.length > 0 && (
            <Box mt={3} data-scene-setup="">
              <Heading as="h3" sx={{ fontSize: 1, mb: 1 }}>
                What this scene needs
              </Heading>
              {scene.setup.map(line => (
                <Text
                  key={line}
                  as="p"
                  sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}
                >
                  {line}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function Scenes(): JSX.Element {
  const scenes = useMemo(() => listSceneSpecs(), []);
  const [selected, setSelected] = useState(scenes[0]?.id ?? '');
  const scene = scenes.find(one => one.id === selected) ?? scenes[0];
  return (
    <Box p={4} maxWidth={1080} mx="auto">
      <Heading as="h2" sx={{ fontSize: 4, mb: 1 }}>
        Scenes
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', mt: 0 }}>
        The catalogue&rsquo;s scenes, played against the local servers: each
        member on a runtime is served over A2A by <code>serve_scenes.py</code>;
        the entry in your browser asks on your token or a visitor&rsquo;s trial
        key.
      </Text>
      <UnderlineNav aria-label="Scenes" sx={{ mb: 3 }}>
        {scenes.map(one => (
          <UnderlineNav.Item
            key={one.id}
            aria-current={one.id === scene?.id ? 'page' : undefined}
            onSelect={event => {
              event.preventDefault();
              setSelected(one.id);
            }}
            data-scene-tab={one.id}
          >
            {one.emoji} {one.name}
          </UnderlineNav.Item>
        ))}
      </UnderlineNav>
      {/* Mounted by its id: a tab switch unmounts the scene that ran, which stops its requests. */}
      {scene && <Scene key={scene.id} scene={scene} />}
    </Box>
  );
}

export function ScenesExample(): JSX.Element {
  return (
    <ThemedProvider>
      <Scenes />
    </ThemedProvider>
  );
}

export default ScenesExample;
