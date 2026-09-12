/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The octicon an agentspec asked for.
 *
 * Every spec names one — `mortar-board` for the tutor, `fold` for the
 * compactor — and until something resolves it, every agent in a menu is drawn
 * with the same fallback and the names do all the work.
 *
 * An explicit map rather than `import * as octicons`. The namespace import
 * resolves any name in one line and pulls the whole icon set into the bundle
 * with it, which a landing page that lazy-loads this workspace pays for on
 * every visit. These are the names the catalogue actually uses.
 *
 * @module loop/plugins/agents/agentIcons
 */

import {
  BeakerIcon,
  BellIcon,
  BookIcon,
  BriefcaseIcon,
  BrowserIcon,
  BugIcon,
  ChecklistIcon,
  CodeReviewIcon,
  ClockIcon,
  CodeIcon,
  CommentDiscussionIcon,
  CpuIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileIcon,
  FoldIcon,
  GitBranchIcon,
  GlobeIcon,
  GraphIcon,
  HeartIcon,
  IssueOpenedIcon,
  LightBulbIcon,
  ListUnorderedIcon,
  MailIcon,
  MegaphoneIcon,
  MortarBoardIcon,
  NoteIcon,
  OrganizationIcon,
  PackageIcon,
  PencilIcon,
  PeopleIcon,
  PlayIcon,
  PulseIcon,
  RssIcon,
  SearchIcon,
  ShareAndroidIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SlidersIcon,
  SunIcon,
  SyncIcon,
  TableIcon,
  TagIcon,
  TasklistIcon,
  TelescopeIcon,
  ToolsIcon,
  RocketIcon,
  ZapIcon,
  type Icon,
} from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';

/** What a spec's `icon` string means, by the name the spec uses. */
const AGENT_ICONS: Record<string, Icon> = {
  agent: AiAgentIcon as Icon,
  beaker: BeakerIcon,
  bell: BellIcon,
  book: BookIcon,
  briefcase: BriefcaseIcon,
  browser: BrowserIcon,
  bug: BugIcon,
  clock: ClockIcon,
  code: CodeIcon,
  'comment-discussion': CommentDiscussionIcon,
  cpu: CpuIcon,
  'credit-card': CreditCardIcon,
  database: DatabaseIcon,
  file: FileIcon,
  checklist: ChecklistIcon,
  'code-review': CodeReviewIcon,
  fold: FoldIcon,
  'git-branch': GitBranchIcon,
  globe: GlobeIcon,
  graph: GraphIcon,
  heart: HeartIcon,
  'issue-opened': IssueOpenedIcon,
  lightbulb: LightBulbIcon,
  // The name octicons actually use; `lightbulb` above is kept for the specs
  // that were already written against it.
  'light-bulb': LightBulbIcon,
  'list-unordered': ListUnorderedIcon,
  mail: MailIcon,
  megaphone: MegaphoneIcon,
  'mortar-board': MortarBoardIcon,
  note: NoteIcon,
  organization: OrganizationIcon,
  package: PackageIcon,
  pencil: PencilIcon,
  people: PeopleIcon,
  play: PlayIcon,
  pulse: PulseIcon,
  rss: RssIcon,
  search: SearchIcon,
  'share-2': ShareAndroidIcon,
  shield: ShieldIcon,
  'shield-check': ShieldCheckIcon,
  sliders: SlidersIcon,
  sun: SunIcon,
  sync: SyncIcon,
  table: TableIcon,
  tag: TagIcon,
  tasklist: TasklistIcon,
  telescope: TelescopeIcon,
  tools: ToolsIcon,
  // Octicons has no trending icon; the landing's registry makes the same
  // substitution, so the two agree on what this name draws.
  'trending-up': GraphIcon,
  rocket: RocketIcon,
  zap: ZapIcon,
};

/**
 * The icon for a spec's `icon` value, or the generic agent one.
 *
 * Never undefined: a menu row with a gap where its neighbours have icons reads
 * as a rendering fault, and "some agent" is a true thing to draw.
 */
export function agentIcon(name?: string): Icon {
  return (name ? AGENT_ICONS[name] : undefined) ?? (AiAgentIcon as Icon);
}

export default agentIcon;
