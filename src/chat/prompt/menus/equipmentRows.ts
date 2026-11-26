/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The MCP servers and the skills of a conversation, as rows: one source for
 * the composer's two dots and its footer's two menus (the user, 19 November
 * 2026: "the exact same overlay should be shown, the indicator and footer
 * are just one way to show the same information").
 *
 * A row says what a server or a skill is, its state in words, why it is off,
 * and whether the conversation has it on — the runtime's equipment (an
 * application's, `useEquipment`), its MCP servers with their tools (its
 * config), their live status, and what the conversation switched on. A row
 * whose switch cannot be used says why (`locked`): the runtime's reason or
 * the spec's, never "disabled without an account" for what the runtime
 * offers.
 *
 * @module chat/prompt/menus/equipmentRows
 */

import type {
  Equipment,
  EquipmentModel,
  EquipmentServer,
  EquipmentSkill,
  McpServerState,
} from '../../../hooks/useEquipment';
import type { MCPServerConfig } from '../../../types/chat';
import type {
  McpServerStatus,
  McpToolsetsStatusResponse,
} from '../../../types/mcp';
import type { SkillInfo } from '../../../types/skills';
import { SKILLS_CATALOG } from '../../../specs/skills';

export const EQUIPMENT_WORDS = {
  switches:
    'What this conversation uses: switch a server, its tools or a skill on or off.',
  declared:
    'As its spec declares them: its runtime has not said their state yet.',
  model: 'Model',
  modelChosen: 'Chosen by the application: its model is the same for everyone.',
  servers: 'MCP servers',
  skills: 'Skills',
  none: { servers: 'It uses no MCP server.', skills: 'It has no skill.' },
  optional: 'optional',
  enableAll: 'Enable all',
  enabled: 'Enabled',
  approved: 'Approved',
  readOnly: {
    runs: 'Reads only: runs without asking. Untick Approved to be asked first.',
    asks: 'Reads only: asks first, as you chose.',
  },
  codemode: 'Codemode',
  codemodeOn:
    'MCP tools reached through meta-tools (search_tools, execute_code).',
  codemodeOff: 'MCP tools exposed directly to the model.',
  codemodeLocked: 'Its runtime takes no codemode switch from this page.',
  serverState: {
    started: 'Running',
    starting: 'Starting',
    failed: 'Failed',
    not_started: 'Not started',
    left_out: 'Off',
  },
  skillState: {
    active: 'Active',
    not_activated: 'Not activated',
    loaded: 'Loaded',
    enabled: 'Enabled',
    available: 'Off',
  },
  modelState: {
    current: 'In use',
    available: 'Available',
    off: 'Not available',
  },
  declaredState: 'Declared',
  locked: {
    notRunning: 'Not running: nothing to switch until it starts.',
    notStarted:
      'Send a first message: the switches apply to this conversation once it has started.',
    notConnected: 'Not connected to its runtime yet: the switches wait for it.',
  },
} as const;

export type Tone = 'success' | 'attention' | 'danger' | 'neutral' | 'accent';

/** A row: what it is, its state in words, and why it is off. */
export type EquipmentRow = {
  id: string;
  name: string;
  state: string;
  tone: Tone;
  /** Whether it counts as on. */
  on: boolean;
  reason?: string;
  note?: string;
};

/** A tool of a running server, with the conversation's switches. */
export type ToolRow = {
  name: string;
  description?: string;
  enabled: boolean;
  approved: boolean;
  /** Classed read only by the catalogue: approved unless the person says otherwise. */
  readOnly?: boolean;
};

/** An MCP server, with its tools and why its switches cannot be used. */
export type ServerRow = EquipmentRow & {
  /** The id its runtime knows it by: what a switch sends. */
  switchId: string;
  tools: ToolRow[];
  /** Why its switches cannot be used; none when they can. */
  locked?: string;
};

/** A skill, with the conversation's switches. */
export type SkillRow = EquipmentRow & {
  /** The id its runtime knows it by: what a switch sends. */
  switchId: string;
  description?: string;
  enabled: boolean;
  approved: boolean;
  locked?: string;
};

/** The two lists, and whether they are only the spec's. */
export type EquipmentLists = {
  declared: boolean;
  servers: ServerRow[];
  skills: SkillRow[];
};

/** Everything the rows are made from; any may be missing. */
export type EquipmentSources = {
  /** An application's equipment: its runtime's answer, or its spec's list. */
  equipment?: Pick<Equipment, 'source' | 'servers' | 'skills'>;
  /** The runtime's MCP servers, with their tools. */
  mcpServers?: MCPServerConfig[];
  /** Their live status. */
  mcpStatus?: McpToolsetsStatusResponse | null;
  enabledMcpTools?: Map<string, Set<string>>;
  approvedMcpTools?: Map<string, Set<string>>;
  /** The skills the runtime reports for the conversation. */
  skills?: SkillInfo[];
  enabledSkills?: Set<string>;
  /** The skills the conversation switched, on or off: over anything else. */
  skillsSwitched?: Record<string, boolean>;
  approvedSkills?: Set<string>;
  /** Why no switch can be used here; none when they can. */
  locked?: string;
};

const bare = (id: string): string => id.split(':', 1)[0];

/**
 * An id as words, for a skill no catalogue names: `datalayer-memory-add` is
 * "Datalayer Memory Add". Never the bare id in a menu.
 */
export function humanisedId(id: string): string {
  const words = bare(id)
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : id;
}

/**
 * A skill's name, for a person: what its runtime calls it, unless that is
 * its id again (a runtime whose catalogue has no entry for it answers the
 * id, and a loaded skill's own name is its id); then the page's catalogue,
 * then the id as words.
 */
export function skillNameOf(
  id: string,
  ...said: (string | undefined)[]
): string {
  const key = bare(id);
  const named = said.find(
    name => name && name.trim() && bare(name.trim()) !== key,
  );
  return named?.trim() || SKILLS_CATALOG[key]?.name || humanisedId(key);
}

/**
 * A skill's description, for a menu: its runtime's catalogue, the page's
 * catalogue, and only then the skill's own (written for the model).
 */
export function skillDescriptionOf(
  id: string,
  catalogued?: string,
  own?: string,
): string | undefined {
  return (
    catalogued?.trim() ||
    SKILLS_CATALOG[bare(id)]?.description?.trim() ||
    own?.trim() ||
    undefined
  );
}

const SERVER_STATES: readonly McpServerState[] = [
  'started',
  'starting',
  'failed',
  'not_started',
  'left_out',
];

const toneOfServer = (state: McpServerState | undefined): Tone =>
  state === 'started'
    ? 'success'
    : state === 'failed'
      ? 'danger'
      : state === 'starting'
        ? 'attention'
        : 'neutral';

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The tools a server has on: its entry in the conversation's switches, or
 * all of them while the conversation has switched none — the runtime's
 * default, everything a server brings.
 */
export function enabledToolsOf(
  enabled: Map<string, Set<string>> | undefined,
  serverId: string,
  toolNames: string[],
): Set<string> {
  return enabled?.get(serverId) ?? new Set(toolNames);
}

/** An application's MCP server as a row, from its equipment alone. */
export function serverRow(server: EquipmentServer): EquipmentRow {
  const state = server.state;
  return {
    id: server.id,
    name: server.name,
    state: state
      ? EQUIPMENT_WORDS.serverState[state]
      : EQUIPMENT_WORDS.declaredState,
    tone: toneOfServer(state),
    on: state === 'started',
    ...(server.reason ? { reason: server.reason } : {}),
    ...(state === 'started' && server.tools !== undefined
      ? { note: plural(server.tools, 'tool') }
      : server.optional
        ? { note: EQUIPMENT_WORDS.optional }
        : {}),
  };
}

/** An application's skill as a row, from its equipment alone. */
export function skillRow(skill: EquipmentSkill): EquipmentRow {
  const state = skill.state;
  return {
    id: skill.id,
    name: skillNameOf(skill.id, skill.name),
    state: state
      ? EQUIPMENT_WORDS.skillState[state]
      : EQUIPMENT_WORDS.declaredState,
    tone: state === 'active' ? 'success' : 'neutral',
    on: state === 'active',
    ...(skill.reason ? { reason: skill.reason } : {}),
    ...(skill.optional ? { note: EQUIPMENT_WORDS.optional } : {}),
  };
}

/** A model as a row. */
export function modelRow(model: EquipmentModel): EquipmentRow {
  const off = model.isAvailable === false;
  return {
    id: model.id,
    name: model.name,
    state: model.current
      ? EQUIPMENT_WORDS.modelState.current
      : off
        ? EQUIPMENT_WORDS.modelState.off
        : EQUIPMENT_WORDS.modelState.available,
    tone: model.current ? 'accent' : off ? 'neutral' : 'success',
    on: !off,
    ...(off && model.unavailableReason
      ? { reason: model.unavailableReason }
      : {}),
  };
}

/** What a row says to a screen reader: its name, its state, and why. */
export function rowWords(row: EquipmentRow): string {
  return [row.name, row.state, row.reason, row.note].filter(Boolean).join(', ');
}

/** The MCP servers, from every source, each once, in the spec's order. */
function serverRows(sources: EquipmentSources): ServerRow[] {
  const declared = sources.equipment?.servers ?? [];
  const config = sources.mcpServers ?? [];
  const status = sources.mcpStatus?.servers ?? [];
  const ids: string[] = [];
  const add = (id: string) => {
    const key = bare(id);
    if (key && !ids.includes(key)) {
      ids.push(key);
    }
  };
  declared.forEach(each => add(each.id));
  config.forEach(each => add(each.id));
  status.forEach(each => add(each.id));
  return ids.map(id => {
    const said = declared.find(each => bare(each.id) === id);
    const configured = config.find(each => bare(each.id) === id);
    const live: McpServerStatus | undefined = status.find(
      each => bare(each.id) === id,
    );
    const liveState = SERVER_STATES.includes(live?.status as McpServerState)
      ? (live?.status as McpServerState)
      : undefined;
    // Left out is the runtime's decision, which no status overrides; then
    // the freshest word: the live status, the equipment's, the config's.
    const state: McpServerState | undefined =
      said?.state === 'left_out'
        ? 'left_out'
        : (liveState ??
          said?.state ??
          (configured
            ? configured.isAvailable
              ? 'started'
              : 'not_started'
            : undefined));
    const listed =
      configured && configured.tools.length > 0
        ? configured.tools
        : (live?.tools ?? []);
    const switchId = configured?.id ?? live?.id ?? said?.id ?? id;
    const names = listed.map(tool => tool.name);
    const enabled = enabledToolsOf(sources.enabledMcpTools, switchId, names);
    const approved = sources.approvedMcpTools?.get(switchId);
    const readOnly = parseReadOnlyMcpToolsByServer(sources.mcpStatus)?.get(
      switchId,
    );
    const tools: ToolRow[] =
      state === 'started'
        ? listed.map(tool => ({
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            enabled: enabled.has(tool.name),
            approved: approved?.has(tool.name) ?? false,
            ...(readOnly?.has(tool.name) ? { readOnly: true } : {}),
          }))
        : [];
    const toolsOn = tools.filter(tool => tool.enabled).length;
    // Switched off whole by the conversation, its tools listed or not.
    const switchedOff = sources.enabledMcpTools?.get(switchId)?.size === 0;
    const count = tools.length || said?.tools || live?.tools_count;
    const reason =
      said?.reason ||
      (state === 'failed' ? live?.reason || live?.error : undefined) ||
      undefined;
    // A running server is switched whole whether or not its tools are
    // listed: its runtime knows them.
    const locked =
      state === undefined
        ? EQUIPMENT_WORDS.declared
        : state !== 'started'
          ? (reason ?? EQUIPMENT_WORDS.locked.notRunning)
          : sources.locked;
    const note =
      state === 'started' && tools.length > 0
        ? `${toolsOn}/${plural(tools.length, 'tool')} on`
        : state === 'started' && count !== undefined
          ? plural(count, 'tool')
          : said?.optional
            ? EQUIPMENT_WORDS.optional
            : undefined;
    return {
      id,
      switchId,
      name: said?.name || configured?.name || id,
      state: state
        ? EQUIPMENT_WORDS.serverState[state]
        : EQUIPMENT_WORDS.declaredState,
      tone: toneOfServer(state),
      on:
        state === 'started' &&
        (tools.length === 0 ? !switchedOff : toolsOn > 0),
      tools,
      ...(reason ? { reason } : {}),
      ...(note ? { note } : {}),
      ...(locked ? { locked } : {}),
    };
  });
}

/** The skills, from every source, each once, in the spec's order. */
function skillRows(sources: EquipmentSources): SkillRow[] {
  const declared = sources.equipment?.skills ?? [];
  const reported = sources.skills ?? [];
  const ids: string[] = [];
  const add = (id: string) => {
    const key = bare(id);
    if (key && !ids.includes(key)) {
      ids.push(key);
    }
  };
  declared.forEach(each => add(each.id));
  reported.forEach(each => add(each.id));
  return ids.map(id => {
    const said = declared.find(each => bare(each.id) === id);
    const known = reported.find(each => bare(each.id) === id);
    const switchId = known?.id ?? said?.id ?? id;
    const unavailable = said?.state === 'not_activated';
    const isDeclared = said !== undefined && !said.state && !known;
    // The conversation's word when the runtime reports the skill; the
    // equipment's otherwise: an active skill is on.
    const switched = sources.skillsSwitched?.[switchId];
    const enabled = unavailable
      ? false
      : switched !== undefined
        ? switched
        : known
          ? (sources.enabledSkills?.has(switchId) ?? false)
          : said?.state === 'active';
    const state = unavailable
      ? EQUIPMENT_WORDS.skillState.not_activated
      : switched !== undefined
        ? switched
          ? EQUIPMENT_WORDS.skillState.enabled
          : EQUIPMENT_WORDS.skillState.available
        : known?.status
          ? EQUIPMENT_WORDS.skillState[known.status]
          : said?.state
            ? EQUIPMENT_WORDS.skillState[said.state]
            : EQUIPMENT_WORDS.declaredState;
    const reason = said?.reason || undefined;
    const locked = unavailable
      ? (reason ?? EQUIPMENT_WORDS.skillState.not_activated)
      : isDeclared
        ? EQUIPMENT_WORDS.declared
        : sources.locked;
    const description = skillDescriptionOf(
      id,
      said?.description,
      known?.description,
    );
    return {
      id,
      switchId,
      name: skillNameOf(id, said?.name, known?.name),
      state,
      tone: enabled ? 'success' : 'neutral',
      on: enabled,
      enabled,
      approved: sources.approvedSkills?.has(switchId) ?? false,
      ...(description ? { description } : {}),
      ...(reason ? { reason } : {}),
      ...(said?.optional ? { note: EQUIPMENT_WORDS.optional } : {}),
      ...(locked ? { locked } : {}),
    };
  });
}

/** The conversation's MCP servers and skills, as the dots and the menus show them. */
export function equipmentLists(sources: EquipmentSources): EquipmentLists {
  const servers = serverRows(sources);
  const skills = skillRows(sources);
  // Only the spec's when nothing live says otherwise.
  const declared =
    sources.equipment?.source === 'declared' &&
    !sources.mcpStatus &&
    (sources.mcpServers ?? []).length === 0 &&
    (sources.skills ?? []).length === 0;
  return { declared, servers, skills };
}

/** How a list stands, at a glance: the dot's colour. */
export type EquipmentStatus = 'none' | 'off' | 'starting' | 'failed' | 'on';

/** What a trigger says, the dot and the footer's alike. */
export type EquipmentSummary = {
  status: EquipmentStatus;
  on: number;
  total: number;
  /** Beside the footer's icon. */
  count: string;
  /** The trigger's tooltip and name, after the list's title. */
  summary: string;
};

/** One summary per list, from its rows alone. */
export function summaryOf(
  kind: 'servers' | 'skills',
  rows: EquipmentRow[],
  declared: boolean,
): EquipmentSummary {
  const total = rows.length;
  const on = rows.filter(row => row.on).length;
  const states = rows.map(row => row.state);
  const status: EquipmentStatus =
    total === 0
      ? 'none'
      : kind === 'servers' &&
          states.includes(EQUIPMENT_WORDS.serverState.starting)
        ? 'starting'
        : kind === 'servers' &&
            states.includes(EQUIPMENT_WORDS.serverState.failed)
          ? 'failed'
          : on > 0
            ? 'on'
            : 'off';
  return {
    status,
    on,
    total,
    count: declared ? String(total) : `${on}/${total}`,
    summary:
      total === 0
        ? 'none'
        : declared
          ? `${total} declared`
          : `${on} of ${total} on`,
  };
}

/** The tool names a server's entry holds, without the `server__` prefix. */
function toolsByServer(raw: unknown): Map<string, Set<string>> {
  const parsed = new Map<string, Set<string>>();
  if (!raw || typeof raw !== 'object') {
    return parsed;
  }
  for (const [serverId, toolNames] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!Array.isArray(toolNames)) {
      continue;
    }
    parsed.set(
      serverId,
      new Set(
        toolNames
          .filter(
            (name): name is string =>
              typeof name === 'string' && name.length > 0,
          )
          .map(name => {
            const sep = name.indexOf('__');
            return sep >= 0 ? name.slice(sep + 2) : name;
          }),
      ),
    );
  }
  return parsed;
}

/** The tools each server has on, as the runtime's status says; null without one. */
export function parseEnabledMcpToolsByServer(
  mcpStatusData: unknown,
): Map<string, Set<string>> | null {
  if (!mcpStatusData || typeof mcpStatusData !== 'object') {
    return null;
  }
  return toolsByServer(
    (mcpStatusData as { enabled_tools_by_server?: unknown })
      .enabled_tools_by_server,
  );
}

/**
 * The tools of each server that run without asking unless the person turns
 * approval on (the catalogue classes them read only), as the runtime's status
 * says; null without one.
 */
export function parseReadOnlyMcpToolsByServer(
  mcpStatusData: unknown,
): Map<string, Set<string>> | null {
  if (!mcpStatusData || typeof mcpStatusData !== 'object') {
    return null;
  }
  return toolsByServer(
    (mcpStatusData as { read_only_tools_by_server?: unknown })
      .read_only_tools_by_server,
  );
}

/** The tools each server has approved, as the runtime's status says; null without one. */
export function parseApprovedMcpToolsByServer(
  mcpStatusData: unknown,
): Map<string, Set<string>> | null {
  if (!mcpStatusData || typeof mcpStatusData !== 'object') {
    return null;
  }
  return toolsByServer(
    (mcpStatusData as { approved_tools_by_server?: unknown })
      .approved_tools_by_server,
  );
}
