/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A local runtime on a person's machine, and the harness it runs (VSCODE
 * VS-02, VS-03; DESKTOP DK-05, DK-06, DK-25): the pure part every host
 * shares — the VS Code extension host and Datalayer Desktop's main process
 * alike import it as `@datalayer/agent-runtimes/lib/portable/localRuntime`.
 *
 * - **Finding `loop`.** No host bundles Python or Agent Runtimes: `loop` is a
 *   prerequisite, found where the person installed it (a path the host's
 *   settings name, else `PATH`, then `uv tool`'s and `pipx`'s bins), checked
 *   to be at least {@link LOOP_MIN_VERSION}, and refused in a sentence naming
 *   the install line when it is absent, too old or does not answer.
 * - **Starting it.** A local runtime is `loop serve --host 127.0.0.1 --port 0`
 *   for one folder, its port read from the first line that names it. The
 *   process is given a trimmed environment plus the credentials the
 *   harnesses declare by name (the environment first, the host's secret
 *   store second), the folder as the harness's workspace, the file session
 *   store, and the person's token and IAM when signed in.
 * - **The harness on the machine.** Before a coding agent starts in a folder,
 *   what `agent-shield setup --harness <id>` checks is checked here: the
 *   binaries the register names, the pinned adapter in the Shield's prefix,
 *   the credential the harness declares — each missing part a sentence, and
 *   `setup` offered for the part it fixes. A harness whose terms refuse the
 *   person's credential is refused in the register's words.
 *
 * The sentences name the host through {@link LocalRuntimeHost}: what the
 * host is called, how a path to `loop` is set by hand, where a credential is
 * kept and how it is given. Pure: no host API, no child process, no file
 * system — the host does the I/O.
 *
 * @module portable/localRuntime
 */

/** The oldest Agent Runtimes whose `loop` a host starts: the release that keeps the folder's instructions file, serves `GET /api/v1/harnesses` and binds the Shield's subject right. */
export const LOOP_MIN_VERSION = '1.5.70';

/** The one line that installs `loop` with the Shield. */
export const INSTALL_LINE = "uv tool install 'agent-runtimes[shield]'";

/** How a local runtime is started: loopback, a free port picked by the server. */
export const LOOP_SERVE_ARGUMENTS: readonly string[] = [
  'serve',
  '--host',
  '127.0.0.1',
  '--port',
  '0',
];

/** The variables of the person's shell a local runtime is given, and nothing else of it. */
export const TRIMMED_VARIABLES: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
  'SSL_CERT_FILE',
  'REQUESTS_CA_BUNDLE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'SystemRoot',
  'SystemDrive',
  'ComSpec',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
];

/**
 * How a host is named in the sentences: the words differ between an editor
 * extension and a desktop application, the rules do not.
 */
export interface LocalRuntimeHost {
  /** *this extension*, *Datalayer Desktop*: the subject of *needs 1.5.70 or later*. */
  name: string;
  /** How a path to `loop` is set by hand: *set datalayer.local.loopPath to where it is*. */
  loopPathHint: string;
  /** Where a credential given to the host is kept: *VS Code's secret storage*, *the app's keychain*. */
  secretStore: string;
  /** How a credential is given once: *Datalayer: Set a harness credential*. */
  credentialCommand: string;
}

/** The VS Code extension's words. */
export const VSCODE_HOST: LocalRuntimeHost = {
  name: 'this extension',
  loopPathHint: 'set datalayer.local.loopPath to where it is',
  secretStore: "VS Code's secret storage",
  credentialCommand: 'Datalayer: Set a harness credential',
};

/** Datalayer Desktop's words. */
export const DESKTOP_HOST: LocalRuntimeHost = {
  name: 'Datalayer Desktop',
  loopPathHint: "set the path to loop in Desktop's settings",
  secretStore: "the app's keychain",
  credentialCommand: 'Sessions: Set a credential…',
};

/** What the host says about itself, for the candidate paths. */
export interface DetectHost {
  /** `process.platform`. */
  platform: string;
  /** The person's home folder. */
  home: string;
  /** The `PATH` variable, or nothing. */
  pathVariable: string | undefined;
  /** The path the host's settings name, empty when unset. */
  configured: string;
}

/**
 * Where `loop` may be, in the order it is looked for: the configured path,
 * each `PATH` entry, then `uv tool`'s and `pipx`'s bins under the home.
 *
 * @param host - The host's platform, home, `PATH` and configured path.
 *
 * @returns Candidate paths, the first that exists being `loop`.
 */
export function candidateLoopPaths(host: DetectHost): string[] {
  const windows = host.platform === 'win32';
  const separator = windows ? ';' : ':';
  const slash = windows ? '\\' : '/';
  const names = windows ? ['loop.exe', 'loop.cmd', 'loop'] : ['loop'];
  const candidates: string[] = [];
  const configured = host.configured.trim();
  if (configured) {
    candidates.push(configured);
  }
  for (const entry of (host.pathVariable ?? '').split(separator)) {
    const dir = entry.trim();
    if (!dir) {
      continue;
    }
    for (const name of names) {
      candidates.push(`${dir.replace(/[\\/]+$/, '')}${slash}${name}`);
    }
  }
  const home = host.home.replace(/[\\/]+$/, '');
  const bins = windows
    ? [
        `${home}\\.local\\bin`,
        `${home}\\AppData\\Roaming\\uv\\tools\\agent-runtimes\\Scripts`,
        `${home}\\pipx\\venvs\\agent-runtimes\\Scripts`,
      ]
    : [
        `${home}/.local/bin`,
        `${home}/.local/share/uv/tools/agent-runtimes/bin`,
        `${home}/.local/pipx/venvs/agent-runtimes/bin`,
      ];
  for (const dir of bins) {
    for (const name of names) {
      candidates.push(`${dir}${slash}${name}`);
    }
  }
  return [...new Set(candidates)];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * The version `loop --version` printed (`Agent Runtimes Chat v1.5.70`,
 * `agent_runtimes: 1.5.70`, colours stripped), or null when none is in it.
 *
 * @param output - What the command wrote, stdout and stderr together.
 *
 * @returns The first `major.minor.patch` found, or null.
 */
export function versionOf(output: string): string | null {
  const plain = output.replace(ANSI, '');
  const match = plain.match(/(?<![\d.])(\d+)\.(\d+)\.(\d+)(?![\d.])/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

/**
 * Orders two `major.minor.patch` versions.
 *
 * @param a - One version.
 * @param b - The other.
 *
 * @returns Negative when `a` is older, zero when equal, positive when newer.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(part => Number(part) || 0);
  const right = b.split('.').map(part => Number(part) || 0);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/** What was found on the machine, before it is judged. */
export interface LoopFound {
  /** The path that exists. */
  path: string;
  /** What `loop --version` wrote, or null when it could not be run. */
  versionOutput: string | null;
  /** Why it could not be run, when it could not. */
  failure?: string;
}

/** Why `loop` is not started. */
export type LoopRefusalReason =
  'absent' | 'too-old' | 'unanswered' | 'disabled';

/** `loop` found and good, or the sentence that refuses it. */
export type LoopDetection =
  | { ok: true; path: string; version: string }
  | { ok: false; reason: LoopRefusalReason; sentence: string };

/**
 * Judges what was found: present, answering and at least the minimum.
 *
 * @param found - The first candidate that exists, with its version output; null when none does.
 * @param host - The host's words.
 * @param minimum - The oldest version accepted.
 *
 * @returns The path and version, or the refusal naming the install line.
 */
export function loopDetection(
  found: LoopFound | null,
  host: LocalRuntimeHost,
  minimum: string = LOOP_MIN_VERSION,
): LoopDetection {
  if (!found) {
    return {
      ok: false,
      reason: 'absent',
      sentence:
        "`loop` was not found on this machine (not on PATH, nor under uv tool's or pipx's bins): " +
        `install it with \`${INSTALL_LINE}\`, or ${host.loopPathHint}.`,
    };
  }
  const version = found.versionOutput ? versionOf(found.versionOutput) : null;
  if (!version) {
    const why = (found.failure ?? found.versionOutput ?? '')
      .replace(ANSI, '')
      .split('\n')
      .map(line => line.trim())
      .find(line => line.length > 0);
    return {
      ok: false,
      reason: 'unanswered',
      sentence:
        `\`loop\` at ${found.path} did not answer \`loop --version\`` +
        (why ? ` (${why})` : '') +
        `: its Python may be gone — reinstall it with \`${INSTALL_LINE}\`.`,
    };
  }
  if (compareVersions(version, minimum) < 0) {
    return {
      ok: false,
      reason: 'too-old',
      sentence:
        `\`loop\` at ${found.path} is agent-runtimes ${version}, and ${host.name} needs ${minimum} or later: ` +
        `update it with \`${INSTALL_LINE}\`.`,
    };
  }
  return { ok: true, path: found.path, version };
}

/**
 * The port a `loop serve` line names: `Auto-selected free port 41231`,
 * `Uvicorn running on http://127.0.0.1:41231`, `API docs available at http://127.0.0.1:41231/docs`.
 *
 * @param line - One line of the process's output.
 *
 * @returns The port, or null when the line names none.
 */
export function portOf(line: string): number | null {
  const plain = line.replace(ANSI, '');
  const picked = plain.match(/free port (\d{2,5})\b/);
  if (picked) {
    return Number(picked[1]);
  }
  const url = plain.match(
    /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d{2,5})\b/,
  );
  return url ? Number(url[1]) : null;
}

/**
 * The origins a host's content-security policy admits for one local
 * runtime, and nothing else on loopback (DESKTOP DK-05).
 *
 * @param port - The runtime's port.
 *
 * @returns `http://127.0.0.1:<port>` and `ws://127.0.0.1:<port>`.
 */
export function loopbackSourcesOf(port: number): string[] {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`A local runtime's port is 1 to 65535, not ${port}.`);
  }
  return [`http://127.0.0.1:${port}`, `ws://127.0.0.1:${port}`];
}

/** What the environment of a local runtime is built from. */
export interface RuntimeEnvironmentInput {
  /** The host's environment (`process.env`). */
  host: Record<string, string | undefined>;
  /** The folder: the harness's workspace. */
  folder: string;
  /** The credential names the harnesses declare (`requires.secrets`). */
  declared: readonly string[];
  /** What the host's secret store holds for those names. */
  secrets: Record<string, string | undefined>;
  /** The person's token and IAM, when signed in. */
  signedIn?: { token: string; iamUrl: string };
  /** `AGENT_RUNTIMES_SESSIONS_PATH`, when the person set one; else the runtime's default. */
  sessionsPath?: string;
}

/** Where each declared credential came from, said to the person (VSCODE O-1, DESKTOP O-2). */
export type CredentialSource = 'environment' | 'secrets';

/** The environment a local runtime is started with, and where its credentials came from. */
export interface RuntimeEnvironment {
  environment: Record<string, string>;
  credentials: Record<string, CredentialSource>;
}

/**
 * The environment of a local runtime: the trimmed set of the person's
 * shell, the declared credentials by name (the environment first, the
 * secret store second — nothing undeclared), the folder as the workspace,
 * the file session store (META_HARNESS decision K: without it a signed-in
 * runtime would pick the record), and the person's token and IAM when
 * signed in.
 *
 * @param input - The host's environment, the folder, the declared names, the secrets, the sign-in.
 *
 * @returns The environment and the source of each credential handed.
 */
export function runtimeEnvironment(
  input: RuntimeEnvironmentInput,
): RuntimeEnvironment {
  const environment: Record<string, string> = {};
  for (const name of TRIMMED_VARIABLES) {
    const value = input.host[name];
    if (value !== undefined && value !== '') {
      environment[name] = value;
    }
  }
  const credentials: Record<string, CredentialSource> = {};
  for (const name of input.declared) {
    const fromHost = input.host[name];
    if (fromHost) {
      environment[name] = fromHost;
      credentials[name] = 'environment';
      continue;
    }
    const fromSecrets = input.secrets[name];
    if (fromSecrets) {
      environment[name] = fromSecrets;
      credentials[name] = 'secrets';
    }
  }
  environment.AGENT_RUNTIMES_WORKSPACE_ROOT = input.folder;
  environment.AGENT_RUNTIMES_SESSION_STORE = 'file';
  if (input.sessionsPath) {
    environment.AGENT_RUNTIMES_SESSIONS_PATH = input.sessionsPath;
  }
  if (input.signedIn) {
    environment.DATALAYER_IAM_URL = input.signedIn.iamUrl;
    environment.DATALAYER_API_KEY = input.signedIn.token;
  }
  environment.PYTHONUNBUFFERED = '1';
  environment.NO_COLOR = '1';
  return { environment, credentials };
}

/** A local runtime as a chat lists it beside Datalayer's runtimes: a place of its own. */
export interface LocalRuntimeHandle {
  /** `local:<folder path>`: unique per folder. */
  runtimeName: string;
  /** `http://127.0.0.1:<port>`. */
  ingress: string;
  /** Nothing: no token is lent to loopback. */
  token: string;
  /** *This machine — <folder name>*. */
  givenName: string;
  /** `local`. */
  environmentName: string;
  /** The place, for the picker. */
  place: 'local';
}

/**
 * The handle a chat's picker shows for a running local runtime.
 *
 * @param folderName - The folder's name.
 * @param folderPath - Its path.
 * @param url - The runtime's address.
 *
 * @returns The handle, with no token.
 */
export function localRuntimeHandle(
  folderName: string,
  folderPath: string,
  url: string,
): LocalRuntimeHandle {
  return {
    runtimeName: `local:${folderPath}`,
    ingress: url.replace(/\/$/, ''),
    token: '',
    givenName: `This machine — ${folderName}`,
    environmentName: 'local',
    place: 'local',
  };
}

// ---------------------------------------------------------------------------
// The harness on the machine (VS-03, DK-06)
// ---------------------------------------------------------------------------

/** One harness of the catalogue, as the check reads it. */
export interface HarnessFacts {
  /** `claude-code`, `codex`, … */
  id: string;
  /** *Claude Code*. */
  name: string;
  /** The adapter pinned (`@agentclientprotocol/claude-agent-acp`). */
  adapter: string;
  /** Its version (`0.91.0`). */
  adapterVersion: string;
  /** The credential it takes, the register's words. */
  credential: string;
  /** The credential names it declares (`ANTHROPIC_API_KEY`). */
  secrets: string[];
  /** The executables it needs on the path (`node`, `git`). */
  binaries: string[];
  /** The register's line on binaries (*Node 22 (engines.node >=22 on npm), git*). */
  registeredBinaries: string;
  /** `api_key_only`, `permitted`, `organizations_own`. */
  servedToThirdParties: string;
  /** The licence, the register's words. */
  licence: string;
  /** Tier restrictions, or empty. */
  tierRestrictions: string;
  /** The capabilities table (MH-20). */
  capabilities: {
    resume: string;
    forkHistory: string;
    interrupt: boolean;
    steering: boolean;
    images: boolean;
    compaction: string;
  };
  /** How it is launched: the executable. */
  command: string;
  /** The executable's arguments. */
  args: string[];
  /** Whether its ACP adapter loads a session again. */
  loadSession: boolean;
  /** The modes it offers. */
  modes: string[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The catalogue as `GET /api/v1/harnesses` answers it (`{harnesses: [...]}`,
 * each the harness spec whole).
 *
 * @param body - The route's answer.
 *
 * @returns The harnesses, in the route's order.
 *
 * @throws Error when the answer is not a list of harnesses.
 */
export function harnessesOf(body: unknown): HarnessFacts[] {
  const harnesses = record(body).harnesses;
  if (!Array.isArray(harnesses)) {
    throw new Error(
      "The runtime's answer for /api/v1/harnesses names no harnesses.",
    );
  }
  return harnesses.map(raw => {
    const spec = record(raw);
    const acp = record(spec.acp);
    const requires = record(spec.requires);
    const registered = record(spec.registered);
    const terms = record(spec.terms);
    const capabilities = record(spec.capabilities);
    const id = text(spec.id);
    if (!id) {
      throw new Error('A harness of /api/v1/harnesses names no id.');
    }
    return {
      id,
      name: text(spec.name) || id,
      adapter: text(registered.adapter),
      adapterVersion: text(registered.version),
      credential: text(registered.credential),
      secrets: list(requires.secrets),
      binaries: list(requires.binaries),
      registeredBinaries: text(registered.binaries),
      servedToThirdParties: text(terms.served_to_third_parties),
      licence: text(terms.licence),
      tierRestrictions: text(terms.tier_restrictions),
      capabilities: {
        resume: text(capabilities.resume),
        forkHistory: text(capabilities.fork_history),
        interrupt: capabilities.interrupt === true,
        steering: capabilities.steering === true,
        images: capabilities.images === true,
        compaction: text(capabilities.compaction),
      },
      command: text(acp.command),
      args: list(acp.args),
      loadSession: acp.load_session === true,
      modes: list(acp.modes),
    };
  });
}

/**
 * The credential names a register line names: *An Anthropic API key
 * (ANTHROPIC_API_KEY), the person's own* → `["ANTHROPIC_API_KEY"]`.
 *
 * @param credential - The register's credential line.
 *
 * @returns The upper-case names in it, in order, once each.
 */
export function credentialNamesOf(credential: string): string[] {
  return [
    ...new Set(credential.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? []),
  ];
}

/**
 * The Node major the register asks for (*Node 22 (engines.node >=22 on npm), git*).
 *
 * @param registeredBinaries - The register's binaries line.
 *
 * @returns The major, or null when the line names no Node version.
 */
export function requiredNodeMajor(registeredBinaries: string): number | null {
  const match = registeredBinaries.match(/\bnode\s+v?(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * The major of a `node --version` answer (`v22.11.0` → 22).
 *
 * @param output - What `node --version` printed.
 *
 * @returns The major, or null when none is in it.
 */
export function nodeMajorOf(output: string): number | null {
  const match = output.match(/v?(\d+)\.\d+\.\d+/);
  return match ? Number(match[1]) : null;
}

/**
 * Where `agent-shield setup` pins an adapter: `~/.agent-shield/harnesses/<id>@<version>`.
 *
 * @param home - The person's home folder.
 * @param facts - The harness.
 *
 * @returns The prefix path.
 */
export function shieldPrefixOf(home: string, facts: HarnessFacts): string {
  return `${home.replace(/[\\/]+$/, '')}/.agent-shield/harnesses/${facts.id}@${facts.adapterVersion}`;
}

/**
 * The command that installs what a harness needs, shown whole before it runs.
 *
 * @param id - The harness.
 *
 * @returns `agent-shield setup --harness <id>`.
 */
export function setupCommandOf(id: string): string {
  return `agent-shield setup --harness ${id}`;
}

/** What the machine has, read by the host, judged here. */
export interface HarnessMachine {
  /** Each binary the harness needs: what `<binary> --version` printed, or null when it is absent. */
  binaries: Record<string, string | null>;
  /** The person's environment. */
  environment: Record<string, string | undefined>;
  /** What the host's secret store holds. */
  secrets: Record<string, string | undefined>;
  /** Whether the pinned adapter is in the Shield's prefix. */
  adapterInstalled: boolean;
  /** Whether a subscription login of the vendor's is what the machine has (no API key). */
  subscriptionLogin: boolean;
}

/** One part of the check that is not met. */
export interface HarnessCheckPart {
  part: 'binary' | 'node' | 'adapter' | 'credential' | 'terms';
  sentence: string;
  /** Whether `agent-shield setup` fixes it. */
  setup: boolean;
  /** Whether it stops the start. */
  blocking: boolean;
}

/** The check's verdict. */
export interface HarnessCheck {
  ok: boolean;
  parts: HarnessCheckPart[];
  /** Where the credential was found, when it was. */
  credentialSource: CredentialSource | null;
  setupCommand: string;
}

/**
 * The register's sentence when the harness's terms refuse what the person has.
 *
 * @param facts - The harness.
 * @param machine - What the machine has.
 * @param host - The host's words.
 *
 * @returns The sentence, or null when the terms admit the person's credential.
 */
export function termsRefusal(
  facts: HarnessFacts,
  machine: Pick<HarnessMachine, 'subscriptionLogin'>,
  host: LocalRuntimeHost,
): string | null {
  if (facts.servedToThirdParties === 'organizations_own') {
    return `${facts.name} is served to an organization's own applications only (${facts.servedToThirdParties.replace(/_/g, ' ')}): it does not run from ${host.name}.`;
  }
  if (
    facts.servedToThirdParties === 'api_key_only' &&
    machine.subscriptionLogin
  ) {
    return (
      `${facts.name}'s terms serve third parties with an API key only (${facts.credential || facts.secrets.join(', ')}): ` +
      `a subscription login is not served here. Set ${facts.secrets.join(' or ') || 'its key'} instead.`
    );
  }
  return null;
}

/**
 * Checks a harness against the machine: binaries and Node's version, the
 * adapter in the Shield's prefix, the credential, the terms.
 *
 * @param facts - The harness.
 * @param machine - What the machine has.
 * @param host - The host's words.
 *
 * @returns The verdict, each unmet part a sentence.
 */
export function harnessCheck(
  facts: HarnessFacts,
  machine: HarnessMachine,
  host: LocalRuntimeHost,
): HarnessCheck {
  const parts: HarnessCheckPart[] = [];
  const setupCommand = setupCommandOf(facts.id);
  const terms = termsRefusal(facts, machine, host);
  if (terms) {
    parts.push({
      part: 'terms',
      sentence: terms,
      setup: false,
      blocking: true,
    });
  }
  for (const binary of facts.binaries) {
    const found = machine.binaries[binary];
    if (found === null || found === undefined) {
      parts.push({
        part: 'binary',
        sentence: `${facts.name} needs \`${binary}\` on this machine, and it was not found: install it, or run \`${setupCommand}\` in a terminal.`,
        setup: true,
        blocking: true,
      });
      continue;
    }
    if (binary === 'node') {
      const required = requiredNodeMajor(facts.registeredBinaries);
      const major = nodeMajorOf(found);
      if (required !== null && major !== null && major < required) {
        parts.push({
          part: 'node',
          sentence: `${facts.name} needs Node ${required} or later (${facts.registeredBinaries}), and this machine has ${found.trim()}: update Node, or run \`${setupCommand}\` in a terminal.`,
          setup: true,
          blocking: true,
        });
      }
    }
  }
  if (facts.adapter && !machine.adapterInstalled) {
    const fetched = facts.command === 'npx';
    parts.push({
      part: 'adapter',
      sentence: fetched
        ? `${facts.name}'s adapter ${facts.adapter}@${facts.adapterVersion} is not pinned in the Shield's prefix: the first start fetches it with npx, or run \`${setupCommand}\` to pin it first.`
        : `${facts.name}'s adapter ${facts.adapter} ${facts.adapterVersion} is not installed: run \`${setupCommand}\` in a terminal.`,
      setup: true,
      blocking: !fetched,
    });
  }
  let credentialSource: HarnessCheck['credentialSource'] = null;
  for (const name of facts.secrets) {
    if (machine.environment[name]) {
      credentialSource = 'environment';
      continue;
    }
    if (machine.secrets[name]) {
      credentialSource = 'secrets';
      continue;
    }
    parts.push({
      part: 'credential',
      sentence: `${facts.name} takes ${facts.credential || name}: set ${name} in your environment, or give it once (${host.credentialCommand}) — it is kept in ${host.secretStore}, never in settings, and never shown.`,
      setup: false,
      blocking: true,
    });
  }
  return {
    ok: parts.every(part => !part.blocking),
    parts,
    credentialSource,
    setupCommand,
  };
}

/**
 * The sentence that says where a credential came from (VSCODE O-1, DESKTOP O-2).
 *
 * @param name - The credential's name.
 * @param source - Where it was found.
 * @param host - The host's words.
 *
 * @returns The sentence.
 */
export function credentialSourceSaid(
  name: string,
  source: CredentialSource,
  host: LocalRuntimeHost,
): string {
  return source === 'environment'
    ? `${name} is taken from your environment.`
    : `${name} is taken from ${host.secretStore}.`;
}

/** The key under which a credential is kept in a host's secret store. */
export function credentialSecretKey(name: string): string {
  return `datalayer.harness.credential.${name}`;
}
