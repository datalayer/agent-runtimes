/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** A chat's block on the Canvas, edited in place. */

import { describe, expect, it, test } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getApp } from '../../specs/apps';
import { emptyAppspec } from '../apps/appspec';
import type { AppSpec } from '../../types/agentspecs';
import { writeAppspecYaml } from '../apps/yaml';
import { readAppYaml } from '../composer/AppYamlEditor';
import {
  CHAT_BLOCK_WORDS,
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
  settingIdOf,
  writeAvatar,
  writeCommand,
  writeMode,
  writeModeOption,
  writeSetting,
  writeStarter,
  writeWelcome,
} from '../composer/chatBlock';

const interview = (): AppSpec =>
  JSON.parse(JSON.stringify(getApp('customer-interview'))) as AppSpec;

describe('a chat’s block, read from its spec', () => {
  it('reads the welcome, the suggested questions, the settings and the face the Appspec holds', () => {
    const spec = interview();
    const block = chatBlockOf(spec);
    expect(block.welcome).toBe(spec.interface.welcome);
    expect(block.starters).toEqual(spec.interface.starters);
    // Its settings are a form: each field, as the block edits it.
    expect(block.settings).toEqual([
      {
        id: 'language',
        type: 'select',
        label: 'Language',
        options: ['English', 'French'],
        default: 'English',
      },
      {
        id: 'length',
        type: 'number',
        label: 'Questions',
        options: [],
        default: 8,
        min: 3,
        max: 15,
      },
    ]);
    expect(block.avatar).toBe(spec.avatar ?? '');
  });

  it('has nothing to say on an example of the catalogue', () => {
    expect(chatBlockProblems(interview())).toEqual([]);
  });
});

describe('edited in place, written into the Appspec’s own fields', () => {
  it('writes the welcome and the face', () => {
    const spec = writeAvatar(
      writeWelcome(interview(), 'Hello. Ask me anything.'),
      'robot',
    );
    expect(spec.interface.welcome).toBe('Hello. Ask me anything.');
    expect(spec.avatar).toBe('robot');
  });

  it('adds, changes, moves and removes a suggested question', () => {
    let spec = emptyAppspec('chat');
    spec = addStarter(spec, {
      label: ' Pricing ',
      message: ' What does it cost? ',
    });
    spec = addStarter(spec, {
      label: 'Refunds',
      message: 'How do I get a refund?',
    });
    expect(spec.interface.starters).toEqual([
      { label: 'Pricing', message: 'What does it cost?' },
      { label: 'Refunds', message: 'How do I get a refund?' },
    ]);
    spec = writeStarter(spec, 0, { message: 'How much is it?' });
    expect(spec.interface.starters[0]).toEqual({
      label: 'Pricing',
      message: 'How much is it?',
    });
    spec = moveStarter(spec, 1, -1);
    expect(spec.interface.starters.map(starter => starter.label)).toEqual([
      'Refunds',
      'Pricing',
    ]);
    spec = removeStarter(spec, 0);
    expect(spec.interface.starters.map(starter => starter.label)).toEqual([
      'Pricing',
    ]);
  });

  it('refuses a suggested question without both its words, twice the same, or past six', () => {
    let spec = emptyAppspec('chat');
    expect(() => addStarter(spec, { label: 'Pricing', message: ' ' })).toThrow(
      /needs the words on its button and the message/,
    );
    spec = addStarter(spec, {
      label: 'Pricing',
      message: 'What does it cost?',
    });
    expect(() =>
      addStarter(spec, { label: 'pricing', message: 'Again?' }),
    ).toThrow(/already a suggested question/);
    for (let n = 1; n < MAX_STARTERS; n += 1) {
      spec = addStarter(spec, { label: `Question ${n}`, message: `Ask ${n}` });
    }
    expect(() =>
      addStarter(spec, { label: 'One more', message: 'Ask' }),
    ).toThrow(/at most 6/);
    expect(() => moveStarter(spec, 0, -1)).toThrow(/already at that end/);
  });

  it('says on its block a suggested question emptied in place', () => {
    const spec = writeStarter(
      addStarter(emptyAppspec('chat'), { label: 'Pricing', message: 'Cost?' }),
      0,
      { message: '' },
    );
    expect(chatBlockProblems(spec)).toEqual([
      { where: 'starter:0', problem: 'It sends no message.' },
    ]);
  });

  it('adds a setting of each type, named once from its first label', () => {
    let spec = emptyAppspec('chat');
    for (const { type } of SETTING_TYPES) {
      spec = addSetting(spec, `Its ${type}`, type);
    }
    expect(
      chatBlockOf(spec).settings.map(setting => [setting.id, setting.type]),
    ).toEqual([
      ['its_select', 'select'],
      ['its_text', 'text'],
      ['its_toggle', 'toggle'],
      ['its_number', 'number'],
    ]);
    // Written as the settings' form, each a field of its kind.
    expect(spec.interface.settings).toEqual({
      type: 'object',
      properties: {
        its_select: { type: 'string', title: 'Its select', enum: [] },
        its_text: { type: 'string', title: 'Its text' },
        its_toggle: { type: 'boolean', title: 'Its toggle', default: false },
        its_number: { type: 'number', title: 'Its number' },
      },
    });
    // Renamed, it keeps the name the page reads it by.
    spec = writeSetting(spec, 0, { label: 'Language' });
    expect(chatBlockOf(spec).settings[0]).toMatchObject({
      id: 'its_select',
      label: 'Language',
    });
    expect(() => addSetting(spec, 'language', 'text')).toThrow(
      /already a setting/,
    );
    expect(() => addSetting(spec, '  ', 'text')).toThrow(
      /needs the name a person reads/,
    );
  });

  it('makes a setting’s name from its words, unique and starting with a letter', () => {
    expect(settingIdOf('Réponse en français', [])).toBe('reponse_en_francais');
    expect(settingIdOf('Tone', ['tone'])).toBe('tone_2');
    expect(settingIdOf('10 questions', [])).toBe('setting_10_questions');
    expect(settingIdOf('!!!', [])).toBe('setting');
  });

  it('keeps only what a new type reads when a setting changes type', () => {
    let spec = addSetting(emptyAppspec('chat'), 'Length', 'number');
    spec = writeSetting(spec, 0, { min: 1, max: 9, default: 3 });
    spec = writeSetting(spec, 0, { type: 'select' });
    expect(chatBlockOf(spec).settings[0]).toEqual({
      id: 'length',
      type: 'select',
      label: 'Length',
      options: [],
    });
    spec = writeSetting(spec, 0, { options: optionsOf('Short\n\n Long \n') });
    expect(spec.interface.settings?.properties.length).toEqual({
      type: 'string',
      title: 'Length',
      enum: ['Short', 'Long'],
    });
    spec = writeSetting(spec, 0, { type: 'toggle' });
    expect(chatBlockOf(spec).settings[0]).toEqual({
      id: 'length',
      type: 'toggle',
      label: 'Length',
      options: [],
      default: false,
    });
  });

  it('moves and removes a setting', () => {
    let spec = addSetting(
      addSetting(emptyAppspec('chat'), 'Tone', 'text'),
      'Length',
      'number',
    );
    spec = moveSetting(spec, 0, 1);
    expect(Object.keys(spec.interface.settings?.properties ?? {})).toEqual([
      'length',
      'tone',
    ]);
    spec = removeSetting(spec, 1);
    expect(Object.keys(spec.interface.settings?.properties ?? {})).toEqual([
      'length',
    ]);
    expect(() => removeSetting(spec, 3)).toThrow(/no item 4/);
    // The last one removed, the application has no settings.
    expect(removeSetting(spec, 0).interface.settings).toBeUndefined();
  });

  it('says what a setting lacks on its block', () => {
    let spec = addSetting(emptyAppspec('chat'), 'Language', 'select');
    spec = writeSetting(spec, 0, { options: ['English'], default: 'French' });
    spec = addSetting(spec, 'Length', 'number');
    spec = writeSetting(spec, 1, { min: 10, max: 5 });
    expect(chatBlockProblems(spec)).toEqual([
      { where: 'setting:0', problem: 'A choice needs at least two choices.' },
      {
        where: 'setting:0',
        problem: 'It starts at “French”, which is not one of its choices.',
      },
      { where: 'setting:1', problem: 'Its least is not below its most.' },
    ]);
  });
});

describe('commands and modes', () => {
  it('adds a command typed after a slash, refuses one that cannot be, and changes or removes it', () => {
    let spec = addCommand(interview(), {
      name: ' /Sum Up ',
      description: 'Summarise',
      prompt: 'Summarise: {input}',
    });
    expect(chatBlockOf(spec).commands).toEqual([
      {
        name: 'sum-up',
        description: 'Summarise',
        prompt: 'Summarise: {input}',
      },
    ]);
    expect(() =>
      addCommand(spec, { name: 'sum-up', description: 'Again', prompt: 'p' }),
    ).toThrow('There is already a command /sum-up.');
    expect(() =>
      addCommand(spec, { name: '1st', description: 'd', prompt: 'p' }),
    ).toThrow('cannot be typed after a slash');
    expect(() =>
      addCommand(spec, { name: 'go', description: '', prompt: 'p' }),
    ).toThrow('A command needs');
    spec = writeCommand(spec, 0, { prompt: 'Ask {question}' });
    expect(chatBlockProblems(spec)).toContainEqual({
      where: 'command:0',
      problem: 'It sends {question}, which nothing fills: only {input} is.',
    });
    expect(chatBlockOf(removeCommand(spec, 0)).commands).toEqual([]);
  });

  it('adds a mode with two options at least, sets where it starts, and keeps two', () => {
    expect(() => addMode(interview(), 'Depth', ['Quick'])).toThrow(
      'A mode needs two options at least.',
    );
    let spec = addMode(interview(), 'Depth', ['Quick', 'Thorough']);
    expect(chatBlockOf(spec).modes).toEqual([
      {
        id: 'depth',
        label: 'Depth',
        options: [
          { id: 'quick', label: 'Quick' },
          { id: 'thorough', label: 'Thorough' },
        ],
      },
    ]);
    expect(() => addMode(spec, 'depth', ['A', 'B'])).toThrow(
      'There is already a mode “depth”.',
    );
    spec = writeModeOption(spec, 0, 1, { instructions: 'Cite what you read.' });
    spec = writeMode(spec, 0, { default: 'thorough' });
    expect(spec.interface.modes[0].default).toBe('thorough');
    expect(() => writeMode(spec, 0, { default: 'deep' })).toThrow(
      '“deep” is not one of its options.',
    );
    expect(() => removeModeOption(spec, 0, 0)).toThrow(
      'A mode keeps two options at least.',
    );
    spec = addModeOption(spec, 0, 'Quick');
    expect(spec.interface.modes[0].options.map(option => option.id)).toEqual([
      'quick',
      'thorough',
      'quick_2',
    ]);
    spec = removeModeOption(spec, 0, 1);
    expect(spec.interface.modes[0].default).toBeUndefined();
    expect(chatBlockOf(removeMode(spec, 0)).modes).toEqual([]);
  });

  it('writes them into the YAML, reads them back, and leaves an Appspec its checks accept', () => {
    let spec = addCommand(interview(), {
      name: 'summarise',
      description: 'Summarise',
      prompt: 'Summarise: {input}',
    });
    spec = writeModeOption(
      addMode(spec, 'Depth', ['Quick', 'Thorough']),
      0,
      0,
      { instructions: 'Two sentences.' },
    );
    const text = writeAppspecYaml(spec);
    expect(text).toContain('name: summarise');
    expect(text).toContain('instructions: Two sentences.');
    const read = readAppYaml(text);
    expect(read.app?.interface.commands).toEqual(spec.interface.commands);
    expect(read.app?.interface.modes).toEqual(spec.interface.modes);
    expect(
      read.check.problems.filter(problem => /interface/.test(problem)),
    ).toEqual([]);
  });
});

describe('one spec with the text', () => {
  it('writes what the block edits into the YAML, and reads it back the same', () => {
    let spec = interview();
    spec = writeWelcome(spec, 'Hello. I ask one question at a time.');
    spec = addStarter(spec, {
      label: 'Pricing',
      message: 'Interview me about pricing.',
    });
    spec = addSetting(spec, 'Tone', 'text');
    spec = writeSetting(spec, chatBlockOf(spec).settings.length - 1, {
      default: 'Warm',
    });
    const text = writeAppspecYaml(spec);
    expect(text).toContain('welcome: Hello. I ask one question at a time.');
    expect(text).toContain('label: Pricing');
    expect(text).toContain('title: Tone');
    const read = readAppYaml(text);
    expect(read.app?.interface.welcome).toBe(spec.interface.welcome);
    expect(read.app?.interface.starters).toEqual(spec.interface.starters);
    expect(read.app?.interface.settings).toEqual(spec.interface.settings);
  });

  it('leaves an Appspec its checks accept', () => {
    let spec = interview();
    spec = addStarter(spec, {
      label: 'Pricing',
      message: 'Interview me about pricing.',
    });
    spec = addSetting(spec, 'Tone', 'toggle');
    const text = writeAppspecYaml(spec);
    const { check } = readAppYaml(text);
    expect(
      [...check.problems, ...check.attention].filter(problem =>
        /interface|starter|setting/i.test(problem),
      ),
    ).toEqual([]);
  });
});

describe('on the Canvas', () => {
  it('is drawn on a chat’s Canvas, above its layout or alone', () => {
    const canvas = readFileSync(
      join(__dirname, '..', 'composer', 'AppLayoutEditor.tsx'),
      'utf8',
    );
    expect(canvas).toContain(
      "kind === 'chat' ? <CanvasChatBlock definition={definition} disabled={disabled} onChange={onChange} /> : null",
    );
    expect(canvas.match(/\{chatBlock\}/g)).toHaveLength(2);
  });
});
