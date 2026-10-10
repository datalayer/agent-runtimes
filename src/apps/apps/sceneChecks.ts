/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * One validation of a scene (plans/STUDIO.md S-10), said in agentspecs' own
 * sentences: what the spec editor refuses, the stage refuses and `loop`
 * refuses, in the same words wherever a person meets them.
 *
 * This is the browser's half of `agentspecs.scenes.scene_problems` — the
 * same checks, in the same order, each sentence written exactly as the
 * Python writes it, so that a person who reads a refusal here reads it
 * again word for word from `loop scenes rehearse`. Both surfaces of the
 * Studio read this module and nothing else: the stage's line above the
 * board and the panel under the spec editor are the same list.
 *
 * The order is agentspecs' order, because its first layer stops: a cast
 * that makes no team is one sentence and nothing more.
 *
 * 1. the team on stage (`SceneSpec.team_of`): the team it names, or the one
 *    its cast makes — a supervisor with no definition, a member that is two
 *    things at once, a system that asks, a link to nobody, a link over the
 *    wrong protocol. Said, as agentspecs says it, under *Its cast makes no
 *    team*;
 * 2. the scene over that team: its entry, its face, its setting, its
 *    script beat by beat, its stage directions, its audience, where it
 *    plays, its rehearsal.
 *
 * Each sentence carries the section of the spec it is about, so that the
 * stage's own refusals (S-09: who runs where, what the audience may do) are
 * read on their own without a second set of checks.
 *
 * **What stays agentspecs'.** Three checks need more than the browser has,
 * and are made when the scene is loaded by `loop`: a tool a system does not
 * offer or offers for something else (`_tool_problem`, the action classes of
 * a running server); a connection a member of the person's *own*
 * applications reaches a system through (the catalogue's applications are
 * read here, an application kept in a Space is not); and a rehearsal's
 * recording beside the scenes on disk. They are named here so that nobody
 * writes them a second time.
 *
 * Pure: no React, no network.
 *
 * It lives in agent-runtimes beside the application's checks (`checks.ts`),
 * so that every shell that edits a scene — the Studio, and agent-runtimes' own —
 * refuses the same things in the same words (plans/STUDIO.md S-10; moved from
 * the landing 2026-10-10). `__tests__/scene-checks.test.ts` holds it to what
 * agentspecs itself says, sentence for sentence.
 *
 * @module apps/apps/sceneChecks
 */

import { SERVER_ACTIONS } from '../../specs/actions';
import { APP_CATALOGUE } from '../../specs/apps';
import { FRAME_CATALOGUE } from '../../specs/frames';
import { MCP_SERVER_LIBRARY } from '../../specs/mcpServers';
import { getTeamSpec } from '../../specs/teams';
import type {
  SceneCastMemberSpec,
  SceneMoveSpec,
  SceneSpec,
  SceneSystemSpec,
} from '../../types/scenes';
import type { TeamAgentspec, TeamSpec } from '../../types/teams';
import { classesOf, matchesPattern } from './rules';

/** The part of a scene a refusal is about: the sections of its spec. */
export type SceneSection =
  'scene' | 'cast' | 'setting' | 'script' | 'stage' | 'audience' | 'rehearsal';

/** One refusal: the sentence agentspecs says, and the section it is about. */
export type SceneProblem = { says: string; section: SceneSection };

/**
 * The sections a stage is written in (S-09): where each player runs and
 * what it is given (`stage`, `deployment`, a member's `runs_in`), and what
 * the audience may do (`audience`).
 */
export const STAGE_SECTIONS: readonly SceneSection[] = ['stage', 'audience'];

/**
 * The parts a person reads one at a time in the spec editor (S-08, S-09),
 * in the order a scene is written. The scene's own fields are always in
 * view, so they are not one of them.
 */
export const SCENE_PARTS: readonly SceneSection[] = [
  'setting',
  'cast',
  'script',
  'stage',
  'audience',
  'rehearsal',
];

/**
 * Each section of a scene, and the keys of the spec it is written in.
 * *Where it plays* is the stage directions and the addresses together: where
 * each player runs is one thing, said in two keys. Read by the editor's
 * parts (S-09) and by `sceneShape`, which files a refusal of the scene's
 * shape under the part whose key it names.
 */
export const SCENE_SECTION_KEYS: Readonly<
  Record<SceneSection, readonly string[]>
> = {
  scene: ['name', 'description', 'emoji', 'icon', 'tags', 'version'],
  cast: ['entry', 'team', 'cast'],
  setting: ['setting'],
  script: ['script'],
  stage: ['stage', 'deployment'],
  audience: ['audience'],
  rehearsal: ['rehearsal'],
};

/** The section a key of the spec is written in; the scene's own otherwise. */
export const sectionOfKey = (key: string): SceneSection =>
  (Object.entries(SCENE_SECTION_KEYS).find(([, keys]) =>
    keys.includes(key),
  )?.[0] as SceneSection | undefined) ?? 'scene';

/** What a person reads each section as, in the editor's panel. */
export const SECTION_WORDS: Record<SceneSection, string> = {
  scene: 'The scene',
  cast: 'Who is on stage',
  setting: 'What is on stage',
  script: 'What happens',
  stage: 'Where it plays',
  audience: 'Who may watch',
  rehearsal: 'Its rehearsal',
};

/**
 * The checks that are not the browser's: made by agentspecs when `loop`
 * loads the scene. Said here so that no second set of them is written.
 */
export const AGENTSPECS_OWN: readonly string[] = [
  "A rehearsal's recording, which is a file beside the scenes.",
];

const idOf = (ref: string): string => (ref ?? '').split(':')[0];

/** As Python writes a string in a sentence (`repr`): in single quotes. */
const quoted = (value: string): string => `'${value}'`;

/** A cast member as its team member: what agentspecs' `as_team_member` makes of it. */
type CastMember = SceneCastMemberSpec;

const isServer = (member: CastMember): boolean => Boolean(member.server);

const personaName = (member: CastMember): string => member.persona?.name ?? '';

/** The entry agentspecs reads: the one said, else the initiator, else the first of the cast. */
export function entryOf(spec: SceneSpec): string {
  if (spec.entry) {
    return spec.entry;
  }
  const initiator = spec.cast.find(member => member.role === 'initiator');
  return initiator?.member ?? spec.cast[0]?.member ?? '';
}

/**
 * Why the cast makes no team, in agentspecs' sentence, or undefined. The
 * order is the order Python builds the team in: its supervisor, then each
 * member of the cast, then the team over them — and the first that fails is
 * the only one said.
 */
function castMakesNoTeam(spec: SceneSpec): string | undefined {
  const cast = spec.cast;
  const entry = entryOf(spec);
  const front = cast.find(member => member.member === entry);
  if (!front) {
    // Raised as a scene's own refusal, not under *Its cast makes no team*.
    return undefined;
  }
  const said = (why: string) => `Its cast makes no team: ${why}`;
  // The supervisor: the member the audience talks to, as the team's front.
  const name = personaName(front) || front.member;
  if (front.ref && front.app) {
    return said(
      `supervisor ${quoted(name)} is an agent (\`ref\`) or an application (\`app\`), not both`,
    );
  }
  if (!front.ref && !front.app) {
    return said(
      `supervisor ${quoted(name)} needs a \`ref\` into the agent catalogue, an \`app\` from the application catalogue, or a \`model\` and \`instructions\` of its own`,
    );
  }
  // Each member of the cast, in its order.
  for (const member of cast) {
    const given = [member.ref, member.app, member.server].filter(
      Boolean,
    ).length;
    if (given > 1) {
      return said(
        `member ${quoted(member.member)} is an agent (\`ref\`), an application (\`app\`) or a server (\`server\`), not two of them`,
      );
    }
    if (given === 0 && !personaName(member) && !member.brief) {
      return said(
        `member ${quoted(member.member)} needs a \`ref\` into the agent catalogue, an \`app\` from the application catalogue, a \`server\` from the MCP server catalogue, or enough of its own definition (\`name\`, \`goal\`) to stand alone`,
      );
    }
    if (member.server && (member.talksTo ?? []).length) {
      return said(
        `member ${quoted(member.member)} is a server: it answers over MCP and asks nobody`,
      );
    }
  }
  // The team over them: every link.
  const seen = new Set(cast.map(member => member.member));
  const servers = new Set(cast.filter(isServer).map(member => member.member));
  for (const member of cast) {
    for (const link of member.talksTo ?? []) {
      if (!seen.has(link.member)) {
        return said(
          `member ${quoted(member.member)} talks to ${quoted(link.member)}, which is not a member of team ${quoted(spec.id)}`,
        );
      }
      if (link.member === member.member) {
        return said(`member ${quoted(member.member)} talks to itself`);
      }
      if (link.over === 'mcp' && !servers.has(link.member)) {
        return said(
          `member ${quoted(member.member)} talks to ${quoted(link.member)} over mcp, which is not a server: an agent or an application is asked over a2a`,
        );
      }
      if (link.over !== 'mcp' && servers.has(link.member)) {
        return said(
          `member ${quoted(member.member)} talks to ${quoted(link.member)} over ${link.over}, which is a server: a server is asked over mcp`,
        );
      }
    }
  }
  return undefined;
}

/**
 * One of the person's own applications, kept in their Space: what the checks
 * read of it when a member of the cast is one of them rather than an
 * application of the catalogue — its name and face, and what its connections
 * reach. agentspecs reads the catalogue only, so to `loop` a member that is
 * the person's own application reaches no system at all; the Studio has the
 * person's applications, and judges them by what they truly reach, in the
 * same sentences (decided 2026-10-10, S-10).
 */
export type SceneOwnApp = {
  name: string;
  emoji?: string;
  connections: readonly { server: string; only?: readonly string[] }[];
};

/** The person's own applications, by uid — the reference a scene's cast writes for one. */
export type SceneOwnApps = Readonly<Record<string, SceneOwnApp>>;

/** A member's application: the catalogue's, else one of the person's own. */
function appOf(
  ref: string | undefined,
  own: SceneOwnApps | undefined,
): SceneOwnApp | undefined {
  if (!ref) {
    return undefined;
  }
  const id = idOf(ref);
  const catalogued: SceneOwnApp | undefined = APP_CATALOGUE[id];
  return (
    catalogued ??
    (own && Object.prototype.hasOwnProperty.call(own, id) ? own[id] : undefined)
  );
}

/** Whether a member reaches a system: through its application's connection, or a link over MCP. */
function reaches(
  member: CastMember,
  cast: readonly CastMember[],
  serverId: string,
  own: SceneOwnApps | undefined,
): boolean {
  const app = appOf(member.app, own);
  if (
    app &&
    app.connections.some(connection => idOf(connection.server) === serverId)
  ) {
    return true;
  }
  return (member.talksTo ?? []).some(link => {
    const asked = cast.find(other => other.member === link.member);
    return (
      link.over === 'mcp' &&
      asked !== undefined &&
      idOf(asked.server) === serverId
    );
  });
}

/** A system of the setting by its id, its reference or the name the audience reads, whatever the case. */
function systemNamed(
  spec: SceneSpec,
  name: string,
): SceneSystemSpec | undefined {
  const wanted = name.trim().toLowerCase();
  return spec.setting.systems.find(system => {
    const shown = (system.as || idOf(system.server)).toLowerCase();
    return (
      wanted === idOf(system.server) ||
      wanted === system.server.toLowerCase() ||
      wanted === shown
    );
  });
}

/** What a system is read as: `as`, or its id. */
const systemName = (system: { server: string; as: string }): string =>
  system.as || idOf(system.server);

/** What is wrong with one move of a beat, in agentspecs' sentences. */
function moveProblems(
  spec: SceneSpec,
  beatId: string,
  move: SceneMoveSpec,
  links: ReadonlySet<string>,
  own: SceneOwnApps | undefined,
): string[] {
  const where = `Beat '${beatId}':`;
  const mover = spec.cast.find(member => member.member === move.who);
  if (!mover) {
    return [`${where} '${move.who}' moves, and is not in the cast.`];
  }
  if (isServer(mover)) {
    return [
      `${where} '${move.who}' moves, and a system answers tool by tool: it asks nobody.`,
    ];
  }
  if (!move.asks) {
    return [];
  }
  const asked = spec.cast.find(member => member.member === move.asks);
  let system = systemNamed(spec, move.asks);
  if (asked && isServer(asked)) {
    system = system ?? { server: asked.server, as: '', holds: '' };
  }
  if (system) {
    if (move.over === 'a2a') {
      return [
        `${where} '${move.who}' asks '${move.asks}' over a2a, a system: a system is asked over mcp.`,
      ];
    }
    if (!reaches(mover, spec.cast, idOf(system.server), own)) {
      return [
        `${where} '${move.who}' asks '${move.asks}' (${idOf(system.server)}), which it reaches through no connection.`,
      ];
    }
    if (move.tool) {
      const why = toolProblem(
        mover,
        personaNameOf(resolvedCast(spec.cast, own), mover.member),
        idOf(system.server),
        move.tool,
        move.does,
        own,
      );
      return why
        ? [`${where} '${move.who}' asks '${move.asks}' for ${why}`]
        : [];
    }
    return [];
  }
  if (move.over === 'mcp') {
    return [
      `${where} '${move.who}' asks '${move.asks}' over mcp, which is not a system of the scene.`,
    ];
  }
  if (!asked) {
    return [
      `${where} '${move.who}' asks '${move.asks}', which is not in the cast.`,
    ];
  }
  if (!links.has(`${move.who}\u0000${move.asks}`)) {
    return [
      `${where} '${move.who}' asks '${move.asks}', which the team does not have it talk to.`,
    ];
  }
  return [];
}

/** What the transcript calls the audience (agentspecs' `AUDIENCE`). */
const AUDIENCE = 'You';

const ASK = /^([^→:]+?)\s*→\s*([^:]+?)(?::\s*(.+))?$/;
const ANSWER = /^([^→:]+?):\s*(.+)$/;

/**
 * A line of a rehearsal's shape, as agentspecs reads it (`parse_line`):
 * *Sales → Accounting* (an ask), *Accounting → Odoo: odoo_*\** (a tool),
 * *Accounting: a table* (an answer).
 */
export function transcriptLineOf(
  text: string,
): { who: string; whom: string; detail: string } | undefined {
  const asked = ASK.exec(text.trim());
  if (asked) {
    return {
      who: asked[1].trim(),
      whom: asked[2].trim(),
      detail: (asked[3] ?? '').trim(),
    };
  }
  const answered = ANSWER.exec(text.trim());
  if (answered) {
    return { who: answered[1].trim(), whom: '', detail: answered[2].trim() };
  }
  return undefined;
}

/** Every name a rehearsal's line may use, to the id it stands for. */
function namesOf(spec: SceneSpec): Map<string, string> {
  // Every name the transcript may use, to the id it stands for (`_names`).
  const names = new Map<string, string>([[AUDIENCE, AUDIENCE]]);
  for (const member of spec.cast) {
    names.set(member.member, member.member);
    if (personaName(member)) {
      names.set(personaName(member), member.member);
    }
  }
  for (const system of spec.setting.systems) {
    const id = idOf(system.server);
    names.set(id, id);
    names.set(system.server, id);
    names.set(systemName(system), id);
    names.set(systemName(system).toLowerCase(), id);
  }
  return names;
}

/** A member's persona name in the cast, as agentspecs reads it (`_persona_name`). */
function personaNameOf(cast: readonly CastMember[], memberId: string): string {
  const said = cast.find(member => member.member === memberId);
  return said ? (said.persona?.name ?? '') : memberId;
}

/**
 * Why a tool of a system is not one a member may use, or undefined — in
 * agentspecs' words (`_tool_problem`): a tool its application's connections
 * to that server do not reach, a tool the server does not offer, or one it
 * offers for something other than what the move asks of it. What a server
 * offers is the catalogue's (`SERVER_ACTIONS`), read with the same pattern
 * matching and the same classes as a call's rules (`rules.ts`).
 */
function toolProblem(
  member: CastMember,
  name: string,
  serverId: string,
  tool: string,
  does: string | null | undefined,
  own: SceneOwnApps | undefined,
): string | undefined {
  const app = appOf(member.app, own);
  if (app) {
    const connections = app.connections.filter(
      connection => idOf(connection.server) === serverId,
    );
    const reached = (only: readonly string[] | undefined) =>
      !only?.length || only.some(pattern => matchesPattern(tool, pattern));
    if (
      connections.length &&
      !connections.some(connection => reached(connection.only))
    ) {
      return `'${tool}', a tool no connection of ${name} offers.`;
    }
  }
  const server = Object.prototype.hasOwnProperty.call(SERVER_ACTIONS, serverId)
    ? SERVER_ACTIONS[serverId]
    : undefined;
  const declared = Object.keys(server?.tools ?? {});
  if (
    declared.length &&
    !declared.some(
      known => matchesPattern(known, tool) || matchesPattern(tool, known),
    )
  ) {
    return `'${tool}', which ${serverId} does not offer.`;
  }
  if (does && server && declared.includes(tool)) {
    const classes = classesOf(`${serverId}.${tool}`, {});
    if (classes.length && !classes.includes(does as never)) {
      return `'${tool}' to ${does}, and it ${classes.join(', ')}s.`;
    }
  }
  return undefined;
}

/** What to show a person of a team member: its name, what it references, or its id (`display_name`). */
const displayName = (member: TeamAgentspec): string =>
  member.name ||
  idOf(member.ref || member.app || member.server || '') ||
  member.id;

/**
 * The cast a named team puts on stage, as its members (`cast_of`): each
 * with its persona filled — the cast's name, else its application's, else
 * what to show a person; the cast's face, else its application's.
 */
function castOfTeam(
  spec: SceneSpec,
  team: TeamSpec | undefined,
): readonly CastMember[] {
  if (!team) {
    return spec.cast;
  }
  return team.agents.map((member: TeamAgentspec) => {
    const said = spec.cast.find(one => one.member === member.id);
    const app = member.app ? APP_CATALOGUE[idOf(member.app)] : undefined;
    return {
      member: member.id,
      app: member.app ?? '',
      ref: member.ref ?? '',
      server: member.server ?? '',
      role: member.role ?? '',
      ...(member.runsIn ? { runsIn: member.runsIn } : {}),
      ...(member.talksTo?.length
        ? {
            talksTo: member.talksTo.map(link => ({
              member: link.member,
              over: link.over,
            })),
          }
        : {}),
      persona: {
        name: said?.persona?.name || (app ? app.name : displayName(member)),
        face: said?.persona?.face || (app ? app.emoji : ''),
        line: said?.persona?.line ?? '',
      },
      brief: said?.brief || member.goal || '',
    };
  }) as CastMember[];
}

/**
 * The cast with every persona resolved (`cast_of`), for the names a
 * rehearsal may use and the faces a scene may not wear: a member of an
 * inline cast that says no name is read as its application's.
 */
function resolvedCast(
  cast: readonly CastMember[],
  own: SceneOwnApps | undefined,
): readonly CastMember[] {
  return cast.map(member => {
    const app = appOf(member.app, own);
    return {
      ...member,
      persona: {
        ...member.persona,
        name:
          member.persona?.name ||
          (app
            ? app.name
            : idOf(member.ref || member.app || member.server) || member.member),
        face: member.persona?.face || (app?.emoji ?? ''),
      },
    };
  });
}

/**
 * What is wrong with the shape of the scene, as agentspecs reads it
 * (`SceneSpec._stages_somebody`), said as `parse_scene` says it — the
 * scene's id, then the sentence. The first stops, as the reader stops.
 */
export function sceneShapeProblem(spec: SceneSpec): SceneProblem | undefined {
  const said = (says: string, section: SceneSection): SceneProblem => ({
    says: `${spec.id}: ${says}`,
    section,
  });
  if (!spec.team && !spec.cast.length) {
    return said(
      'the scene stages nobody: it names a `team`, or writes its `cast`',
      'cast',
    );
  }
  const seen = new Set<string>();
  for (const member of spec.cast) {
    if (seen.has(member.member)) {
      return said(`the cast names '${member.member}' twice`, 'cast');
    }
    seen.add(member.member);
  }
  const beats = new Set<string>();
  for (const beat of spec.script) {
    if (beats.has(beat.id)) {
      return said(`the script has two beats named '${beat.id}'`, 'script');
    }
    beats.add(beat.id);
  }
  // Where each member stands: fractions of the box (`StagePosition`).
  for (const [memberId, at] of Object.entries(spec.stage.positions)) {
    for (const [axis, value] of [
      ['x', at.x],
      ['y', at.y],
    ] as const) {
      if (value > 1) {
        return said(
          `stage.positions.${memberId}.${axis}: Input should be less than or equal to 1`,
          'stage',
        );
      }
      if (value < 0) {
        return said(
          `stage.positions.${memberId}.${axis}: Input should be greater than or equal to 0`,
          'stage',
        );
      }
    }
  }
  return undefined;
}

/**
 * What stops a scene from being played, each in agentspecs' sentence with
 * the section it is about; empty when nothing does.
 */
export function sceneCheck(
  spec: SceneSpec,
  own?: SceneOwnApps,
): SceneProblem[] {
  // 1. The shape of the scene, as it is read (`parse_scene`): the first stops.
  const shape = sceneShapeProblem(spec);
  if (shape) {
    return [shape];
  }
  // 2. The team on stage.
  if (spec.team) {
    const team = getTeamSpec(idOf(spec.team));
    if (!team) {
      return [
        {
          says: `There is no team named ${quoted(spec.team)}.`,
          section: 'cast',
        },
      ];
    }
    // A scene that names a team says how each member is played, and nothing
    // of what each is: the team says that (`scene_problems`). The editor's text
    // is written with an inline cast and no team, so this speaks only of a
    // team a person wrote — never of a catalogue scene read resolved.
    const ids = new Set(team.agents.map(member => member.id));
    const castProblems: SceneProblem[] = [];
    for (const said of spec.cast) {
      if (!ids.has(said.member)) {
        castProblems.push({
          says: `The cast names '${said.member}', which is not a member of the team '${team.id}'.`,
          section: 'cast',
        });
      } else if (
        Boolean(said.app || said.ref || said.server) ||
        said.role != null ||
        said.runsIn != null ||
        Boolean(said.talksTo?.length)
      ) {
        castProblems.push({
          says: `The cast member '${said.member}' is the team's: it says its persona and its brief, nothing of what it is.`,
          section: 'cast',
        });
      }
    }
    return [
      ...castProblems,
      ...sceneOverTeam(spec, castOfTeam(spec, team), own),
    ];
  }
  const entry = entryOf(spec);
  if (!spec.cast.some(member => member.member === entry)) {
    return [
      {
        says: `The scene enters at '${entry}', which is not in its cast.`,
        section: 'cast',
      },
    ];
  }
  const noTeam = castMakesNoTeam(spec);
  if (noTeam) {
    return [{ says: noTeam, section: 'cast' }];
  }
  return sceneOverTeam(spec, spec.cast, own);
}

/** The scene read over the team on stage: everything after `team_of` passed. */
function sceneOverTeam(
  spec: SceneSpec,
  cast: readonly CastMember[],
  own: SceneOwnApps | undefined,
): SceneProblem[] {
  const problems: SceneProblem[] = [];
  const say = (section: SceneSection, says: string) =>
    problems.push({ says, section });
  const ids = new Set(cast.map(member => member.member));
  const entry = entryOf(spec);
  if (spec.entry && !ids.has(spec.entry)) {
    say(
      'cast',
      `The scene enters at '${spec.entry}', which is not in its cast.`,
    );
  }
  const front = cast.find(member => member.member === entry);
  if (front && isServer(front)) {
    say(
      'cast',
      `The scene enters at '${entry}', a system: the audience talks to an agent.`,
    );
  }
  const resolved = resolvedCast(cast, own);
  const faces = resolved.map(member => member.persona?.face).filter(Boolean);
  if (spec.emoji && faces.includes(spec.emoji)) {
    say(
      'scene',
      `The scene wears ${spec.emoji}, a member's face: a scene has a face of its own.`,
    );
  }
  // The setting.
  for (const system of spec.setting.systems) {
    const id = idOf(system.server);
    if (!MCP_SERVER_LIBRARY[id]) {
      say('setting', `There is no MCP server named ${quoted(system.server)}.`);
    } else if (
      !cast.some(
        member => reaches(member, cast, id, own) || idOf(member.server) === id,
      )
    ) {
      say(
        'setting',
        `The system '${systemName(system)}' (${id}) is on stage, and no member of the cast reaches it.`,
      );
    }
  }
  for (const ref of spec.setting.frames ?? []) {
    if (!FRAME_CATALOGUE[idOf(ref)]) {
      say('setting', `There is no Frame named ${quoted(ref)}.`);
    }
  }
  // The script.
  const links = new Set(
    cast.flatMap(member =>
      (member.talksTo ?? []).map(
        link => `${member.member}\u0000${link.member}`,
      ),
    ),
  );
  const beats = new Set(spec.script.map(beat => beat.id));
  for (const beat of spec.script) {
    let answered = false;
    const moves = [
      ...beat.moves,
      ...(beat.branch ?? []).flatMap(branch => branch.moves ?? []),
    ];
    for (const move of moves) {
      for (const says of moveProblems(
        { ...spec, cast: cast as CastMember[] },
        beat.id,
        move,
        links,
        own,
      )) {
        say('script', says);
      }
      answered = answered || move.who === entry;
    }
    if (!answered) {
      say(
        'script',
        `Beat '${beat.id}': its cue is answered by nobody — no move is the entry's ('${entry}').`,
      );
    }
    for (const branch of beat.branch ?? []) {
      if (branch.then && !beats.has(branch.then)) {
        say(
          'script',
          `Beat '${beat.id}': its branch goes on to '${branch.then}', which is no beat.`,
        );
      }
    }
  }
  // The stage directions.
  for (const memberId of Object.keys(spec.stage.positions)) {
    if (!ids.has(memberId)) {
      say('stage', `The stage places '${memberId}', which is not in the cast.`);
    }
  }
  if (spec.stage.opensFirst && !ids.has(spec.stage.opensFirst)) {
    say(
      'stage',
      `The balloon of '${spec.stage.opensFirst}' opens first, and it is not in the cast.`,
    );
  }
  // The audience, and where the scene plays.
  for (const memberId of Object.keys(spec.deployment.addresses)) {
    const member = cast.find(item => item.member === memberId);
    if (!member) {
      say(
        'stage',
        `An address is read for '${memberId}', which is not in the cast.`,
      );
    } else if (member.runsIn === 'browser') {
      say('stage', `'${memberId}' runs in the browser: it has no address.`);
    }
  }
  if (spec.audience.who === 'visitors') {
    for (const member of cast) {
      if (
        !isServer(member) &&
        member.runsIn === 'runtime' &&
        !(member.member in spec.deployment.addresses)
      ) {
        say(
          'audience',
          `Visitors may watch, and '${member.member}' runs on a runtime with no address: deployment.addresses names none for it.`,
        );
      }
    }
  }
  // The rehearsal.
  const names = namesOf({ ...spec, cast: resolved as CastMember[] });
  const systemIds = new Set(
    spec.setting.systems.map(system => idOf(system.server)),
  );
  const rehearsed = new Set<string>();
  for (const rehearsal of spec.rehearsal.beats) {
    if (!beats.has(rehearsal.beat)) {
      say(
        'rehearsal',
        `The rehearsal names the beat '${rehearsal.beat}', which is not in the script.`,
      );
    }
    if (rehearsed.has(rehearsal.beat)) {
      say(
        'rehearsal',
        `The rehearsal names the beat '${rehearsal.beat}' twice.`,
      );
    }
    rehearsed.add(rehearsal.beat);
    for (const text of rehearsal.lines ?? []) {
      const line = transcriptLineOf(text);
      if (!line) {
        // A line that is neither an ask nor an answer is refused as it is read.
        say(
          'rehearsal',
          `${spec.id}: the line '${text}' is neither an ask (\`A → B\`) nor an answer (\`A: …\`)`,
        );
        continue;
      }
      for (const name of [line.who, line.whom]) {
        if (name && !names.has(name)) {
          say(
            'rehearsal',
            `The rehearsal of '${rehearsal.beat}' names '${name}', which is not on stage.`,
          );
        }
      }
      // A tool a member is expected to ask a system for (`_tool_problem`).
      const whom = names.get(line.whom) ?? '';
      const asker = (resolved as CastMember[]).find(
        member => member.member === (names.get(line.who) ?? ''),
      );
      if (systemIds.has(whom) && line.detail && asker) {
        const why = toolProblem(
          asker,
          personaNameOf(resolved as CastMember[], asker.member),
          whom,
          line.detail,
          null,
          own,
        );
        if (why) {
          say(
            'rehearsal',
            `The rehearsal of '${rehearsal.beat}' expects ${why}`,
          );
        }
      }
    }
  }
  return problems;
}

/** What stops a scene from being played, in agentspecs' sentences; empty when nothing does. */
export const sceneProblems = (spec: SceneSpec, own?: SceneOwnApps): string[] =>
  sceneCheck(spec, own).map(problem => problem.says);

/** The refusals of one section of the spec: the stage's, for S-09's own panel. */
export const problemsOfSections = (
  problems: readonly SceneProblem[],
  sections: readonly SceneSection[],
): SceneProblem[] =>
  problems.filter(problem => sections.includes(problem.section));
