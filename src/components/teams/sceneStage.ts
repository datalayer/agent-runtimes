/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A scene as a page stages it (LOOP A-13, A-15), read from the scene spec
 * and its team: who is on stage and where each one stands, who asks whom
 * over A2A, what the entry suggests, and where the members on a runtime are
 * reached when the scene plays against local servers.
 *
 * Pure, so the examples app, the landing and the tests read a scene the
 * same way.
 *
 * @module components/teams/sceneStage
 */

import type { AppSpec } from '../../types/agentspecs';
import type { SceneCastMemberSpec, SceneSpec } from '../../types/scenes';
import type { TeamSpec } from '../../types/teams';
import { APP_CATALOGUE } from '../../specs/apps';
import { listSceneSpecs } from '../../specs/scenes';

/** Who talks to whom over A2A: an edge of the team's graph. */
export type A2ATeamLink = {
  /** The member that asks, by its id. */
  from: string;
  /** The member asked. */
  to: string;
};

/** A reference without its version: `accounting:0.0.1` is `accounting`. */
export function refId(ref: string): string {
  const at = ref.lastIndexOf(':');
  return at > 0 && ref.slice(at + 1).includes('.') ? ref.slice(0, at) : ref;
}

/** The application a cast member is, from the catalogue, or undefined. */
export function appOfMember(
  member: Pick<SceneCastMemberSpec, 'app'>,
): AppSpec | undefined {
  const id = refId(member.app);
  return id && Object.prototype.hasOwnProperty.call(APP_CATALOGUE, id)
    ? APP_CATALOGUE[id]
    : undefined;
}

/**
 * The links of a team over A2A, in the order its members say them: each
 * member's `talks_to … over: a2a`. A link to a server (over `mcp`) is a
 * connection, drawn under the member, not an edge between members.
 */
export function teamLinksOf(
  team: Pick<TeamSpec, 'agents'> | Pick<SceneSpec, 'cast'>,
): A2ATeamLink[] {
  const members: readonly {
    id: string;
    talksTo?: { member: string; over: string }[];
  }[] =
    'cast' in team
      ? team.cast.map(member => ({
          id: member.member,
          talksTo: member.talksTo,
        }))
      : team.agents;
  return members.flatMap(member =>
    (member.talksTo ?? [])
      .filter(link => link.over === 'a2a')
      .map(link => ({ from: member.id, to: link.member })),
  );
}

/** A suggestion the entry offers: a label on its chip, and what is sent. */
export type SceneSuggestion = { label: string; prompt: string };

/**
 * The entry's suggestions: the script's cues, each labelled by the starter
 * of the entry's Appspec that says the same words, or by its first words.
 * Without a scene, the starters themselves.
 */
export function sceneCuesOf(
  scene: Pick<SceneSpec, 'script'> | undefined,
  starters: readonly { label: string; message: string }[],
): SceneSuggestion[] {
  const fromStarters = starters.map(starter => ({
    label: starter.label,
    prompt: starter.message,
  }));
  if (!scene) {
    return fromStarters;
  }
  return scene.script
    .map(beat => beat.cue.say.trim())
    .filter(Boolean)
    .map(prompt => ({
      label:
        fromStarters.find(starter => starter.prompt === prompt)?.label ??
        prompt.split(/\s+/).slice(0, 4).join(' '),
      prompt,
    }));
}

/** One member of a scene, as a page stages it. */
export type SceneStageMember = {
  /** Its id in the cast. */
  id: string;
  /** The application it is. */
  app: AppSpec;
  cast: SceneCastMemberSpec;
  /** Whether it is the member the audience talks to. */
  entry: boolean;
  /** Where its loop turns. */
  runsIn: 'browser' | 'runtime';
  /** The variable its address is read from, when it runs on a runtime. */
  addressVariable?: string;
  /** Where it stands: fractions of the box, from the stage directions. */
  position?: { x: number; y: number };
  /** What its application needs that is not set up, in sentences. */
  setup: string[];
};

/** A scene as a page stages it. */
export type SceneStage = {
  scene: SceneSpec;
  entry: SceneStageMember;
  /** The members the entry asks over A2A, in the cast's order. */
  peers: SceneStageMember[];
  /** Every member, the entry first. */
  members: SceneStageMember[];
  /** The edges between members: the team's `talks_to` over A2A. */
  links: A2ATeamLink[];
  /** Where each member stands, by its id. */
  positions: Record<string, { x: number; y: number }>;
  /** Whose balloon opens first. */
  opensFirst: string;
  /** What the audience is told: the line under the title. */
  assumes: string;
};

/**
 * Read a scene's stage: its members with their applications, who the entry
 * is and whom it asks, the links, the positions. Refused when a cast member
 * is an application the catalogue does not have, or the entry is not in the
 * cast: a page cannot stage what it cannot draw.
 */
export function sceneStageOf(scene: SceneSpec): SceneStage {
  const members = scene.cast
    .filter(member => member.app)
    .map((member): SceneStageMember => {
      const app = appOfMember(member);
      if (!app) {
        throw new Error(
          `The scene ${scene.id} casts ${member.member} as ${member.app}, which the catalogue does not have.`,
        );
      }
      const position = scene.stage.positions[member.member];
      const variable = scene.deployment.addresses[member.member];
      return {
        id: member.member,
        app,
        cast: member,
        entry: member.member === scene.entry,
        runsIn: member.runsIn ?? 'runtime',
        ...(variable ? { addressVariable: variable } : {}),
        ...(position ? { position } : {}),
        setup: app.setup ?? [],
      };
    });
  const entry = members.find(member => member.entry);
  if (!entry) {
    throw new Error(
      `The scene ${scene.id} says its entry is ${scene.entry}, which is not in its cast.`,
    );
  }
  const links = teamLinksOf(scene);
  const asked = links
    .filter(link => link.from === entry.id)
    .map(link => link.to);
  const peers = members.filter(
    member => !member.entry && asked.includes(member.id),
  );
  return {
    scene,
    entry,
    peers,
    members: [entry, ...members.filter(member => !member.entry)],
    links,
    positions: scene.stage.positions,
    opensFirst: scene.stage.opensFirst || entry.id,
    assumes: scene.setting.assumes,
  };
}

/** The port the examples serve Accounting on, as `npm run examples` starts it. */
export const ACCOUNTING_PORT = 8767;

/** The first port `serve_scenes.py` starts a runtime on for the other members. */
export const SCENE_PORTS_FROM = 8768;

/**
 * The members on a runtime across the catalogue's scenes, each once, in
 * the catalogue's order (a scene's cast in its order): what
 * `examples/sales-accounting-a2a/serve_scenes.py` serves, in that order.
 */
export function sceneRuntimeMembers(
  scenes: readonly SceneSpec[] = listSceneSpecs(),
): string[] {
  const seen: string[] = [];
  for (const scene of scenes) {
    for (const member of scene.cast) {
      const id = refId(member.app);
      if (
        id &&
        (member.runsIn ?? 'runtime') === 'runtime' &&
        !seen.includes(id)
      ) {
        seen.push(id);
      }
    }
  }
  return seen;
}

/**
 * The port each runtime member is served on locally: Accounting on
 * {@link ACCOUNTING_PORT}, the others from {@link SCENE_PORTS_FROM} on, in
 * the order of {@link sceneRuntimeMembers}. `serve_scenes.py` gives the
 * same ports by the same rule.
 */
export function sceneRuntimePorts(
  scenes: readonly SceneSpec[] = listSceneSpecs(),
): Record<string, number> {
  const ports: Record<string, number> = {};
  let next = SCENE_PORTS_FROM;
  for (const id of sceneRuntimeMembers(scenes)) {
    if (id === 'accounting') {
      ports[id] = ACCOUNTING_PORT;
    } else {
      ports[id] = next;
      next += 1;
    }
  }
  return ports;
}

/** The variable the examples read a member's local address from: `VITE_A2A_CHANGE_DETECTION_URL`. */
export function sceneAddressVariable(appId: string): string {
  return `VITE_A2A_${appId.replace(/-/g, '_').toUpperCase()}_URL`;
}

/** Where a member is served over A2A on a local runtime at `port`. */
export function localA2AUrl(appId: string, port: number): string {
  return `http://127.0.0.1:${port}/api/v1/a2a/agents/${appId}`;
}

/**
 * Where a member on a runtime is reached by the examples: its variable
 * (`VITE_A2A_<MEMBER>_URL`) when set in `env`, else the local runtime
 * `serve_scenes.py` serves it on.
 */
export function sceneMemberUrl(
  appId: string,
  env: Record<string, string | undefined>,
  ports: Record<string, number> = sceneRuntimePorts(),
): string {
  const port = ports[appId];
  const set = env[sceneAddressVariable(appId)];
  if (set) {
    return set;
  }
  if (port === undefined) {
    throw new Error(
      `${appId} runs on no local runtime the examples serve: set ${sceneAddressVariable(appId)}.`,
    );
  }
  return localA2AUrl(appId, port);
}
