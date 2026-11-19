/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The model, the MCP servers and the skills of an application's agent, as
 * three read-only menus under its composer (the user, 18 November 2026: "the
 * application component should show in the footer the model, mcp and skill
 * selector — those selectors should indicate all the available (enabled or
 * disabled)").
 *
 * The same triggers as an agent chat's own selectors (`ToolsMenu`,
 * `SkillsMenu`, `ModelSelector`): an icon and a count. Each opens a menu
 * that lists everything the agent declares, on or off, with its state in
 * words and why one is off — the names of the variables it needs, never a
 * value. A person using an application chooses none of them: its builder
 * did, in its spec. So a row selects nothing, and the menu says so.
 *
 * @module chat/prompt/menus/EquipmentMenus
 */

import type { JSX } from 'react';
import { ActionList, ActionMenu, Button, Text, Tooltip } from '@primer/react';
import { AiModelIcon, BriefcaseIcon, type Icon } from '@primer/octicons-react';
// Primer's MCP mark (the user, 19 November 2026), by its own path: the
// package's index types do not declare it, its per-icon entry does.
import { McpIcon } from '@primer/octicons-react/McpIcon';
import { Box } from '@datalayer/primer-addons';
import type {
  Equipment,
  EquipmentModel,
  EquipmentServer,
  EquipmentSkill,
} from '../../../hooks/useEquipment';

export const EQUIPMENT_WORDS = {
  readOnly:
    'Chosen by the application. Shown for you to read: nothing here changes it.',
  declared:
    'As its spec declares them: its runtime has not said their state yet.',
  model: 'Model',
  servers: 'MCP servers',
  skills: 'Skills',
  none: { servers: 'It uses no MCP server.', skills: 'It has no skill.' },
  optional: 'optional',
  serverState: {
    started: 'Running',
    starting: 'Starting',
    failed: 'Failed',
    not_started: 'Not started',
    left_out: 'Off',
  },
  skillState: { active: 'Active', not_activated: 'Not activated' },
  modelState: {
    current: 'In use',
    available: 'Available',
    off: 'Not available',
  },
  declaredState: 'Declared',
} as const;

type Tone = 'success' | 'attention' | 'danger' | 'neutral' | 'accent';

/** A row of a menu: what it is, its state in words, and why it is off. */
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

const TONES: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: 'success.fg', bg: 'success.subtle' },
  attention: { fg: 'attention.fg', bg: 'attention.subtle' },
  danger: { fg: 'danger.fg', bg: 'danger.subtle' },
  accent: { fg: 'accent.fg', bg: 'accent.subtle' },
  neutral: { fg: 'fg.muted', bg: 'neutral.subtle' },
};

/** An MCP server as a row. */
export function serverRow(server: EquipmentServer): EquipmentRow {
  const words = EQUIPMENT_WORDS.serverState;
  const state = server.state;
  return {
    id: server.id,
    name: server.name,
    state: state ? words[state] : EQUIPMENT_WORDS.declaredState,
    tone:
      state === 'started'
        ? 'success'
        : state === 'failed'
          ? 'danger'
          : state === 'starting'
            ? 'attention'
            : 'neutral',
    on: state === 'started',
    ...(server.reason ? { reason: server.reason } : {}),
    ...(state === 'started' && server.tools !== undefined
      ? { note: `${server.tools} ${server.tools === 1 ? 'tool' : 'tools'}` }
      : server.optional
        ? { note: EQUIPMENT_WORDS.optional }
        : {}),
  };
}

/** A skill as a row. */
export function skillRow(skill: EquipmentSkill): EquipmentRow {
  const state = skill.state;
  return {
    id: skill.id,
    name: skill.name,
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

/**
 * One read-only menu: a trigger with an icon and a count, and the list. A
 * row is a menu item a keyboard reaches and a screen reader reads; choosing
 * one does nothing and leaves the menu open.
 */
export function EquipmentMenu({
  kind,
  icon,
  title,
  rows,
  count,
  summary,
  empty,
  declared = false,
  align = 'start',
}: {
  kind: 'model' | 'servers' | 'skills';
  icon: Icon;
  title: string;
  rows: EquipmentRow[];
  /** What the trigger shows beside its icon. */
  count: string;
  /** What the trigger says: its tooltip and its name. */
  summary: string;
  empty?: string;
  declared?: boolean;
  align?: 'start' | 'end';
}): JSX.Element {
  const label = `${title} — ${summary}`;
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Tooltip text={label} direction="n">
          <Button
            type="button"
            variant="invisible"
            size="small"
            aria-label={label}
            leadingVisual={icon}
            data-equipment-menu={kind}
            data-equipment-source={declared ? 'declared' : 'live'}
          >
            <Text
              sx={{
                fontSize: 0,
                fontVariantNumeric: 'tabular-nums',
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'inline-block',
                verticalAlign: 'bottom',
                // A model's name is long: on a phone its icon stands alone,
                // and the tooltip and the menu say which.
                ...(kind === 'model'
                  ? { '@media (max-width: 480px)': { display: 'none' } }
                  : {}),
              }}
            >
              {count}
            </Text>
          </Button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align={align} width="medium">
        <Box maxHeight="60vh" overflowY="auto">
          <ActionList aria-label={title}>
            <ActionList.Group>
              <ActionList.GroupHeading>
                {title}
                {rows.length > 0 ? ` · ${summary}` : ''}
              </ActionList.GroupHeading>
              {rows.length === 0 ? (
                <ActionList.Item
                  onSelect={event => event.preventDefault()}
                  sx={{ color: 'fg.muted' }}
                >
                  {empty}
                </ActionList.Item>
              ) : (
                rows.map(row => {
                  const tone = TONES[row.tone];
                  return (
                    <ActionList.Item
                      key={row.id}
                      // Read, not chosen: the menu stays open.
                      onSelect={event => event.preventDefault()}
                      aria-label={rowWords(row)}
                      data-equipment-row={row.id}
                      data-equipment-on={row.on ? 'true' : 'false'}
                      sx={row.on ? undefined : { color: 'fg.muted' }}
                    >
                      {row.name}
                      <ActionList.TrailingVisual>
                        <Text
                          sx={{
                            fontSize: '11px',
                            px: '6px',
                            py: '1px',
                            borderRadius: 999,
                            bg: tone.bg,
                            color: tone.fg,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.state}
                        </Text>
                      </ActionList.TrailingVisual>
                      {row.reason || row.note ? (
                        <ActionList.Description variant="block">
                          {[row.reason, row.note].filter(Boolean).join(' · ')}
                        </ActionList.Description>
                      ) : null}
                    </ActionList.Item>
                  );
                })
              )}
            </ActionList.Group>
          </ActionList>
          <Box
            px={3}
            py={2}
            borderTop="1px solid"
            borderColor="border.muted"
            data-equipment-note=""
          >
            <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
              {EQUIPMENT_WORDS.readOnly}
            </Text>
            {declared ? (
              <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                {EQUIPMENT_WORDS.declared}
              </Text>
            ) : null}
          </Box>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

const of = (on: number, all: number, declared: boolean): string =>
  declared ? String(all) : `${on}/${all}`;

/** The three menus, in the order of an agent chat's selectors: tools, skills, model. */
export function EquipmentBar({
  equipment,
}: {
  equipment: Equipment;
}): JSX.Element {
  const declared = equipment.source === 'declared';
  const servers = equipment.servers.map(serverRow);
  const skills = equipment.skills.map(skillRow);
  const models = equipment.models.map(modelRow);
  const serversOn = servers.filter(row => row.on).length;
  const skillsOn = skills.filter(row => row.on).length;
  const current = equipment.models.find(model => model.current);
  return (
    <Box
      display="inline-flex"
      alignItems="center"
      role="group"
      aria-label="What this application runs with"
      data-equipment-bar={equipment.source}
    >
      <EquipmentMenu
        kind="servers"
        icon={McpIcon}
        title={EQUIPMENT_WORDS.servers}
        rows={servers}
        count={of(serversOn, servers.length, declared)}
        summary={
          servers.length === 0
            ? 'none'
            : declared
              ? `${servers.length} declared`
              : `${serversOn} of ${servers.length} running`
        }
        empty={EQUIPMENT_WORDS.none.servers}
        declared={declared}
      />
      <EquipmentMenu
        kind="skills"
        icon={BriefcaseIcon}
        title={EQUIPMENT_WORDS.skills}
        rows={skills}
        count={of(skillsOn, skills.length, declared)}
        summary={
          skills.length === 0
            ? 'none'
            : declared
              ? `${skills.length} declared`
              : `${skillsOn} of ${skills.length} active`
        }
        empty={EQUIPMENT_WORDS.none.skills}
        declared={declared}
      />
      {models.length > 0 ? (
        <EquipmentMenu
          kind="model"
          icon={AiModelIcon}
          title={EQUIPMENT_WORDS.model}
          rows={models}
          count={current?.name ?? String(models.length)}
          summary={
            current
              ? `${current.name}, of ${models.length} it may run on`
              : `${models.length} it may run on`
          }
          declared={equipment.modelsSource === 'declared'}
          align="end"
        />
      ) : null}
    </Box>
  );
}
