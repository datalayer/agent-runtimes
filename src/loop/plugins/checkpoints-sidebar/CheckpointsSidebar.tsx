/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation checkpoints of the workspace's agent.
 *
 * Reads them from the server the workspace is backed by, again after every
 * snapshot the agent pushes (so a turn's auto-checkpoint shows as the turn
 * ends), and offers the three things a person does with them: save one now,
 * rewind to one, drop one. A rewind asks the chat to reload its transcript
 * once the server's fresh snapshot has arrived, so what is on screen is what
 * the agent now remembers.
 *
 * @module loop/plugins/checkpoints-sidebar/CheckpointsSidebar
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Heading,
  IconButton,
  Label,
  Text,
  TextInput,
  Timeline,
} from '@primer/react';
import {
  BookmarkIcon,
  HistoryIcon,
  SyncIcon,
  TrashIcon,
  VersionsIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { LoopWorkspaceContext } from '../../core';
import {
  deleteConversationCheckpoint,
  isAutoCheckpoint,
  listConversationCheckpoints,
  rewindConversation,
  saveConversationCheckpoint,
} from '../../../api/checkpoints';
import {
  agentRuntimeStore,
  useAgentRuntimeStore,
} from '../../../stores/agentRuntimeStore';
import type {
  ConversationCheckpoint,
  ConversationCheckpointsState,
} from '../../../types/checkpoints';

/** How long to wait for the server's snapshot after a rewind before reloading anyway. */
const SNAPSHOT_WAIT_MS = 3000;

const FREQUENCY_LABEL: Record<string, string> = {
  every_turn: 'after every turn',
  every_tool: 'before every tool call',
  manual_only: 'only on request',
};

/** "2 min ago" for a checkpoint's time, or the time itself when older. */
export function ago(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(then).toLocaleString();
}

/**
 * Wait for the store's full context to change — the server's next snapshot —
 * then resolve; resolve anyway after `timeoutMs`.
 */
export function afterNextSnapshot(timeoutMs = SNAPSHOT_WAIT_MS): Promise<void> {
  return new Promise(resolve => {
    const before = agentRuntimeStore.getState().fullContext;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsubscribe();
      window.clearTimeout(timer);
      resolve();
    };
    const unsubscribe = agentRuntimeStore.subscribe(
      state => state.fullContext,
      next => {
        if (next !== before) finish();
      },
    );
    const timer = window.setTimeout(finish, timeoutMs);
  });
}

export interface CheckpointsSidebarProps {
  /** Forwarded by the shell: where the agent runs and which one it is. */
  workspace?: LoopWorkspaceContext;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
      {children}
    </Heading>
  );
}

export function CheckpointsSidebar({
  workspace,
}: CheckpointsSidebarProps): React.ReactElement {
  const serverUrl = workspace?.serverUrl ?? '';
  const agentId = workspace?.agentId ?? '';
  const [state, setState] = useState<ConversationCheckpointsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [now, setNow] = useState(() => Date.now());
  // A new snapshot means a turn ended (or a rewind landed): read the list again.
  const fullContext = useAgentRuntimeStore(s => s.fullContext);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!serverUrl || !agentId) return;
    try {
      const next = await listConversationCheckpoints(serverUrl, agentId);
      if (!alive.current) return;
      setState(next);
      setError(null);
      setNow(Date.now());
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [serverUrl, agentId]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, fullContext]);

  // The "ago" labels move on their own.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const act = useCallback(
    async (key: string, work: () => Promise<void>) => {
      setBusy(key);
      setError(null);
      try {
        await work();
      } catch (err) {
        if (alive.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (alive.current) setBusy(null);
      }
      await reload();
    },
    [reload],
  );

  const save = useCallback(() => {
    const trimmed = label.trim();
    if (!trimmed) return;
    void act('save', async () => {
      await saveConversationCheckpoint(serverUrl, agentId, trimmed);
      if (alive.current) setLabel('');
    });
  }, [act, agentId, label, serverUrl]);

  const rewind = useCallback(
    (checkpoint: ConversationCheckpoint) =>
      act(`rewind:${checkpoint.id}`, async () => {
        const settled = afterNextSnapshot();
        await rewindConversation(serverUrl, agentId, checkpoint.id);
        // The server pushes the rewound snapshot; ask for one too in case the
        // push raced us, then have the chat load the transcript it now has.
        agentRuntimeStore.getState().requestRefresh(agentId);
        await settled;
        agentRuntimeStore.getState().requestHistoryReload();
      }),
    [act, agentId, serverUrl],
  );

  const remove = useCallback(
    (checkpoint: ConversationCheckpoint) =>
      act(`delete:${checkpoint.id}`, () =>
        deleteConversationCheckpoint(serverUrl, agentId, checkpoint.id),
      ),
    [act, agentId, serverUrl],
  );

  const checkpoints = useMemo(() => state?.checkpoints ?? [], [state]);
  const enabled = state?.enabled ?? false;

  return (
    <Box
      data-checkpoints-sidebar={agentId || undefined}
      data-checkpoints-count={checkpoints.length}
      sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <VersionsIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, m: 0, flex: 1 }}>
          Checkpoints
        </Heading>
        <Label variant="accent">{checkpoints.length}</Label>
        <IconButton
          icon={SyncIcon}
          size="small"
          variant="invisible"
          aria-label="Refresh checkpoints"
          onClick={() => void reload()}
        />
      </Box>

      <Box>
        <SectionHeading>How they are taken</SectionHeading>
        {state === null ? (
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {error ? `Could not read them: ${error}` : 'Reading…'}
          </Text>
        ) : !enabled ? (
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
            This agent&apos;s spec asks for no conversation checkpoints.
          </Text>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              columnGap: 3,
              rowGap: 1,
              fontSize: 0,
            }}
          >
            <Text sx={{ color: 'fg.muted' }}>Snapshot</Text>
            <Text>
              {FREQUENCY_LABEL[state.frequency ?? ''] ?? state.frequency}
            </Text>
            <Text sx={{ color: 'fg.muted' }}>Kept</Text>
            <Text>
              the last {state.maxCheckpoints ?? '—'},{' '}
              {state.store ?? 'in_memory'}
            </Text>
            <Text sx={{ color: 'fg.muted' }}>Turn</Text>
            <Text data-checkpoints-turn={state.turn}>{state.turn}</Text>
          </Box>
        )}
      </Box>

      {enabled ? (
        <Box>
          <SectionHeading>Save one now</SectionHeading>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextInput
              size="small"
              sx={{ flex: 1 }}
              placeholder="Label, e.g. before-refactor"
              value={label}
              aria-label="Checkpoint label"
              onChange={event => setLabel(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') save();
              }}
            />
            <Button
              size="small"
              leadingVisual={BookmarkIcon}
              disabled={!label.trim() || busy !== null}
              onClick={save}
              data-checkpoints-save
            >
              Save
            </Button>
          </Box>
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mt: 1, mb: 0 }}>
            The conversation as the last turn left it.
          </Text>
        </Box>
      ) : null}

      {error && state !== null ? (
        <Text sx={{ fontSize: 0, color: 'danger.fg' }} data-checkpoints-error>
          {error}
        </Text>
      ) : null}

      <Box>
        <SectionHeading>Checkpoints</SectionHeading>
        {checkpoints.length === 0 ? (
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
            {enabled ? 'None yet — one is taken as each turn ends.' : 'None.'}
          </Text>
        ) : (
          <Timeline>
            {checkpoints.map(checkpoint => {
              const auto = isAutoCheckpoint(checkpoint);
              const rewinding = busy === `rewind:${checkpoint.id}`;
              return (
                <Timeline.Item
                  key={checkpoint.id}
                  data-checkpoint={checkpoint.id}
                  data-checkpoint-label={checkpoint.label}
                  data-checkpoint-auto={auto ? 'true' : 'false'}
                >
                  <Timeline.Badge>
                    {auto ? <HistoryIcon /> : <BookmarkIcon />}
                  </Timeline.Badge>
                  <Timeline.Body>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>
                        {checkpoint.label}
                      </Text>
                      <Label
                        size="small"
                        variant={auto ? 'secondary' : 'accent'}
                      >
                        {auto ? 'auto' : 'saved'}
                      </Label>
                    </Box>
                    <Text
                      as="p"
                      sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 1 }}
                    >
                      turn {checkpoint.turn} · {checkpoint.messageCount} message
                      {checkpoint.messageCount === 1 ? '' : 's'} ·{' '}
                      {ago(checkpoint.createdAt, now)}
                    </Text>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Button
                        size="small"
                        leadingVisual={HistoryIcon}
                        disabled={busy !== null}
                        onClick={() => void rewind(checkpoint)}
                        data-checkpoints-rewind={checkpoint.id}
                      >
                        {rewinding ? 'Rewinding…' : 'Rewind'}
                      </Button>
                      <IconButton
                        icon={TrashIcon}
                        size="small"
                        variant="invisible"
                        aria-label={`Delete checkpoint ${checkpoint.label}`}
                        disabled={busy !== null}
                        onClick={() => void remove(checkpoint)}
                      />
                    </Box>
                  </Timeline.Body>
                </Timeline.Item>
              );
            })}
          </Timeline>
        )}
      </Box>
    </Box>
  );
}

export default CheckpointsSidebar;
