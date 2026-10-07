/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Scenes (agentspecs `scenes`, `schema: loop.scene/v1`, LOOP A-11): a team,
 * staged. The team says who is on stage; the scene says what happens there —
 * the setting, the script, the stage directions, the audience, the rehearsal
 * and where it plays.
 *
 * In the generated catalogue the cast is resolved: every member of the team,
 * each with its persona filled from its application, and the `entry` said.
 *
 * @module types/scenes
 */

import type { AppVerifiedSpec } from './agentspecs';
import type { TeamLinkSpec } from './teams';

/** How a member appears to the audience, in a scene. */
export interface ScenePersonaSpec {
  /** The name the audience sees. */
  name: string;
  /** One emoji, its face on stage. */
  face: string;
  /** One line of *who I am here*. */
  line: string;
}

/** A member of the cast: a member of the team, with its persona and its brief. */
export interface SceneCastMemberSpec {
  /** Its id in the team. */
  member: string;
  /** The application it is, `id:version`; empty for an agent or a server. */
  app: string;
  /** The agent it is, when it is not an application. */
  ref: string;
  /** The MCP server it is, a system of the scene, when it is one. */
  server: string;
  /** What it is for, structurally: initiator, contributor, … */
  role?: string;
  /** Where its loop turns. */
  runsIn?: 'browser' | 'runtime';
  /** Whom it asks, and over what; absent when it asks nobody. */
  talksTo?: TeamLinkSpec[];
  persona: ScenePersonaSpec;
  /** What it is for in this scene, over its application's instructions. */
  brief: string;
}

/** A system on stage: an MCP server the cast reaches. */
export interface SceneSystemSpec {
  /** The server, `id` or `id:version`. */
  server: string;
  /** The name the audience reads on the graph and in the transcript. */
  as: string;
  /** What it holds in this scene. */
  holds: string;
}

/** The stage: what is on it, and what the audience is told. */
export interface SceneSettingSpec {
  systems: SceneSystemSpec[];
  /** The Frames the scene plays under, over the team's; absent when none. */
  frames?: string[];
  /** The data in play; absent when none. */
  contents?: string[];
  /** When the scene plays, in words. */
  period: string;
  /** The language it plays in, `en`. */
  language: string;
  /** What the audience is told before it starts: the line under the title. */
  assumes: string;
}

/** What starts a beat: one of the three is said. */
export interface SceneCueSpec {
  /** An opener the audience may say: the entry's suggestion on the page. */
  say: string;
  schedule: string;
  event: string;
}

/** What kind of answer comes back, and what the page shows. */
export type SceneAnswerKind =
  | 'words'
  | 'table'
  | 'chart'
  | 'notebook'
  | 'map'
  | 'file'
  | 'image'
  /** The sources it read, as cards that open (STUDIO H-02). */
  | 'sources'
  /** A choice as buttons that answer the application. */
  | 'choice'
  /** A choice whose option does more than read: asked, and refused to a visitor. */
  | 'approval';

/** How fast a beat plays for the audience. */
export type ScenePace = 'quick' | 'steady' | 'slow';

/** One member asking another over a protocol, or answering the audience. */
export interface SceneMoveSpec {
  /** The member moving, by its id in the cast. */
  who: string;
  /** Whom: a member or a system; empty when it answers the audience. */
  asks: string;
  /** `a2a` to a member, `mcp` to a system. */
  over?: 'a2a' | 'mcp';
  /** What it asks for, or what it answers, in words. */
  what: string;
  /** Over `mcp`: the tool, by name or pattern. */
  tool: string;
  /** The kind of tool: `read`, `write`, … */
  does?: string;
  /** What kind of answer comes back. */
  answers?: SceneAnswerKind;
}

/** What a beat does instead when a decision holds. */
export interface SceneBranchSpec {
  decision: string;
  expect: string;
  /** The moves then, when they differ; absent otherwise. */
  moves?: SceneMoveSpec[];
  /** The beat that follows, by id. */
  then: string;
}

/** One beat of the script. */
export interface SceneBeatSpec {
  id: string;
  cue: SceneCueSpec;
  /** One line for the audience, read in the transcript. */
  narration: string;
  moves: SceneMoveSpec[];
  /** What should happen, in words. */
  expect: string;
  /** What the page shows: said, or the kinds of the answers to the audience. */
  shows: SceneAnswerKind[];
  /** Its pace; the stage's when absent. */
  pace?: ScenePace;
  /** What it does instead, on a decision; absent when it never branches. */
  branch?: SceneBranchSpec[];
}

/** Where a member stands: fractions of the box. */
export interface ScenePositionSpec {
  x: number;
  y: number;
}

/** What the transcript shows. */
export interface SceneTranscriptSpec {
  tools: boolean;
  narration: boolean;
  /** Words withheld; absent when none. */
  withhold?: ('credentials' | 'ids' | 'addresses' | 'amounts')[];
}

/** Directions for the page. */
export interface SceneStageSpec {
  positions: Record<string, ScenePositionSpec>;
  /** Whose balloon opens first; the entry's when empty. */
  opensFirst: string;
  transcript: SceneTranscriptSpec;
  inspectors: ('agent' | 'tools' | 'a2a' | 'notebook' | 'cost')[];
  /** How long the scene plays before it rests, `10m`. */
  restsAfter: string;
  pace: ScenePace;
}

/** Who may watch and ask, and what an ask may cost. */
export interface SceneAudienceSpec {
  who: 'visitors' | 'signed-in' | 'nobody';
  /** What one ask may cost, in USD; the site's when 0. */
  ceilingPerAsk: number;
  /** How many asks a visitor gets a day; the site's when 0. */
  asksADay: number;
}

/** What a beat's transcript must look like. */
export interface SceneRehearsalBeatSpec {
  beat: string;
  /** The shape, in order: `Sales → Accounting`, `Accounting → Odoo: odoo_accounting_*`, `Accounting: a table`. */
  lines: string[];
  mustSay?: string[];
  mustNotSay?: string[];
  within: string;
}

/** A transcript recorded once, played when the scene cannot play live (LOOP H-08). */
export interface SceneRecordingSpec {
  path: string;
  taken: string;
  note: string;
}

/** The scene's tests: a passing rehearsal is the gallery's *Live*. */
export interface SceneRehearsalSpec {
  beats: SceneRehearsalBeatSpec[];
  within: string;
  recording?: SceneRecordingSpec;
  verified: AppVerifiedSpec;
}

/** Where the scene plays. */
export interface SceneDeploymentSpec {
  account: string;
  /** The page it plays on. */
  page: string;
  /** For each member on a runtime, the variable its address is read from at build. */
  addresses: Record<string, string>;
}

/** Specification for a scene: a team, staged. */
export interface SceneSpec {
  /** The version of the spec itself: `loop.scene/v1`. */
  schema: string;
  id: string;
  version: string;
  /** The tab's name. */
  name: string;
  description: string;
  tags: string[];
  icon: string;
  /** Its face: one emoji, drawn before its name. */
  emoji: string;
  /** The team it stages, `id:version`; empty when the cast was written inline. */
  team: string;
  /** The member the audience talks to. */
  entry: string;
  /** The cast, resolved: every member of the team with its persona filled. */
  cast: SceneCastMemberSpec[];
  setting: SceneSettingSpec;
  script: SceneBeatSpec[];
  stage: SceneStageSpec;
  audience: SceneAudienceSpec;
  rehearsal: SceneRehearsalSpec;
  deployment: SceneDeploymentSpec;
  /** What it names that is not enabled today, in sentences. */
  setup: string[];
}
