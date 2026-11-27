/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The MCP servers and the skills of a conversation, in one overlay each,
 * opened from either of two triggers: the dot beside the composer's send
 * button, or the menu in its footer (the user, 19 November 2026: "the exact
 * same overlay should be shown, the indicator and footer are just one way to
 * show the same information").
 *
 * Both triggers take the same rows (`equipmentLists`) and say the same
 * summary (`summaryOf`): the dot by its colour and its tooltip, the footer
 * by its icon and its count. The overlay lists every server and skill, on or
 * off, with its state in words and why one is off, and the conversation's
 * switches: a server's tools all at once or one by one, each tool's
 * approval, a skill, all the skills, each skill's approval, and codemode.
 * A switch that cannot be used is drawn disabled, with its reason.
 *
 * An application's model is listed apart (`EquipmentModelMenu`): chosen by
 * its builder, the same for everyone, to read.
 *
 * @module chat/prompt/menus/EquipmentMenus
 */

import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type JSX,
  type ReactNode,
} from 'react';
import {
  ActionList,
  ActionMenu,
  Button,
  Link,
  Text,
  ToggleSwitch,
  Tooltip,
} from '@primer/react';
import { AiModelIcon, BriefcaseIcon } from '@primer/octicons-react';
// Primer's MCP mark (the user, 19 November 2026), by its own path: the
// package's index types do not declare it, its per-icon entry does.
import { McpIcon } from '@primer/octicons-react/McpIcon';
import { Box } from '@datalayer/primer-addons';
import { defaultIndicatorColors } from '@datalayer/primer-addons/lib/theme';
import type { Equipment } from '../../../hooks/useEquipment';
import { SpecMark, hasMark, marksOfMcpServer, marksOfSkill } from '../../marks';
import {
  EQUIPMENT_WORDS,
  modelRow,
  rowWords,
  summaryOf,
  type EquipmentLists,
  type EquipmentRow,
  type EquipmentStatus,
  type ServerRow,
  type SkillRow,
  type Tone,
} from './equipmentRows';

const TONES: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: 'success.fg', bg: 'success.subtle' },
  attention: { fg: 'attention.fg', bg: 'attention.subtle' },
  danger: { fg: 'danger.fg', bg: 'danger.subtle' },
  accent: { fg: 'accent.fg', bg: 'accent.subtle' },
  neutral: { fg: 'fg.muted', bg: 'neutral.subtle' },
};

const DOT_COLOURS: Record<EquipmentStatus, string> = {
  none: defaultIndicatorColors.neutral,
  off: defaultIndicatorColors.muted,
  starting: defaultIndicatorColors.warning,
  failed: defaultIndicatorColors.danger,
  on: defaultIndicatorColors.success,
};

/** What the switches do: the conversation's own handlers. */
export type EquipmentSwitches = {
  onToggleMcpTool: (serverId: string, toolName: string) => void;
  onToggleAllMcpServerTools: (
    serverId: string,
    toolNames: string[],
    enable: boolean,
  ) => void;
  onToggleMcpToolApproval: (serverId: string, toolName: string) => void;
  onToggleSkill: (skillId: string) => void;
  onToggleAllSkills: (skillIds: string[], enable: boolean) => void;
  onToggleSkillApproval: (skillId: string) => void;
  /** The runtime's sentence for the last switch it refused: said in the overlay. */
  refusal?: string;
  /** Codemode, where the chat offers it; its toggle disabled without a handler. */
  codemode?: {
    enabled: boolean;
    onToggle?: (enabled: boolean) => void | Promise<void>;
  };
};

export type EquipmentKind = 'servers' | 'skills';

/** The mark of a skill no catalogue marks: the Skills menu's own briefcase. */
export const NEUTRAL_SKILL_ICON = '@primer/octicons-react:briefcase';

const TITLES: Record<EquipmentKind, string> = {
  servers: EQUIPMENT_WORDS.servers,
  skills: EQUIPMENT_WORDS.skills,
};

/** A state, as a small pill. */
function StatePill({ row }: { row: EquipmentRow }): JSX.Element {
  const tone = TONES[row.tone];
  return (
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
  );
}

/** A switch with its word above it, labelled by what it switches. */
function Switch({
  word,
  checked,
  labelledBy,
  locked,
  onToggle,
  name,
}: {
  word: string;
  checked: boolean;
  labelledBy: string;
  locked?: string;
  onToggle: () => void;
  /** What the tests find it by. */
  name: string;
}): JSX.Element {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="2px"
      data-equipment-switch={name}
      data-equipment-checked={checked ? 'true' : 'false'}
      data-equipment-locked={locked ? 'true' : 'false'}
      title={locked}
    >
      <Text sx={{ fontSize: '10px', color: 'fg.muted' }}>{word}</Text>
      <ToggleSwitch
        size="small"
        checked={checked}
        disabled={Boolean(locked)}
        onClick={onToggle}
        aria-labelledby={labelledBy}
      />
    </Box>
  );
}

/** A row's name line: its mark, its name, its state. */
function RowHead({
  row,
  labelId,
  mark,
}: {
  row: EquipmentRow;
  labelId: string;
  mark?: ReactNode;
}): JSX.Element {
  return (
    <Box display="flex" alignItems="center" gap={1} minWidth={0}>
      {mark}
      <Text
        id={labelId}
        sx={{
          fontWeight: 'semibold',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: row.on ? undefined : 'fg.muted',
        }}
      >
        {row.name}
      </Text>
      <StatePill row={row} />
    </Box>
  );
}

/** A line longer than this is cut at a word, with "more…" to read the rest (the user, 20 November 2026). */
export const LINE_FOLD_CHARS = 140;

/** Where a long line is cut: the last space before the limit, else the limit. */
export function foldLine(text: string, limit = LINE_FOLD_CHARS): string | null {
  if (text.length <= limit) {
    return null;
  }
  const cut = text.lastIndexOf(' ', limit);
  return text.slice(0, cut > limit / 2 ? cut : limit).trimEnd();
}

/**
 * A muted line under a name: its reason, its note, or its description. A long
 * one (a tool's description can run to a page) shows its start and "more…";
 * a click shows the rest, and "less" folds it again. The click stays in the
 * line: the row's switch is not touched, and the menu stays open.
 */
function Line({ children }: { children: ReactNode }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!children) {
    return null;
  }
  const folded = typeof children === 'string' ? foldLine(children) : null;
  const toggle = (event: {
    preventDefault(): void;
    stopPropagation(): void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(value => !value);
  };
  return (
    <Text
      sx={{
        display: 'block',
        fontSize: 0,
        color: 'fg.muted',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: folded && open ? 'pre-wrap' : undefined,
        overflowWrap: 'anywhere',
      }}
    >
      {folded && !open ? `${folded}… ` : children}
      {folded ? (
        <>
          {open ? ' ' : null}
          <Link
            as="button"
            type="button"
            onClick={toggle}
            aria-expanded={open}
            sx={{ fontSize: 0, verticalAlign: 'baseline' }}
            data-equipment-more=""
          >
            {open ? 'less' : 'more…'}
          </Link>
        </>
      ) : null}
    </Text>
  );
}

const ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
  px: 3,
  py: 2,
} as const;

function ServerBlock({
  row,
  switches,
  scope,
}: {
  row: ServerRow;
  switches: EquipmentSwitches;
  scope: string;
}): JSX.Element {
  const labelId = `${scope}-server-${row.id}`;
  const names = row.tools.map(tool => tool.name);
  const toolsOn = row.tools.filter(tool => tool.enabled).length;
  // Without its tools listed, the server is on unless switched off whole.
  const allOn = names.length > 0 ? toolsOn === names.length : row.on;
  const marks = marksOfMcpServer({ id: row.id });
  // Its tools folded until asked for: a server of a hundred tools drew two
  // switches each before the overlay could open, about a second (the user,
  // 27 November 2026); the server's own switch still sets them all.
  const [toolsShown, setToolsShown] = useState(false);
  const toolsId = `${labelId}-tools`;
  return (
    <Box
      role="group"
      aria-label={rowWords(row)}
      data-equipment-row={row.id}
      data-equipment-on={row.on ? 'true' : 'false'}
      borderTop="1px solid"
      borderColor="border.muted"
    >
      <Box sx={ROW_SX}>
        <Box flex={1} minWidth={0}>
          <RowHead
            row={row}
            labelId={labelId}
            mark={
              hasMark(marks) ? (
                <SpecMark icon={marks.icon} emoji={marks.emoji} size={16} />
              ) : undefined
            }
          />
          <Line>{[row.reason, row.note].filter(Boolean).join(' · ')}</Line>
        </Box>
        <Switch
          word={EQUIPMENT_WORDS.enableAll}
          name={`server:${row.id}`}
          checked={allOn}
          labelledBy={labelId}
          locked={row.locked}
          onToggle={() =>
            switches.onToggleAllMcpServerTools(row.switchId, names, !allOn)
          }
        />
      </Box>
      {row.tools.length > 0 ? (
        <Box px={3} pb={2} pl={5}>
          <Button
            variant="invisible"
            size="small"
            aria-expanded={toolsShown}
            aria-controls={toolsId}
            onClick={() => setToolsShown(shown => !shown)}
            data-equipment-tools-toggle={row.id}
          >
            {toolsShown
              ? EQUIPMENT_WORDS.toolsHide
              : EQUIPMENT_WORDS.toolsShow(row.tools.length, toolsOn)}
          </Button>
        </Box>
      ) : null}
      <Box id={toolsId} hidden={!toolsShown}>
        {(toolsShown ? row.tools : []).map(tool => {
          const toolId = `${labelId}-tool-${tool.name}`;
          return (
            <Box
              key={tool.name}
              sx={{ ...ROW_SX, pl: 5 }}
              data-equipment-tool={`${row.id}:${tool.name}`}
            >
              <Box flex={1} minWidth={0}>
                <Text id={toolId} sx={{ fontSize: 1 }}>
                  {tool.name}
                </Text>
                <Line>{tool.description}</Line>
                {tool.readOnly ? (
                  <Line>
                    {tool.approved
                      ? EQUIPMENT_WORDS.readOnly.runs
                      : EQUIPMENT_WORDS.readOnly.asks}
                  </Line>
                ) : null}
              </Box>
              <Box display="flex" alignItems="center" gap={3}>
                <Switch
                  word={EQUIPMENT_WORDS.enabled}
                  name={`tool:${row.id}:${tool.name}`}
                  checked={tool.enabled}
                  labelledBy={toolId}
                  locked={row.locked}
                  onToggle={() =>
                    switches.onToggleMcpTool(row.switchId, tool.name)
                  }
                />
                <Switch
                  word={EQUIPMENT_WORDS.approved}
                  name={`tool-approval:${row.id}:${tool.name}`}
                  checked={tool.approved}
                  labelledBy={toolId}
                  locked={row.locked}
                  onToggle={() =>
                    switches.onToggleMcpToolApproval(row.switchId, tool.name)
                  }
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function SkillBlock({
  row,
  switches,
  scope,
}: {
  row: SkillRow;
  switches: EquipmentSwitches;
  scope: string;
}): JSX.Element {
  const labelId = `${scope}-skill-${row.id}`;
  const marks = marksOfSkill(row.id);
  return (
    <Box
      role="group"
      aria-label={rowWords(row)}
      data-equipment-row={row.id}
      data-equipment-on={row.on ? 'true' : 'false'}
      borderTop="1px solid"
      borderColor="border.muted"
      sx={ROW_SX}
    >
      <Box flex={1} minWidth={0}>
        <RowHead
          row={row}
          labelId={labelId}
          // Every skill has a mark before its name: the catalogue's icon,
          // its emoji where it names no icon, a neutral one otherwise.
          mark={
            hasMark(marks) ? (
              <SpecMark icon={marks.icon} emoji={marks.emoji} size={16} />
            ) : (
              <SpecMark icon={NEUTRAL_SKILL_ICON} size={16} />
            )
          }
        />
        {/* What it does, on every row; then why it is off, and its note. */}
        <Line>{row.description}</Line>
        <Line>{[row.reason, row.note].filter(Boolean).join(' · ')}</Line>
      </Box>
      <Box display="flex" alignItems="center" gap={3}>
        <Switch
          word={EQUIPMENT_WORDS.enabled}
          name={`skill:${row.id}`}
          checked={row.enabled}
          labelledBy={labelId}
          locked={row.locked}
          onToggle={() => switches.onToggleSkill(row.switchId)}
        />
        <Switch
          word={EQUIPMENT_WORDS.approved}
          name={`skill-approval:${row.id}`}
          checked={row.approved}
          labelledBy={labelId}
          locked={row.locked}
          onToggle={() => switches.onToggleSkillApproval(row.switchId)}
        />
      </Box>
    </Box>
  );
}

/**
 * The overlay's content: the list, its switches, and what it says of them.
 * The one component both triggers open.
 */
export function EquipmentPanel({
  kind,
  lists,
  switches,
}: {
  kind: EquipmentKind;
  lists: EquipmentLists;
  switches: EquipmentSwitches;
}): JSX.Element {
  const scope = useId().replace(/:/g, '');
  const rows = kind === 'servers' ? lists.servers : lists.skills;
  const { summary } = summaryOf(kind, rows, lists.declared);
  const title = TITLES[kind];
  const codemode = kind === 'servers' ? switches.codemode : undefined;
  const open = lists.skills.filter(row => !row.locked);
  const allSkillsOn = open.length > 0 && open.every(row => row.enabled);
  return (
    <Box data-equipment-panel={kind} aria-label={title} role="group">
      <Box px={3} py={2}>
        <Text sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          {title}
          {rows.length > 0 ? ` · ${summary}` : ''}
        </Text>
      </Box>
      {codemode ? (
        <Box sx={ROW_SX} borderTop="1px solid" borderColor="border.muted">
          <Box flex={1} minWidth={0}>
            <Text
              id={`${scope}-codemode`}
              sx={{ fontWeight: 'semibold', display: 'block' }}
            >
              {EQUIPMENT_WORDS.codemode}
            </Text>
            <Line>
              {codemode.enabled
                ? EQUIPMENT_WORDS.codemodeOn
                : EQUIPMENT_WORDS.codemodeOff}
            </Line>
          </Box>
          <Switch
            word={EQUIPMENT_WORDS.enabled}
            name="codemode"
            checked={codemode.enabled}
            labelledBy={`${scope}-codemode`}
            locked={
              codemode.onToggle ? undefined : EQUIPMENT_WORDS.codemodeLocked
            }
            onToggle={() => void codemode.onToggle?.(!codemode.enabled)}
          />
        </Box>
      ) : null}
      {kind === 'skills' && rows.length > 0 ? (
        <Box sx={ROW_SX} borderTop="1px solid" borderColor="border.muted">
          <Text
            id={`${scope}-all-skills`}
            sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}
          >
            {EQUIPMENT_WORDS.enableAll} (
            {lists.skills.filter(row => row.enabled).length}/{rows.length})
          </Text>
          <Switch
            word={EQUIPMENT_WORDS.enableAll}
            name="all-skills"
            checked={allSkillsOn}
            labelledBy={`${scope}-all-skills`}
            locked={
              open.length === 0
                ? lists.skills.find(row => row.locked)?.locked
                : undefined
            }
            onToggle={() =>
              switches.onToggleAllSkills(
                open.map(row => row.switchId),
                !allSkillsOn,
              )
            }
          />
        </Box>
      ) : null}
      {rows.length === 0 ? (
        <Box px={3} py={2} borderTop="1px solid" borderColor="border.muted">
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            {EQUIPMENT_WORDS.none[kind]}
          </Text>
        </Box>
      ) : kind === 'servers' ? (
        lists.servers.map(row => (
          <ServerBlock
            key={row.id}
            row={row}
            switches={switches}
            scope={scope}
          />
        ))
      ) : (
        lists.skills.map(row => (
          <SkillBlock
            key={row.id}
            row={row}
            switches={switches}
            scope={scope}
          />
        ))
      )}
      <Box
        px={3}
        py={2}
        borderTop="1px solid"
        borderColor="border.muted"
        data-equipment-note=""
      >
        {switches.refusal ? (
          <Text
            role="alert"
            data-equipment-refusal=""
            sx={{ fontSize: 0, color: 'danger.fg', display: 'block', mb: 1 }}
          >
            {switches.refusal}
          </Text>
        ) : null}
        <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
          {EQUIPMENT_WORDS.switches}
        </Text>
        {lists.declared ? (
          <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
            {EQUIPMENT_WORDS.declared}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

const PULSE_KEYFRAMES = `
@keyframes equipment-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

function usePulseKeyframes(): void {
  useEffect(() => {
    const id = '__equipment-pulse-keyframes__';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = PULSE_KEYFRAMES;
    document.head.appendChild(style);
  }, []);
}

/*
 * The triggers take the anchor's props (its click, its ref, its ARIA) onto
 * their button: `ActionMenu.Anchor` gives them to the tooltip's child.
 */
type AnchorProps = Omit<ComponentPropsWithoutRef<'button'>, 'type'>;

/** The dot: the list's status in its colour, its summary in its tooltip. */
const DotTrigger = forwardRef<
  HTMLButtonElement,
  AnchorProps & { kind: EquipmentKind; status: EquipmentStatus; label: string }
>(function DotTrigger({ kind, status, label, ...anchor }, ref) {
  usePulseKeyframes();
  return (
    <button
      {...anchor}
      ref={ref}
      type="button"
      aria-label={label}
      data-equipment-dot={kind}
      data-equipment-status={status}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        padding: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        lineHeight: 0,
      }}
    >
      <Box
        as="span"
        display="inline-block"
        width={12}
        height={12}
        borderRadius="50%"
        bg={DOT_COLOURS[status]}
        flexShrink={0}
        animation={
          status === 'starting'
            ? 'equipment-pulse 1.5s ease-in-out infinite'
            : undefined
        }
        reducedMotion={{ animation: 'none' }}
      />
    </button>
  );
});

/** The footer's trigger: an icon and a count. */
const ButtonTrigger = forwardRef<
  HTMLButtonElement,
  AnchorProps & {
    kind: EquipmentKind;
    count: string;
    label: string;
    declared: boolean;
  }
>(function ButtonTrigger({ kind, count, label, declared, ...anchor }, ref) {
  return (
    <Button
      {...anchor}
      ref={ref}
      type="button"
      variant="invisible"
      size="small"
      aria-label={label}
      leadingVisual={kind === 'servers' ? McpIcon : BriefcaseIcon}
      data-equipment-menu={kind}
      data-equipment-source={declared ? 'declared' : 'live'}
    >
      <Text sx={{ fontSize: 0, fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </Text>
    </Button>
  );
});

/**
 * The MCP servers or the skills, from a dot or from the footer: the same
 * overlay either way. A dot with nothing to say is not drawn; the footer's
 * menu says "none".
 */
export function EquipmentMenu({
  kind,
  trigger,
  lists,
  switches,
}: {
  kind: EquipmentKind;
  trigger: 'dot' | 'button';
  lists: EquipmentLists;
  switches: EquipmentSwitches;
}): JSX.Element | null {
  const rows = kind === 'servers' ? lists.servers : lists.skills;
  const { status, count, summary } = summaryOf(kind, rows, lists.declared);
  if (trigger === 'dot' && status === 'none') {
    return null;
  }
  const label = `${TITLES[kind]} — ${summary}`;
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Tooltip text={label} direction="n">
          {trigger === 'dot' ? (
            <DotTrigger kind={kind} status={status} label={label} />
          ) : (
            <ButtonTrigger
              kind={kind}
              count={count}
              label={label}
              declared={lists.declared}
            />
          )}
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay
        side="outside-top"
        align={trigger === 'dot' ? 'end' : 'start'}
        width="large"
      >
        <Box maxHeight="60vh" overflowY="auto">
          <EquipmentPanel kind={kind} lists={lists} switches={switches} />
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

/**
 * An application's model, to read: chosen by its builder, the same for
 * everyone. Every model it may run on, the one in use marked, an unusable
 * one with why. Not drawn when no model is known.
 */
export function EquipmentModelMenu({
  equipment,
}: {
  equipment: Pick<Equipment, 'models' | 'modelsSource'>;
}): JSX.Element | null {
  const models = equipment.models.map(modelRow);
  const current = equipment.models.find(model => model.current);
  if (models.length === 0) {
    return null;
  }
  const summary = current
    ? `${current.name}, of ${models.length} it may run on`
    : `${models.length} it may run on`;
  const label = `${EQUIPMENT_WORDS.model} — ${summary}`;
  const declared = equipment.modelsSource === 'declared';
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Tooltip text={label} direction="n">
          <Button
            type="button"
            variant="invisible"
            size="small"
            aria-label={label}
            leadingVisual={AiModelIcon}
            data-equipment-menu="model"
            data-equipment-source={declared ? 'declared' : 'live'}
          >
            <Text
              sx={{
                fontSize: 0,
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'inline-block',
                verticalAlign: 'bottom',
                // A model's name is long: on a phone its icon stands alone,
                // and the tooltip and the menu say which.
                '@media (max-width: 480px)': { display: 'none' },
              }}
            >
              {current?.name ?? String(models.length)}
            </Text>
          </Button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="end" width="medium">
        <Box maxHeight="60vh" overflowY="auto">
          <ActionList aria-label={EQUIPMENT_WORDS.model}>
            <ActionList.Group>
              <ActionList.GroupHeading>
                {EQUIPMENT_WORDS.model} · {summary}
              </ActionList.GroupHeading>
              {models.map(row => (
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
                    <StatePill row={row} />
                  </ActionList.TrailingVisual>
                  {row.reason ? (
                    <ActionList.Description variant="block">
                      {row.reason}
                    </ActionList.Description>
                  ) : null}
                </ActionList.Item>
              ))}
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
              {EQUIPMENT_WORDS.modelChosen}
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
