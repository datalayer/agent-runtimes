/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the hands-free cases share (VO-12, VO-13): the browser with Chrome's
 * fake microphone playing a fixture, and the application's Preview with
 * hands-free turned on, every state it shows recorded as it changes.
 *
 * @module e2e/handsFree
 */

import { fileURLToPath } from 'node:url';
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { PROBES, landingUrl } from './global-setup';

export const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

/**
 * A hosted address to drive instead of the Studio's Preview (VO-53):
 * `/apps/<slug>`, opened by a visitor without an account, the voice turned
 * on for the page alone. The application's own page is lighter than the
 * Studio's, so the browser's own model hears inside the memory a test is
 * given there.
 */
export const voiceAddress = (): string => process.env.E2E_VOICE_ADDRESS || '';

export const unreachable =
  process.env[PROBES.landing] ||
  (voiceAddress()
    ? ''
    : !process.env.E2E_STATE
      ? 'E2E_STATE names no signed-in storage state: the Preview needs a person (or name a hosted address, E2E_VOICE_ADDRESS).'
      : !process.env.E2E_VOICE_APP
        ? 'E2E_VOICE_APP names no application to preview.'
        : '');

/**
 * Press a voice control. At a hosted address the floating assistant's
 * character is drawn over the right end of the composer's footer, where the
 * microphone, the voice menu and *Talk with it* are, and takes their clicks
 * (20 October 2026, 1280×900): there they are pressed from the keyboard,
 * Enter on the focused button, as a person using the keyboard does (VO-66).
 */
export const activate = (
  target: Locator,
  address = voiceAddress(),
): Promise<void> => (address ? target.press('Enter') : target.click());

/** The voice an Appspec says, as its JSON writes it (`interface.voice`). */
export interface VoiceSaid {
  input: 'push_to_talk' | 'hands_free';
  output: 'off' | 'on_request' | 'always';
  where: 'auto' | 'device' | 'server';
}

/**
 * The page the voice is driven on, open and its composer shown: the
 * application's Preview in the Studio, signed in; or, with
 * `E2E_VOICE_ADDRESS`, its hosted address as a visitor, its voice turned on
 * for the page alone in the answer that address is read from. Nothing of
 * the application is changed: writes are refused in the browser.
 */
export async function openVoice(
  page: Page,
  context: BrowserContext,
  voice: VoiceSaid,
  address = voiceAddress(),
): Promise<void> {
  await context.route('**/api/**', route =>
    ['PUT', 'PATCH', 'DELETE'].includes(route.request().method())
      ? route.abort()
      : route.continue(),
  );
  // The notebook's Python in the browser is not needed to talk, and the
  // page stays inside the memory a test is given.
  await context.route(
    /pyodide|jupyterlite|lite-service-worker|\.whl(\?|$)/,
    route => route.abort(),
  );
  const slug = address;
  if (slug) {
    // Registered last, so tried first: the address's answer, with a voice.
    await context.route(
      url =>
        url.pathname.endsWith(
          `/apps/deployments/at/${encodeURIComponent(slug)}`,
        ),
      async route => {
        const response = await route.fetch();
        const read = (await response.json()) as {
          spec?: { interface?: Record<string, unknown> };
        };
        if (read.spec) {
          read.spec.interface = {
            ...read.spec.interface,
            voice: { enabled: true, voice: '', language: 'en', ...voice },
          };
        }
        await route.fulfill({ response, json: read });
      },
    );
    await page.goto(`${landingUrl()}/apps/${encodeURIComponent(slug)}`);
    return;
  }
  await page.goto(
    `${landingUrl()}/studio/apps/${process.env.E2E_VOICE_APP}?section=face&try=1`,
  );
  const card = page.locator('#app-voice');
  await expect(card).toBeVisible({ timeout: 180_000 });
  if (
    !['on', 'true'].includes((await card.getAttribute('data-app-voice')) ?? '')
  ) {
    await card.locator('input[type=checkbox]').click();
  }
  if (voice.input === 'hands_free') {
    // The page's own choice, never saved: hands-free, answers always said.
    await card.getByLabel('Talking to it').selectOption('hands_free');
  }
  await page.locator('text=Compose >> visible=true').first().click();
}

/**
 * The browser, its fake microphone playing `wav` over and over; at
 * `address` (`E2E_VOICE_ADDRESS` unless said, `''` for the Studio's
 * Preview) as a visitor.
 */
export const hearing = (wav: string, address = voiceAddress()) => ({
  // A visitor at a hosted address has no account.
  storageState: address ? undefined : process.env.E2E_STATE || undefined,
  permissions: ['microphone'],
  launchOptions: {
    executablePath: process.env.E2E_CHROME || '/usr/bin/google-chrome',
    args: [
      // Inside the memory a test is given: no GPU process, no extensions.
      '--disable-gpu',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${fixture(wav)}`,
      // The timing probe's own meter on the microphone runs without a gesture.
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

/** One moment the timing probe saw, in the page's clock (`performance.now()`, ms). */
export interface VoiceMoment {
  at: number;
  what: string;
  detail?: string;
}

/**
 * The latency probe (VO-52), added before the page loads: the moments the
 * budgets are measured between, in the page's own clock. Chrome's fake
 * microphone starts its file when the page opens it, a moment the page's
 * code does not see; so the probe meters every stream the page opens itself
 * — a meter of its own on the same tracks, every 10 ms — and notes when
 * sound starts (`speech`) and when it has been silent for 300 ms
 * (`silence`, at the last sound). Besides: each sentence asked of the speech
 * service and its answer, each run sent, each sound played and stopped
 * (`AudioBufferSourceNode`), and the composer's microphone and hands-free
 * states as they change. Nothing of the page's own code is changed.
 */
export const timeVoice = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript(() => {
    const moments: { at: number; what: string; detail?: string }[] = [];
    (window as unknown as { __voiceTimes: typeof moments }).__voiceTimes =
      moments;
    const note = (what: string, detail?: string) =>
      moments.push({ at: Math.round(performance.now()), what, detail });
    const devices = navigator.mediaDevices;
    const open = devices.getUserMedia.bind(devices);
    let streams = 0;
    devices.getUserMedia = async constraints => {
      const stream = await open(constraints);
      if (!constraints || !constraints.audio) {
        return stream;
      }
      streams += 1;
      const id = String(streams);
      note('microphone opened', id);
      const meter = new AudioContext();
      void meter.resume();
      const analyser = meter.createAnalyser();
      analyser.fftSize = 512;
      meter.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let sounding = false;
      let lastSound = 0;
      const timer = window.setInterval(() => {
        if (
          stream.getAudioTracks().every(track => track.readyState === 'ended')
        ) {
          window.clearInterval(timer);
          void meter.close();
          note('microphone closed', id);
          return;
        }
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          sum += sample * sample;
        }
        const level = Math.sqrt(sum / samples.length);
        const now = performance.now();
        if (level > 0.01) {
          lastSound = now;
          if (!sounding) {
            sounding = true;
            note('speech', id);
          }
        } else if (sounding && now - lastSound > 300) {
          sounding = false;
          moments.push({
            at: Math.round(lastSound),
            what: 'silence',
            detail: id,
          });
        }
      }, 10);
      return stream;
    };
    const send = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      const kind = url.includes('/speech/syntheses')
        ? 'synthesis'
        : method === 'POST' &&
            /\/(chat|runs?|messages|ag-ui|assistant)\b/.test(url)
          ? 'run'
          : '';
      if (kind) {
        note(`${kind} asked`);
      }
      const response = await send(input, init);
      if (kind) {
        note(`${kind} answered`, String(response.status));
      }
      return response;
    };
    const proto = AudioBufferSourceNode.prototype;
    const start = proto.start;
    const stop = proto.stop;
    proto.start = function (this: AudioBufferSourceNode, ...args: number[]) {
      note('sound started');
      this.addEventListener('ended', () => note('sound ended'));
      return start.apply(this, args as []);
    };
    proto.stop = function (this: AudioBufferSourceNode, ...args: number[]) {
      note('sound stopped');
      return stop.apply(this, args as []);
    };
    const watch = () => {
      const mic = document
        .querySelector('[data-voice-input]')
        ?.getAttribute('data-voice-input');
      const hands = document
        .querySelector('[data-hands-free-state]')
        ?.getAttribute('data-hands-free-state');
      const interim = document.querySelector('[data-voice-interim]') !== null;
      const shown = `${mic ?? ''}|${hands ?? ''}|${interim}`;
      const last = (window as unknown as { __voiceShown?: string })
        .__voiceShown;
      if (shown !== last) {
        (window as unknown as { __voiceShown?: string }).__voiceShown = shown;
        note('shown', shown);
      }
    };
    new MutationObserver(watch).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'data-voice-input',
        'data-hands-free-state',
        'data-voice-interim',
      ],
    });
    // Push-to-talk's key, held and let go (VO-10).
    window.addEventListener(
      'keydown',
      event => {
        if (event.code === 'Space' && event.ctrlKey && !event.repeat) {
          note('key held');
        }
      },
      true,
    );
    window.addEventListener(
      'keyup',
      event => {
        if (event.code === 'Space') {
          note('key let go');
        }
      },
      true,
    );
    document.addEventListener(
      'click',
      event => {
        const target = event.target as Element | null;
        if (target?.closest('[data-voice-mic]')) {
          note('microphone clicked');
        } else if (target?.closest('[data-hands-free-toggle]')) {
          note('hands-free clicked');
        } else if (
          target?.closest(
            '[data-voice-consent-yes],[data-hands-free-consent-yes]',
          )
        ) {
          note('consent given');
        }
      },
      true,
    );
  });
};

/** What the timing probe saw, in order. */
export const voiceTimes = (page: Page): Promise<VoiceMoment[]> =>
  page.evaluate(
    () =>
      (window as unknown as { __voiceTimes?: VoiceMoment[] }).__voiceTimes ??
      [],
  );

export interface Talk {
  /** The runs the page started: one per turn sent. */
  runs: string[];
  /** The status of each answer said by the speech service. */
  syntheses: number[];
  /** Every state the composer showed, in order, each once per change. */
  states: () => Promise<string[]>;
  /** The toggle: *Talk with it*. */
  toggle: ReturnType<Page['locator']>;
  /** The state shown: *Listening…*, *Thinking…*, *Speaking…*, *Paused*. */
  state: ReturnType<Page['locator']>;
  /** Whether a sentence of the answer was ever marked as being said. */
  sentenceMarked: () => Promise<boolean>;
  /** The silence that ends a turn, as the hands-free composer was given it (ms). */
  turnSilenceMs: () => Promise<number | undefined>;
  /** What the latency probe saw (VO-52). */
  times: () => Promise<VoiceMoment[]>;
}

/**
 * The application's Preview with hands-free chosen and turned on, its
 * consent given; `settings` are the person's voice settings.
 */
export async function talkWith(
  page: Page,
  context: BrowserContext,
  settings: Record<string, unknown>,
  address = voiceAddress(),
): Promise<Talk> {
  const runs: string[] = [];
  const syntheses: number[] = [];
  // In the Studio's Preview, heard on Datalayer's servers as it is said (the
  // person's *Detect the language I speak*): the browser runs only the VAD,
  // and the Studio's page stays inside the memory a test is given — with the
  // browser's own model besides, it did not (OOM at 2.5 GB, 16 October
  // 2026). At a hosted address, lighter, the browser's own model hears.
  const onDevice = Boolean(address);
  await timeVoice(context);
  await context.addInitScript(
    kept =>
      window.localStorage.setItem(
        'datalayer-voice-settings',
        JSON.stringify(kept),
      ),
    onDevice ? { ...settings } : { detectLanguage: true, ...settings },
  );
  // Every state shown, as it changes: a state shown for a moment is seen;
  // and whether a sentence was ever marked as being said, since the answer
  // may be spoken over a moment later (VO-65, VO-13).
  await context.addInitScript(() => {
    const seen: string[] = [];
    const held = window as unknown as {
      __handsFree: string[];
      __sentenceMarked: boolean;
    };
    held.__handsFree = seen;
    held.__sentenceMarked = false;
    const note = () => {
      const shown = document
        .querySelector('[data-hands-free-state]')
        ?.getAttribute('data-hands-free-state');
      if (shown && seen[seen.length - 1] !== shown) {
        seen.push(shown);
      }
      if (document.querySelector('[data-voice-saying][aria-current="true"]')) {
        held.__sentenceMarked = true;
      }
    };
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'data-hands-free-state',
        'data-voice-saying',
        'aria-current',
      ],
    });
  });
  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      /\/(chat|runs?|messages|ag-ui|assistant)\b/.test(request.url())
    ) {
      runs.push(request.url());
    }
  });
  page.on('response', response => {
    if (response.url().includes('/speech/syntheses')) {
      syntheses.push(response.status());
    }
  });
  await openVoice(
    page,
    context,
    {
      input: 'hands_free',
      output: 'always',
      where: onDevice ? 'device' : 'server',
    },
    address,
  );
  const toggle = page.locator('[data-hands-free-toggle]').first();
  await expect(toggle).toBeEnabled({ timeout: 120_000 });
  await activate(toggle, address);
  const yes = page.locator('[data-hands-free-consent-yes]');
  if (await yes.isVisible().catch(() => false)) {
    await activate(yes, address);
  }
  const state = page.locator('[data-hands-free-state]').first();
  await expect(state).toHaveAttribute('data-hands-free-state', 'listening', {
    timeout: 120_000,
  });
  return {
    runs,
    syntheses,
    toggle,
    state,
    states: () =>
      page.evaluate(
        () => (window as unknown as { __handsFree: string[] }).__handsFree,
      ),
    times: () => voiceTimes(page),
    sentenceMarked: () =>
      page.evaluate(
        () =>
          (window as unknown as { __sentenceMarked: boolean }).__sentenceMarked,
      ),
    // Read from the component itself: the prop React holds for it, found
    // from its element up through its fibers.
    turnSilenceMs: () =>
      page.evaluate(() => {
        const element = document.querySelector('[data-hands-free]');
        const key = element
          ? Object.keys(element).find(name => name.startsWith('__reactFiber$'))
          : undefined;
        type Fiber = {
          memoizedProps?: Record<string, unknown>;
          return?: Fiber;
        };
        let fiber = key
          ? (element as unknown as Record<string, Fiber>)[key]
          : undefined;
        while (fiber) {
          const props = fiber.memoizedProps;
          if (props && typeof props.turnSilenceMs === 'number') {
            return props.turnSilenceMs;
          }
          fiber = fiber.return;
        }
        return undefined;
      }),
  };
}

/** `wanted` appear in `seen` in this order, others between them or not. */
export const inOrder = (seen: string[], wanted: string[]): boolean => {
  let at = 0;
  for (const shown of seen) {
    if (shown === wanted[at]) {
      at += 1;
    }
  }
  return at === wanted.length;
};
