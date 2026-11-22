/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat's block on the Canvas: its face, its welcome,
 * its suggested questions, its commands and modes and its settings, edited where they are seen, in
 * the Appspec's own fields (`chatBlock`). The face is chosen with the
 * profile's picker. Everything is a field or a button: nothing needs
 * a pointer.
 *
 * @module apps/composer/CanvasChatBlock
 */

import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  Flash,
  FormControl,
  Heading,
  IconButton,
  Select,
  Text,
  TextInput,
  Textarea,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from '@primer/octicons-react';
import { PrincipalAvatarPicker } from '@datalayer/core/lib/components/principal';
import type { AppSpec } from '../../types/agentspecs';
import { AppAvatar, faceOfAppspec } from './AppAvatar';
import type { AppDraft } from './draft';
import { VERDICT_TONES } from './tones';
import {
  CHAT_BLOCK_WORDS as WORDS,
  MAX_STARTERS,
  SETTING_TYPES,
  addCommand,
  addMode,
  addModeOption,
  addSetting,
  addStarter,
  chatBlockOf,
  chatBlockProblems,
  moveSetting,
  moveStarter,
  optionsOf,
  removeCommand,
  removeMode,
  removeModeOption,
  removeSetting,
  removeStarter,
  writeAvatar,
  writeCommand,
  writeMode,
  writeModeOption,
  writeSetting,
  writeStarter,
  writeWelcome,
  type ChatSetting,
  type SettingType,
} from './chatBlock';

export type CanvasChatBlockProps = {
  definition: AppDraft;
  disabled?: boolean;
  onChange: (next: AppDraft) => void;
};

/*
  One part of the chat — a suggested question, a command, a mode, a setting —
  in its own box inside the block.

  `borderRadius: 'control'` is this theme's pill (999px): right on a control
  the height of one line, wrong on a box. A row two lines tall was drawn with
  78px corners and the settings block, 224px tall, bulged like a capsule
  (seen 2026-10-09). A part is a box, so it takes the box radius the blocks
  around it take, one step inside the section's own.
*/
const partSx = {
  border: '1px solid',
  borderColor: 'border.default',
  borderRadius: 'medium',
  p: 2,
  bg: 'canvas.default',
} as const;

/** A number as typed: nothing typed is no number. */
const numberOf = (text: string): number | undefined => {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
};

function Problems({ problems }: { problems: string[] }): JSX.Element | null {
  return problems.length ? (
    <Box
      as="ul"
      m={0}
      mt={1}
      pl={3}
      color={VERDICT_TONES['Not ready'].fg}
      fontSize={0}
    >
      {problems.map(problem => (
        <li key={problem}>{problem}</li>
      ))}
    </Box>
  ) : null;
}

function Order({
  what,
  index,
  count,
  disabled,
  onMove,
  onRemove,
}: {
  what: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <Box display="flex" gap={1} flexShrink={0}>
      <IconButton
        icon={ArrowUpIcon}
        size="small"
        variant="invisible"
        aria-label={`Move ${what} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      />
      <IconButton
        icon={ArrowDownIcon}
        size="small"
        variant="invisible"
        aria-label={`Move ${what} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
      />
      <IconButton
        icon={TrashIcon}
        size="small"
        variant="invisible"
        aria-label={`Remove ${what}`}
        disabled={disabled}
        onClick={onRemove}
      />
    </Box>
  );
}

/** What a setting starts at, set with the control of its type. */
function SettingDefault({
  setting,
  disabled,
  onChange,
}: {
  setting: ChatSetting;
  disabled: boolean;
  onChange: (value: ChatSetting['default']) => void;
}): JSX.Element {
  if (setting.type === 'toggle') {
    return (
      <FormControl disabled={disabled}>
        <Checkbox
          checked={setting.default === true}
          onChange={event => onChange(event.target.checked)}
        />
        <FormControl.Label>On at the start</FormControl.Label>
      </FormControl>
    );
  }
  if (setting.type === 'select') {
    return (
      <FormControl disabled={disabled}>
        <FormControl.Label>{WORDS.settingDefault}</FormControl.Label>
        <Select
          value={typeof setting.default === 'string' ? setting.default : ''}
          onChange={event => onChange(event.target.value || undefined)}
        >
          <Select.Option value="">Nothing chosen</Select.Option>
          {setting.options.map(option => (
            <Select.Option key={option} value={option}>
              {option}
            </Select.Option>
          ))}
        </Select>
      </FormControl>
    );
  }
  if (setting.type === 'text') {
    return (
      <FormControl disabled={disabled}>
        <FormControl.Label>{WORDS.settingDefault}</FormControl.Label>
        <TextInput
          value={typeof setting.default === 'string' ? setting.default : ''}
          onChange={event => onChange(event.target.value || undefined)}
        />
      </FormControl>
    );
  }
  return (
    <FormControl disabled={disabled}>
      <FormControl.Label>{WORDS.settingDefault}</FormControl.Label>
      <TextInput
        type="number"
        sx={{ width: 96 }}
        value={
          typeof setting.default === 'number' ? String(setting.default) : ''
        }
        onChange={event => onChange(numberOf(event.target.value))}
      />
    </FormControl>
  );
}

export function CanvasChatBlock({
  definition,
  disabled = false,
  onChange,
}: CanvasChatBlockProps): JSX.Element {
  const [refusal, setRefusal] = useState('');
  const [status, setStatus] = useState('');
  const [starter, setStarter] = useState({ label: '', message: '' });
  const [setting, setSetting] = useState<{ label: string; type: SettingType }>({
    label: '',
    type: 'select',
  });
  // A select's choices as typed, kept while they are typed: a blank line is
  // not dropped under the cursor.
  const [optionsText, setOptionsText] = useState<Record<string, string>>({});
  const [command, setCommand] = useState({
    name: '',
    description: '',
    prompt: '',
  });
  const [mode, setMode] = useState({ label: '', options: '' });
  const [newOption, setNewOption] = useState<Record<string, string>>({});

  const spec = definition.spec;
  if (!spec) {
    throw new Error('A chat is drawn from its Appspec.');
  }
  const block = chatBlockOf(spec);
  const problems = chatBlockProblems(spec);
  const problemsAt = (where: string) =>
    problems.filter(found => found.where === where).map(found => found.problem);
  const face = faceOfAppspec(spec);

  /** Do it, or say why it cannot be done. */
  const attempt = (work: (spec: AppSpec) => AppSpec, said = ''): boolean => {
    try {
      onChange({ ...definition, spec: work(spec) });
      setRefusal('');
      setStatus(said);
      return true;
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  const starterName = (index: number) => `suggested question ${index + 1}`;
  const settingName = (index: number) =>
    `setting “${block.settings[index].label || index + 1}”`;

  return (
    <Box
      as="section"
      aria-labelledby="canvas-chat-block"
      border="1px solid"
      borderColor="accent.emphasis"
      borderRadius="large"
      // The application's stage, flat: no gradient on a surface of the builder.
      background="var(--theme-stage)"
      p={3}
      mb={3}
    >
      <Box
        role="status"
        aria-live="polite"
        position="absolute"
        width="1px"
        height="1px"
        overflow="hidden"
        clip="rect(0 0 0 0)"
      >
        {status}
      </Box>
      <Heading as="h3" id="canvas-chat-block" sx={{ fontSize: 2, mb: 1 }}>
        {WORDS.heading}
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', fontSize: 1, mt: 0 }}>
        {WORDS.about}
      </Text>
      {refusal ? (
        <Flash role="alert" sx={{ mb: 2 }}>
          {refusal}
        </Flash>
      ) : null}

      {/* Its face and what it says first: the welcome, as its bubble. */}
      <Box
        display="flex"
        gap={3}
        alignItems="flex-start"
        flexWrap="wrap"
        mb={3}
      >
        <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
          <AppAvatar face={face} size="medium" ring />
          <PrincipalAvatarPicker
            value={block.avatar || undefined}
            disabled={disabled}
            onChange={value =>
              attempt(
                current => writeAvatar(current, value),
                'Its face is changed.',
              )
            }
          />
        </Box>
        <Box flex="1 1 260px" minWidth={0}>
          <FormControl disabled={disabled}>
            <FormControl.Label>{WORDS.welcome}</FormControl.Label>
            <Textarea
              block
              rows={3}
              value={block.welcome}
              placeholder={WORDS.welcomeEmpty}
              sx={{ borderRadius: 'var(--borderRadius-large)' }}
              onChange={event =>
                attempt(current => writeWelcome(current, event.target.value))
              }
            />
          </FormControl>
        </Box>
      </Box>

      {/* Its suggested questions, as the buttons a person sees. */}
      <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
        {WORDS.starters}
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, mt: 0 }}>
        {WORDS.startersAbout}
      </Text>
      <Box display="flex" flexDirection="column" gap={2} mb={2}>
        {block.starters.map((item, index) => (
          <Box key={index} {...partSx}>
            <Box display="flex" gap={2} alignItems="flex-end" flexWrap="wrap">
              <FormControl disabled={disabled} sx={{ flex: '0 1 180px' }}>
                <FormControl.Label>{WORDS.starterLabel}</FormControl.Label>
                <TextInput
                  block
                  value={item.label}
                  sx={{ borderRadius: 'var(--borderRadius-full)' }}
                  onChange={event =>
                    attempt(current =>
                      writeStarter(current, index, {
                        label: event.target.value,
                      }),
                    )
                  }
                />
              </FormControl>
              <FormControl disabled={disabled} sx={{ flex: '1 1 240px' }}>
                <FormControl.Label>{WORDS.starterMessage}</FormControl.Label>
                <TextInput
                  block
                  value={item.message}
                  onChange={event =>
                    attempt(current =>
                      writeStarter(current, index, {
                        message: event.target.value,
                      }),
                    )
                  }
                />
              </FormControl>
              <Order
                what={starterName(index)}
                index={index}
                count={block.starters.length}
                disabled={disabled}
                onMove={delta =>
                  attempt(
                    current => moveStarter(current, index, delta),
                    `${starterName(index)} moved ${delta < 0 ? 'up' : 'down'}.`,
                  )
                }
                onRemove={() =>
                  attempt(
                    current => removeStarter(current, index),
                    `${starterName(index)} removed.`,
                  )
                }
              />
            </Box>
            <Problems problems={problemsAt(`starter:${index}`)} />
          </Box>
        ))}
        <Problems problems={problemsAt('starters')} />
      </Box>
      {block.starters.length < MAX_STARTERS ? (
        <Box
          as="form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (
              attempt(
                current => addStarter(current, starter),
                `Suggested question “${starter.label.trim()}” added.`,
              )
            ) {
              setStarter({ label: '', message: '' });
            }
          }}
          display="flex"
          gap={2}
          alignItems="flex-end"
          flexWrap="wrap"
          mb={3}
        >
          <FormControl disabled={disabled} sx={{ flex: '0 1 180px' }}>
            <FormControl.Label>{WORDS.starterLabel}</FormControl.Label>
            <TextInput
              block
              value={starter.label}
              onChange={event =>
                setStarter({ ...starter, label: event.target.value })
              }
            />
          </FormControl>
          <FormControl disabled={disabled} sx={{ flex: '1 1 240px' }}>
            <FormControl.Label>{WORDS.starterMessage}</FormControl.Label>
            <TextInput
              block
              value={starter.message}
              onChange={event =>
                setStarter({ ...starter, message: event.target.value })
              }
            />
          </FormControl>
          <Button type="submit" disabled={disabled}>
            {WORDS.addStarter}
          </Button>
        </Box>
      ) : (
        <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, mb: 3 }}>
          {`A chat offers at most ${MAX_STARTERS} suggested questions.`}
        </Text>
      )}

      {/* Its commands, listed when / is typed. */}
      <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
        {WORDS.commands}
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, mt: 0 }}>
        {WORDS.commandsAbout}
      </Text>
      <Box display="flex" flexDirection="column" gap={2} mb={2}>
        {block.commands.map((item, index) => (
          <Box key={item.name} {...partSx}>
            <Box display="flex" gap={2} alignItems="flex-end" flexWrap="wrap">
              <Text
                sx={{
                  fontFamily: 'mono',
                  fontSize: 1,
                  flex: '0 0 auto',
                  pb: 1,
                }}
              >
                /{item.name}
              </Text>
              <FormControl disabled={disabled} sx={{ flex: '1 1 180px' }}>
                <FormControl.Label>
                  {WORDS.commandDescription}
                </FormControl.Label>
                <TextInput
                  block
                  value={item.description}
                  onChange={event =>
                    attempt(current =>
                      writeCommand(current, index, {
                        description: event.target.value,
                      }),
                    )
                  }
                />
              </FormControl>
              <FormControl disabled={disabled} sx={{ flex: '2 1 240px' }}>
                <FormControl.Label>{WORDS.commandPrompt}</FormControl.Label>
                <TextInput
                  block
                  value={item.prompt}
                  onChange={event =>
                    attempt(current =>
                      writeCommand(current, index, {
                        prompt: event.target.value,
                      }),
                    )
                  }
                />
              </FormControl>
              <IconButton
                icon={TrashIcon}
                size="small"
                variant="invisible"
                aria-label={`Remove the command /${item.name}`}
                disabled={disabled}
                onClick={() =>
                  attempt(
                    current => removeCommand(current, index),
                    `The command /${item.name} removed.`,
                  )
                }
              />
            </Box>
            <Problems problems={problemsAt(`command:${index}`)} />
          </Box>
        ))}
      </Box>
      <Box
        as="form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (
            attempt(
              current => addCommand(current, command),
              `The command /${command.name.trim()} added.`,
            )
          ) {
            setCommand({ name: '', description: '', prompt: '' });
          }
        }}
        display="flex"
        gap={2}
        alignItems="flex-end"
        flexWrap="wrap"
        mb={3}
      >
        <FormControl disabled={disabled} sx={{ flex: '0 1 140px' }}>
          <FormControl.Label>{WORDS.commandName}</FormControl.Label>
          <TextInput
            block
            leadingVisual="/"
            value={command.name}
            onChange={event =>
              setCommand({ ...command, name: event.target.value })
            }
          />
        </FormControl>
        <FormControl disabled={disabled} sx={{ flex: '1 1 180px' }}>
          <FormControl.Label>{WORDS.commandDescription}</FormControl.Label>
          <TextInput
            block
            value={command.description}
            onChange={event =>
              setCommand({ ...command, description: event.target.value })
            }
          />
        </FormControl>
        <FormControl disabled={disabled} sx={{ flex: '2 1 240px' }}>
          <FormControl.Label>{WORDS.commandPrompt}</FormControl.Label>
          <TextInput
            block
            placeholder="Summarise the conversation in five bullets. {input}"
            value={command.prompt}
            onChange={event =>
              setCommand({ ...command, prompt: event.target.value })
            }
          />
        </FormControl>
        <Button type="submit" disabled={disabled}>
          {WORDS.addCommand}
        </Button>
      </Box>

      {/* Its modes, a switch beside the chat. */}
      <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
        {WORDS.modes}
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, mt: 0 }}>
        {WORDS.modesAbout}
      </Text>
      <Box display="flex" flexDirection="column" gap={2} mb={2}>
        {block.modes.map((item, index) => (
          <Box key={item.id} {...partSx}>
            <Box display="flex" gap={2} alignItems="flex-end" flexWrap="wrap">
              <FormControl disabled={disabled} sx={{ flex: '1 1 160px' }}>
                <FormControl.Label>{WORDS.modeLabel}</FormControl.Label>
                <TextInput
                  block
                  value={item.label}
                  onChange={event =>
                    attempt(current =>
                      writeMode(current, index, { label: event.target.value }),
                    )
                  }
                />
                <FormControl.Caption>Sent as “{item.id}”</FormControl.Caption>
              </FormControl>
              <FormControl disabled={disabled} sx={{ flex: '0 1 160px' }}>
                <FormControl.Label>{WORDS.modeDefault}</FormControl.Label>
                <Select
                  value={item.default ?? ''}
                  onChange={event =>
                    attempt(current =>
                      writeMode(current, index, {
                        default: event.target.value || undefined,
                      }),
                    )
                  }
                >
                  <Select.Option value="">Its first</Select.Option>
                  {item.options.map(option => (
                    <Select.Option key={option.id} value={option.id}>
                      {option.label}
                    </Select.Option>
                  ))}
                </Select>
              </FormControl>
              <IconButton
                icon={TrashIcon}
                size="small"
                variant="invisible"
                aria-label={`Remove the mode “${item.label}”`}
                disabled={disabled}
                onClick={() =>
                  attempt(
                    current => removeMode(current, index),
                    `The mode “${item.label}” removed.`,
                  )
                }
              />
            </Box>
            <Box display="flex" flexDirection="column" gap={2} mt={2}>
              {item.options.map((option, optionIndex) => (
                <Box
                  key={option.id}
                  display="flex"
                  gap={2}
                  alignItems="flex-end"
                  flexWrap="wrap"
                >
                  <FormControl disabled={disabled} sx={{ flex: '0 1 160px' }}>
                    <FormControl.Label>{WORDS.optionLabel}</FormControl.Label>
                    <TextInput
                      block
                      value={option.label}
                      onChange={event =>
                        attempt(current =>
                          writeModeOption(current, index, optionIndex, {
                            label: event.target.value,
                          }),
                        )
                      }
                    />
                  </FormControl>
                  <FormControl disabled={disabled} sx={{ flex: '1 1 240px' }}>
                    <FormControl.Label>
                      {WORDS.optionInstructions}
                    </FormControl.Label>
                    <TextInput
                      block
                      value={option.instructions ?? ''}
                      onChange={event =>
                        attempt(current =>
                          writeModeOption(current, index, optionIndex, {
                            instructions: event.target.value,
                          }),
                        )
                      }
                    />
                  </FormControl>
                  <IconButton
                    icon={TrashIcon}
                    size="small"
                    variant="invisible"
                    aria-label={`Remove the option “${option.label}”`}
                    disabled={disabled || item.options.length <= 2}
                    onClick={() =>
                      attempt(
                        current =>
                          removeModeOption(current, index, optionIndex),
                        `The option “${option.label}” removed.`,
                      )
                    }
                  />
                </Box>
              ))}
              <Box
                as="form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  const label = newOption[item.id] ?? '';
                  if (
                    attempt(
                      current => addModeOption(current, index, label),
                      `The option “${label.trim()}” added.`,
                    )
                  ) {
                    setNewOption(previous => ({ ...previous, [item.id]: '' }));
                  }
                }}
                display="flex"
                gap={2}
                alignItems="flex-end"
                flexWrap="wrap"
              >
                <FormControl disabled={disabled} sx={{ flex: '0 1 160px' }}>
                  <FormControl.Label>{WORDS.optionLabel}</FormControl.Label>
                  <TextInput
                    block
                    value={newOption[item.id] ?? ''}
                    onChange={event =>
                      setNewOption(previous => ({
                        ...previous,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                </FormControl>
                <Button type="submit" size="small" disabled={disabled}>
                  {WORDS.addOption}
                </Button>
              </Box>
            </Box>
            <Problems problems={problemsAt(`mode:${index}`)} />
          </Box>
        ))}
      </Box>
      <Box
        as="form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (
            attempt(
              current => addMode(current, mode.label, optionsOf(mode.options)),
              `The mode “${mode.label.trim()}” added.`,
            )
          ) {
            setMode({ label: '', options: '' });
          }
        }}
        display="flex"
        gap={2}
        alignItems="flex-end"
        flexWrap="wrap"
        mb={3}
      >
        <FormControl disabled={disabled} sx={{ flex: '0 1 180px' }}>
          <FormControl.Label>{WORDS.modeLabel}</FormControl.Label>
          <TextInput
            block
            value={mode.label}
            onChange={event => setMode({ ...mode, label: event.target.value })}
          />
        </FormControl>
        <FormControl disabled={disabled} sx={{ flex: '1 1 220px' }}>
          <FormControl.Label>{WORDS.modeOptions}</FormControl.Label>
          <Textarea
            block
            rows={2}
            value={mode.options}
            onChange={event =>
              setMode({ ...mode, options: event.target.value })
            }
          />
        </FormControl>
        <Button type="submit" disabled={disabled}>
          {WORDS.addMode}
        </Button>
      </Box>

      {/* What a person may set, beside the chat. */}
      <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
        {WORDS.settings}
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, mt: 0 }}>
        {WORDS.settingsAbout}
      </Text>
      <Box display="flex" flexDirection="column" gap={2} mb={2}>
        {block.settings.map((item, index) => (
          <Box key={item.id} {...partSx}>
            <Box display="flex" gap={2} alignItems="flex-end" flexWrap="wrap">
              <FormControl disabled={disabled} sx={{ flex: '1 1 160px' }}>
                <FormControl.Label>{WORDS.settingLabel}</FormControl.Label>
                <TextInput
                  block
                  value={item.label}
                  onChange={event =>
                    attempt(current =>
                      writeSetting(current, index, {
                        label: event.target.value,
                      }),
                    )
                  }
                />
                <FormControl.Caption>Read as “{item.id}”</FormControl.Caption>
              </FormControl>
              <FormControl disabled={disabled} sx={{ flex: '0 1 140px' }}>
                <FormControl.Label>{WORDS.settingType}</FormControl.Label>
                <Select
                  value={item.type}
                  onChange={event =>
                    attempt(current =>
                      writeSetting(current, index, {
                        type: event.target.value as SettingType,
                      }),
                    )
                  }
                >
                  {SETTING_TYPES.map(option => (
                    <Select.Option key={option.type} value={option.type}>
                      {option.says}
                    </Select.Option>
                  ))}
                </Select>
              </FormControl>
              {item.type === 'number' ? (
                <>
                  <FormControl disabled={disabled}>
                    <FormControl.Label>{WORDS.settingMin}</FormControl.Label>
                    <TextInput
                      type="number"
                      sx={{ width: 80 }}
                      value={
                        typeof item.min === 'number' ? String(item.min) : ''
                      }
                      onChange={event =>
                        attempt(current =>
                          writeSetting(current, index, {
                            min: numberOf(event.target.value),
                          }),
                        )
                      }
                    />
                  </FormControl>
                  <FormControl disabled={disabled}>
                    <FormControl.Label>{WORDS.settingMax}</FormControl.Label>
                    <TextInput
                      type="number"
                      sx={{ width: 80 }}
                      value={
                        typeof item.max === 'number' ? String(item.max) : ''
                      }
                      onChange={event =>
                        attempt(current =>
                          writeSetting(current, index, {
                            max: numberOf(event.target.value),
                          }),
                        )
                      }
                    />
                  </FormControl>
                </>
              ) : null}
              <SettingDefault
                setting={item}
                disabled={disabled}
                onChange={value =>
                  attempt(current =>
                    writeSetting(current, index, { default: value }),
                  )
                }
              />
              <Order
                what={settingName(index)}
                index={index}
                count={block.settings.length}
                disabled={disabled}
                onMove={delta =>
                  attempt(
                    current => moveSetting(current, index, delta),
                    `${settingName(index)} moved ${delta < 0 ? 'up' : 'down'}.`,
                  )
                }
                onRemove={() =>
                  attempt(
                    current => removeSetting(current, index),
                    `${settingName(index)} removed.`,
                  )
                }
              />
            </Box>
            {item.type === 'select' ? (
              <FormControl disabled={disabled} sx={{ mt: 2 }}>
                <FormControl.Label>{WORDS.settingOptions}</FormControl.Label>
                <Textarea
                  block
                  rows={3}
                  value={optionsText[item.id] ?? item.options.join('\n')}
                  onChange={event => {
                    const text = event.target.value;
                    setOptionsText(previous => ({
                      ...previous,
                      [item.id]: text,
                    }));
                    attempt(current =>
                      writeSetting(current, index, {
                        options: optionsOf(text),
                      }),
                    );
                  }}
                />
              </FormControl>
            ) : null}
            <Problems problems={problemsAt(`setting:${index}`)} />
          </Box>
        ))}
      </Box>
      <Box
        as="form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (
            attempt(
              current => addSetting(current, setting.label, setting.type),
              `Setting “${setting.label.trim()}” added.`,
            )
          ) {
            setSetting({ label: '', type: setting.type });
          }
        }}
        display="flex"
        gap={2}
        alignItems="flex-end"
        flexWrap="wrap"
      >
        <FormControl disabled={disabled} sx={{ flex: '1 1 160px' }}>
          <FormControl.Label>{WORDS.settingLabel}</FormControl.Label>
          <TextInput
            block
            value={setting.label}
            onChange={event =>
              setSetting({ ...setting, label: event.target.value })
            }
          />
        </FormControl>
        <FormControl disabled={disabled} sx={{ flex: '0 1 140px' }}>
          <FormControl.Label>{WORDS.settingType}</FormControl.Label>
          <Select
            value={setting.type}
            onChange={event =>
              setSetting({
                ...setting,
                type: event.target.value as SettingType,
              })
            }
          >
            {SETTING_TYPES.map(option => (
              <Select.Option key={option.type} value={option.type}>
                {option.says}
              </Select.Option>
            ))}
          </Select>
        </FormControl>
        <Button type="submit" disabled={disabled}>
          {WORDS.addSetting}
        </Button>
      </Box>
    </Box>
  );
}

export default CanvasChatBlock;
