/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant's gallery: every state is posed, each pose's
 * balloon is the one the assistant says, and the test sprite reads through
 * the clippy.js reader with an animation of its own for every state.
 */

import { describe, expect, it } from 'vitest';
import { readClippyAgent } from '../../chat/assistant/formats/clippy';
import { stateAnimations } from '../../chat/assistant/formats/stateAnimations';
import { ASSISTANT_WORDS } from '../../chat/assistant/state';
import {
  GALLERY_POSES,
  GALLERY_POSE_LABELS,
  SAMPLE_CONVERSATIONS,
  balloonForPose,
  sampleApproval,
  sampleSaying,
  stateOfPose,
} from '../utils/assistantGallery';
import {
  TEST_SPRITE_AGENT_JS,
  testSpriteMapPng,
} from '../utils/testSpriteCharacter';
import { EXAMPLES, getExampleEntries } from '../example-selector';

const approval = sampleApproval(
  () => undefined,
  () => undefined,
);

describe('the gallery poses', () => {
  it('poses every state the stage acts, and stepped aside', () => {
    const sprite = { ...readClippyAgent(TEST_SPRITE_AGENT_JS), sprite: 'x' };
    // `stateAnimations` answers for every state there is.
    const states = Object.keys(stateAnimations(sprite)).sort();
    const posed = [...new Set(GALLERY_POSES.map(stateOfPose))].sort();
    expect(posed).toEqual(states);
    expect(GALLERY_POSES).toContain('aside');
    for (const pose of GALLERY_POSES) {
      expect(GALLERY_POSE_LABELS[pose]).toBeTruthy();
    }
  });

  it('acts stepped aside as idle, under what covers it', () => {
    expect(stateOfPose('aside')).toBe('idle');
    expect(stateOfPose('paused')).toBe('paused');
  });
});

describe('the balloons', () => {
  it('waits with the approval, Approve and Deny in the balloon', () => {
    expect(balloonForPose('waiting', { approval })).toEqual({
      text: ASSISTANT_WORDS.approval,
      approval,
    });
  });

  it('says it is paused', () => {
    expect(balloonForPose('paused', { approval })?.text).toBe(
      ASSISTANT_WORDS.paused,
    );
  });

  it('says the latest saying when asked, and nothing leaving or aside', () => {
    const saying = sampleSaying(0);
    expect(balloonForPose('speaking', { saying, approval })).toBe(saying);
    expect(balloonForPose('idle', { approval })).toBeUndefined();
    expect(balloonForPose('goodbye', { saying, approval })).toBeUndefined();
    expect(balloonForPose('aside', { saying, approval })).toBeUndefined();
  });

  it('reads the samples as the assistant reads a chat', () => {
    // Markdown made plain; a tool call skipped; a long answer cut.
    expect(sampleSaying(0)).toEqual({
      text: 'Three customers wrote about late deliveries this week: Ada, Grace and Alan.',
      more: false,
    });
    expect(sampleSaying(1).text).toContain('its chart shows');
    expect(sampleSaying(2).more).toBe(true);
    expect(sampleSaying(SAMPLE_CONVERSATIONS.length)).toEqual(sampleSaying(0));
  });
});

describe('the test sprite', () => {
  it('is a PNG of ten 48×48 cells', () => {
    const png = testSpriteMapPng();
    expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const view = new DataView(png.buffer);
    expect(view.getUint32(16)).toBe(480);
    expect(view.getUint32(20)).toBe(48);
  });

  it('gives every state an animation of its own', () => {
    const agent = readClippyAgent(TEST_SPRITE_AGENT_JS);
    expect(agent.frameSize).toEqual({ width: 48, height: 48 });
    const byState = stateAnimations({ ...agent, sprite: 'x' });
    // One animation per state, so a picture of it is always the same.
    for (const names of Object.values(byState)) {
      expect(names).toHaveLength(1);
    }
    const chosen = Object.values(byState).map(names => names[0]);
    expect(new Set(chosen).size).toBe(chosen.length);
    // Every frame indexes a cell of the sheet.
    for (const animation of Object.values(agent.animations)) {
      for (const frame of animation.frames) {
        for (const image of frame.images) {
          expect(image.x % 48).toBe(0);
          expect(image.x).toBeLessThan(480);
          expect(image.y).toBe(0);
        }
      }
    }
  });
});

describe('the registry', () => {
  it('lists the gallery in the Chat group', () => {
    const entry = getExampleEntries().find(
      e => e.id === 'ChatAssistantGalleryExample',
    );
    expect(entry?.title).toBe('Chat Assistant Gallery');
    expect(EXAMPLES.ChatAssistantGalleryExample).toBeTypeOf('function');
  });
});
