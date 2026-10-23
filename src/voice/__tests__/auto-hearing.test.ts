/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `where: auto`: the page chooses where each press is heard —
 * on the device when a model there hears the language and loads, on the
 * speech service otherwise, and back to the device when the service refuses
 * a press (a visitor's day spent).
 */

import { describe, expect, it } from 'vitest';
import type { Hearing } from '../hearing';
import { AutoHearing, MOVED_TO_SERVER, ServerRefused } from '../serverHearing';
import type { Transcript } from '../types';

/** A hearing on the real shape, saying where it heard. */
class Heard implements Hearing {
  readied: string[] = [];
  heard = 0;
  constructor(
    readonly where: 'device' | 'server',
    private readonly fails: { ready?: boolean; refuse?: boolean } = {},
  ) {}
  async ready(language: string): Promise<void> {
    this.readied.push(language);
    if (this.fails.ready) {
      throw new Error('The model could not be read: Failed to fetch');
    }
  }
  async hearSoFar() {
    return { text: '', spoke: true, silentMs: 0 };
  }
  async hear(_audio: Float32Array, language: string): Promise<Transcript> {
    this.heard += 1;
    if (this.fails.refuse) {
      throw new ServerRefused(
        'You have heard all the spoken answers offered without an account today.',
      );
    }
    return {
      text: `heard on the ${this.where}`,
      metadata: { input: 'voice', language, engine: 'x', where: this.where },
      seconds: 1,
      ms: 1,
    };
  }
}

const press = new Float32Array(16000);

describe('where: auto', () => {
  it('hears on the device a language its models hear, on the server one they do not', async () => {
    const device = new Heard('device');
    const server = new Heard('server');
    const english = new AutoHearing(device, server, 'en-US');
    expect(english.where).toBe('device');
    await english.ready('en-US');
    expect((await english.hear(press, 'en-US'))?.metadata.where).toBe('device');
    const german = new AutoHearing(device, server, 'de-DE');
    expect(german.where).toBe('server');
    await german.ready('de-DE');
    expect((await german.hear(press, 'de-DE'))?.metadata.where).toBe('server');
  });

  it('moves to the server when the device model does not load, and says so before any sound goes', async () => {
    const device = new Heard('device', { ready: true });
    const server = new Heard('server');
    const auto = new AutoHearing(device, server, 'en-US');
    await expect(auto.ready('en-US')).rejects.toThrow(MOVED_TO_SERVER);
    // The next press asks the server's consent: `where` says server now.
    expect(auto.where).toBe('server');
    expect(server.heard).toBe(0);
    // It stays there, even for a language the device would hear.
    await auto.ready('fr-FR');
    expect((await auto.hear(press, 'fr-FR'))?.metadata.where).toBe('server');
    expect(device.readied).toEqual(['en-US']);
  });

  it('a refused visitor is heard in the page instead, the sound staying there', async () => {
    const device = new Heard('device');
    const server = new Heard('server', { refuse: true });
    let devicePossible = false;
    const auto = new AutoHearing(device, server, 'en-US', () => devicePossible);
    expect(auto.where).toBe('server');
    await auto.ready('en-US');
    // No model here for it: the refusal is said as the service said it.
    await expect(auto.hear(press, 'en-US')).rejects.toThrow(
      'without an account today',
    );
    expect(auto.where).toBe('server');
    // A model here hears it: the press is heard in the page.
    devicePossible = true;
    const heard = await auto.hear(press, 'en-US');
    expect(heard?.metadata.where).toBe('device');
    expect(auto.where).toBe('device');
    expect(device.readied).toEqual(['en-US']);
  });

  it('a network failure is not a refusal: it is said, and nothing moves', async () => {
    const device = new Heard('device');
    const server: Hearing = {
      where: 'server',
      ready: async () => undefined,
      hearSoFar: async () => ({ text: '', spoke: false, silentMs: 0 }),
      hear: async () => {
        throw new TypeError('Failed to fetch');
      },
    };
    const auto = new AutoHearing(device, server, 'de-DE', () => false);
    await expect(auto.hear(press, 'de-DE')).rejects.toThrow('Failed to fetch');
    expect(auto.where).toBe('server');
  });
});
