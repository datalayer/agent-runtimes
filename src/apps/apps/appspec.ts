/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Appspec as a file, and as the application an editor holds.
 *
 * An application is kept as a YAML or JSON document in the spec's own words —
 * `applies_to`, `ready_at`, `keep_for` — with nothing written that is at its
 * default. An editor works on the whole of it: an {@link AppSpec} with every
 * field present, in TypeScript's spelling.
 *
 * {@link parseAppspec} reads the first into the second, and
 * {@link dumpAppspec} writes it back: the same application always writes the
 * same document, keys in one fixed order — the spec's own where it declares
 * them, alphabetical where it does not (a scenario's weights, a component of
 * a surface) — so that a difference between two versions shows what changed
 * and nothing else. Reading what was written
 * gives the application back, and writing what was read gives the document
 * back — which is what lets three editors work on one file.
 *
 * Reading is tolerant, because a draft is not yet an application: what is
 * missing takes its default, and what is wrong is reported beside the result
 * rather than thrown. Whether the application can be used is decided by the
 * spec's own validation, not here.
 *
 * Pure: nothing here calls a service or renders.
 *
 * @module apps/apps/appspec
 */

import type {
  AppAccent,
  AppThemeMode,
  AppThemeVariant,
  AppAvatar,
  AppAvatarId,
  AppAvatarModel3D,
  AppEmbedMode,
  AppHostUser,
  AppActionSpec,
  AppCommandSpec,
  AppConnectionSpec,
  AppPapAlternativeSpec,
  AppPapCompanyScopeSpec,
  AppPapExcludedTaskSpec,
  AppPapSpec,
  PapProfile,
  AppPactSpec,
  AppCommerceSpec,
  AppPairSpec,
  AppSignedFetchSpec,
  AppA2ASpec,
  AppCriterionSpec,
  AppCustomComponentSpec,
  AppDecisionSpec,
  AppSamplesSpec,
  AppDeploymentSpec,
  AppInterfaceSpec,
  AppVoiceSpec,
  AppKind,
  AppLayout,
  AppModeOptionSpec,
  AppModeSpec,
  AppPageOutputComponent,
  AppPageSpec,
  AppProfileSpec,
  AppRuleSpec,
  AppStarterSpec,
  AppTestTurnSpec,
  AppTranslationSpec,
  AppFormSchema,
  AppSpec,
  AppSurfaceSpec,
  AppToolSpec,
  AppTriggerSpec,
  AppUploadsSpec,
  UiChoice,
} from '../../types/agentspecs';
import { BEHAVIOURS } from './rules';
import { PROTOCOL_CATALOGUE } from '../../specs/protocols';
import { UI_CATALOGUE } from '../../specs/ui';
import { UI_RENDERER_CATALOGUE } from '../../specs/uiRenderers';
import { DEFAULT_MAX_FILES, DEFAULT_UPLOAD_MB } from './uploads';

/** The version of the spec itself. */
export const APP_SCHEMA = 'loop.app/v1';

/** The language an application's own words are in, unless it says. */
export const DEFAULT_LANGUAGE = 'en';

/** The face of an application that has not chosen one. */
export const DEFAULT_EMOJI = '\u{1F440}';

export const APP_KINDS: AppKind[] = ['chat', 'widget', 'decision', 'worker'];

export const APP_ACCENTS: AppAccent[] = [
  'green',
  'rose',
  'sky',
  'lime',
  'sun',
  'violet',
];

/**
 * The themes an application may run in: Appearance's, as
 * primer-addons lists them (`themeVariants`), in its order.
 */
export const APP_THEME_VARIANTS: AppThemeVariant[] = [
  'datalayer',
  'spatial',
  'lovely',
  'matrix',
  'earth',
  'sand',
  'ivory',
  'sun',
  'loop',
  'vscode',
];

/** The colour modes a theme is worn in. */
export const APP_THEME_MODES: AppThemeMode[] = ['light', 'dark', 'auto'];

/** The four ways an application sits in another product's page. */
export const APP_EMBED_MODES: AppEmbedMode[] = [
  'inline',
  'bubble',
  'panel',
  'assistant',
];

/**
 * How an Appspec names the avatar of its floating assistant: the
 * id a plugin contributes it under, `paperclip` or `acme-owl` — as
 * agentspecs' `ASSISTANT_AVATAR_ID`. Which ids exist is what the enabled
 * plugins contribute (`assistantCharacterNamed`), not the spec's to say.
 */
export const APP_ASSISTANT_AVATAR_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Whether a value is shaped as an avatar id an Appspec may name. */
export function isAvatarId(value: unknown): value is AppAvatarId {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    APP_ASSISTANT_AVATAR_ID.test(value)
  );
}

/**
 * The 3D model an avatar of kind `model3d` shows when it names no `url`
 * (agentspecs' `DEFAULT_AVATAR_MODEL_URL`): RobotExpressive, by Tomás
 * Laulhé (Quaternius), CC0 1.0, with Don McCurdy's facial morph targets,
 * from the three.js repository at r170, served by jsDelivr.
 */
export const DEFAULT_AVATAR_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

/** What a 3D avatar's `url` may be: an https address of a glTF model. */
export const AVATAR_MODEL_URL = /^https:\/\/\S+\.(?:glb|gltf)(?:[?#]\S*)?$/;

/** Whether a value is a 3D avatar as an Appspec says it. */
export function isAvatarModel3D(value: unknown): value is AppAvatarModel3D {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const { kind, url, ...rest } = value as Record<string, unknown>;
  return (
    kind === 'model3d' &&
    Object.keys(rest).length === 0 &&
    (url === undefined ||
      url === '' ||
      (typeof url === 'string' && AVATAR_MODEL_URL.test(url)))
  );
}

/** Whether a value is an avatar an Appspec may name: an id, or a 3D model. */
export function isAvatar(value: unknown): value is AppAvatar {
  return isAvatarId(value) || isAvatarModel3D(value);
}

/** The address of the model a 3D avatar shows: its own, else the default. */
export const avatarModelUrl = (avatar: AppAvatarModel3D): string =>
  avatar.url || DEFAULT_AVATAR_MODEL_URL;

const ACTION_CLASS_NAMES = [
  'read',
  'write',
  'send',
  'buy',
  'delete',
  'publish',
];

/** The layout a kind starts with. */
export const DEFAULT_LAYOUTS: Record<AppKind, AppLayout> = {
  chat: 'chat',
  widget: 'page',
  decision: 'page',
  worker: 'split',
};

/** The media type of an answer drawn as A2UI surfaces. */
export const A2UI_OUTPUT = 'application/json+a2ui';

/** What `uiFor` reads of an application besides its kind. */
export interface AppUiFacts {
  /** Its layout; its kind's own when unsaid. */
  layout?: AppLayout;
  /** The media types it answers in. */
  outputs?: readonly string[];
  /** It signs people in at companies (`pap.connections`). */
  signsIn?: boolean;
  /** It has components of its own (`interface.customComponents`). */
  ownComponents?: boolean;
}

/**
 * The UI plugins an application is drawn with (R8), as its `ui`
 * lists them: what `appPreset` mounts for it. A decision: its page alone,
 * drawn by its host. Every other kind: the conversation — `chat`, which
 * stands for the conversation base the runtime mounts — then the A2UI
 * surfaces when it answers in `application/json+a2ui`, the sign-in card when
 * it signs people in at companies, its page, its layout and the Canvas's
 * blocks when its layout is not `chat`, and its own components when it has
 * some. What a host adds (the Preview's sidebar, a frame) is not the
 * application's.
 *
 * agentspecs' `ui_for` is the same function: both are held to
 * `agent_runtimes/tests/fixtures/app_ui.json`.
 */
export function uiFor(kind: AppKind, facts: AppUiFacts = {}): UiChoice[] {
  if (kind === 'decision') {
    return [{ plugin: 'app-page' }];
  }
  const drawn: UiChoice[] = [{ plugin: 'chat' }];
  if (facts.outputs?.includes(A2UI_OUTPUT)) {
    drawn.push({ plugin: 'a2ui-surface', renderer: 'a2ui' });
  }
  if (facts.signsIn) {
    drawn.push({ plugin: 'pap-sign-in' });
  }
  if ((facts.layout ?? DEFAULT_LAYOUTS[kind]) !== 'chat') {
    drawn.push(
      { plugin: 'page-layout' },
      { plugin: 'app-page' },
      { plugin: 'canvas-blocks' },
    );
  }
  if (facts.ownComponents) {
    drawn.push({ plugin: 'app-components' });
  }
  return drawn;
}

/** The UI plugins an application is drawn with, by what its spec says (`uiFor`). */
export function uiOf(
  app: Pick<AppSpec, 'kind' | 'interface' | 'pap'>,
): UiChoice[] {
  return uiFor(app.kind, {
    layout: app.interface.layout,
    outputs: app.interface.outputs,
    signsIn: Boolean(app.pap?.connections.length),
    ownComponents: Boolean(app.interface.customComponents?.length),
  });
}

/** What an application keeps of what it did, when it does not say. */
export const DEFAULT_RECORD_INCLUDE = ['conversations', 'actions', 'approvals'];

const DEFAULT_KEEP_FOR = '1_years';
const DEFAULT_READY_AT = 0.8;
const DEFAULT_PROTOCOL = 'a2ui/v0.9';
const DEFAULT_ICON = 'apps';
const DEFAULT_VERSION = '0.0.1';

type Data = Record<string, unknown>;

/** A host function's arguments when it names none: an empty object. */
const NO_HOST_PARAMETERS = { type: 'object', properties: {} };

const isData = (value: unknown): value is Data =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown, otherwise = ''): string =>
  typeof value === 'string' ? value : otherwise;

const flag = (value: unknown, otherwise: boolean): boolean =>
  typeof value === 'boolean' ? value : otherwise;

const numberOf = (value: unknown, otherwise: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : otherwise;

const texts = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const records = (value: unknown): Data[] =>
  Array.isArray(value) ? value.filter(isData) : [];

/**
 * An application's UI plugins as its document says them (R8):
 * `{plugin, renderer}` each. Anything else — a bare id, the old shape — is
 * not read as a plugin: `parseAppspec` refuses it (`uiShapeProblems`).
 */
const uiChoices = (value: unknown): UiChoice[] =>
  Array.isArray(value)
    ? value.filter(isData).map(item => ({
        plugin: text(item.plugin),
        ...(text(item.renderer) ? { renderer: text(item.renderer) } : {}),
      }))
    : [];

/**
 * An entry of `ui` that is not `{plugin, renderer}`, in agentspecs' sentence
 * (`ui_choices_problems`): a bare id is refused, never read as the plugin it
 * names, and one naming a renderer says how to write it.
 */
const uiShapeProblems = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter(item => !isData(item))
        .map(
          item =>
            `\`ui\` lists UI plugins, each as \`{plugin, renderer}\`: ${JSON.stringify(item)} is not one` +
            (typeof item === 'string' && UI_RENDERER_CATALOGUE[item]
              ? ` (${JSON.stringify(item)} is a UI renderer: name the plugin it renders, and say it as its \`renderer\`).`
              : '.'),
        )
    : [];

/**
 * One turn of a test's conversation as its document says it:
 * what it says, chooses or presses, with a press's payload; nothing it does
 * not say.
 */
function parseTestTurn(turn: Data): AppTestTurnSpec {
  return {
    ...(text(turn.say) ? { say: text(turn.say) } : {}),
    ...(text(turn.choose) ? { choose: text(turn.choose) } : {}),
    ...(text(turn.press) ? { press: text(turn.press) } : {}),
    ...(isData(turn.payload) && Object.keys(turn.payload).length
      ? { payload: { ...turn.payload } }
      : {}),
  };
}

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  otherwise: T,
): T => (allowed.includes(value as T) ? (value as T) : otherwise);

const RETENTION = /^([1-9]\d*)_(day|days|month|months|year|years)$/;
const DAYS: Record<string, number> = { day: 1, month: 30, year: 365 };

/** A retention as days: `90_days`, `18_months`, `1_years`; 0 when it cannot be read. */
export function retentionDays(keepFor: string): number {
  const matched = RETENTION.exec(keepFor.trim());
  return matched ? Number(matched[1]) * DAYS[matched[2].replace(/s$/, '')] : 0;
}

/** An application with nothing said: what *Start blank* opens. */
export function emptyAppspec(kind: AppKind = 'chat'): AppSpec {
  return {
    schema: APP_SCHEMA,
    id: '',
    version: DEFAULT_VERSION,
    name: '',
    kind,
    description: '',
    owner: '',
    agent: '',
    team: '',
    instructions: '',
    model: '',
    skills: [],
    backendTools: [],
    context: [],
    contents: [],
    connections: [],
    protocols: [],
    // A blank application starts with its kind's UI plugins (R8).
    ui: uiFor(kind),
    rules: [],
    permissions: {
      spaces: [],
      computer: { browse: false, files: false, shell: false },
    },
    interface: {
      layout: DEFAULT_LAYOUTS[kind],
      welcome: '',
      starters: [],
      commands: [],
      modes: [],
      actions: [],
      profiles: [],
      language: DEFAULT_LANGUAGE,
      translations: {},
      components: [],
      outputs: [],
    },
    tests: {
      readyAt: DEFAULT_READY_AT,
      evalset: '',
      cases: [],
      verified: { live: [], recorded: [], unverified: [] },
    },
    record: {
      keepFor: DEFAULT_KEEP_FOR,
      retentionDays: retentionDays(DEFAULT_KEEP_FOR),
      include: [...DEFAULT_RECORD_INCLUDE],
      suggestTests: false,
    },
    checks: { guards: [], gates: [], track: '' },
    deployment: {},
    goal: '',
    triggers: [],
    memory: '',
    notifications: [],
    samples: { documents: [], alternatives: [] },
    setup: [],
    enabled: true,
    unavailable_because: '',
    tags: [],
    icon: DEFAULT_ICON,
    emoji: DEFAULT_EMOJI,
    avatar: '',
    banner: '',
  };
}

// --- reading --------------------------------------------------------------------------

const KNOWN_KEYS = [
  'schema',
  'id',
  'version',
  'name',
  'kind',
  'description',
  'owner',
  'agent',
  'team',
  'instructions',
  'model',
  'skills',
  'backend_tools',
  'tools',
  'context',
  'contents',
  'connections',
  'protocols',
  'ui',
  'pap',
  'pact',
  'commerce',
  'signed_fetch',
  'pair',
  'a2a',
  'rules',
  'permissions',
  'interface',
  'tests',
  'record',
  'checks',
  'deployment',
  'goal',
  'triggers',
  'memory',
  'notifications',
  'decision',
  'samples',
  'enabled',
  'unavailable_because',
  'tags',
  'icon',
  'emoji',
  'avatar',
  'banner',
] as const;

/** Where a check of its code runs. */
const CHECK_STAGES = ['answer', 'tool_call'] as const;

/** A tool of its own, written in its code; a wrong one is said by the checks. */
function parseTool(data: Data): AppToolSpec {
  return {
    name: text(data.name),
    description: text(data.description),
    parameters: isData(data.parameters)
      ? data.parameters
      : { ...NO_HOST_PARAMETERS },
    does: texts(data.does),
  };
}

function parseConnection(data: Data): AppConnectionSpec {
  return {
    server: text(data.server),
    access: oneOf(data.access, ['read', 'write'] as const, 'read'),
    as: oneOf(data.as, ['owner', 'user'] as const, 'owner'),
    only: texts(data.only),
  };
}

/** The Personal Agent Protocol profiles Datalayer speaks, as agentspecs' `PAP_PROFILES`. */
export const PAP_PROFILES: readonly PapProfile[] = ['draft-01'];

/** The profile a `pap` block is written for when the Studio or a builder starts one. */
export const PAP_PROFILE: PapProfile = PAP_PROFILES[PAP_PROFILES.length - 1];

/**
 * What is wrong with a `pap` block's profile, in agentspecs' sentence
 * (`pap_profile_problem`); `undefined` when it is one Datalayer speaks.
 */
export function papProfileProblem(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return `Its \`pap\` block names no Personal Agent Protocol profile: add \`profile: ${PAP_PROFILE}\`.`;
  }
  if (!PAP_PROFILES.includes(value as PapProfile)) {
    return `This application asks for Personal Agent Protocol profile “${String(value)}”; Datalayer speaks ${PAP_PROFILES.join(' or ')}.`;
  }
  return undefined;
}

const PAP_INTERFACES = ['agent', 'openapi', 'mcp', 'web'] as const;
const PAP_SIGN_IN = ['direct', 'device', 'mediated'] as const;
const PAP_DEFAULT_INTERFACES = ['agent'] as const;
const PAP_DEFAULT_SIGN_IN = ['direct', 'device'] as const;

/** The values of a list that are one of `allowed`, or `otherwise` when it says none. */
const enumsOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  otherwise: readonly T[],
): T[] => {
  if (!Array.isArray(value)) return [...otherwise];
  return value.filter((item): item is T => allowed.includes(item as T));
};

/**
 * Personal Agent Protocol: the companies the
 * application works with, and whether it is one. Defaults are agentspecs'.
 */
function parsePap(data: Data): AppPapSpec {
  const company = isData(data.company) ? data.company : {};
  return {
    profile: data.profile as PapProfile,
    connections: records(data.connections).map(connection => ({
      id: text(connection.id),
      company: text(connection.company),
      access: oneOf(connection.access, ['read', 'write'] as const, 'read'),
      as: oneOf(connection.as, ['owner', 'user'] as const, 'user'),
      scopes: texts(connection.scopes),
      interfaces: enumsOf(
        connection.interfaces,
        PAP_INTERFACES,
        PAP_DEFAULT_INTERFACES,
      ),
      signIn: enumsOf(connection.sign_in, PAP_SIGN_IN, PAP_DEFAULT_SIGN_IN),
      extensions: texts(connection.extensions),
    })),
    company: {
      enabled: flag(company.enabled, false),
      signedOut: flag(company.signed_out, true),
      interfaces: enumsOf(
        company.interfaces,
        PAP_INTERFACES,
        PAP_DEFAULT_INTERFACES,
      ),
      scopes: records(company.scopes).map(parsePapCompanyScope),
      excludedTasks: records(company.excluded_tasks).map(task => ({
        task: text(task.task),
        ...(isData(task.alternative)
          ? { alternative: parsePapAlternative(task.alternative) }
          : {}),
      })),
      extensions: texts(company.extensions),
      personalAgents: oneOf(
        company.personal_agents,
        ['any', 'registered'] as const,
        'any',
      ),
      registeredAgents: texts(company.registered_agents),
      operations: records(company.operations).map(operation => ({
        action: text(operation.action),
        tool: text(operation.tool),
        summary: text(operation.summary),
      })),
    },
  };
}

const PAP_SCOPE_CHANGES = ['none', 'reversible', 'irreversible'] as const;
const PAP_REFERENCE_TYPES = ['openapi', 'mcp', 'web'] as const;

/** A scope a company offers (PAP draft 0.3 §4.4), as agentspecs reads it. */
function parsePapCompanyScope(data: Data): AppPapCompanyScopeSpec {
  const changes = PAP_SCOPE_CHANGES.find(value => value === data.changes);
  return {
    name: text(data.name),
    description: text(data.description),
    ...(changes ? { changes } : {}),
    ...(typeof data.personal_data === 'boolean'
      ? { personalData: data.personal_data }
      : {}),
  };
}

/** Another way to do an excluded task (PAP draft 0.3 §8.2), as agentspecs reads it. */
function parsePapAlternative(data: Data): AppPapAlternativeSpec {
  return {
    ...(typeof data.instructions === 'string'
      ? { instructions: data.instructions }
      : {}),
    references: records(data.references).map(reference => ({
      type: oneOf(reference.type, PAP_REFERENCE_TYPES, 'web'),
      url: text(reference.url),
      ...(typeof reference.operation_id === 'string'
        ? { operationId: reference.operation_id }
        : {}),
      ...(typeof reference.tool === 'string' ? { tool: reference.tool } : {}),
    })),
  };
}

/** A company scope as its document says it. */
function dumpPapCompanyScope(scope: AppPapCompanyScopeSpec): Data {
  return {
    name: scope.name,
    description: scope.description,
    ...(scope.changes !== undefined ? { changes: scope.changes } : {}),
    ...(scope.personalData !== undefined
      ? { personal_data: scope.personalData }
      : {}),
  };
}

/** An excluded task as its document says it. */
function dumpPapExcludedTask(task: AppPapExcludedTaskSpec): Data {
  const alternative = task.alternative;
  return {
    task: task.task,
    ...(alternative
      ? {
          alternative: {
            ...(alternative.instructions !== undefined
              ? { instructions: alternative.instructions }
              : {}),
            ...(alternative.references.length
              ? {
                  references: alternative.references.map(reference => ({
                    type: reference.type,
                    url: reference.url,
                    ...(reference.operationId !== undefined
                      ? { operation_id: reference.operationId }
                      : {}),
                    ...(reference.tool !== undefined
                      ? { tool: reference.tool }
                      : {}),
                  })),
                }
              : {}),
          },
        }
      : {}),
  };
}

/** Personal Agent Protocol as its document says it, nothing at its default. */
function dumpPap(pap: AppPapSpec | undefined): Data {
  if (!pap) return {};
  return new Writer()
    .text('profile', pap.profile, '\u0000')
    .list(
      'connections',
      pap.connections.map(
        connection =>
          new Writer()
            .text('id', connection.id, '\u0000')
            .text('company', connection.company, '\u0000')
            .value<string>('access', connection.access, 'read')
            .value<string>('as', connection.as, 'user')
            .list('scopes', connection.scopes)
            .list('interfaces', connection.interfaces, [
              ...PAP_DEFAULT_INTERFACES,
            ])
            .list('sign_in', connection.signIn, [...PAP_DEFAULT_SIGN_IN])
            .list('extensions', connection.extensions).data,
      ),
    )
    .part(
      'company',
      new Writer()
        .value('enabled', pap.company.enabled, false)
        .value('signed_out', pap.company.signedOut, true)
        .list('interfaces', pap.company.interfaces, [...PAP_DEFAULT_INTERFACES])
        .list('scopes', pap.company.scopes.map(dumpPapCompanyScope))
        .list(
          'excluded_tasks',
          pap.company.excludedTasks.map(dumpPapExcludedTask),
        )
        .list('extensions', pap.company.extensions)
        .value<string>('personal_agents', pap.company.personalAgents, 'any')
        .list('registered_agents', pap.company.registeredAgents)
        .list(
          'operations',
          pap.company.operations.map(
            operation =>
              new Writer()
                .text('action', operation.action, '\u0000')
                .text('tool', operation.tool, '\u0000')
                .text('summary', operation.summary, '\u0000').data,
          ),
        ).data,
    ).data;
}

/** PACT: the businesses it asks for each person, and as one. */
function parsePact(data: Data): AppPactSpec {
  const business: Data = isData(data.business) ? data.business : {};
  const scopes: Record<string, string> = {};
  if (isData(business.scopes)) {
    for (const [scope, said] of Object.entries(business.scopes)) {
      scopes[scope] = text(said);
    }
  }
  return {
    connections: records(data.connections).map(connection => ({
      id: text(connection.id),
      brand: text(connection.brand),
      audience: text(connection.audience),
      access: oneOf(connection.access, ['read', 'write'] as const, 'read'),
      scopes: texts(connection.scopes),
    })),
    business: {
      enabled: flag(business.enabled, false),
      brand: text(business.brand),
      scopes,
      registeredAgents: records(business.registered_agents).map(agent => ({
        issuer: text(agent.issuer),
        jwksUri: text(agent.jwks_uri),
      })),
    },
  };
}

/** Commerce: the merchants it shops at for each person. */
function parseCommerce(data: Data): AppCommerceSpec {
  return {
    merchants: records(data.merchants).map(merchant => ({
      id: text(merchant.id),
      protocol: oneOf(merchant.protocol, ['ucp', 'acp'] as const, 'ucp'),
      merchant: text(merchant.merchant),
      access: oneOf(merchant.access, ['read', 'write'] as const, 'read'),
      ...(isData(merchant.limit)
        ? {
            limit: {
              amount: text(merchant.limit.amount),
              currency: text(merchant.limit.currency),
            },
          }
        : {}),
    })),
  };
}

/** Commerce as its document says it, nothing at its default. */
function dumpCommerce(commerce: AppCommerceSpec | undefined): Data {
  if (!commerce) return {};
  return new Writer().list(
    'merchants',
    commerce.merchants.map(
      merchant =>
        new Writer()
          .text('id', merchant.id, '\u0000')
          .text('protocol', merchant.protocol, '\u0000')
          .text('merchant', merchant.merchant, '\u0000')
          .value<string>('access', merchant.access, 'read')
          .part(
            'limit',
            merchant.limit
              ? {
                  amount: merchant.limit.amount,
                  currency: merchant.limit.currency,
                }
              : {},
          ).data,
    ),
  ).data;
}

/** Signed fetch: the exact sites it reads pages of, each request signed. */
function parseSignedFetch(data: Data): AppSignedFetchSpec {
  return {
    sites: records(data.sites).map(site => ({
      id: text(site.id),
      site: text(site.site),
    })),
  };
}

/** Signed fetch as its document says it, nothing at its default. */
function dumpSignedFetch(signedFetch: AppSignedFetchSpec | undefined): Data {
  if (!signedFetch) return {};
  return new Writer().list(
    'sites',
    signedFetch.sites.map(
      site =>
        new Writer()
          .text('id', site.id, '\u0000')
          .text('site', site.site, '\u0000').data,
    ),
  ).data;
}

/** One of a pair of examples: its id and its side, or a problem. */
function parsePair(data: Data): AppPairSpec | string {
  const id = text(data.id);
  const role = text(data.role);
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id)) {
    return `A pair's id is lower-case letters, digits and hyphens: ${JSON.stringify(id)}.`;
  }
  if (role !== 'business' && role !== 'personal_agent') {
    return `One of a pair is its business or its personal_agent, not ${JSON.stringify(role)}.`;
  }
  return { id, role };
}

/** PACT as its document says it, nothing at its default. */
function dumpPact(pact: AppPactSpec | undefined): Data {
  if (!pact) return {};
  const business = pact.business ?? {
    enabled: false,
    brand: '',
    scopes: {},
    registeredAgents: [],
  };
  return new Writer()
    .list(
      'connections',
      pact.connections.map(
        connection =>
          new Writer()
            .text('id', connection.id, '\u0000')
            .text('brand', connection.brand, '\u0000')
            .text('audience', connection.audience, '\u0000')
            .value<string>('access', connection.access, 'read')
            .list('scopes', connection.scopes).data,
      ),
    )
    .part(
      'business',
      new Writer()
        .value('enabled', business.enabled, false)
        .text('brand', business.brand)
        .part('scopes', { ...business.scopes })
        .list(
          'registered_agents',
          business.registeredAgents.map(
            agent =>
              new Writer()
                .text('issuer', agent.issuer, '\u0000')
                .text('jwks_uri', agent.jwksUri, '\u0000').data,
          ),
        ).data,
    ).data;
}

/** A2A: the extensions its Agent Card advertises. */
function parseA2A(data: Data): AppA2ASpec {
  return {
    extensions: records(data.extensions).map(extension => ({
      uri: text(extension.uri),
      description: text(extension.description),
      required: flag(extension.required, false),
      params: isData(extension.params) ? { ...extension.params } : {},
    })),
  };
}

/** A2A as its document says it, nothing at its default. */
function dumpA2A(a2a: AppA2ASpec | undefined): Data {
  if (!a2a) return {};
  return new Writer().list(
    'extensions',
    a2a.extensions.map(
      extension =>
        new Writer()
          .text('uri', extension.uri, '\u0000')
          .text('description', extension.description)
          .value('required', extension.required, false)
          .part('params', extension.params).data,
    ),
  ).data;
}

function parseRule(data: Data): AppRuleSpec {
  return {
    action: text(data.action),
    appliesTo:
      typeof data.applies_to === 'string'
        ? [data.applies_to]
        : texts(data.applies_to),
    behaviour: oneOf(data.behaviour, BEHAVIOURS, 'ask_first'),
  };
}

/** A slash command; a wrong one is said by the checks. */
/** An action of its code, typed: its payload's schema kept as written. */
function parseAction(data: Data): AppActionSpec {
  const action: AppActionSpec = { name: text(data.name) };
  if (text(data.description)) {
    action.description = text(data.description);
  }
  if (isData(data.payload)) {
    action.payload = JSON.parse(JSON.stringify(data.payload)) as Data;
  }
  return action;
}

function parseCommand(data: Data): AppCommandSpec {
  return {
    name: text(data.name),
    description: text(data.description),
    prompt: text(data.prompt),
  };
}

/** One position of a mode switch, what it does said only when said. */
function parseModeOption(data: Data): AppModeOptionSpec {
  const option: AppModeOptionSpec = {
    id: text(data.id),
    label: text(data.label),
  };
  for (const key of ['description', 'instructions', 'model'] as const) {
    if (typeof data[key] === 'string' && data[key]) {
      option[key] = data[key] as string;
    }
  }
  return option;
}

/** A mode switch. */
function parseMode(data: Data): AppModeSpec {
  const mode: AppModeSpec = {
    id: text(data.id),
    label: text(data.label),
    options: records(data.options).map(parseModeOption),
  };
  if (typeof data.default === 'string' && data.default) {
    mode.default = data.default;
  }
  return mode;
}

/** A starter, its category said only when it has one. */
function parseStarter(data: Data): AppStarterSpec {
  const starter: AppStarterSpec = {
    label: text(data.label),
    message: text(data.message),
  };
  if (typeof data.category === 'string' && data.category) {
    starter.category = data.category;
  }
  return starter;
}

/** One of several assistants in one application. */
function parseProfile(data: Data): AppProfileSpec {
  return {
    id: text(data.id),
    label: text(data.label),
    description: text(data.description),
    instructions: text(data.instructions),
    model: typeof data.model === 'string' && data.model ? data.model : null,
    starters: records(data.starters).map(parseStarter),
  };
}

/** Words by key, what is not a word left out. */
function wordsBy(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(isData(value) ? value : {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/** Records by key, what is not one left out. */
function recordsBy(value: unknown): Record<string, Data> {
  return Object.fromEntries(
    Object.entries(isData(value) ? value : {}).filter(
      (entry): entry is [string, Data] => isData(entry[1]),
    ),
  );
}

const mapValues = <T, U>(
  value: Record<string, T>,
  map: (item: T) => U,
): Record<string, U> =>
  Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, map(item)]),
  );

/** An application's words in one other language, every key present. */
function parseTranslation(data: Data): AppTranslationSpec {
  return {
    name: text(data.name),
    description: text(data.description),
    welcome: text(data.welcome),
    starters: mapValues(recordsBy(data.starters), starter => ({
      label: text(starter.label),
      message: text(starter.message),
    })),
    categories: wordsBy(data.categories),
    settings: mapValues(recordsBy(data.settings), field => ({
      title: text(field.title),
      description: text(field.description),
      options: wordsBy(field.options),
    })),
    commands: wordsBy(data.commands),
    modes: mapValues(recordsBy(data.modes), mode => ({
      label: text(mode.label),
      options: mapValues(recordsBy(mode.options), option => ({
        label: text(option.label),
        description: text(option.description),
      })),
    })),
    profiles: mapValues(recordsBy(data.profiles), profile => ({
      label: text(profile.label),
      description: text(profile.description),
    })),
  };
}

function parseSurface(data: Data): AppSurfaceSpec {
  return {
    protocol: text(data.protocol, DEFAULT_PROTOCOL),
    components: records(data.components).filter(
      component =>
        typeof component.id === 'string' &&
        typeof component.component === 'string',
    ) as AppSurfaceSpec['components'],
    composedBy: text(data.composed_by),
    composedAt: text(data.composed_at),
  };
}

/** An application's voice: off unless said. */
export const DEFAULT_VOICE: AppVoiceSpec = {
  enabled: false,
  input: 'push_to_talk',
  output: 'on_request',
  voice: '',
  language: '',
  where: 'auto',
};

function parseVoice(data: unknown): AppVoiceSpec {
  const voice = isData(data) ? data : {};
  return {
    enabled: voice.enabled === true,
    input: oneOf(
      voice.input,
      ['off', 'push_to_talk', 'hands_free'] as const,
      DEFAULT_VOICE.input,
    ),
    output: oneOf(
      voice.output,
      ['off', 'on_request', 'always'] as const,
      DEFAULT_VOICE.output,
    ),
    voice: text(voice.voice),
    language: text(voice.language),
    where: oneOf(
      voice.where,
      ['auto', 'device', 'server'] as const,
      DEFAULT_VOICE.where,
    ),
  };
}

/** What a person may send without being asked, as the spec says it. */
function parseUploads(data: Data): AppUploadsSpec {
  return {
    kinds: records(data.kinds).map(kind => ({
      type: text(kind.type),
      maxMb: numberOf(kind.max_mb, DEFAULT_UPLOAD_MB),
    })),
    maxFiles: numberOf(data.max_files, DEFAULT_MAX_FILES),
  };
}

/** What a page's output may be drawn with, and the property of each that shows its value. */
export const PAGE_OUTPUT_SHOWS: Record<AppPageOutputComponent, string> = {
  Text: 'text',
  Image: 'url',
  Table: 'rows',
  Chart: 'points',
};

/** The height of a component its developer wrote, unless it says. */
export const DEFAULT_CUSTOM_HEIGHT = 240;

/**
 * A component its developer wrote, as written: its schema and
 * example kept whole, so that the checks say what is wrong with them.
 */
function parseCustomComponent(data: Data): AppCustomComponentSpec {
  const component: AppCustomComponentSpec = {
    name: text(data.name),
    description: text(data.description),
    props: isData(data.props)
      ? (JSON.parse(JSON.stringify(data.props)) as Data)
      : { type: 'object', properties: {} },
    shows: texts(data.shows),
    sends: texts(data.sends),
    source: text(data.source),
    integrity: text(data.integrity),
    height: numberOf(data.height, DEFAULT_CUSTOM_HEIGHT),
  };
  if (isData(data.example)) {
    component.example = JSON.parse(JSON.stringify(data.example)) as Data;
  }
  return component;
}

function dumpCustomComponent(component: AppCustomComponentSpec): Data {
  const written = new Writer()
    .text('name', component.name, '\u0000')
    .text('description', component.description, '\u0000');
  written.data.props = JSON.parse(JSON.stringify(component.props));
  written
    .list('shows', component.shows)
    .list('sends', component.sends)
    .text('source', component.source, '\u0000')
    .text('integrity', component.integrity)
    .value('height', component.height, DEFAULT_CUSTOM_HEIGHT);
  if (component.example) {
    written.data.example = JSON.parse(JSON.stringify(component.example));
  }
  return written.data;
}

/**
 * The property a page's output fills with its value: a catalog
 * component's (`PAGE_OUTPUT_SHOWS`), or what a component of the
 * application's own shows first. Undefined for any other.
 */
export function pageOutputShows(
  component: string,
  own: readonly AppCustomComponentSpec[] = [],
): string | undefined {
  if (component in PAGE_OUTPUT_SHOWS) {
    return PAGE_OUTPUT_SHOWS[component as AppPageOutputComponent];
  }
  return own.find(each => each.name === component)?.shows[0];
}

/**
 * A widget's page written in its code, as written: its inputs a form
 * kept whole, an output drawn with another component kept as written so that
 * the checks say it.
 */
function parsePage(data: Data): AppPageSpec {
  const page: AppPageSpec = {
    function: text(data.function),
    inputs: (isData(data.inputs)
      ? JSON.parse(JSON.stringify(data.inputs))
      : {}) as AppFormSchema,
    outputs: records(data.outputs).map(output => ({
      name: text(output.name),
      title: text(output.title),
      component: text(output.component, 'Text'),
      props: isData(output.props)
        ? (JSON.parse(JSON.stringify(output.props)) as Data)
        : {},
    })),
    live: data.live !== false,
  };
  if (isData(data.inputs_ui)) {
    page.inputsUi = JSON.parse(JSON.stringify(data.inputs_ui)) as Data;
  }
  return page;
}

function dumpPage(page: AppPageSpec): Data {
  const written = new Writer().text('function', page.function, '\u0000');
  written.data.inputs = JSON.parse(JSON.stringify(page.inputs));
  if (page.inputsUi) {
    written.data.inputs_ui = { ...page.inputsUi };
  }
  written.list(
    'outputs',
    page.outputs.map(
      output =>
        new Writer()
          .text('name', output.name, '\u0000')
          .text('title', output.title)
          .text('component', output.component, 'Text')
          .part('props', { ...output.props }).data,
    ),
  );
  return written.value('live', page.live, true).data;
}

function parseInterface(data: Data, kind: AppKind): AppInterfaceSpec {
  const parsed: AppInterfaceSpec = {
    layout: oneOf(
      data.layout,
      ['chat', 'page', 'split'] as const,
      DEFAULT_LAYOUTS[kind],
    ),
    // Unsaid, the theme's own colours: no accent is assumed. A name that is
    // not one of the six is refused by `checkAppspec`.
    accent: APP_ACCENTS.includes(data.accent as AppAccent)
      ? (data.accent as AppAccent)
      : undefined,
    welcome: text(data.welcome),
    starters: records(data.starters).map(parseStarter),
    commands: records(data.commands).map(parseCommand),
    modes: records(data.modes).map(parseMode),
    actions: records(data.actions).map(parseAction),
    profiles: records(data.profiles).map(parseProfile),
    language: text(data.language, DEFAULT_LANGUAGE),
    translations: mapValues(recordsBy(data.translations), parseTranslation),
    components: texts(data.components),
    voice: parseVoice(data.voice),
    outputs: texts(data.outputs),
  };
  // Its settings are the JSON Schema of a form, kept as written: what
  // is not one — the list of settings of earlier versions among it — is not
  // read, and is said by the checks.
  if (isData(data.settings)) {
    parsed.settings = JSON.parse(
      JSON.stringify(data.settings),
    ) as AppFormSchema;
  }
  // How its settings' fields are drawn, kept as written: a wrong
  // widget is said by the checks.
  if (isData(data.settings_ui)) {
    parsed.settingsUi = JSON.parse(JSON.stringify(data.settings_ui)) as Data;
  }
  if (isData(data.uploads)) {
    parsed.uploads = parseUploads(data.uploads);
  }
  // Components its developer wrote: absent when it has none.
  if (Array.isArray(data.custom_components)) {
    parsed.customComponents = records(data.custom_components).map(
      parseCustomComponent,
    );
  }
  if (isData(data.surface)) {
    parsed.surface = parseSurface(data.surface);
  }
  if (isData(data.page)) {
    parsed.page = parsePage(data.page);
  }
  if (isAvatarId(data.avatar)) {
    parsed.avatar = data.avatar;
  } else if (isAvatarModel3D(data.avatar)) {
    parsed.avatar = data.avatar.url
      ? { kind: 'model3d', url: data.avatar.url }
      : { kind: 'model3d' };
  }
  if (data.balloon === 'history' || data.balloon === 'current') {
    parsed.balloon = data.balloon;
  }
  // A theme of Appearance's, or none: an unknown one is said by the checks.
  if (
    isData(data.theme) &&
    APP_THEME_VARIANTS.includes(data.theme.variant as AppThemeVariant)
  ) {
    parsed.theme = { variant: data.theme.variant as AppThemeVariant };
    if (APP_THEME_MODES.includes(data.theme.mode as AppThemeMode)) {
      parsed.theme.mode = data.theme.mode as AppThemeMode;
    }
  }
  return parsed;
}

function parseCriterion(data: Data): AppCriterionSpec {
  return {
    name: text(data.name),
    kind: oneOf(
      data.kind,
      ['metric', 'noul', 'choice', 'score'] as const,
      'metric',
    ),
    weight: Math.max(0, numberOf(data.weight, 1)),
    instructions: text(data.instructions),
    options: texts(data.options),
    direction: data.direction === 'lower' ? 'lower' : 'higher',
    measure: oneOf(
      data.measure,
      ['', 'pass_rate', 'cost_per_task', 'seconds_per_task'] as const,
      '',
    ),
  };
}

function parseDecision(data: Data): AppDecisionSpec {
  return {
    question: text(data.question),
    alternatives: texts(data.alternatives),
    criteria: records(data.criteria).map(parseCriterion),
    minConfidence: Math.min(1, Math.max(0, numberOf(data.min_confidence, 0))),
    scenarios: records(data.scenarios).map(scenario => ({
      name: text(scenario.name),
      weights: Object.fromEntries(
        Object.entries(isData(scenario.weights) ? scenario.weights : {}).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      ),
    })),
    decisionModel: text(data.decision_model),
  };
}

/** What it is tried on before it is anybody's: read only. */
function parseSamples(data: Data): AppSamplesSpec {
  return {
    documents: records(data.documents).map(document => ({
      name: text(document.name),
      file: text(document.file),
      text: text(document.text),
    })),
    alternatives: records(data.alternatives).map(alternative => ({
      name: text(alternative.name),
      evidence: text(alternative.evidence),
      metrics: Object.fromEntries(
        Object.entries(
          isData(alternative.metrics) ? alternative.metrics : {},
        ).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      ),
    })),
  };
}

function parseDeployment(data: Data): AppDeploymentSpec {
  const deployment: AppDeploymentSpec = {};
  if (isData(data.hosted)) {
    deployment.hosted = {
      visibility: oneOf(
        data.hosted.visibility,
        ['private', 'invited', 'organization', 'link', 'public'] as const,
        'private',
      ),
      slug: text(data.hosted.slug),
      ...(data.hosted.avatar_alone === true ? { avatarAlone: true } : {}),
    };
  }
  if (isData(data.embedded)) {
    deployment.embedded = {
      mode: oneOf(data.embedded.mode, APP_EMBED_MODES, 'inline'),
      origins: texts(data.embedded.origins),
      ...(isData(data.embedded.host)
        ? {
            host: {
              context: texts(data.embedded.host.context),
              // Kept as written when said: a value that is none is refused
              // by the checks, never read as `claimed`.
              ...(data.embedded.host.user !== undefined
                ? { user: text(data.embedded.host.user) as AppHostUser }
                : {}),
              functions: records(data.embedded.host.functions).map(fn => ({
                name: text(fn.name),
                description: text(fn.description),
                parameters: isData(fn.parameters)
                  ? fn.parameters
                  : { ...NO_HOST_PARAMETERS },
              })),
            },
          }
        : {}),
    };
  }
  return deployment;
}

function parseTrigger(data: Data): AppTriggerSpec {
  return {
    type: oneOf(data.type, ['schedule', 'event', 'once'] as const, 'schedule'),
    cron: text(data.cron),
    event: text(data.event),
    at: text(data.at),
    description: text(data.description),
    prompt: text(data.prompt),
  };
}

/** What reading a document gives: the application, and what the document got wrong. */
export interface ParsedAppspec {
  app: AppSpec;
  /** In sentences; empty when the document reads as it was written. */
  problems: string[];
}

/**
 * An application from a document in the spec's own words.
 *
 * Tolerant: what is missing takes its default, and what cannot be read is
 * reported in `problems` — a key the spec does not know, a version of the
 * spec this does not read, a kind that is not one. The application returned
 * is always whole, so an editor can open it and show what is wrong.
 */
export function parseAppspec(document: unknown): ParsedAppspec {
  const problems: string[] = [];
  if (!isData(document)) {
    return {
      app: emptyAppspec(),
      problems: ['The document is not an application.'],
    };
  }
  const data = document;
  for (const key of Object.keys(data)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
      problems.push(`\`${key}\` is not a field of the spec.`);
    }
  }
  problems.push(...uiShapeProblems(data.ui));
  const schema = text(data.schema, APP_SCHEMA);
  if (schema !== APP_SCHEMA) {
    problems.push(
      `This reads ${APP_SCHEMA}; the application is written in ${schema}.`,
    );
  }
  if (!APP_KINDS.includes(data.kind as AppKind)) {
    problems.push(
      data.kind === undefined
        ? 'The application does not say its `kind`.'
        : `\`${String(data.kind)}\` is not a kind: chat, widget, decision or worker.`,
    );
  }
  const kind = oneOf(data.kind, APP_KINDS, 'chat');
  const base = emptyAppspec(kind);
  const permissions = isData(data.permissions) ? data.permissions : {};
  const computer = isData(permissions.computer) ? permissions.computer : {};
  const tests = isData(data.tests) ? data.tests : {};
  const verified = isData(tests.verified) ? tests.verified : {};
  const record = isData(data.record) ? data.record : {};
  const checks = isData(data.checks) ? data.checks : {};
  // A check of its code runs on an answer or a tool call.
  for (const check of records(checks.code)) {
    if (!(CHECK_STAGES as readonly unknown[]).includes(check.on)) {
      problems.push(
        `The check \`${text(check.name)}\` of its code runs on answer or tool_call, not \`${String(check.on)}\`.`,
      );
    }
  }
  const keepFor = text(record.keep_for, DEFAULT_KEEP_FOR);
  if (retentionDays(keepFor) === 0) {
    problems.push(
      `Cannot read the retention \`${keepFor}\`: write 90_days, 18_months or 1_years.`,
    );
  }
  const app: AppSpec = {
    ...base,
    schema: APP_SCHEMA,
    id: text(data.id),
    version: text(data.version, DEFAULT_VERSION),
    name: text(data.name),
    kind,
    description: text(data.description),
    owner: text(data.owner),
    agent: text(data.agent),
    team: text(data.team),
    instructions: text(data.instructions),
    model: text(data.model),
    skills: texts(data.skills),
    backendTools: texts(data.backend_tools),
    tools: records(data.tools).map(parseTool),
    context: texts(data.context),
    contents: texts(data.contents),
    connections: records(data.connections).map(parseConnection),
    protocols: texts(data.protocols),
    ui: uiChoices(data.ui),
    rules: records(data.rules).map(parseRule),
    permissions: {
      spaces: records(permissions.spaces).map(grant => ({
        space: text(grant.space),
        access: oneOf(grant.access, ['read', 'write'] as const, 'read'),
      })),
      computer: {
        browse: flag(computer.browse, false),
        files: flag(computer.files, false),
        shell: flag(computer.shell, false),
        // A repository lent to it, at one commit: said only when it is.
        ...(isData(computer.repository)
          ? {
              repository: {
                url: text(computer.repository.url),
                revision: text(computer.repository.revision),
              },
            }
          : {}),
      },
    },
    interface: parseInterface(
      isData(data.interface) ? data.interface : {},
      kind,
    ),
    tests: {
      readyAt: Math.min(
        1,
        Math.max(0, numberOf(tests.ready_at, DEFAULT_READY_AT)),
      ),
      evalset: text(tests.evalset),
      cases: records(tests.cases).map(testCase => ({
        ask: text(testCase.ask),
        // A conversation, turn by turn, when it is one.
        ...(records(testCase.turns).length
          ? { turns: records(testCase.turns).map(parseTestTurn) }
          : {}),
        expect: text(testCase.expect),
        // Decided by its code, when it names the function.
        ...(text(testCase.code) ? { code: text(testCase.code) } : {}),
        // Given files with what it is asked, when it is.
        ...(records(testCase.files).length
          ? {
              files: records(testCase.files).map(file => ({
                name: text(file.name),
                text: text(file.text),
              })),
            }
          : {}),
      })),
      verified: {
        live: texts(verified.live),
        recorded: texts(verified.recorded),
        unverified: texts(verified.unverified),
      },
    },
    record: {
      keepFor,
      retentionDays: retentionDays(keepFor),
      include: Array.isArray(record.include)
        ? texts(record.include)
        : [...DEFAULT_RECORD_INCLUDE],
      suggestTests: record.suggest_tests === true,
    },
    checks: {
      guards: texts(checks.guards),
      gates: texts(checks.gates),
      track: text(checks.track),
      code: records(checks.code).map(check => ({
        name: text(check.name),
        on: oneOf(check.on, CHECK_STAGES, 'answer'),
        description: text(check.description),
      })),
    },
    deployment: parseDeployment(isData(data.deployment) ? data.deployment : {}),
    goal: text(data.goal),
    triggers: records(data.triggers).map(parseTrigger),
    memory: text(data.memory),
    notifications: texts(data.notifications),
    samples: parseSamples(isData(data.samples) ? data.samples : {}),
    enabled: flag(data.enabled, true),
    unavailable_because: text(data.unavailable_because),
    tags: texts(data.tags),
    icon: text(data.icon, DEFAULT_ICON),
    emoji: text(data.emoji, DEFAULT_EMOJI) || DEFAULT_EMOJI,
    avatar: text(data.avatar).trim(),
    banner: text(data.banner).trim(),
  };
  if (isData(data.decision)) {
    app.decision = parseDecision(data.decision);
  }
  // A `pap` block names a profile Datalayer speaks, or it is refused and not
  // read; a block saying nothing is no block.
  if (isData(data.pap) && Object.keys(data.pap).length > 0) {
    const problem = papProfileProblem(data.pap.profile);
    if (problem) {
      problems.push(problem);
    } else {
      app.pap = parsePap(data.pap);
    }
  }
  if (isData(data.pact)) {
    app.pact = parsePact(data.pact);
  }
  if (isData(data.commerce)) {
    app.commerce = parseCommerce(data.commerce);
  }
  if (isData(data.signed_fetch)) {
    app.signed_fetch = parseSignedFetch(data.signed_fetch);
  }
  if (isData(data.pair)) {
    const pair = parsePair(data.pair);
    if (typeof pair === 'string') {
      problems.push(pair);
    } else {
      app.pair = pair;
    }
  }
  if (isData(data.a2a)) {
    app.a2a = parseA2A(data.a2a);
  }
  problems.push(...protocolsProblems(app), ...uiProblems(app));
  return { app, problems };
}

/**
 * What is wrong with the UI plugins an application names (R8), in
 * the sentences agentspecs says (`ui_choices_problems`): a plugin the
 * catalogue does not have or said twice — a renderer named as a plugin is
 * refused —, a renderer the catalogue does not have or the plugin may not be
 * exposed through, and one not enabled while the application is offered.
 */
export function uiProblems(app: Pick<AppSpec, 'ui' | 'enabled'>): string[] {
  const problems: string[] = [];
  const seen: string[] = [];
  for (const choice of app.ui) {
    const id = choice.plugin;
    if (seen.includes(id)) {
      problems.push(`It lists the UI plugin '${id}' twice.`);
      continue;
    }
    seen.push(id);
    const spec = UI_CATALOGUE[id];
    if (!spec) {
      problems.push(
        `There is no UI plugin named '${id}': one of ${Object.keys(UI_CATALOGUE).sort().join(', ')}.` +
          (UI_RENDERER_CATALOGUE[id]
            ? ` '${id}' is a UI renderer: say it as a plugin's \`renderer\`.`
            : ''),
      );
      continue;
    }
    if (choice.renderer === undefined) {
      continue;
    }
    const renderer = UI_RENDERER_CATALOGUE[choice.renderer];
    if (!renderer) {
      problems.push(
        `There is no UI renderer named '${choice.renderer}': one of ${Object.keys(UI_RENDERER_CATALOGUE).sort().join(', ')}.`,
      );
    } else if (!spec.renderers.includes(renderer.id)) {
      problems.push(
        `The UI plugin ${spec.name} ('${id}') is not exposed through ${renderer.name}: ` +
          (spec.renderers.length > 0
            ? `through ${spec.renderers.join(', ')} only.`
            : 'through no renderer.'),
      );
    } else if (app.enabled && !renderer.enabled) {
      problems.push(
        `The UI renderer ${renderer.name} ('${renderer.id}') is not enabled: an application cannot be exposed through it yet.`,
      );
    }
  }
  return problems;
}

/**
 * What is wrong with the protocols an application says it speaks, as agentspecs says it: an id the catalogue does not
 * know or said twice, a planned protocol while it is offered, and a `pap`,
 * `pact`, `a2a` or `signed_fetch` block configuring a protocol it does not list.
 */
export function protocolsProblems(
  app: Pick<
    AppSpec,
    | 'protocols'
    | 'enabled'
    | 'pap'
    | 'pact'
    | 'a2a'
    | 'commerce'
    | 'signed_fetch'
  >,
): string[] {
  const problems: string[] = [];
  const seen: string[] = [];
  for (const id of app.protocols) {
    if (seen.includes(id)) {
      problems.push(`It lists the protocol '${id}' twice.`);
      continue;
    }
    seen.push(id);
    const spec = PROTOCOL_CATALOGUE[id];
    if (!spec) {
      problems.push(
        `There is no protocol named '${id}': one of ${Object.keys(PROTOCOL_CATALOGUE).sort().join(', ')}.`,
      );
    } else if (app.enabled && spec.status === 'planned') {
      problems.push(
        `${spec.name} ('${id}') is planned, not shipped: an application cannot speak it yet.`,
      );
    }
  }
  const configured: Record<'pap' | 'pact' | 'a2a' | 'signed_fetch', boolean> = {
    pap: Boolean(
      app.pap && (app.pap.connections.length > 0 || app.pap.company.enabled),
    ),
    pact: Boolean(
      app.pact &&
      (app.pact.connections.length > 0 || app.pact.business?.enabled),
    ),
    a2a: Boolean(app.a2a && app.a2a.extensions.length > 0),
    signed_fetch: Boolean(
      app.signed_fetch && app.signed_fetch.sites.length > 0,
    ),
  };
  for (const spec of Object.values(PROTOCOL_CATALOGUE)) {
    const block = spec.appspecBlock;
    if (block && configured[block] && !app.protocols.includes(spec.id)) {
      problems.push(
        `Its \`${block}\` block configures ${spec.name}, which it does not list: add '${spec.id}' to \`protocols\`.`,
      );
    }
  }
  // The `commerce` block configures UCP and ACP, by each merchant's protocol.
  for (const id of new Set(
    (app.commerce?.merchants ?? []).map(merchant => merchant.protocol),
  )) {
    if (!app.protocols.includes(id)) {
      problems.push(
        `Its \`commerce\` block shops over ${id.toUpperCase()}, which it does not list: add '${id}' to \`protocols\`.`,
      );
    }
  }
  return problems;
}

// --- writing --------------------------------------------------------------------------

const sameList = (a: unknown[], b: unknown[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/** A document with a key only when its value says something. */
class Writer {
  readonly data: Data = {};

  text(key: string, value: string, otherwise = ''): this {
    if (value !== otherwise) {
      this.data[key] = value;
    }
    return this;
  }

  value<T>(key: string, value: T, otherwise: T): this {
    if (value !== otherwise) {
      this.data[key] = value;
    }
    return this;
  }

  list(key: string, value: unknown[], otherwise: unknown[] = []): this {
    if (!sameList(value, otherwise)) {
      this.data[key] = value;
    }
    return this;
  }

  /** A nested object, written only when it says something. */
  part(key: string, value: Data): this {
    if (Object.keys(value).length > 0) {
      this.data[key] = value;
    }
    return this;
  }

  /** A nested object that is written even when empty: its presence is what it says. */
  present(key: string, value: Data | undefined): this {
    if (value !== undefined) {
      this.data[key] = value;
    }
    return this;
  }
}

/** A value with the keys of every mapping in it in alphabetical order. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (isData(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map(key => [key, sorted(value[key])]),
    );
  }
  return value;
}

/** A component as it is written: its `id`, what it is, then the rest in alphabetical order. */
function dumpComponent(component: Data): Data {
  const { id, component: what, ...rest } = component;
  return { id, component: what, ...(sorted(rest) as Data) };
}

function dumpSurface(surface: AppSurfaceSpec): Data {
  return new Writer()
    .text('protocol', surface.protocol, DEFAULT_PROTOCOL)
    .list('components', surface.components.map(dumpComponent))
    .text('composed_by', surface.composedBy)
    .text('composed_at', surface.composedAt).data;
}

function dumpStarter(starter: AppStarterSpec): Data {
  return new Writer()
    .text('label', starter.label, '\u0000')
    .text('message', starter.message, '\u0000')
    .text('category', starter.category ?? '').data;
}

/** Words by key, what is empty left out. */
const saidWords = (words: Record<string, string>): Data =>
  Object.fromEntries(Object.entries(words).filter(([, said]) => said !== ''));

/** One translation as it is written: only what it says. */
function dumpTranslation(words: AppTranslationSpec): Data {
  const parts = <T>(value: Record<string, T>, dump: (item: T) => Data): Data =>
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, dump(item)]),
    );
  return new Writer()
    .text('name', words.name)
    .text('description', words.description)
    .text('welcome', words.welcome)
    .part(
      'starters',
      parts(
        words.starters,
        starter =>
          new Writer()
            .text('label', starter.label)
            .text('message', starter.message).data,
      ),
    )
    .part('categories', saidWords(words.categories))
    .part(
      'settings',
      parts(
        words.settings,
        field =>
          new Writer()
            .text('title', field.title)
            .text('description', field.description)
            .part('options', saidWords(field.options)).data,
      ),
    )
    .part('commands', saidWords(words.commands))
    .part(
      'modes',
      parts(
        words.modes,
        mode =>
          new Writer().text('label', mode.label).part(
            'options',
            parts(
              mode.options,
              option =>
                new Writer()
                  .text('label', option.label)
                  .text('description', option.description).data,
            ),
          ).data,
      ),
    )
    .part(
      'profiles',
      parts(
        words.profiles,
        profile =>
          new Writer()
            .text('label', profile.label)
            .text('description', profile.description).data,
      ),
    ).data;
}

function dumpInterface(spec: AppInterfaceSpec, kind: AppKind): Data {
  const writer = new Writer()
    // A layout is written when it is not the one its kind starts with.
    .value<string>('layout', spec.layout, DEFAULT_LAYOUTS[kind])
    .value<string | undefined>('accent', spec.accent, undefined)
    .text('welcome', spec.welcome)
    .list('starters', spec.starters.map(dumpStarter))
    .list(
      'commands',
      spec.commands.map(command => ({
        name: command.name,
        description: command.description,
        prompt: command.prompt,
      })),
    )
    .list(
      'modes',
      spec.modes.map(mode => {
        const written = new Writer()
          .text('id', mode.id, '\u0000')
          .text('label', mode.label, '\u0000')
          .list(
            'options',
            mode.options.map(
              option =>
                new Writer()
                  .text('id', option.id, '\u0000')
                  .text('label', option.label, '\u0000')
                  .text('description', option.description ?? '')
                  .text('instructions', option.instructions ?? '')
                  .text('model', option.model ?? '').data,
            ),
          );
        if (mode.default) {
          written.data.default = mode.default;
        }
        return written.data;
      }),
    )
    .list(
      'actions',
      (spec.actions ?? []).map(action => {
        const written = new Writer()
          .text('name', action.name, '\u0000')
          .text('description', action.description ?? '');
        if (action.payload) {
          written.data.payload = { ...action.payload };
        }
        return written.data;
      }),
    )
    .list(
      'profiles',
      (spec.profiles ?? []).map(
        profile =>
          new Writer()
            .text('id', profile.id, '\u0000')
            .text('label', profile.label, '\u0000')
            .text('description', profile.description)
            .text('instructions', profile.instructions)
            .text('model', profile.model ?? '')
            .list('starters', profile.starters.map(dumpStarter)).data,
      ),
    )
    .part('settings', spec.settings ? { ...spec.settings } : {});
  // How its settings' fields are drawn: written when said.
  if (spec.settingsUi) {
    writer.data.settings_ui = { ...spec.settingsUi };
  }
  writer
    .text('language', spec.language ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE)
    .part('translations', mapValues(spec.translations ?? {}, dumpTranslation));
  // What a person may send without being asked: written when said.
  if (spec.uploads) {
    writer.data.uploads = new Writer()
      .list(
        'kinds',
        spec.uploads.kinds.map(
          kind =>
            new Writer()
              .text('type', kind.type, '\u0000')
              .value('max_mb', kind.maxMb, DEFAULT_UPLOAD_MB).data,
        ),
      )
      .value('max_files', spec.uploads.maxFiles, DEFAULT_MAX_FILES).data;
  }
  writer.list('components', spec.components);
  writer.list(
    'custom_components',
    (spec.customComponents ?? []).map(dumpCustomComponent),
  );
  if (spec.surface) {
    writer.data.surface = dumpSurface(spec.surface);
  }
  if (spec.page) {
    writer.data.page = dumpPage(spec.page);
  }
  if (spec.avatar) {
    writer.data.avatar =
      typeof spec.avatar === 'string' ? spec.avatar : { ...spec.avatar };
  }
  if (spec.balloon) {
    writer.data.balloon = spec.balloon;
  }
  if (spec.theme) {
    writer.data.theme = spec.theme.mode
      ? { variant: spec.theme.variant, mode: spec.theme.mode }
      : { variant: spec.theme.variant };
  }
  // Its voice, when it says one: a spec made before voice has none.
  if (spec.voice) {
    writer.part(
      'voice',
      new Writer()
        .value('enabled', spec.voice.enabled, DEFAULT_VOICE.enabled)
        .value<string>('input', spec.voice.input, DEFAULT_VOICE.input)
        .value<string>('output', spec.voice.output, DEFAULT_VOICE.output)
        .text('voice', spec.voice.voice)
        .text('language', spec.voice.language)
        .value<string>('where', spec.voice.where, DEFAULT_VOICE.where).data,
    );
  }
  // The formats its answers come in, words first, when it says any.
  writer.list('outputs', spec.outputs ?? []);
  return writer.data;
}

function dumpDecision(decision: AppDecisionSpec): Data {
  return new Writer()
    .text('question', decision.question, '\u0000')
    .list('alternatives', decision.alternatives)
    .list(
      'criteria',
      decision.criteria.map(
        criterion =>
          new Writer()
            .text('name', criterion.name, '\u0000')
            .value<string>('kind', criterion.kind, 'metric')
            .value('weight', criterion.weight, 1)
            .text('instructions', criterion.instructions)
            .list('options', criterion.options)
            .value<string>('direction', criterion.direction, 'higher')
            .value<string>('measure', criterion.measure, '').data,
      ),
    )
    .value('min_confidence', decision.minConfidence, 0)
    .list(
      'scenarios',
      decision.scenarios.map(
        scenario =>
          new Writer()
            .text('name', scenario.name, '\u0000')
            // By criterion name, in alphabetical order: the spec declares no order.
            .part('weights', sorted(scenario.weights) as Data).data,
      ),
    )
    .text('decision_model', decision.decisionModel).data;
}

function dumpSamples(samples: AppSamplesSpec): Data {
  return new Writer()
    .list(
      'documents',
      samples.documents.map(
        document =>
          new Writer()
            .text('name', document.name, '\u0000')
            .text('file', document.file, '\u0000')
            .text('text', document.text, '\u0000').data,
      ),
    )
    .list(
      'alternatives',
      samples.alternatives.map(
        alternative =>
          new Writer()
            .text('name', alternative.name, '\u0000')
            .text('evidence', alternative.evidence, '\u0000')
            // By criterion name, as written: the spec keeps their order.
            .part('metrics', { ...alternative.metrics }).data,
      ),
    ).data;
}

/**
 * An application as the document its file holds.
 *
 * The spec's own words, keys in one fixed order, nothing written that is at
 * its default: the same application always writes the same document. What an
 * application carries that is not the spec's — what it needs set up — is left
 * out.
 */
export function dumpAppspec(app: AppSpec): Data {
  const computer = new Writer()
    .value('browse', app.permissions.computer.browse, false)
    .value('files', app.permissions.computer.files, false)
    .value('shell', app.permissions.computer.shell, false)
    .present(
      'repository',
      app.permissions.computer.repository
        ? {
            url: app.permissions.computer.repository.url,
            revision: app.permissions.computer.repository.revision,
          }
        : undefined,
    ).data;
  const writer = new Writer();
  writer.data.schema = APP_SCHEMA;
  writer
    .text('id', app.id, '\u0000')
    .text('version', app.version, DEFAULT_VERSION)
    .text('name', app.name, '\u0000')
    .text('kind', app.kind, '\u0000')
    .text('description', app.description)
    .text('owner', app.owner)
    .text('agent', app.agent)
    .text('team', app.team)
    .text('instructions', app.instructions)
    .text('model', app.model)
    .list('skills', app.skills)
    .list('backend_tools', app.backendTools)
    .list(
      'tools',
      (app.tools ?? []).map(tool => ({
        name: tool.name,
        description: tool.description,
        // No arguments is what it is unless said.
        ...(JSON.stringify(tool.parameters) ===
        JSON.stringify(NO_HOST_PARAMETERS)
          ? {}
          : { parameters: tool.parameters }),
        does: tool.does,
      })),
    )
    .list('context', app.context)
    .list('contents', app.contents)
    .list(
      'connections',
      app.connections.map(
        connection =>
          new Writer()
            .text('server', connection.server, '\u0000')
            .value<string>('access', connection.access, 'read')
            .value<string>('as', connection.as, 'owner')
            .list('only', connection.only).data,
      ),
    )
    .list('protocols', app.protocols)
    .list(
      'ui',
      app.ui.map(choice =>
        choice.renderer
          ? { plugin: choice.plugin, renderer: choice.renderer }
          : { plugin: choice.plugin },
      ),
    )
    .part('pap', dumpPap(app.pap))
    .part('pact', dumpPact(app.pact))
    .part('commerce', dumpCommerce(app.commerce))
    .part('signed_fetch', dumpSignedFetch(app.signed_fetch))
    .part('pair', app.pair ? { id: app.pair.id, role: app.pair.role } : {})
    .part('a2a', dumpA2A(app.a2a))
    .list(
      'rules',
      app.rules.map(rule => ({
        action: rule.action,
        // One target is written alone when it is a class, as a person would.
        applies_to:
          rule.appliesTo.length === 1 &&
          ACTION_CLASS_NAMES.includes(rule.appliesTo[0])
            ? rule.appliesTo[0]
            : rule.appliesTo,
        behaviour: rule.behaviour,
      })),
    )
    .part(
      'permissions',
      new Writer()
        .list(
          'spaces',
          app.permissions.spaces.map(
            grant =>
              new Writer()
                .text('space', grant.space, '\u0000')
                .value<string>('access', grant.access, 'read').data,
          ),
        )
        .part('computer', computer).data,
    )
    .part('interface', dumpInterface(app.interface, app.kind))
    .part(
      'tests',
      new Writer()
        .value('ready_at', app.tests.readyAt, DEFAULT_READY_AT)
        .text('evalset', app.tests.evalset)
        .list(
          'cases',
          app.tests.cases.map(testCase => ({
            // One message, or a conversation in its place.
            ...(testCase.turns?.length
              ? {
                  turns: testCase.turns.map(turn => parseTestTurn({ ...turn })),
                }
              : { ask: testCase.ask }),
            expect: testCase.expect,
            ...(testCase.code ? { code: testCase.code } : {}),
            ...(testCase.files?.length
              ? {
                  files: testCase.files.map(file => ({
                    name: file.name,
                    text: file.text,
                  })),
                }
              : {}),
          })),
        )
        .part(
          'verified',
          new Writer()
            .list('live', app.tests.verified.live)
            .list('recorded', app.tests.verified.recorded)
            .list('unverified', app.tests.verified.unverified).data,
        ).data,
    )
    .part(
      'record',
      new Writer()
        .text('keep_for', app.record.keepFor, DEFAULT_KEEP_FOR)
        .list('include', app.record.include, DEFAULT_RECORD_INCLUDE)
        .value('suggest_tests', app.record.suggestTests, false).data,
    )
    .part(
      'checks',
      new Writer()
        .list('guards', app.checks.guards)
        .list('gates', app.checks.gates)
        .text('track', app.checks.track)
        .list(
          'code',
          (app.checks.code ?? []).map(check => ({
            name: check.name,
            on: check.on,
            description: check.description,
          })),
        ).data,
    )
    .part(
      'deployment',
      new Writer()
        .present(
          'hosted',
          app.deployment.hosted &&
            new Writer()
              .value<string>(
                'visibility',
                app.deployment.hosted.visibility,
                'private',
              )
              .text('slug', app.deployment.hosted.slug)
              .value<boolean>(
                'avatar_alone',
                app.deployment.hosted.avatarAlone === true,
                false,
              ).data,
        )
        .present(
          'embedded',
          app.deployment.embedded &&
            new Writer()
              .value<string>('mode', app.deployment.embedded.mode, 'inline')
              .list('origins', app.deployment.embedded.origins)
              .present(
                'host',
                app.deployment.embedded.host &&
                  new Writer()
                    .list('context', app.deployment.embedded.host.context)
                    .list(
                      'functions',
                      app.deployment.embedded.host.functions.map(fn => ({
                        name: fn.name,
                        description: fn.description,
                        // No arguments is what it is unless said.
                        ...(JSON.stringify(fn.parameters) ===
                        JSON.stringify(NO_HOST_PARAMETERS)
                          ? {}
                          : { parameters: fn.parameters }),
                      })),
                    )
                    .value<string>(
                      'user',
                      app.deployment.embedded.host.user ?? 'claimed',
                      'claimed',
                    ).data,
              ).data,
        ).data,
    )
    .text('goal', app.goal)
    .list(
      'triggers',
      app.triggers.map(
        trigger =>
          new Writer()
            .text('type', trigger.type, '\u0000')
            .text('cron', trigger.cron)
            .text('event', trigger.event)
            .text('at', trigger.at)
            .text('description', trigger.description)
            .text('prompt', trigger.prompt).data,
      ),
    )
    .text('memory', app.memory)
    .list('notifications', app.notifications);
  if (app.decision) {
    writer.data.decision = dumpDecision(app.decision);
  }
  writer
    .part('samples', dumpSamples(app.samples))
    .value('enabled', app.enabled, true)
    .text('unavailable_because', app.unavailable_because)
    .list('tags', app.tags)
    .text('icon', app.icon ?? DEFAULT_ICON, DEFAULT_ICON)
    .text('emoji', app.emoji, DEFAULT_EMOJI)
    .text('avatar', app.avatar ?? '', '')
    .text('banner', app.banner ?? '', '');
  return writer.data;
}

/** The keys of a document in the order they are written. */
export const APPSPEC_KEY_ORDER: readonly string[] = KNOWN_KEYS;
