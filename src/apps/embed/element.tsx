/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `<datalayer-app>`: an application in another product's page, as one
 * script tag and one element (LOOP D-08), in the mode its Appspec says
 * (D-07), its theme isolated from the host's and overridable in the three
 * ways that matter (T-13, D-11).
 *
 *   <script src="https://datalayer.app/embed/datalayer-app.js" async></script>
 *   <datalayer-app app="01M…" origin="https://datalayer.app"></datalayer-app>
 *
 * What it shows comes from one of three places, first found first:
 *
 * 1. an Appspec written in the element, as YAML or JSON
 *    (`<script type="application/yaml">…</script>`);
 * 2. an Appspec at an address (`spec="https://…/support-desk.yaml"`);
 * 3. an application on Datalayer (`app`), read with its embed token
 *    (`token`), or — with no token — a public one read as a visitor
 *    without an account reads it (STUDIO D-07, R-30, `visitorApp`): an
 *    example Datalayer keeps warm for visitors, or an application at its
 *    address that its owner lets anybody talk to. The conversation then
 *    runs on the visitors' runtime with a visitor's token the chat mints
 *    from ai-inference itself (`api`), in every mode; one a visitor may not
 *    talk to says so in a sentence, with the embed token as what it takes.
 *    A decision is framed as before: Datalayer's run page in an iframe,
 *    sized to it, its `decision` and `token-expired` events raised on the
 *    element.
 *
 * Every other application is drawn here, in the element's shadow root, by
 * `AppEmbed` — inline, or floating over the page as a bubble, a panel or the
 * assistant. The bundle's stylesheet is linked inside that root, the
 * styled-components rules are written into it, and Primer's overlays are
 * drawn in it, so nothing of the application's styles reaches the page and
 * nothing of the page's reaches the application.
 *
 * The page and the application talk (LOOP D-10), for the names its Appspec
 * gives under `deployment.embedded.host`: the page sets `element.context`
 * (`{ user, page, …its own }`), which its agent reads with `host_context`,
 * and `element.functions` (`{ open_ticket: async args => … }`), which its
 * agent calls as `host_open_ticket`, each as the rule naming it decides; the
 * element raises `message` when the application has answered and `action`
 * when it called a function of the page, beside `decision` and
 * `token-expired`. Who its user is, when it matters (LOOP D-21): the page
 * sets `user-token` (or `element.userToken`) to the token its server signed
 * naming the user, sent with every run of an application that says
 * `user: signed`.
 *
 * Window messages (LOOP P-25), on the host's own server: the element raises
 * `window-message` (`detail.data`) when the application's code tells the page
 * something outside the conversation (`session.send_window_message`), and
 * `element.postWindowMessage(data)` hands the page's to its `@app.window`.
 *
 * On the host's server (`server`) with the visit's embed token, the
 * session the application opens is kept in the page's `localStorage`, under
 * the application and the visit its token names, and picked up again after
 * the page reloads — its conversation drawn again (LOOP D-13); a token
 * renewed for the visit redraws the application on the same session.
 * `resume="false"` keeps nothing in the page's storage.
 *
 * @module apps/embed/element
 */

import { createRoot, type Root } from 'react-dom/client';
import { StyleSheetManager } from 'styled-components';
import { getThemeConfig } from '@datalayer/primer-addons';
import { coreStore } from '@datalayer/core/lib/state/substates/CoreState';
import type { AppSpec } from '../../types/agentspecs';
import { parseAppspec, type ParsedAppspec } from '../apps/appspec';
import type { DatalayerVisitors } from '../apps/visitorToken';
import { readAppspecYaml } from '../apps/yaml';
import { AppEmbed, embedAssistantCharacter } from './AppEmbed';
import type { AppEmbedHost, HostFunction, WindowPost } from './hostBridge';
import { WINDOW_NOT_YET } from './embedSession';
import {
  EMBED_HOST_VARIABLES,
  EMBED_OBSERVED_ATTRIBUTES,
  EMBED_TAG,
  EmbedAttributeError,
  adoptPropertiesSetEarly,
  embedLookOf,
  inlineHeightOf,
  languageOf,
  resumeOf,
  runnable,
  type EmbedAttribute,
  type EmbedInputs,
  type EmbedLook,
} from './embedConfig';
import { embedShadowCss } from './embedTheme';
import { DEFAULT_API, readVisitorApp } from './visitorApp';

export { runnable };

/** What the framed run page and the element say to each other. */
export const EMBED_MESSAGES = {
  size: 'datalayer-app:size',
  decision: 'datalayer-app:decision',
  /** To the frame: an embed token, the first or a new one. */
  token: 'datalayer-app:token',
  /** From the frame: the token lapsed; a new one is needed. */
  tokenExpired: 'datalayer-app:token-expired',
} as const;

/** Where an application comes from, once read. */
export type EmbedSource =
  /** An Appspec to draw; with `visitors`, run as a visitor without an account on the visitors' runtime (D-07). */
  | { kind: 'spec'; app: AppSpec; visitors?: DatalayerVisitors }
  | { kind: 'frame'; src: string }
  | { kind: 'said'; text: string; expired?: boolean };

/** An Appspec from its text, YAML or JSON; refused in a sentence when it is neither. */
export function appspecOfText(text: string): AppSpec {
  // Written in a page, a document is indented with its markup: the
  // indentation every line shares is the page's, not the document's.
  const lines = text.replace(/\t/g, '  ').split('\n');
  const indent = Math.min(
    ...lines
      .filter(line => line.trim())
      .map(line => line.length - line.trimStart().length),
  );
  const trimmed = lines
    .map(line => line.slice(Number.isFinite(indent) ? indent : 0))
    .join('\n')
    .trim();
  if (!trimmed) {
    throw new EmbedAttributeError('datalayer-app: the Appspec is empty.');
  }
  let parsed: ParsedAppspec;
  if (trimmed.startsWith('{')) {
    let document: unknown;
    try {
      document = JSON.parse(trimmed);
    } catch (error) {
      throw new EmbedAttributeError(
        `datalayer-app: the Appspec is not JSON (${(error as Error).message}).`,
      );
    }
    parsed = parseAppspec(document);
  } else {
    parsed = readAppspecYaml(trimmed);
  }
  return runnable(parsed);
}

/** The run page an application on Datalayer is framed from. */
export function frameSrcOf(origin: string, app: string, token = ''): string {
  // The token in the fragment, which no server is sent: it reaches the page
  // and no access log.
  return `${origin.replace(/\/+$/, '')}/public/apps/${encodeURIComponent(app)}/run?embed=1${
    token ? `#token=${encodeURIComponent(token)}` : ''
  }`;
}

/**
 * A framed run page told the visitor's language (P-26): `language=` in its
 * query, before the fragment that holds the token.
 */
export function frameInLanguage(src: string, language?: string): string {
  if (!language) {
    return src;
  }
  const at = src.indexOf('#');
  const [page, fragment] =
    at < 0 ? [src, ''] : [src.slice(0, at), src.slice(at)];
  return `${page}${page.includes('?') ? '&' : '?'}language=${encodeURIComponent(language)}${fragment}`;
}

/**
 * An application on Datalayer, read with its embed token: what the space
 * keeps of it (`model_s`, the stored definition), whose `spec` is the
 * Appspec. A decision is framed; so is an application that has no spec.
 */
export async function readEmbeddedApp({
  api,
  origin,
  app,
  token,
  fetcher = fetch,
}: {
  api: string;
  origin: string;
  app: string;
  token: string;
  fetcher?: typeof fetch;
}): Promise<EmbedSource> {
  const response = await fetcher(
    `${api.replace(/\/+$/, '')}/api/spacer/v1/apps/${encodeURIComponent(app)}/embedded`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 401) {
    return {
      kind: 'said',
      text: 'datalayer-app: the embed token expired or is not for this application.',
      expired: true,
    };
  }
  if (!response.ok) {
    return {
      kind: 'said',
      text: `datalayer-app: the application could not be read (${response.status}).`,
    };
  }
  const body = (await response.json()) as { app?: { model_s?: unknown } };
  let definition: { spec?: unknown };
  try {
    definition = JSON.parse(String(body.app?.model_s ?? '{}')) as {
      spec?: unknown;
    };
  } catch {
    definition = {};
  }
  if (!definition.spec) {
    return { kind: 'frame', src: frameSrcOf(origin, app, token) };
  }
  const spec = runnable(parseAppspec(definition.spec));
  return spec.kind === 'decision'
    ? { kind: 'frame', src: frameSrcOf(origin, app, token) }
    : { kind: 'spec', app: spec };
}

export type DatalayerAppElementOptions = {
  /** The element's name; `datalayer-app` by default. */
  tag?: string;
  /** Where the script was loaded from: the default origin, and where its stylesheet is. */
  scriptUrl?: string;
};

/** The script that is running, when it is a script tag. */
function currentScriptUrl(): string {
  try {
    const script = document.currentScript as HTMLScriptElement | null;
    return script?.src ? new URL(script.src, location.href).href : '';
  } catch {
    return '';
  }
}

/**
 * Define the element, once. Returns its class, or `undefined` where there is
 * no `customElements` (a server render) — a second call returns the class
 * already defined.
 */
export function defineDatalayerAppElement(
  options: DatalayerAppElementOptions = {},
): CustomElementConstructor | undefined {
  if (typeof window === 'undefined' || !('customElements' in window)) {
    return undefined;
  }
  const tag = options.tag ?? EMBED_TAG;
  const existing = customElements.get(tag);
  if (existing) {
    return existing;
  }
  const scriptUrl = options.scriptUrl ?? currentScriptUrl();
  const scriptOrigin = scriptUrl ? new URL(scriptUrl).origin : '';
  // The bundle's stylesheet, beside its script.
  const stylesheetUrl = scriptUrl
    ? scriptUrl.replace(/\.js(\?.*)?$/, '.css')
    : '';

  class DatalayerAppElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return EMBED_OBSERVED_ATTRIBUTES;
    }

    private root: Root | null = null;
    private frame: HTMLIFrameElement | null = null;
    private source: EmbedSource | null = null;
    private loading = 0;
    private passed: Record<string, unknown> = {};
    /** One object, its functions replaced in place: the host below holds it. */
    private readonly offered: Record<string, HostFunction> = {};
    /** How a window message reaches the application's session, once it can (P-25). */
    private windowPort: WindowPost | null = null;
    /** What the page gives the application, read at each call (D-10). */
    private readonly host: AppEmbedHost = {
      context: () => this.passed,
      // Read as each run is sent (D-21): a renewed one goes with the next.
      userToken: () => this.getAttribute('user-token') || undefined,
      functions: this.offered,
      onWindowPort: post => {
        this.windowPort = post;
      },
      onEvent: event =>
        this.dispatchEvent(
          new CustomEvent(event.type, {
            detail: event.detail,
            bubbles: true,
            composed: true,
          }),
        ),
    };

    /** The values the page passes: `user`, `page`, its own (D-10). */
    get context(): Record<string, unknown> {
      return this.passed;
    }

    set context(value: Record<string, unknown>) {
      this.passed = { ...(value ?? {}) };
    }

    /**
     * Post a window message to the application (LOOP P-25): its code's
     * `@app.window` reads it, and what it answers is raised as
     * `window-message` events. Refused, in a sentence, before its
     * conversation has started or off the host's own server.
     */
    postWindowMessage(data: unknown): Promise<void> {
      const post = this.windowPort;
      return post
        ? post(data)
        : Promise.reject(new Error(`datalayer-app: ${WINDOW_NOT_YET}`));
    }

    /** The page's functions the application may call, by name (D-10). */
    get functions(): Record<string, HostFunction> {
      return this.offered;
    }

    set functions(value: Record<string, HostFunction>) {
      for (const name of Object.keys(this.offered)) {
        delete this.offered[name];
      }
      Object.assign(this.offered, value ?? {});
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.onMessage = this.onMessage.bind(this);
      // What the page set before the element was defined (D-10).
      adoptPropertiesSetEarly(this);
    }

    /** An embed token, the attribute's. Set it to hand a new one over. */
    get token(): string {
      return this.getAttribute('token') ?? '';
    }

    set token(value: string) {
      if (value) {
        this.setAttribute('token', String(value));
      } else {
        this.removeAttribute('token');
      }
    }

    /**
     * The token the host's server signed naming its user (LOOP D-21), the
     * `user-token` attribute's: what an application that says `user: signed`
     * opens its session with. Set it to hand a new one over.
     */
    get userToken(): string {
      return this.getAttribute('user-token') ?? '';
    }

    set userToken(value: string) {
      if (value) {
        this.setAttribute('user-token', String(value));
      } else {
        this.removeAttribute('user-token');
      }
    }

    connectedCallback(): void {
      window.addEventListener('message', this.onMessage);
      void this.load();
    }

    disconnectedCallback(): void {
      window.removeEventListener('message', this.onMessage);
      this.unmount();
    }

    attributeChangedCallback(
      name: string,
      before: string | null,
      after: string | null,
    ): void {
      if (!this.isConnected || before === after) {
        return;
      }
      // The user's signed token is read as each run is sent (D-21): nothing
      // is drawn again for a new one.
      if (name === 'user-token') {
        return;
      }
      // A new token is handed to the framed page that is already there,
      // which keeps what the person entered.
      if (name === 'token' && this.frame?.contentWindow && after) {
        this.frame.contentWindow.postMessage(
          { type: EMBED_MESSAGES.token, token: after },
          this.origin(),
        );
        return;
      }
      // How it looks is drawn again; what it is, read again.
      if (
        [
          'mode',
          'accent',
          'theme',
          'font',
          'height',
          'resume',
          'language',
        ].includes(name)
      ) {
        this.draw();
        return;
      }
      void this.load();
    }

    private origin(): string {
      return (
        this.getAttribute('origin') ||
        scriptOrigin ||
        location.origin
      ).replace(/\/+$/, '');
    }

    private inputs(): EmbedInputs {
      const attributes: EmbedInputs['attributes'] = {};
      for (const name of EMBED_OBSERVED_ATTRIBUTES) {
        attributes[name as EmbedAttribute] = this.getAttribute(name);
      }
      const computed = getComputedStyle(this);
      const variables: EmbedInputs['variables'] = {};
      for (const [key, property] of Object.entries(EMBED_HOST_VARIABLES)) {
        const value = computed.getPropertyValue(property).trim();
        if (value) {
          variables[key as keyof typeof EMBED_HOST_VARIABLES] = value.replace(
            /^["']|["']$/g,
            '',
          );
        }
      }
      return { attributes, variables };
    }

    /** Where the application comes from: the element's own Appspec, an address, or Datalayer. */
    private async read(): Promise<EmbedSource> {
      const inline = this.querySelector(
        'script[type="application/yaml"], script[type="application/json"], script[type="text/yaml"]',
      );
      if (inline?.textContent?.trim()) {
        return { kind: 'spec', app: appspecOfText(inline.textContent) };
      }
      const spec = this.getAttribute('spec');
      if (spec) {
        const response = await fetch(new URL(spec, location.href).href);
        if (!response.ok) {
          return {
            kind: 'said',
            text: `datalayer-app: the Appspec at ${spec} could not be read (${response.status}).`,
          };
        }
        return { kind: 'spec', app: appspecOfText(await response.text()) };
      }
      const app = this.getAttribute('app');
      if (!app) {
        return {
          kind: 'said',
          text: 'datalayer-app: the "app" attribute names the application to show, or "spec" the address of its Appspec.',
        };
      }
      const token = this.token;
      if (!token) {
        // A public application, as a visitor without an account (D-07):
        // an example kept warm or an address open to visitors, run on the
        // visitors' runtime; a decision framed; a refusal said.
        const visitor = await readVisitorApp({ api: this.api(), app });
        if (visitor.kind === 'decision') {
          return { kind: 'frame', src: frameSrcOf(this.origin(), visitor.app) };
        }
        if (visitor.kind === 'said') {
          return { kind: 'said', text: visitor.text };
        }
        return { kind: 'spec', app: visitor.app, visitors: visitor.visitors };
      }
      return readEmbeddedApp({
        api: this.api(),
        origin: this.origin(),
        app,
        token,
      });
    }

    /** Datalayer's services: the `api` attribute, else the platform's, else prod1's. */
    private api(): string {
      return (
        this.getAttribute('api') ||
        coreStore.getState().configuration?.spacerUrl ||
        DEFAULT_API
      ).replace(/\/+$/, '');
    }

    private async load(): Promise<void> {
      const turn = ++this.loading;
      let source: EmbedSource;
      try {
        source = await this.read();
      } catch (error) {
        source = {
          kind: 'said',
          text:
            error instanceof Error
              ? error.message
              : `datalayer-app: ${String(error)}`,
        };
      }
      // A later read wins over an earlier one still in flight.
      if (turn !== this.loading || !this.isConnected) {
        return;
      }
      this.source = source;
      this.draw();
      if (source.kind === 'said' && source.expired) {
        this.dispatchEvent(
          new CustomEvent('token-expired', {
            detail: { app: this.getAttribute('app') ?? '' },
            bubbles: true,
            composed: true,
          }),
        );
      }
    }

    private unmount(): void {
      this.root?.unmount();
      this.root = null;
      this.frame = null;
    }

    /** The shadow root's skeleton: the bundle's stylesheet, the element's own, and what goes in it. */
    private skeleton(themeCss?: string): ShadowRoot {
      const shadow = this.shadowRoot as ShadowRoot;
      this.unmount();
      shadow.replaceChildren();
      if (stylesheetUrl) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = stylesheetUrl;
        shadow.appendChild(link);
      }
      const style = document.createElement('style');
      style.textContent = embedShadowCss(themeCss);
      shadow.appendChild(style);
      return shadow;
    }

    private say(text: string): void {
      this.setAttribute('data-embed-mode', 'inline');
      const shadow = this.skeleton();
      const note = document.createElement('p');
      note.className = 'datalayer-app-said';
      note.setAttribute('role', 'status');
      note.textContent = text;
      shadow.appendChild(note);
    }

    private draw(): void {
      const source = this.source;
      if (!source) {
        return;
      }
      if (source.kind === 'said') {
        this.say(source.text);
        return;
      }
      if (source.kind === 'frame') {
        let framedLanguage: string | undefined;
        try {
          framedLanguage = languageOf(this.getAttribute('language'));
        } catch (error) {
          this.say((error as Error).message);
          return;
        }
        this.setAttribute('data-embed-mode', 'inline');
        const shadow = this.skeleton();
        const frame = document.createElement('iframe');
        frame.className = 'datalayer-app-frame';
        frame.src = frameInLanguage(source.src, framedLanguage);
        frame.title = 'Datalayer app';
        frame.style.height = `${inlineHeightOf(this.getAttribute('height'))}px`;
        frame.setAttribute('allow', 'clipboard-write');
        shadow.appendChild(frame);
        this.frame = frame;
        return;
      }
      let look: EmbedLook;
      let resume: boolean;
      let language: string | undefined;
      try {
        look = embedLookOf(this.inputs(), source.app);
        resume = resumeOf(this.getAttribute('resume'));
        language = languageOf(this.getAttribute('language'));
      } catch (error) {
        this.say((error as Error).message);
        return;
      }
      // A character nothing contributes is said in place, as an attribute
      // that is not one is (D-07, T-24).
      if (look.mode === 'assistant') {
        const chosen = embedAssistantCharacter(source.app);
        if ('problem' in chosen) {
          this.say(chosen.problem);
          return;
        }
      }
      this.setAttribute('data-embed-mode', look.mode);
      // The theme's own stylesheet: `loop`'s, or the one the application
      // names (T-30).
      const shadow = this.skeleton(
        getThemeConfig(look.variant).themeStyles.css,
      );
      const mount = document.createElement('div');
      mount.className = 'datalayer-app-root';
      shadow.appendChild(mount);
      this.root = createRoot(mount);
      const server = this.getAttribute('server') || undefined;
      this.root.render(
        <StyleSheetManager target={shadow as unknown as HTMLElement}>
          <AppEmbed
            app={source.app}
            mode={look.mode}
            accent={look.accent}
            colorMode={look.colorMode}
            font={look.font}
            serverUrl={server}
            // The visit's embed token goes with the conversation to the
            // host's server, which runs the application's deployment (R-20).
            {...(server && this.token ? { embedToken: this.token } : {})}
            // A public application for a visitor without an account: on the
            // visitors' runtime, with a visitor's token (D-07, R-30).
            {...(source.visitors ? { visitors: source.visitors } : {})}
            height={inlineHeightOf(this.getAttribute('height'))}
            ownPortal
            host={this.host}
            // The visit's session kept in the page's storage, and picked
            // up again after a reload, unless the host says not (D-13).
            resume={resume}
            // The visitor's language, when the host says it (P-26).
            {...(language ? { language } : {})}
          />
        </StyleSheetManager>,
      );
    }

    private onMessage(event: MessageEvent): void {
      if (!this.frame || event.source !== this.frame.contentWindow) {
        return;
      }
      if (event.origin !== this.origin()) {
        return;
      }
      const data = (event.data ?? {}) as {
        type?: string;
        height?: unknown;
        record?: unknown;
      };
      if (
        data.type === EMBED_MESSAGES.size &&
        typeof data.height === 'number' &&
        data.height > 0
      ) {
        this.frame.style.height = `${Math.ceil(data.height)}px`;
      } else if (data.type === EMBED_MESSAGES.decision) {
        this.dispatchEvent(
          new CustomEvent('decision', {
            detail: data.record,
            bubbles: true,
            composed: true,
          }),
        );
      } else if (data.type === EMBED_MESSAGES.tokenExpired) {
        this.dispatchEvent(
          new CustomEvent('token-expired', {
            detail: { app: this.getAttribute('app') ?? '' },
            bubbles: true,
            composed: true,
          }),
        );
      }
    }
  }

  customElements.define(tag, DatalayerAppElement);
  return DatalayerAppElement;
}
