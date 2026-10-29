/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The local runtime and the harness on the machine (VSCODE VS-02, VS-03;
 * DESKTOP DK-05, DK-06, DK-25): where `loop` is looked for, the version
 * read, the refusals (absent, too old, unanswered) each naming the install
 * line in the host's words, the port parsed from `loop serve`'s lines, the
 * loopback origins a policy admits, the environment handed (the trimmed
 * set, the declared credentials by name and nothing undeclared, the folder
 * as the workspace, the file store, the token when signed in), the chat's
 * handle for a local place; the catalogue read from `GET /api/v1/harnesses`,
 * each check's sentence, `setup` offered for the part it fixes.
 *
 * @module portable/__tests__/localRuntime
 */

import { describe, expect, it } from 'vitest';
import {
  candidateLoopPaths,
  compareVersions,
  credentialNamesOf,
  credentialSecretKey,
  credentialSourceSaid,
  DESKTOP_HOST,
  harnessCheck,
  harnessesOf,
  type HarnessFacts,
  type HarnessMachine,
  INSTALL_LINE,
  localRuntimeHandle,
  LOOP_MIN_VERSION,
  LOOP_SERVE_ARGUMENTS,
  loopbackSourcesOf,
  loopDetection,
  nodeMajorOf,
  portOf,
  requiredNodeMajor,
  runtimeEnvironment,
  setupCommandOf,
  shieldPrefixOf,
  termsRefusal,
  versionOf,
  VSCODE_HOST,
} from '../localRuntime';

describe('where loop is looked for', () => {
  it("takes the configured path first, then PATH, then uv tool's and pipx's bins", () => {
    const paths = candidateLoopPaths({
      platform: 'linux',
      home: '/home/ada',
      pathVariable: '/usr/bin:/home/ada/miniconda3/bin/',
      configured: '/opt/loop',
    });
    expect(paths).toEqual([
      '/opt/loop',
      '/usr/bin/loop',
      '/home/ada/miniconda3/bin/loop',
      '/home/ada/.local/bin/loop',
      '/home/ada/.local/share/uv/tools/agent-runtimes/bin/loop',
      '/home/ada/.local/pipx/venvs/agent-runtimes/bin/loop',
    ]);
  });

  it('looks for loop.exe on Windows', () => {
    const paths = candidateLoopPaths({
      platform: 'win32',
      home: 'C:\\Users\\ada',
      pathVariable: 'C:\\Python\\Scripts',
      configured: '',
    });
    expect(paths[0]).toBe('C:\\Python\\Scripts\\loop.exe');
    expect(paths).toContain('C:\\Users\\ada\\.local\\bin\\loop.exe');
  });
});

describe('the version read', () => {
  it('is 1.5.70 at least: the release that keeps the instructions file and serves the harnesses', () => {
    expect(LOOP_MIN_VERSION).toBe('1.5.70');
  });

  it('reads loop --version in both of its shapes, colours stripped', () => {
    expect(versionOf('\u001b[32mAgent Runtimes Chat\u001b[0m v1.5.70\n')).toBe(
      '1.5.70',
    );
    expect(versionOf('agent_runtimes: 1.3.111')).toBe('1.3.111');
    expect(versionOf('Traceback (most recent call last)')).toBeNull();
  });

  it('orders versions numerically', () => {
    expect(compareVersions('1.5.70', '1.5.70')).toBe(0);
    expect(compareVersions('1.3.111', '1.5.70')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
  });
});

describe("the refusals, in the host's words", () => {
  it('refuses an absent loop with the install line and how the host sets a path', () => {
    const editor = loopDetection(null, VSCODE_HOST);
    expect(editor.ok).toBe(false);
    if (!editor.ok) {
      expect(editor.reason).toBe('absent');
      expect(editor.sentence).toContain(INSTALL_LINE);
      expect(editor.sentence).toContain('datalayer.local.loopPath');
    }
    const desktop = loopDetection(null, DESKTOP_HOST);
    if (!desktop.ok) {
      expect(desktop.sentence).toContain(INSTALL_LINE);
      expect(desktop.sentence).toContain("Desktop's settings");
    }
  });

  it('refuses a loop older than the release the host needs', () => {
    const detection = loopDetection(
      { path: '/usr/bin/loop', versionOutput: 'agent_runtimes: 1.5.69' },
      DESKTOP_HOST,
    );
    expect(detection.ok).toBe(false);
    if (!detection.ok) {
      expect(detection.reason).toBe('too-old');
      expect(detection.sentence).toContain('1.5.69');
      expect(detection.sentence).toContain(
        `Datalayer Desktop needs ${LOOP_MIN_VERSION} or later`,
      );
      expect(detection.sentence).toContain(INSTALL_LINE);
    }
  });

  it('refuses a loop that does not answer, with the first line of why', () => {
    const detection = loopDetection(
      {
        path: '/usr/bin/loop',
        versionOutput: null,
        failure: '\n/usr/bin/python3: No such file or directory\n',
      },
      VSCODE_HOST,
    );
    expect(detection.ok).toBe(false);
    if (!detection.ok) {
      expect(detection.reason).toBe('unanswered');
      expect(detection.sentence).toContain('No such file or directory');
      expect(detection.sentence).toContain(INSTALL_LINE);
    }
  });

  it('accepts the minimum and anything newer', () => {
    expect(
      loopDetection(
        { path: '/usr/bin/loop', versionOutput: 'Agent Runtimes Chat v1.5.70' },
        DESKTOP_HOST,
      ),
    ).toEqual({ ok: true, path: '/usr/bin/loop', version: '1.5.70' });
    expect(
      loopDetection(
        { path: '/usr/bin/loop', versionOutput: 'agent_runtimes: 1.6.0' },
        VSCODE_HOST,
      ).ok,
    ).toBe(true);
  });
});

describe('the port and the start', () => {
  it('starts loop serve on loopback with a free port', () => {
    expect(LOOP_SERVE_ARGUMENTS).toEqual([
      'serve',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ]);
  });

  it('reads the port from the lines loop serve writes', () => {
    expect(
      portOf(
        'INFO agent_runtimes.commands.serve Auto-selected free port 41231',
      ),
    ).toBe(41231);
    expect(
      portOf(
        'INFO:     Uvicorn running on http://127.0.0.1:41231 (Press CTRL+C to quit)',
      ),
    ).toBe(41231);
    expect(portOf('API docs available at http://127.0.0.1:8000/docs')).toBe(
      8000,
    );
    expect(portOf('Found credentials in environment variables.')).toBeNull();
  });

  it('admits one runtime on loopback, http and ws, and refuses a port that is none', () => {
    expect(loopbackSourcesOf(41231)).toEqual([
      'http://127.0.0.1:41231',
      'ws://127.0.0.1:41231',
    ]);
    expect(() => loopbackSourcesOf(0)).toThrow(/1 to 65535/);
    expect(() => loopbackSourcesOf(70000)).toThrow(/1 to 65535/);
  });
});

describe('the environment handed', () => {
  const host = {
    PATH: '/usr/bin',
    HOME: '/home/ada',
    AWS_SECRET_ACCESS_KEY: 'never',
    ANTHROPIC_API_KEY: 'sk-from-shell',
    GITHUB_TOKEN: 'not-declared',
  };

  it('hands the trimmed set, the declared credentials and nothing else', () => {
    const { environment, credentials } = runtimeEnvironment({
      host,
      folder: '/home/ada/project',
      declared: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
      secrets: { OPENAI_API_KEY: 'sk-from-secrets', GITHUB_TOKEN: 'nor-this' },
    });
    expect(environment.PATH).toBe('/usr/bin');
    expect(environment.HOME).toBe('/home/ada');
    expect(environment.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(environment.GITHUB_TOKEN).toBeUndefined();
    expect(environment.ANTHROPIC_API_KEY).toBe('sk-from-shell');
    expect(environment.OPENAI_API_KEY).toBe('sk-from-secrets');
    expect(credentials).toEqual({
      ANTHROPIC_API_KEY: 'environment',
      OPENAI_API_KEY: 'secrets',
    });
    expect(environment.AGENT_RUNTIMES_WORKSPACE_ROOT).toBe('/home/ada/project');
    expect(environment.AGENT_RUNTIMES_SESSION_STORE).toBe('file');
    expect(environment.AGENT_RUNTIMES_SESSIONS_PATH).toBeUndefined();
    expect(environment.DATALAYER_API_KEY).toBeUndefined();
    expect(environment.DATALAYER_IAM_URL).toBeUndefined();
  });

  it('takes the environment before the secret store for the same name', () => {
    const { environment, credentials } = runtimeEnvironment({
      host,
      folder: '/p',
      declared: ['ANTHROPIC_API_KEY'],
      secrets: { ANTHROPIC_API_KEY: 'sk-from-secrets' },
    });
    expect(environment.ANTHROPIC_API_KEY).toBe('sk-from-shell');
    expect(credentials.ANTHROPIC_API_KEY).toBe('environment');
  });

  it('hands the token and IAM when signed in, the sessions path when set, and the file store always', () => {
    const { environment } = runtimeEnvironment({
      host,
      folder: '/p',
      declared: [],
      secrets: {},
      signedIn: { token: 'jwt', iamUrl: 'https://prod1.datalayer.run' },
      sessionsPath: '/tmp/sessions',
    });
    expect(environment.DATALAYER_API_KEY).toBe('jwt');
    expect(environment.DATALAYER_IAM_URL).toBe('https://prod1.datalayer.run');
    expect(environment.AGENT_RUNTIMES_SESSIONS_PATH).toBe('/tmp/sessions');
    // META_HARNESS decision K: signed in, the runtime would pick the record.
    expect(environment.AGENT_RUNTIMES_SESSION_STORE).toBe('file');
  });
});

describe("the chat's handle for a local place", () => {
  it('lends no token to loopback', () => {
    expect(
      localRuntimeHandle(
        'project',
        '/home/ada/project',
        'http://127.0.0.1:41231/',
      ),
    ).toEqual({
      runtimeName: 'local:/home/ada/project',
      ingress: 'http://127.0.0.1:41231',
      token: '',
      givenName: 'This machine — project',
      environmentName: 'local',
      place: 'local',
    });
  });
});

const CLAUDE_CODE_SPEC = {
  id: 'claude-code',
  name: 'Claude Code',
  acp: {
    command: 'npx',
    args: ['-y', '@agentclientprotocol/claude-agent-acp@0.91.0'],
    load_session: true,
    modes: ['default', 'plan'],
  },
  requires: { secrets: ['ANTHROPIC_API_KEY'], binaries: ['node', 'git'] },
  registered: {
    adapter: '@agentclientprotocol/claude-agent-acp',
    version: '0.91.0',
    credential: "An Anthropic API key (ANTHROPIC_API_KEY), the person's own",
    binaries: 'Node 22 (engines.node >=22 on npm), git',
  },
  terms: {
    served_to_third_parties: 'api_key_only',
    licence:
      'Apache-2.0 (adapter); Anthropic Commercial Terms of Service (the agent)',
    tier_restrictions: null,
  },
  capabilities: {
    resume: 'load',
    fork_history: 'replay',
    interrupt: true,
    steering: false,
    images: true,
    compaction: 'own',
  },
  contributed_by: 'agent-runtimes.sessions',
};

function claudeCode(): HarnessFacts {
  return harnessesOf({ harnesses: [CLAUDE_CODE_SPEC] })[0]!;
}

function machine(overrides: Partial<HarnessMachine> = {}): HarnessMachine {
  return {
    binaries: { node: 'v22.11.0', git: 'git version 2.43.0' },
    environment: { ANTHROPIC_API_KEY: 'sk-shell' },
    secrets: {},
    adapterInstalled: true,
    subscriptionLogin: false,
    ...overrides,
  };
}

describe('the catalogue read', () => {
  it("reads the route's answer whole", () => {
    const facts = claudeCode();
    expect(facts.id).toBe('claude-code');
    expect(facts.secrets).toEqual(['ANTHROPIC_API_KEY']);
    expect(facts.binaries).toEqual(['node', 'git']);
    expect(facts.adapter).toBe('@agentclientprotocol/claude-agent-acp');
    expect(facts.adapterVersion).toBe('0.91.0');
    expect(facts.servedToThirdParties).toBe('api_key_only');
    expect(facts.capabilities).toEqual({
      resume: 'load',
      forkHistory: 'replay',
      interrupt: true,
      steering: false,
      images: true,
      compaction: 'own',
    });
    expect(facts.command).toBe('npx');
    expect(facts.loadSession).toBe(true);
  });

  it('refuses an answer that names no harnesses', () => {
    expect(() => harnessesOf({})).toThrow(/names no harnesses/);
    expect(() => harnessesOf({ harnesses: [{ name: 'Nameless' }] })).toThrow(
      /names no id/,
    );
  });

  it('names the credentials of a register line', () => {
    expect(
      credentialNamesOf(
        "An OpenAI API key (OPENAI_API_KEY or CODEX_API_KEY), the person's own",
      ),
    ).toEqual(['OPENAI_API_KEY', 'CODEX_API_KEY']);
    expect(credentialNamesOf('None: it runs without a key')).toEqual([]);
  });
});

describe("each check's sentence", () => {
  it('passes a machine that has everything, the credential from the environment', () => {
    const check = harnessCheck(claudeCode(), machine(), DESKTOP_HOST);
    expect(check.ok).toBe(true);
    expect(check.parts).toEqual([]);
    expect(check.credentialSource).toBe('environment');
    expect(check.setupCommand).toBe('agent-shield setup --harness claude-code');
  });

  it('says a missing binary and offers setup', () => {
    const check = harnessCheck(
      claudeCode(),
      machine({ binaries: { node: 'v22.1.0', git: null } }),
      DESKTOP_HOST,
    );
    expect(check.ok).toBe(false);
    expect(check.parts).toHaveLength(1);
    expect(check.parts[0]).toMatchObject({
      part: 'binary',
      setup: true,
      blocking: true,
    });
    expect(check.parts[0]?.sentence).toContain('`git`');
    expect(check.parts[0]?.sentence).toContain(
      'agent-shield setup --harness claude-code',
    );
  });

  it("checks node's version against the register", () => {
    expect(requiredNodeMajor('Node 22 (engines.node >=22 on npm), git')).toBe(
      22,
    );
    expect(requiredNodeMajor('git')).toBeNull();
    expect(nodeMajorOf('v20.18.0\n')).toBe(20);
    const check = harnessCheck(
      claudeCode(),
      machine({ binaries: { node: 'v20.18.0', git: 'git version 2.43.0' } }),
      VSCODE_HOST,
    );
    expect(check.ok).toBe(false);
    expect(check.parts[0]).toMatchObject({
      part: 'node',
      setup: true,
      blocking: true,
    });
    expect(check.parts[0]?.sentence).toContain('Node 22 or later');
    expect(check.parts[0]?.sentence).toContain('v20.18.0');
  });

  it('says an adapter not pinned, fetched by npx on the first start, and offers setup without blocking', () => {
    const check = harnessCheck(
      claudeCode(),
      machine({ adapterInstalled: false }),
      DESKTOP_HOST,
    );
    expect(check.ok).toBe(true);
    expect(check.parts[0]).toMatchObject({
      part: 'adapter',
      setup: true,
      blocking: false,
    });
    expect(check.parts[0]?.sentence).toContain(
      '@agentclientprotocol/claude-agent-acp@0.91.0',
    );
    expect(shieldPrefixOf('/home/ada/', claudeCode())).toBe(
      '/home/ada/.agent-shield/harnesses/claude-code@0.91.0',
    );
  });

  it("says the credential missing, where to put it in the host's words, and that it is never written to settings", () => {
    const check = harnessCheck(
      claudeCode(),
      machine({ environment: {}, secrets: {} }),
      DESKTOP_HOST,
    );
    expect(check.ok).toBe(false);
    expect(check.credentialSource).toBeNull();
    expect(check.parts[0]).toMatchObject({
      part: 'credential',
      setup: false,
      blocking: true,
    });
    expect(check.parts[0]?.sentence).toContain('ANTHROPIC_API_KEY');
    expect(check.parts[0]?.sentence).toContain("the app's keychain");
    expect(check.parts[0]?.sentence).toContain('never in settings');
    const editor = harnessCheck(
      claudeCode(),
      machine({ environment: {}, secrets: {} }),
      VSCODE_HOST,
    );
    expect(editor.parts[0]?.sentence).toContain("VS Code's secret storage");
    expect(editor.parts[0]?.sentence).toContain(
      'Datalayer: Set a harness credential',
    );
  });

  it('reads the credential from the secret store second, and says which it used', () => {
    const check = harnessCheck(
      claudeCode(),
      machine({ environment: {}, secrets: { ANTHROPIC_API_KEY: 'sk-kept' } }),
      DESKTOP_HOST,
    );
    expect(check.ok).toBe(true);
    expect(check.credentialSource).toBe('secrets');
    expect(
      credentialSourceSaid('ANTHROPIC_API_KEY', 'secrets', DESKTOP_HOST),
    ).toBe("ANTHROPIC_API_KEY is taken from the app's keychain.");
    expect(
      credentialSourceSaid('ANTHROPIC_API_KEY', 'secrets', VSCODE_HOST),
    ).toBe("ANTHROPIC_API_KEY is taken from VS Code's secret storage.");
    expect(
      credentialSourceSaid('ANTHROPIC_API_KEY', 'environment', DESKTOP_HOST),
    ).toBe('ANTHROPIC_API_KEY is taken from your environment.');
    expect(credentialSecretKey('ANTHROPIC_API_KEY')).toBe(
      'datalayer.harness.credential.ANTHROPIC_API_KEY',
    );
  });

  it('refuses a subscription login where the terms serve third parties with an API key only', () => {
    const facts = claudeCode();
    expect(
      termsRefusal(facts, { subscriptionLogin: false }, DESKTOP_HOST),
    ).toBeNull();
    const sentence = termsRefusal(
      facts,
      { subscriptionLogin: true },
      DESKTOP_HOST,
    );
    expect(sentence).toContain('API key only');
    expect(sentence).toContain('Set ANTHROPIC_API_KEY instead');
    const check = harnessCheck(
      facts,
      machine({ environment: {}, subscriptionLogin: true }),
      DESKTOP_HOST,
    );
    expect(check.ok).toBe(false);
    expect(check.parts.map(part => part.part)).toEqual(['terms', 'credential']);
  });

  it("refuses an organization's own harness from the host, by name", () => {
    const facts = {
      ...claudeCode(),
      servedToThirdParties: 'organizations_own',
    };
    expect(
      termsRefusal(facts, { subscriptionLogin: false }, DESKTOP_HOST),
    ).toBe(
      "Claude Code is served to an organization's own applications only (organizations own): it does not run from Datalayer Desktop.",
    );
  });

  it('shows setup whole', () => {
    expect(setupCommandOf('codex')).toBe('agent-shield setup --harness codex');
  });
});
