/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActionList,
  ActionMenu,
  Box,
  Button,
  Dialog,
  FormControl,
  IconButton,
  Spinner,
  Text,
  TextInput,
} from '@primer/react';
import { ClockIcon, TrashIcon, type Icon } from '@primer/octicons-react';
import {
  disableSchedule,
  updateSchedule,
  upsertSchedule,
  type ScheduleDoc,
} from '../../api/scheduler/schedules';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';

/**
 * Supported schedule presets.
 */
export type SchedulePreset = 'every-minute' | 'hourly' | 'daily' | 'custom';

/**
 * Props for the self-contained {@link ScheduleMenu} component.
 *
 * The component performs the scheduler service calls internally. Provide the
 * `notebookUid`, an authentication `token`, and the scheduler service
 * `baseUrl` (configurable via props) to enable scheduling.
 */
export type ScheduleMenuProps = {
  /** Target notebook uid to schedule (used to create/update a schedule). */
  notebookUid?: string;
  /**
   * Existing schedule uid to update in place. When provided, changes are
   * persisted with a PUT update instead of a notebook upsert.
   */
  scheduleUid?: string;
  /** Authentication token used for scheduler API calls. */
  token?: string;
  /** Base URL of the scheduler service. Defaults to the production service. */
  baseUrl?: string;
  /** Force-disable the menu. When omitted, the menu is enabled if a token and notebook uid are present. */
  enabled?: boolean;
  /** Icon shown on the anchor button (replaced by a spinner while saving). */
  icon?: Icon;
  /** Optional color for the anchor icon. */
  iconColor?: string;
  /** Accessible label for the anchor button. */
  ariaLabel?: string;
  /** Initial preset selection. */
  initialPreset?: SchedulePreset;
  /** Initial cron expression. */
  initialCronExpression?: string;
  /** Called after a schedule is successfully saved. */
  onSaved?: (schedule: ScheduleDoc) => void;
  /** Called after a schedule is successfully deleted/disabled. */
  onDeleted?: (schedule: ScheduleDoc) => void;
  /** Called when saving a schedule fails. */
  onError?: (error: unknown) => void;
};

const SCHEDULE_PRESETS: Array<{
  id: Exclude<SchedulePreset, 'custom'>;
  label: string;
  cron: string;
}> = [
  { id: 'every-minute', label: 'Every minute', cron: '* * * * *' },
  { id: 'hourly', label: 'Every hour', cron: '0 * * * *' },
  { id: 'daily', label: 'Every day', cron: '0 0 * * *' },
];

const DEFAULT_CRON_EXPRESSION = '* * * * *';

const presetFromCron = (cronExpression: string): SchedulePreset => {
  const normalized = cronExpression.trim();
  const preset = SCHEDULE_PRESETS.find(item => item.cron === normalized);
  return preset ? preset.id : 'custom';
};

/**
 * Self-contained schedule menu that lets a user pick a cron schedule for a
 * notebook and persists it to the scheduler service.
 *
 * The component owns its loading state and renders a spinner in place of the
 * anchor icon while a save request is in flight. The scheduler service URL is
 * configurable through the `baseUrl` prop.
 */
export const ScheduleMenu = ({
  notebookUid,
  scheduleUid,
  token,
  baseUrl = DEFAULT_SERVICE_URLS.SCHEDULER,
  enabled,
  icon = ClockIcon,
  iconColor,
  ariaLabel = 'Schedule execution',
  initialPreset = 'every-minute',
  initialCronExpression,
  onSaved,
  onDeleted,
  onError,
}: ScheduleMenuProps) => {
  const providedInitialCron = (initialCronExpression || '').trim();
  const hasProvidedInitialCron = providedInitialCron.length > 0;
  const initialCron = hasProvidedInitialCron
    ? providedInitialCron
    : DEFAULT_CRON_EXPRESSION;
  const [cronExpression, setCronExpression] = useState<string>(initialCron);
  const [hasExplicitCron, setHasExplicitCron] = useState(
    hasProvidedInitialCron,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmUid, setDeleteConfirmUid] = useState('');

  useEffect(() => {
    const nextProvidedCron = (initialCronExpression || '').trim();
    const nextHasExplicitCron = nextProvidedCron.length > 0;
    setHasExplicitCron(nextHasExplicitCron);
    setCronExpression(
      nextHasExplicitCron ? nextProvidedCron : DEFAULT_CRON_EXPRESSION,
    );
  }, [initialCronExpression, scheduleUid, notebookUid]);

  const preset = useMemo(
    () => (hasExplicitCron ? presetFromCron(cronExpression) : 'custom'),
    [cronExpression, hasExplicitCron],
  );

  const isEnabled =
    (enabled ?? true) &&
    Boolean(token) &&
    Boolean(notebookUid || scheduleUid) &&
    !isSaving &&
    !isDeleting;

  const selectedPresetDescription = useMemo(() => {
    if (!hasExplicitCron) {
      return 'Not scheduled';
    }
    const selected = SCHEDULE_PRESETS.find(
      item => item.cron === cronExpression.trim(),
    );
    if (selected) {
      return `${selected.label} (${selected.cron})`;
    }
    return `Custom (${cronExpression || 'Cron expression not set'})`;
  }, [cronExpression, hasExplicitCron]);

  const saveSchedule = async (nextPreset: SchedulePreset, nextCron: string) => {
    const cron = nextCron.trim();
    if (!token || (!notebookUid && !scheduleUid) || !cron) {
      return;
    }
    setIsSaving(true);
    try {
      let schedule: ScheduleDoc;
      if (scheduleUid) {
        const response = await updateSchedule(
          token,
          scheduleUid,
          {
            cronExpression: cron,
            preset: nextPreset,
          },
          baseUrl,
        );
        schedule = response.schedule;
      } else {
        const response = await upsertSchedule(
          token,
          {
            notebookUid: notebookUid as string,
            cronExpression: cron,
            preset: nextPreset,
            enabled: true,
          },
          baseUrl,
        );
        schedule = response.schedule;
      }
      onSaved?.(schedule);
    } catch (error) {
      onError?.(error);
    } finally {
      setIsSaving(false);
    }
  };

  const selectPreset = (nextPreset: Exclude<SchedulePreset, 'custom'>) => {
    const next = SCHEDULE_PRESETS.find(item => item.id === nextPreset);
    if (!next) {
      return;
    }
    setHasExplicitCron(true);
    setCronExpression(next.cron);
    void saveSchedule(nextPreset, next.cron);
  };

  const applyCustomCron = () => {
    const value = cronExpression.trim();
    const inferredPreset = presetFromCron(value);
    void saveSchedule(inferredPreset, value);
  };

  const performDeleteSchedule = async () => {
    if (!token || !scheduleUid) {
      return;
    }
    setIsDeleting(true);
    try {
      const response = await disableSchedule(token, scheduleUid, baseUrl);
      setIsDeleteDialogOpen(false);
      setDeleteConfirmUid('');
      onDeleted?.(response.schedule);
    } catch (error) {
      onError?.(error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ActionMenu>
        <ActionMenu.Anchor>
          <IconButton
            icon={isSaving ? () => <Spinner size="small" /> : icon}
            variant="invisible"
            sx={iconColor ? { color: iconColor } : undefined}
            aria-label={ariaLabel}
            title={
              isSaving
                ? `${ariaLabel} (saving…)`
                : isEnabled
                  ? ariaLabel
                  : `${ariaLabel} (disabled)`
            }
          />
        </ActionMenu.Anchor>
        <ActionMenu.Overlay width="medium" sx={{ minWidth: 300 }}>
          <Box
            sx={{
              px: 3,
              pt: 3,
              pb: 2,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Text as="p" sx={{ fontWeight: 600 }}>
              Schedule
            </Text>
          </Box>
          <ActionList selectionVariant="single" showDividers>
            {SCHEDULE_PRESETS.map(option => (
              <ActionList.Item
                key={option.id}
                selected={preset === option.id}
                disabled={!isEnabled}
                onSelect={() => selectPreset(option.id)}
              >
                {option.label}
                <ActionList.Description variant="block">
                  {option.cron}
                </ActionList.Description>
              </ActionList.Item>
            ))}
          </ActionList>
          <Box
            sx={{ p: 3, borderTop: '1px solid', borderColor: 'border.default' }}
          >
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
              Cron Expression
            </Text>
            <TextInput
              value={cronExpression}
              onChange={event => {
                const value = event.currentTarget.value;
                setHasExplicitCron(value.trim().length > 0);
                setCronExpression(value);
              }}
              placeholder="* * * * *"
              aria-label="Cron expression"
              block
              disabled={!isEnabled}
            />
            <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                size="small"
                onClick={applyCustomCron}
                disabled={!isEnabled}
              >
                Apply Cron
              </Button>
              {scheduleUid ? (
                <Button
                  size="small"
                  variant="danger"
                  leadingVisual={TrashIcon}
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={!isEnabled}
                >
                  Delete Schedule
                </Button>
              ) : null}
            </Box>
            <Text as="p" sx={{ mt: 2, fontSize: 0, color: 'fg.muted' }}>
              Current: {selectedPresetDescription}
            </Text>
          </Box>
        </ActionMenu.Overlay>
      </ActionMenu>
      {isDeleteDialogOpen && scheduleUid ? (
        <Dialog
          title="Delete schedule"
          onClose={() => {
            if (isDeleting) {
              return;
            }
            setIsDeleteDialogOpen(false);
            setDeleteConfirmUid('');
          }}
          width="medium"
        >
          <Box sx={{ display: 'grid', gap: 3 }}>
            <Text>
              This action will disable the schedule and remove planned runs.
              Type{' '}
              <Text as="span" sx={{ fontWeight: 700 }}>
                {scheduleUid}
              </Text>{' '}
              to confirm.
            </Text>
            <FormControl>
              <FormControl.Label>Schedule UID</FormControl.Label>
              <TextInput
                value={deleteConfirmUid}
                onChange={event =>
                  setDeleteConfirmUid(event.currentTarget.value)
                }
                placeholder={scheduleUid}
                autoFocus
              />
            </FormControl>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button
                variant="default"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setDeleteConfirmUid('');
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void performDeleteSchedule()}
                disabled={isDeleting || deleteConfirmUid !== scheduleUid}
              >
                Delete schedule
              </Button>
            </Box>
          </Box>
        </Dialog>
      ) : null}
    </>
  );
};

export default ScheduleMenu;
